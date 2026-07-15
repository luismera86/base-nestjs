import { z } from 'zod';

/**
 * Única fuente de verdad de las variables de entorno.
 * Si falta una variable obligatoria o hay un valor inválido, la app
 * aborta el arranque (fail-fast) listando TODOS los errores.
 */

// 'true'/'false' de texto (env vars siempre son strings) → boolean real.
const booleanString = z.enum(['true', 'false']).transform((v) => v === 'true');

const port = z.coerce.number().int().min(1).max(65535);

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: port.default(3000),
    API_PREFIX: z.string().default('api'),
    // Lista separada por comas de orígenes permitidos, ej: http://localhost:5173,https://app.example.com
    CORS_ORIGINS: z.string().default(''),
    // Tamaño máximo del body JSON (formato de la librería bytes: 100kb, 1mb...).
    BODY_LIMIT: z.string().default('100kb'),

    DB_HOST: z.string().min(1),
    DB_PORT: port.default(5432),
    DB_USERNAME: z.string().min(1),
    DB_PASSWORD: z.string().min(1),
    DB_NAME: z.string().min(1),
    DB_SSL: booleanString.default(false),

    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
    JWT_REFRESH_SECRET: z.string().min(32),
    JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

    // Flag Secure de las cookies de auth (solo HTTPS).
    // Sin valor: true en producción, false en el resto (ver validateEnv).
    COOKIE_SECURE: booleanString.optional(),

    THROTTLE_TTL: z.coerce.number().int().positive().default(60000),
    THROTTLE_LIMIT: z.coerce.number().int().positive().default(100),

    // Cantidad de proxies inversos de confianza delante de la app (nginx,
    // Apache, ALB...). 0 = ninguno. Con proxy y valor 0, el rate limiting
    // cuenta a todos los usuarios contra la IP del proxy.
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),

    // Correo (SMTP). Opcionales: sin MAIL_HOST se usa un transporte que escribe
    // el correo en los logs (útil en desarrollo). En producción, configurarlos.
    MAIL_HOST: z.string().default(''),
    MAIL_PORT: port.default(587),
    MAIL_SECURE: booleanString.default(false),
    MAIL_USER: z.string().default(''),
    MAIL_PASSWORD: z.string().default(''),
    MAIL_FROM: z.string().default('no-reply@example.com'),

    FRONTEND_URL: z.url().default('http://localhost:5173'),
    PASSWORD_RESET_TTL_MINUTES: z.coerce.number().positive().default(60),

    // Swagger en /docs. Sin valor: true en dev, false en producción (ver validateEnv).
    SWAGGER_ENABLED: booleanString.optional(),
    // WebSockets (módulo events). Apagado por defecto: activar solo si el
    // proyecto los usa (sin la variable, el gateway ni se registra).
    WS_ENABLED: booleanString.default(false),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
      .default('info'),
  })
  .refine((env) => env.JWT_ACCESS_SECRET !== env.JWT_REFRESH_SECRET, {
    path: ['JWT_REFRESH_SECRET'],
    message: 'JWT_REFRESH_SECRET must be different from JWT_ACCESS_SECRET',
  });

export type Env = z.infer<typeof envSchema>;

/** Hook de validación para ConfigModule.forRoot({ validate }). */
export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Variables de entorno inválidas:\n${details}`);
  }

  const env = result.data;
  // Defaults condicionados a NODE_ENV (equivalente al .when() de Joi):
  env.COOKIE_SECURE ??= env.NODE_ENV === 'production';
  env.SWAGGER_ENABLED ??= env.NODE_ENV !== 'production';
  return env;
}
