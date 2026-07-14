import { ConfigService, registerAs } from '@nestjs/config';
import { ThrottlerModuleOptions } from '@nestjs/throttler';

export default registerAs('throttler', () => ({
  ttl: parseInt(process.env.THROTTLE_TTL ?? '60000', 10),
  limit: parseInt(process.env.THROTTLE_LIMIT ?? '100', 10),
}));

export const throttlerFactory = (
  config: ConfigService,
): ThrottlerModuleOptions => ({
  throttlers: [
    {
      ttl: config.getOrThrow<number>('throttler.ttl'),
      limit: config.getOrThrow<number>('throttler.limit'),
    },
  ],
  // Clave de traducción: AllExceptionsFilter la resuelve al idioma del request.
  errorMessage: 'errors.TOO_MANY_REQUESTS',
});
