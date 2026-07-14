# base-nestjs

Plantilla base para APIs con [NestJS](https://nestjs.com) 11, pensada para iniciar proyectos con las piezas que toda API necesita ya resueltas: configuración validada, autenticación JWT con refresh tokens, PostgreSQL con migraciones, logging estructurado, rate limiting y las medidas de seguridad básicas activadas por defecto.

## Stack

- **NestJS 11** + TypeScript + pnpm
- **PostgreSQL + TypeORM** (migraciones con el CLI, `synchronize` deshabilitado siempre)
- **Auth JWT**: access + refresh token con rotación y detección de reuso
- **nestjs-pino**: logs JSON con `x-request-id` por petición + archivos con rotación
- **Swagger** en `/docs` (deshabilitado en producción por defecto)
- **Docker**: Dockerfile multi-stage + docker-compose para la DB local

## Quickstart

```bash
# 1. Dependencias
pnpm install

# 2. Variables de entorno
cp .env.example .env
# Generar secretos JWT reales:
#   openssl rand -hex 32   (uno para ACCESS y otro distinto para REFRESH)

# 3. Base de datos local
docker compose up -d

# 4. Migraciones
pnpm migration:run

# 5. Arrancar en modo desarrollo
pnpm start:dev
```

La API queda en `http://localhost:3000/api/v1`, el health check en `http://localhost:3000/health` y Swagger en `http://localhost:3000/docs`.

## Variables de entorno

Validadas con Joi al arranque ([env.validation.ts](src/config/env.validation.ts)): si falta una obligatoria, la app no arranca.

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
| `THROTTLE_TTL` / `THROTTLE_LIMIT` | Rate limit global (ventana ms / peticiones) | `60000` / `100` |
| `SWAGGER_ENABLED` | Habilita `/docs` | `true` en dev, `false` en prod |
| `LOG_LEVEL` | Nivel de log de pino | `info` |

## Autenticación

Flujo JWT con **access token** (corto, 15 min) y **refresh token** (largo, 7 días) firmados con secretos distintos:

- `POST /api/v1/auth/register` — crea el usuario (password hasheado con **argon2id**) y devuelve tokens.
- `POST /api/v1/auth/login` — devuelve tokens. El error es el mismo 401 exista o no el email (evita enumeración de usuarios).
- `POST /api/v1/auth/refresh` — enviar el **refresh token** como `Authorization: Bearer`. Rota el par: el refresh anterior queda invalidado. Si se presenta un refresh ya rotado (firma válida, hash distinto), se asume robo y **se revoca la sesión completa**.
- `POST /api/v1/auth/logout` — revoca el refresh token (requiere access token).

El guard JWT es **global**: toda ruta exige token salvo que esté marcada con `@Public()`. Para acceder al usuario autenticado: `@CurrentUser() user: AuthenticatedUser`.

Del refresh token solo se guarda su **hash SHA-256** en la DB (columna `refresh_token_hash`), nunca el token en claro.

> **Nota de diseño**: hay una sesión de refresh activa por usuario (simple y suficiente para la mayoría de APIs). Para multi-dispositivo, extender a una tabla `refresh_tokens` con `jti` por sesión. Los tokens se entregan en el body; para SPAs de mismo dominio se puede cambiar a cookies `httpOnly` tocando solo `auth.controller.ts`.

## Seguridad incluida

- **helmet** (headers de seguridad) y **CORS** restringido a `CORS_ORIGINS`
- **Rate limiting** global (`@nestjs/throttler`) + límite estricto de 5/min en los endpoints de auth
- **ValidationPipe global** con `whitelist` + `forbidNonWhitelisted`: cualquier propiedad fuera del DTO rechaza la petición
- **ClassSerializerInterceptor global**: `password` y `refreshTokenHash` tienen `@Exclude()` (y `select: false`), jamás salen en una respuesta
- **Filtro global de excepciones**: formato de error uniforme con `requestId`, sin stack traces ni detalles internos al cliente
- **Logs con redacción**: `authorization`, `cookie`, `password` y `refreshToken` aparecen `[Redacted]`
- **Fail-fast de configuración**: env inválido aborta el boot con mensaje claro
- **Graceful shutdown** (`enableShutdownHooks`) y contenedor con usuario no-root

## Logs

Configurados en [logger.config.ts](src/config/logger.config.ts) con `pino.multistream` (varios destinos a la vez):

| Destino | Contenido | Cuándo |
|---|---|---|
| `logs/combined.log` | Todo desde `debug` | siempre (salvo tests) |
| `logs/error.log` | Solo `error` y `fatal` | siempre (salvo tests) |
| Consola legible (estilo Nest) | Según `LOG_LEVEL` | solo `development` |
| Consola JSON | Según `LOG_LEVEL` | producción (para docker/orquestadores) |

Los archivos rotan a diario o al superar 20 MB, los rotados se comprimen con gzip y los más viejos se borran solos (retención: 14 archivos para combined, 30 para error). Para agregar un destino nuevo (S3, CloudWatch, etc.) basta sumar una factory en `buildDestinations()`.

En Docker, montar un volumen en `/app/logs` si se quiere persistir los archivos fuera del contenedor.

## Base de datos y migraciones

`synchronize` está deshabilitado siempre: el schema se maneja con migraciones.

```bash
# Generar una migración a partir de cambios en las entidades
pnpm migration:generate src/database/migrations/NombreDelCambio

# Ejecutar / revertir
pnpm migration:run
pnpm migration:revert
```

## Tests

```bash
pnpm test        # unit (auth.service: hashing, login no-enumerable, rotación, reuso)
pnpm test:e2e    # flujo completo (requiere la DB de docker compose + migraciones)
```

## Docker (producción)

```bash
docker build -t base-nestjs .
docker run --env-file .env -p 3000:3000 base-nestjs
```

## Estructura

```
src/
├── main.ts                  # bootstrap: helmet, CORS, pipes, versioning, swagger
├── app.module.ts            # config, DB, logger, throttler + providers globales
├── config/                  # validación Joi + configs tipadas por dominio
├── common/                  # @Public, @CurrentUser, filtro de excepciones
├── database/                # módulo TypeORM, data-source del CLI, migraciones
├── modules/
│   ├── users/               # entidad User + GET /users/me de ejemplo
│   └── auth/                # register/login/refresh/logout, estrategias, guards
└── health/                  # GET /health con ping a la DB (Terminus)
```

## Cómo empezar un proyecto desde esta plantilla

1. Clonar / usar como template y renombrar en `package.json`.
2. `cp .env.example .env` y generar secretos reales.
3. Crear tus módulos en `src/modules/` siguiendo el patrón de `users`.
4. Toda ruta nueva queda protegida por defecto; marca con `@Public()` solo lo que deba ser público.
