import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  apiPrefix: process.env.API_PREFIX ?? 'api',
  corsOrigins: (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  swaggerEnabled: process.env.SWAGGER_ENABLED === 'true',
  // WebSockets: el módulo events y su adapter solo se registran si está activo.
  wsEnabled: process.env.WS_ENABLED === 'true',
  // Cookies con Secure (solo HTTPS). Default: activo en producción.
  cookieSecure: process.env.COOKIE_SECURE
    ? process.env.COOKIE_SECURE === 'true'
    : process.env.NODE_ENV === 'production',
  // Tamaño máximo del body JSON aceptado.
  bodyLimit: process.env.BODY_LIMIT ?? '100kb',
  // Proxies inversos de confianza (para que req.ip sea la IP real del cliente).
  trustProxy: parseInt(process.env.TRUST_PROXY ?? '0', 10),
  // Base del frontend: se usa para armar el link de recuperación de contraseña.
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  // Vigencia del token de recuperación de contraseña, en minutos.
  passwordResetTtlMinutes: parseInt(
    process.env.PASSWORD_RESET_TTL_MINUTES ?? '60',
    10,
  ),
  logLevel: process.env.LOG_LEVEL ?? 'info',
}));
