import * as Joi from 'joi';

/**
 * Única fuente de verdad de las variables de entorno.
 * Si falta una variable obligatoria, la app aborta el arranque (fail-fast).
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  API_PREFIX: Joi.string().default('api'),
  // Lista separada por comas de orígenes permitidos, ej: http://localhost:5173,https://app.example.com
  CORS_ORIGINS: Joi.string().default(''),

  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().port().default(5432),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().required(),
  DB_SSL: Joi.boolean().default(false),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string()
    .min(32)
    .required()
    .invalid(Joi.ref('JWT_ACCESS_SECRET'))
    .messages({
      'any.invalid':
        'JWT_REFRESH_SECRET must be different from JWT_ACCESS_SECRET',
    }),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),

  THROTTLE_TTL: Joi.number().default(60000),
  THROTTLE_LIMIT: Joi.number().default(100),

  // Correo (SMTP). Opcionales: sin MAIL_HOST se usa un transporte que escribe
  // el correo en los logs (útil en desarrollo). En producción, configurarlos.
  MAIL_HOST: Joi.string().allow('').default(''),
  MAIL_PORT: Joi.number().port().default(587),
  MAIL_SECURE: Joi.boolean().default(false),
  MAIL_USER: Joi.string().allow('').default(''),
  MAIL_PASSWORD: Joi.string().allow('').default(''),
  MAIL_FROM: Joi.string().default('no-reply@example.com'),

  // Tamaño máximo del body JSON (formato de la librería bytes: 100kb, 1mb...).
  BODY_LIMIT: Joi.string().default('100kb'),

  FRONTEND_URL: Joi.string().uri().default('http://localhost:5173'),
  PASSWORD_RESET_TTL_MINUTES: Joi.number().positive().default(60),

  // Flag Secure de las cookies de auth (solo HTTPS). Default: true en producción.
  COOKIE_SECURE: Joi.boolean().when('NODE_ENV', {
    is: 'production',
    then: Joi.boolean().default(true),
    otherwise: Joi.boolean().default(false),
  }),

  SWAGGER_ENABLED: Joi.boolean().when('NODE_ENV', {
    is: 'production',
    then: Joi.boolean().default(false),
    otherwise: Joi.boolean().default(true),
  }),
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace')
    .default('info'),
});

export const envValidationOptions = {
  abortEarly: false,
  allowUnknown: true,
};
