# base-nestjs

Plantilla base para APIs REST con [NestJS](https://nestjs.com) 11, pensada para arrancar proyectos con las piezas que toda API necesita ya resueltas y con la seguridad activada por defecto: autenticación JWT en cookies `httpOnly` con rotación de refresh tokens, PostgreSQL con migraciones, configuración validada al arranque, logging estructurado, rate limiting y arquitectura por use cases.

## Stack

| Pieza | Tecnología |
|---|---|
| Framework | NestJS 11 + TypeScript + pnpm |
| Base de datos | PostgreSQL + TypeORM (migraciones, `synchronize` siempre deshabilitado) |
| Autenticación | JWT access + refresh en cookies `httpOnly`, rotación con detección de reuso |
| Passwords | argon2id |
| Logging | nestjs-pino: JSON estructurado, `x-request-id`, archivos con rotación |
| Documentación | Swagger en `/docs` (deshabilitado en producción por defecto) |
| Contenedores | Dockerfile multi-stage (usuario no-root) + docker-compose para la DB local |

## Arquitectura

Cada módulo sigue la cadena **Controller → Service → Use cases**:

```
HTTP → Controller ──► Service (fachada) ──► Use case ──► Repository de TypeORM
        DTOs,           un método por        toda la lógica
        guards,         use case, sin        de negocio, una
        swagger         lógica               clase por operación
```

- **Use cases** (`use-cases/`): toda la lógica de negocio, fragmentada en una clase por operación con un único método `execute()`. Acceden a los datos inyectando el `Repository` de TypeORM directamente.
- **Service**: fachada del módulo. No contiene lógica de negocio, solo canaliza los use cases.
- **Controller**: llama al service y mantiene la estructura estándar de Nest (DTOs, decoradores, Swagger).
- La lógica de soporte compartida entre use cases de un módulo (p. ej. `TokenService` o `CookieService` en auth) va en un provider aparte, no en el service.

## Quickstart

```bash
# 1. Dependencias
pnpm install

# 2. Variables de entorno
cp .env.example .env
# Generar secretos JWT reales (uno para ACCESS y otro distinto para REFRESH):
#   openssl rand -hex 32

# 3. Base de datos local
docker compose up -d

# 4. Migraciones
pnpm migration:run

# 5. Arrancar en modo desarrollo
pnpm start:dev
```

Al arrancar, el log muestra las URLs:

```
INFO: Servidor escuchando en http://localhost:3000/api/v1
INFO: Documentación disponible en http://localhost:3000/docs
```

El health check queda en `http://localhost:3000/health` (fuera del prefijo de la API, para los probes de infraestructura).

## Variables de entorno

Validadas con Joi al arranque ([env.validation.ts](src/config/env.validation.ts)): si falta una obligatoria o hay un valor inválido, la app **no arranca** (fail-fast con mensaje claro).

| Variable | Descripción | Default |
|---|---|---|
| `NODE_ENV` | `development` \| `test` \| `production` | `development` |
| `PORT` | Puerto HTTP | `3000` |
| `API_PREFIX` | Prefijo global de rutas | `api` |
| `CORS_ORIGINS` | Orígenes permitidos, separados por coma. Vacío = sin CORS | — |
| `DB_HOST` / `DB_PORT` / `DB_USERNAME` / `DB_PASSWORD` / `DB_NAME` | Conexión a PostgreSQL | requeridas |
| `DB_SSL` | Habilita SSL hacia la DB | `false` |
| `JWT_ACCESS_SECRET` | Secreto del access token (mín. 32 chars) | requerida |
| `JWT_ACCESS_EXPIRES_IN` | TTL del access token | `15m` |
| `JWT_REFRESH_SECRET` | Secreto del refresh token (mín. 32 chars, distinto del access) | requerida |
| `JWT_REFRESH_EXPIRES_IN` | TTL del refresh token | `7d` |
| `COOKIE_SECURE` | Flag `Secure` de las cookies de auth (solo HTTPS) | `true` en prod, `false` en dev |
| `THROTTLE_TTL` / `THROTTLE_LIMIT` | Rate limit global (ventana ms / peticiones) | `60000` / `100` |
| `SWAGGER_ENABLED` | Habilita `/docs` | `true` en dev, `false` en prod |
| `LOG_LEVEL` | Nivel de log de pino | `info` |

## Autenticación

Flujo JWT con **access token** (corto, 15 min) y **refresh token** (largo, 7 días) firmados con secretos distintos. Los tokens se entregan en **cookies `httpOnly`** (`access_token` y `refresh_token`), **nunca en el body**: si viajaran en la respuesta, un XSS podría llamar a `/refresh` (la cookie viaja sola) y leer tokens frescos, anulando el beneficio de `httpOnly`.

| Endpoint | Qué hace |
|---|---|
| `POST /api/v1/auth/register` | Crea el usuario (password con **argon2id**) y setea las cookies |
| `POST /api/v1/auth/login` | Setea las cookies. Mismo 401 exista o no el email (evita enumeración de usuarios) |
| `POST /api/v1/auth/refresh` | Lee el refresh de su cookie, **rota el par** y setea las nuevas cookies |
| `POST /api/v1/auth/logout` | Revoca el refresh token y limpia las cookies |

**Rotación con detección de reuso**: cada refresh invalida el token anterior. Si se presenta un refresh ya rotado (firma válida pero hash distinto al guardado), se asume robo y **se revoca la sesión completa** — el refresh vigente también deja de servir.

Del refresh token solo se guarda su **hash SHA-256** en la DB (columna `refresh_token_hash`), nunca el token en claro.

### Propiedades de las cookies ([cookie.service.ts](src/modules/auth/cookie.service.ts))

- `httpOnly` — el JS del navegador no puede leerlas (mitiga robo por XSS).
- `SameSite=Lax` — no viajan en peticiones cross-site (mitiga CSRF).
- `Secure` — solo HTTPS; activo en producción por defecto (`COOKIE_SECURE`).
- La cookie de refresh tiene `Path=/api/v1/auth/refresh`: el token de larga vida solo viaja al único endpoint que lo necesita.
- El `maxAge` de cada cookie se deriva del TTL del JWT correspondiente.

### Consumir la API

- **Navegadores / SPAs**: hacer las peticiones con `credentials: 'include'` (CORS ya responde con `Access-Control-Allow-Credentials`). No hay que manejar tokens a mano.
- **Clientes API / móviles**: las estrategias también aceptan `Authorization: Bearer <token>` como fallback.

### Proteger rutas

El guard JWT es **global**: toda ruta nueva exige token automáticamente, salvo que se marque con `@Public()`. Para acceder al usuario autenticado:

```ts
@Get('me')
me(@CurrentUser() user: AuthenticatedUser) { ... }
```

> **Nota de diseño**: hay una sesión de refresh activa por usuario (simple y suficiente para la mayoría de APIs). Para multi-dispositivo, extender a una tabla `refresh_tokens` con `jti` por sesión.

## Seguridad incluida

- **Tokens en cookies `httpOnly`** con `SameSite=Lax` y `Secure` en producción.
- **helmet** (headers de seguridad) y **CORS** restringido a `CORS_ORIGINS`.
- **Rate limiting** global (`@nestjs/throttler`) + límite estricto de 5/min en los endpoints de auth (blanco típico de fuerza bruta).
- **ValidationPipe global** con `whitelist` + `forbidNonWhitelisted`: cualquier propiedad fuera del DTO rechaza la petición.
- **ClassSerializerInterceptor global**: `password` y `refreshTokenHash` tienen `@Exclude()` (y `select: false` en la entidad), jamás salen en una respuesta.
- **Filtro global de excepciones**: formato de error uniforme con `requestId`, sin stack traces ni detalles internos al cliente.
- **Logs con redacción**: `authorization`, `cookie`, `password` y `refreshToken` aparecen como `[Redacted]`.
- **Fail-fast de configuración**: env inválido aborta el boot.
- **Graceful shutdown** (`enableShutdownHooks`) y contenedor con usuario no-root.

## Base de datos

### Entidades

Toda entidad extiende [`BaseEntity`](src/common/entities/base.entity.ts), que aporta `id` (uuid), `createdAt`, `updatedAt` y `deletedAt` (**soft delete**: los registros borrados con `softDelete`/`softRemove` quedan marcados y las queries los excluyen automáticamente).

Los nombres de columnas, joins y tablas de unión se generan en **snake_case** automáticamente (`SnakeNamingStrategy`): `createdAt` → `created_at` sin declarar `name` en cada `@Column`.

```ts
@Entity('pacientes')
export class Paciente extends BaseEntity {
  @Column()
  numeroDocumento: string; // → columna numero_documento
}
```

### Migraciones

`synchronize` está deshabilitado siempre: el schema se maneja con migraciones. Después de crear o modificar una entidad:

```bash
# Generar una migración a partir de los cambios en las entidades
pnpm migration:generate src/database/migrations/NombreDelCambio

# Ejecutar / revertir
pnpm migration:run
pnpm migration:revert
```

> El CLI usa [data-source.ts](src/database/data-source.ts) (lee el `.env`); la app se configura aparte en [database.module.ts](src/database/database.module.ts). Ambos comparten la naming strategy.

## Logs

Configurados en [logger.config.ts](src/config/logger.config.ts) con `pino.multistream` (varios destinos a la vez):

| Destino | Contenido | Cuándo |
|---|---|---|
| `logs/combined.log` | Todo desde `debug` | siempre (salvo tests) |
| `logs/error.log` | Solo `error` y `fatal` | siempre (salvo tests) |
| Consola legible (estilo Nest) | Según `LOG_LEVEL` | solo `development` |
| Consola JSON | Según `LOG_LEVEL` | producción (para docker/orquestadores) |

Los archivos rotan a diario o al superar 20 MB, los rotados se comprimen con gzip y los más viejos se borran solos (retención: 14 archivos para combined, 30 para error). Para agregar un destino nuevo (S3, CloudWatch, etc.) basta sumar una factory en `buildDestinations()`.

Cada petición lleva un `x-request-id` que aparece en todos sus logs y en las respuestas de error — permite correlacionar un error reportado con su traza exacta.

## Tests

```bash
pnpm test        # unit: flujo de auth completo vía la fachada (hashing, login
                 # no-enumerable, rotación, detección de reuso)
pnpm test:e2e    # e2e con HTTP y DB reales: cookies httpOnly, rotación, logout,
                 # validación de DTOs, health (requiere docker compose + migraciones)
```

## Docker (producción)

Imagen multi-stage: compila, poda a dependencias de producción y corre como usuario no-root.

```bash
docker build -t base-nestjs .
docker run --env-file .env -p 3000:3000 base-nestjs
```

Los logs de archivo se escriben en `/app/logs`: montar un volumen ahí si se quiere persistirlos fuera del contenedor.

## Estructura

```
src/
├── main.ts                  # bootstrap: helmet, cookies, CORS, pipes, versioning, swagger
├── app.module.ts            # config, DB, logger, throttler + providers globales
├── config/                  # validación Joi + configs tipadas por dominio
├── common/
│   ├── decorators/          # @Public, @CurrentUser
│   ├── entities/            # BaseEntity (id, timestamps, soft delete)
│   └── filters/             # filtro global de excepciones
├── database/                # módulo TypeORM, data-source del CLI, migraciones
├── modules/
│   ├── users/
│   │   ├── entities/        # entidad User
│   │   ├── use-cases/       # get-profile
│   │   ├── users.service.ts # fachada
│   │   └── users.controller.ts
│   └── auth/
│       ├── dto/             # register, login
│       ├── guards/          # jwt, jwt-refresh
│       ├── strategies/      # extracción cookie-first con fallback Bearer
│       ├── use-cases/       # register, login, refresh-tokens, logout
│       ├── token.service.ts # soporte: emisión y hash de tokens
│       ├── cookie.service.ts# soporte: entrega/limpieza de cookies httpOnly
│       ├── auth.service.ts  # fachada
│       └── auth.controller.ts
└── health/                  # GET /health con ping a la DB (Terminus)
```

## Cómo crear un módulo nuevo

1. Crear la carpeta en `src/modules/<nombre>/` siguiendo el patrón de `users`.
2. La entidad extiende `BaseEntity` y va en `entities/`. Generar y correr la migración.
3. La lógica de negocio va en `use-cases/`, una clase por operación con método `execute()`.
4. El service es la fachada: un método por use case, sin lógica.
5. El controller llama al service. Toda ruta nueva queda **protegida por defecto**; marcar con `@Public()` solo lo que deba ser público.
6. Registrar entidad (`TypeOrmModule.forFeature`), use cases y service como providers del módulo.

## Cómo empezar un proyecto desde esta plantilla

1. Clonar / usar como template y renombrar en `package.json`.
2. `cp .env.example .env` y generar secretos reales con `openssl rand -hex 32`.
3. Ajustar `CORS_ORIGINS` al dominio del frontend.
4. Crear los módulos de dominio siguiendo la guía anterior.
