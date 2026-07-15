# base-nestjs

Plantilla base para APIs REST con [NestJS](https://nestjs.com) 11, pensada para arrancar proyectos con las piezas que toda API necesita ya resueltas y con la seguridad activada por defecto: autenticación JWT en cookies `httpOnly` con rotación de refresh tokens, verificación de email, roles (RBAC), recuperación de contraseña por correo, PostgreSQL con migraciones, paginación estándar, i18n (es/en), configuración validada al arranque, logging estructurado, rate limiting y arquitectura por use cases.

## Stack

| Pieza | Tecnología |
|---|---|
| Framework | NestJS 11 + TypeScript + pnpm |
| Base de datos | PostgreSQL + TypeORM (migraciones, `synchronize` siempre deshabilitado) |
| Autenticación | JWT access + refresh en cookies `httpOnly`, rotación con detección de reuso |
| Passwords | argon2id |
| Logging | nestjs-pino: JSON estructurado, `x-request-id`, archivos con rotación |
| i18n | nestjs-i18n: mensajes de error en `es`/`en` según `Accept-Language` (default: `es`) |
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

# 5. Primer admin (lee SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD del .env)
pnpm seed

# 6. Arrancar en modo desarrollo
pnpm start:dev
```

Al arrancar, el log muestra las URLs:

```
INFO: Servidor escuchando en http://localhost:3000/api/v1
INFO: Documentación disponible en http://localhost:3000/docs
INFO: WebSockets escuchando en http://localhost:3000/events
```

El health check queda en `http://localhost:3000/health` (fuera del prefijo de la API, para los probes de infraestructura). La línea de WebSockets solo aparece con `WS_ENABLED=true`.

## Variables de entorno

Validadas con **Zod** al arranque ([env.validation.ts](src/config/env.validation.ts)): si falta una obligatoria o hay un valor inválido, la app **no arranca** (fail-fast listando todos los errores). El schema es la única fuente de verdad: coerción de tipos (`PORT` llega como number, `DB_SSL` como boolean), defaults condicionados a `NODE_ENV` y reglas cruzadas (los secretos JWT deben ser distintos). El tipo `Env` se infiere del schema (`z.infer`).

| Variable | Descripción | Default |
|---|---|---|
| `NODE_ENV` | `development` \| `test` \| `production` | `development` |
| `PORT` | Puerto HTTP | `3000` |
| `API_PREFIX` | Prefijo global de rutas | `api` |
| `CORS_ORIGINS` | Orígenes permitidos, separados por coma. Vacío = sin CORS | — |
| `BODY_LIMIT` | Tamaño máximo del body JSON | `100kb` |
| `DB_HOST` / `DB_PORT` / `DB_USERNAME` / `DB_PASSWORD` / `DB_NAME` | Conexión a PostgreSQL | requeridas |
| `DB_SSL` | Habilita SSL hacia la DB | `false` |
| `JWT_ACCESS_SECRET` | Secreto del access token (mín. 32 chars) | requerida |
| `JWT_ACCESS_EXPIRES_IN` | TTL del access token | `15m` |
| `JWT_REFRESH_SECRET` | Secreto del refresh token (mín. 32 chars, distinto del access) | requerida |
| `JWT_REFRESH_EXPIRES_IN` | TTL del refresh token | `7d` |
| `COOKIE_SECURE` | Flag `Secure` de las cookies de auth (solo HTTPS) | `true` en prod, `false` en dev |
| `MAIL_HOST` / `MAIL_PORT` / `MAIL_SECURE` / `MAIL_USER` / `MAIL_PASSWORD` | SMTP. Sin `MAIL_HOST`, los correos se loguean en vez de enviarse | opcionales |
| `MAIL_FROM` | Remitente de los correos | `no-reply@example.com` |
| `FRONTEND_URL` | Base del frontend para el enlace de recuperación | `http://localhost:5173` |
| `PASSWORD_RESET_TTL_MINUTES` | Vigencia del token de recuperación (minutos) | `60` |
| `THROTTLE_TTL` / `THROTTLE_LIMIT` | Rate limit global (ventana ms / peticiones) | `60000` / `100` |
| `TRUST_PROXY` | Proxies inversos de confianza delante de la app (`1` con nginx/Apache) | `0` |
| `SWAGGER_ENABLED` | Habilita `/docs` | `true` en dev, `false` en prod |
| `WS_ENABLED` | Habilita WebSockets (módulo events) | `false` |
| `LOG_LEVEL` | Nivel de log de pino | `info` |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | Credenciales del primer admin — solo las lee `pnpm seed`, la app no las usa | requeridas por el seed |

## Autenticación

Flujo JWT con **access token** (corto, 15 min) y **refresh token** (largo, 7 días) firmados con secretos distintos. Los tokens se entregan en **cookies `httpOnly`** (`access_token` y `refresh_token`), **nunca en el body**: si viajaran en la respuesta, un XSS podría llamar a `/refresh` (la cookie viaja sola) y leer tokens frescos, anulando el beneficio de `httpOnly`.

| Endpoint | Qué hace |
|---|---|
| `POST /api/v1/auth/register` | Crea el usuario (password con **argon2id**) y envía el correo de verificación. **No inicia sesión** |
| `POST /api/v1/auth/verify-email` | Verifica el correo con el token recibido; habilita el login |
| `POST /api/v1/auth/resend-verification` | Reenvía el correo de verificación; invalida el enlace anterior |
| `POST /api/v1/auth/login` | Setea las cookies. Mismo 401 exista o no el email (evita enumeración); **403 si el correo no está verificado** |
| `POST /api/v1/auth/refresh` | Lee el refresh de su cookie, **rota el par** y setea las nuevas cookies |
| `POST /api/v1/auth/logout` | Revoca el refresh token y limpia las cookies |
| `POST /api/v1/auth/forgot-password` | Envía por correo un enlace con token para recuperar la contraseña |
| `POST /api/v1/auth/reset-password` | Restablece la contraseña con el token recibido |

**Rotación con detección de reuso**: cada refresh invalida el token anterior. Si se presenta un refresh ya rotado (firma válida pero hash distinto al guardado), se asume robo y **se revoca la sesión completa** — el refresh vigente también deja de servir.

Del refresh token solo se guarda su **hash SHA-256** en la DB (columna `refresh_token_hash`), nunca el token en claro.

### Verificación de email

El registro **no emite sesión**: crea el usuario con un token de verificación (en DB solo su hash SHA-256) y envía el correo con el enlace `${FRONTEND_URL}/verify-email?token=...`. El **login queda bloqueado (403)** hasta que el correo se verifique con `POST /auth/verify-email`. El chequeo de verificación corre después de validar la contraseña, así no revela nada a terceros. El token es de un solo uso.

Si el correo se pierde, `POST /auth/resend-verification` genera un token nuevo (el enlace anterior queda invalidado) y reenvía. Responde **204 siempre** — exista o no el email, esté o no verificado — para no permitir enumeración de usuarios.

### Roles (RBAC)

Autorización simple por roles, lista para extender:

- `User.role` (`admin` | `user`, default `user`) — enum en [role.enum.ts](src/common/enums/role.enum.ts).
- El rol viaja **dentro del JWT**: sin consulta a DB por request. Un cambio de rol aplica al renovar el token (máx. 15 min) o al re-loguear.
- `@Roles(Role.ADMIN)` en cualquier handler/controller + [RolesGuard](src/common/guards/roles.guard.ts) global (orden: rate limit → auth → roles). Sin `@Roles`, basta estar autenticado.
- Ejemplo funcionando: `GET /api/v1/users` (listado paginado, solo admin).
- El primer admin se crea con **`pnpm seed`** ([seed.ts](src/database/seed.ts)): lee `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` del `.env`, valida la política de contraseñas y es **idempotente** (si el usuario existe lo promueve; si ya es admin, no hace nada). El registro público siempre crea `user` (el DTO no acepta rol: sin mass-assignment).

### Recuperación de contraseña

Flujo en dos pasos, sin revelar si un email existe:

1. `POST /auth/forgot-password` con `{ email }` → responde **204 siempre** (exista o no el email, evita enumeración). Si existe, genera un token aleatorio de 256 bits, guarda en la DB solo su **hash SHA-256** con vencimiento (`PASSWORD_RESET_TTL_MINUTES`, default 60) y envía un correo con el enlace `${FRONTEND_URL}/reset-password?token=...`.
2. `POST /auth/reset-password` con `{ token, password }` → valida el hash y el vencimiento, aplica la política de contraseña, guarda la nueva (argon2id), **consume el token** (un solo uso) y **revoca todas las sesiones activas** (`refresh_token_hash = null`): si la cuenta estaba comprometida, el atacante queda fuera.

El envío usa **nodemailer** ([mail.service.ts](src/modules/mail/mail.service.ts), en el `MailModule` global y reutilizable). Sin `MAIL_HOST` configurado, el correo se escribe en los logs en vez de enviarse — la app arranca sin SMTP en desarrollo; en producción se configuran las variables `MAIL_*`.

Los correos se arman con **templates multi-idioma** en [templates/](src/modules/mail/templates): cada template es una función que recibe el idioma y sus parámetros y devuelve `{ subject, html, text }`. Las traducciones viven junto a los templates (`templates/i18n/es.json`, `en.json`) y el idioma sale del request (`Accept-Language`), igual que el resto de la API, con fallback a español. Para agregar un idioma: crear el JSON y sumarlo al mapa de `mail-template.ts`; para un correo nuevo: crear su `*.template.ts` reutilizando `layout()` e `interpolate()`.

### Política de contraseñas

La política vive en el decorador reutilizable [`@IsStrongPassword()`](src/common/decorators/is-strong-password.decorator.ts), usado en registro y en el reset de contraseña: entre **8 y 128 caracteres** y al menos **una minúscula, una mayúscula, un número y un carácter especial**. El login no aplica la política (solo valida tipo y longitud máxima), para no rechazar credenciales legítimas creadas antes de un cambio de reglas. Los mensajes de error salen traducidos (es/en) vía `nestjs-i18n`.

### Propiedades de las cookies ([cookie.service.ts](src/modules/auth/cookie.service.ts))

- `httpOnly` — el JS del navegador no puede leerlas (mitiga robo por XSS).
- `SameSite=Lax` — no viajan en peticiones cross-site (mitiga CSRF).
- `Secure` — solo HTTPS; activo en producción por defecto (`COOKIE_SECURE`).
- La cookie de refresh tiene `Path=/api/v1/auth/refresh`: el token de larga vida solo viaja al único endpoint que lo necesita.
- El `maxAge` de cada cookie se deriva del TTL del JWT correspondiente.

### Consumir la API

- **Navegadores / SPAs**: hacer las peticiones con `credentials: 'include'` (CORS ya responde con `Access-Control-Allow-Credentials`). No hay que manejar tokens a mano.
- **Clientes API / móviles**: las estrategias también aceptan `Authorization: Bearer <token>` como fallback.
- **Swagger (`/docs`)**: al ejecutar `POST /auth/login` desde la propia UI, el navegador guarda las cookies (mismo origen) y el resto de los endpoints protegidos funcionan sin más pasos. Alternativa: botón **Authorize** con un Bearer token.
- **Postman / Insomnia**: manejan cookies automáticamente — basta llamar a login y las siguientes peticiones salen autenticadas. Con curl: `curl -c jar.txt -b jar.txt ...` (guarda y reenvía las cookies).

### Proteger rutas

El guard JWT es **global**: toda ruta nueva exige token automáticamente, salvo que se marque con `@Public()`. Para acceder al usuario autenticado:

```ts
@Get('me')
me(@CurrentUser() user: AuthenticatedUser) { ... }
```

Ejemplo funcionando: `GET /api/v1/users/me` devuelve el perfil del usuario autenticado.

> **Nota de diseño**: hay una sesión de refresh activa por usuario (simple y suficiente para la mayoría de APIs). Para multi-dispositivo, extender a una tabla `refresh_tokens` con `jti` por sesión.

## WebSockets

Infraestructura de socket.io lista para usar, en [src/modules/events/](src/modules/events/), **desactivada por defecto**: se enciende con `WS_ENABLED=true` en el `.env` (sin la variable, ni el módulo ni el servidor de sockets se registran — cero overhead para proyectos que no los usan).

El namespace es **`/events`** y **toda conexión exige un access token válido**: el handshake se autentica en un middleware (antes de aceptar la conexión) y sin token responde `connect_error` con `errors.UNAUTHORIZED`.

**URL de conexión** — base del servidor + namespace, sin el prefijo de la API:

```
http://localhost:3000/events        # desarrollo
https://api.midominio.com/events    # producción
```

Tres aclaraciones sobre la URL:

- `/events` es un **namespace lógico de socket.io, no una ruta HTTP** — el prefijo `/api/v1` solo aplica a los controllers REST. Abrir `/events` en el navegador da 404: es normal, solo el cliente de socket.io sabe hablarle.
- Se usa esquema **`http`/`https`, no `ws`/`wss`**: el cliente de socket.io negocia el upgrade a WebSocket solo.
- Todo el tráfico real (handshake y mensajes) viaja por el endpoint **`/socket.io/`**; si hay un proxy delante (nginx, traefik), es esa ruta la que necesita soporte de upgrade/WebSocket.

**Cliente browser** — la cookie httpOnly viaja sola:

```ts
import { io } from 'socket.io-client';
const socket = io('http://localhost:3000/events', { withCredentials: true });
socket.emit('ping');
socket.on('pong', (data) => console.log(data));
```

**Cliente Node / mobile** — token por `auth` (mismo access token del login):

```ts
const socket = io('http://localhost:3000/events', { auth: { token: accessToken } });
```

**Emitir desde cualquier módulo** — cada usuario entra a su room `user:{id}` al conectar; `EventsService` (exportado por `EventsModule`) permite notificarle a todas sus conexiones:

```ts
// en el módulo: imports: [EventsModule]
constructor(private readonly eventsService: EventsService) {}

this.eventsService.emitToUser(userId, 'notification', { text: 'Hola' });
this.eventsService.emitToAll('announcement', { text: 'Para todos' });
```

Detalles de diseño:

- El **CORS** del gateway lo aporta [`SocketIoAdapter`](src/common/adapters/socket-io.adapter.ts) (registrado en main.ts) con los mismos `CORS_ORIGINS` + credentials del HTTP.
- `@Roles()` funciona igual en eventos WS que en rutas HTTP (el `RolesGuard` global es context-aware).
- Los errores en handlers se emiten por el evento **`exception`** con `{ status, message, timestamp }`; los mensajes son claves del catálogo i18n **sin traducir** (en WS no hay `Accept-Language` por evento).
- Para un gateway nuevo: replicar el patrón de [`events.gateway.ts`](src/modules/events/events.gateway.ts) (`@UseGuards(WsJwtGuard)` + `@UseFilters(WsExceptionsFilter)` + middleware de handshake en `afterInit`).
- Si el proyecto no necesita sockets: basta dejar `WS_ENABLED=false` (o borrar la variable). Para eliminarlos del todo: quitar el `ConditionalModule.registerWhen(EventsModule, ...)` de `app.module.ts`, el bloque del adapter en `main.ts` y la carpeta `src/modules/events/`.

## Paginación estándar

Todo listado usa el mismo patrón, definido en `src/common/dto/`:

- [`PaginationQueryDto`](src/common/dto/pagination-query.dto.ts): `?page=2&limit=20&order=desc` — `limit` con tope 100, valores validados y con defaults.
- [`Paginated<T>`](src/common/dto/paginated.dto.ts): respuesta uniforme `{ items, total, page, limit, pages }`.

```ts
// En el use case:
const [items, total] = await this.repo.findAndCount({
  skip: query.skip,
  take: query.limit,
  order: { createdAt: query.order === 'asc' ? 'ASC' : 'DESC' },
});
return new Paginated(items, total, query);
```

Ejemplo funcionando: `GET /api/v1/users?page=1&limit=20` (solo admin).

## Seguridad incluida

- **Tokens en cookies `httpOnly`** con `SameSite=Lax` y `Secure` en producción.
- **Verificación de email obligatoria** antes de poder iniciar sesión.
- **Solo se parsea body JSON** (sin parser `urlencoded`): un `<form>` cross-site llega con body vacío y se rechaza — cierra el login-CSRF. Límite de tamaño de body explícito (`BODY_LIMIT`).
- **RBAC** con guard global de roles (`@Roles`), también en eventos WebSocket.
- **WebSockets autenticados**: el handshake de socket.io exige access token (cookie o `auth.token`) y el CORS del gateway respeta `CORS_ORIGINS`.
- **helmet** (headers de seguridad) y **CORS** restringido a `CORS_ORIGINS`.
- **Rate limiting** global (`@nestjs/throttler`) + límite estricto de 5/min en los endpoints de auth (blanco típico de fuerza bruta).
- **ValidationPipe global** (`I18nValidationPipe`) con `whitelist` + `forbidNonWhitelisted`: cualquier propiedad fuera del DTO rechaza la petición.
- **ClassSerializerInterceptor global**: `password` y `refreshTokenHash` tienen `@Exclude()` (y `select: false` en la entidad), jamás salen en una respuesta.
- **Filtro global de excepciones**: formato de error uniforme con `requestId`, sin stack traces ni detalles internos al cliente. Mapea errores conocidos de Postgres a HTTP correcto (unique violation → 409, FK violation → 409, uuid inválido → 400) — p. ej., la carrera de dos registros simultáneos con el mismo email responde 409, no 500.
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

### Transacciones

**Buena práctica obligatoria**: cuando un use case escribe en **múltiples tablas** (o hace varias escrituras que deben ser atómicas), las operaciones van dentro de una **transacción**. Si algo falla a mitad de camino, se hace rollback automático de todo y la DB nunca queda en estado inconsistente (ej.: una orden creada sin sus ítems, un paciente sin su historia clínica inicial).

El patrón: el use case inyecta `DataSource` y usa `dataSource.transaction()`. Todas las escrituras dentro del callback deben hacerse con el `manager` transaccional — una escritura hecha con el repository inyectado quedaría **fuera** de la transacción y no participaría del rollback.

```ts
@Injectable()
export class CreateOrderUseCase {
  constructor(private readonly dataSource: DataSource) {}

  async execute(dto: CreateOrderDto): Promise<Order> {
    return this.dataSource.transaction(async (manager) => {
      const order = await manager.save(
        manager.create(Order, { customerId: dto.customerId }),
      );
      const items = dto.items.map((item) =>
        manager.create(OrderItem, { ...item, orderId: order.id }),
      );
      await manager.save(items);
      // Si cualquier operación lanza una excepción, TypeORM hace ROLLBACK
      // de todo; si el callback termina bien, hace COMMIT.
      return order;
    });
  }
}
```

Reglas prácticas:

- **Una escritura en una sola tabla no necesita transacción** — no agregar overhead donde no aporta.
- La transacción se abre y se cierra **dentro del use case** (es parte de la lógica de negocio); nunca en el controller ni en el service.
- Mantener la transacción **corta**: solo operaciones de DB. Nada de llamadas HTTP, colas o envío de emails dentro del callback — mantienen la conexión tomada y los locks abiertos.
- Los efectos externos (notificaciones, webhooks) van **después** del commit: si van dentro y la transacción hace rollback, el efecto externo ya salió y no se puede deshacer.

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

## Errores e i18n

Toda respuesta de error sale con el mismo formato (armado en los filtros de [common/filters/](src/common/filters/)) y el `message` se traduce al idioma que el cliente pida en la cabecera `Accept-Language` (`es` | `en`; sin cabecera o idioma no soportado → español). Variantes regionales como `es-AR` o `en-US` resuelven al idioma base.

```json
{
  "statusCode": 401,
  "error": "Unauthorized",
  "message": "Credenciales inválidas",
  "path": "/api/v1/auth/login",
  "timestamp": "2026-07-14T23:55:11.969Z",
  "requestId": "e2775f18-..."
}
```

Cómo funciona:

- Los textos viven en [src/i18n/](src/i18n/) (`es/` y `en/`, un JSON por dominio). `nest build` los copia a `dist` (assets en `nest-cli.json`).
- **Excepciones de negocio**: se lanzan con la clave de traducción como mensaje — `throw new UnauthorizedException('errors.INVALID_CREDENTIALS')` — y el filtro global ([all-exceptions.filter.ts](src/common/filters/all-exceptions.filter.ts)) la resuelve al idioma del request. Un mensaje que no empieza con `errors.` pasa tal cual.
- **Validación de DTOs**: los decoradores usan `i18nValidationMessage('validation.XXX')` y el `I18nValidationPipe` global; [i18n-validation.filter.ts](src/common/filters/i18n-validation.filter.ts) traduce y mantiene el formato de respuesta. Placeholders disponibles: `{property}`, `{value}`, `{constraints.0}`.
- El campo `error` (nombre del status HTTP) queda en inglés a propósito: es un identificador para máquinas, no un texto para mostrar.
- Para agregar un idioma: crear `src/i18n/<lang>/` con los mismos JSON — el resolver lo detecta solo.
- Limitación conocida: el mensaje de `forbidNonWhitelisted` ("property X should not exist") lo genera el propio pipe y no es traducible.

Para agregar un error nuevo: sumar la clave en `es/errors.json` **y** `en/errors.json`, y lanzarla como mensaje de la excepción.

## Tests

```bash
pnpm test        # unit: flujo de auth completo vía la fachada (hashing, login
                 # no-enumerable, rotación, detección de reuso), guard de roles
                 # y filtro de excepciones
pnpm test:e2e    # e2e con HTTP y DB reales: cookies httpOnly, verificación de
                 # email, roles, paginación, recuperación de contraseña, health
```

Los e2e usan su **propia base** (`base_nestjs_test`, config en [.env.test](.env.test)): `pnpm test:e2e` la crea y migra solo si hace falta ([setup-e2e-db.ts](test/setup-e2e-db.ts)) y trunca las tablas al inicio de cada corrida — la DB de desarrollo nunca se toca (hay cinturón de seguridad: si el nombre de la DB no contiene `test`, el suite aborta).

## Docker (producción)

Imagen multi-stage: compila, poda a dependencias de producción y corre como usuario no-root.

```bash
docker build -t base-nestjs .
docker run --env-file .env -p 3000:3000 base-nestjs
```

Los logs de archivo se escriben en `/app/logs`: montar un volumen ahí si se quiere persistirlos fuera del contenedor.

## Checklist de producción

Antes del primer despliegue:

- [ ] `NODE_ENV=production` — activa los defaults seguros: cookies `Secure`, Swagger apagado, logs JSON.
- [ ] Secretos JWT **nuevos** (no los de desarrollo): `openssl rand -hex 32` para cada uno.
- [ ] `CORS_ORIGINS` con los dominios reales del frontend (sin `localhost`).
- [ ] Servir **solo por HTTPS**: con `COOKIE_SECURE=true` (default en prod) las cookies de auth no viajan por HTTP plano.
- [ ] **Detrás de un proxy/balanceador** (nginx, Apache, traefik, ALB): poner `TRUST_PROXY=1` (o la cantidad de saltos) y verificar que el proxy reenvíe `X-Forwarded-For` — ver [Desplegar detrás de nginx/Apache](#desplegar-detrás-de-nginxapache). Sin esto el rate limiting cuenta todas las peticiones contra la IP del proxy (un solo cliente puede agotar la cuota de todos).
- [ ] Correr `pnpm migration:run` como paso del deploy, **antes** de levantar la app nueva.
- [ ] `pnpm seed` una única vez con credenciales de admin reales (rotar `SEED_ADMIN_PASSWORD` después).
- [ ] Configurar `MAIL_*` con el SMTP real — sin `MAIL_HOST` los correos de verificación y recuperación solo se loguean, y nadie podrá completar el registro.
- [ ] Si `WS_ENABLED=true` y hay proxy: habilitar upgrade/WebSocket en la ruta `/socket.io/`.
- [ ] Volumen o shipping de logs para `/app/logs` (o borrar los destinos de archivo y quedarse solo con stdout si el orquestador ya recolecta).
- [ ] Apuntar los probes de liveness/readiness a `GET /health`.

## Desplegar detrás de nginx/Apache

Con un proxy inverso delante, la app recibe todas las conexiones desde la IP del proxy. Para que `req.ip` sea la **IP real del cliente** (de eso dependen el rate limiting por usuario y los logs) hacen falta dos cosas: que el proxy reenvíe la IP en `X-Forwarded-For` y que la app confíe en él (`TRUST_PROXY=1`; con dos saltos, p. ej. Cloudflare → nginx, `TRUST_PROXY=2`).

**nginx**:

```nginx
server {
    listen 443 ssl;
    server_name api.midominio.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # WebSockets (solo si WS_ENABLED=true)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

**Apache** (módulos `proxy`, `proxy_http`; `proxy_wstunnel` y `rewrite` para sockets):

```apache
<VirtualHost *:443>
    ServerName api.midominio.com

    ProxyPreserveHost On
    # mod_proxy agrega X-Forwarded-For automáticamente

    # WebSockets (solo si WS_ENABLED=true) — antes del ProxyPass general
    RewriteEngine On
    RewriteCond %{HTTP:Upgrade} =websocket [NC]
    RewriteRule ^/socket.io/(.*) ws://127.0.0.1:3000/socket.io/$1 [P,L]

    ProxyPass / http://127.0.0.1:3000/
    ProxyPassReverse / http://127.0.0.1:3000/
</VirtualHost>
```

Y en el `.env` de la app: `TRUST_PROXY=1`.

> Importante: `TRUST_PROXY` debe quedar en `0` cuando NO hay proxy — si la app confía en `X-Forwarded-For` estando expuesta directo, cualquier cliente puede falsificar su IP con esa cabecera y evadir el rate limiting.

## Estructura

```
src/
├── main.ts                  # bootstrap: helmet, cookies, CORS, pipes, versioning, swagger
├── app.module.ts            # config, DB, logger, throttler + providers globales
├── config/                  # validación Zod del env + configs tipadas por dominio
├── common/
│   ├── adapters/            # SocketIoAdapter (CORS de sockets desde config)
│   ├── decorators/          # @Public, @CurrentUser, @Roles, @IsStrongPassword
│   ├── dto/                 # PaginationQueryDto, Paginated<T>
│   ├── entities/            # BaseEntity (id, timestamps, soft delete)
│   ├── enums/               # Role
│   ├── guards/              # RolesGuard (global, HTTP y WS)
│   └── filters/             # filtro global de excepciones + validación i18n
├── i18n/                    # traducciones de errores y validación (es, en)
├── database/                # módulo TypeORM, data-source del CLI, migraciones
├── modules/
│   ├── mail/                # MailModule global: envío vía nodemailer
│   │   └── templates/       # templates de correo + traducciones (i18n/es|en)
│   ├── users/
│   │   ├── entities/        # entidad User (role, verificación, tokens)
│   │   ├── use-cases/       # get-profile, list-users (paginado, admin)
│   │   ├── users.service.ts # fachada
│   │   └── users.controller.ts
│   ├── auth/
│   │   ├── dto/             # register, login, verify-email, forgot/reset-password
│   │   ├── guards/          # jwt, jwt-refresh
│   │   ├── strategies/      # extracción cookie-first con fallback Bearer
│   │   ├── use-cases/       # register, verify-email, login, refresh, logout,
│   │   │                    # forgot-password, reset-password
│   │   ├── token.service.ts # soporte: emisión y hash de tokens
│   │   ├── cookie.service.ts# soporte: entrega/limpieza de cookies httpOnly
│   │   ├── auth.service.ts  # fachada
│   │   └── auth.controller.ts
│   └── events/              # WebSockets: gateway /events con handshake autenticado
│       ├── events.gateway.ts    # ejemplo ping→pong + room user:{id}
│       ├── events.service.ts    # emitToUser/emitToAll para otros módulos
│       ├── ws-auth.service.ts   # verificación del token en el handshake
│       ├── guards/              # WsJwtGuard
│       └── filters/             # WsExceptionsFilter (evento 'exception')
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
