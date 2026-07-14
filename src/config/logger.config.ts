import { ConfigService } from '@nestjs/config';
import { Params } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import pino from 'pino';
import pretty from 'pino-pretty';
import { createStream } from 'rotating-file-stream';

const LOG_DIR = join(process.cwd(), 'logs');

/**
 * Contextos internos de Nest que solo hacen ruido en el arranque
 * (módulos inicializados, rutas mapeadas...). Se descartan en todos
 * los destinos. Quitar de la lista el que se quiera volver a ver.
 */
const SILENCED_CONTEXTS = new Set([
  'InstanceLoader',
  'RoutesResolver',
  'RouterExplorer',
]);

/**
 * Un destino de log es un stream de pino con su nivel mínimo. Se componen con
 * pino.multistream: agregar un storage nuevo (S3, CloudWatch, etc.) es sumar
 * una factory más en buildDestinations() — el resto del código no cambia.
 */
type LogDestination = pino.StreamEntry;

/**
 * Archivo local con rotación (diaria o al superar 20 MB), compresión gzip de
 * los rotados y retención automática (maxFiles: los más viejos se borran solos).
 */
const rotatingFileDestination = (
  name: string,
  level: pino.Level,
  maxFiles: number,
): LogDestination => ({
  level,
  stream: createStream(`${name}.log`, {
    path: LOG_DIR,
    interval: '1d',
    size: '20M',
    compress: 'gzip',
    maxFiles,
  }),
});

/** Consola legible para desarrollo, imitando el formato del logger de NestJS. */
const prettyConsoleDestination = (): LogDestination => {
  const RESET = '\x1b[0m';
  const YELLOW = '\x1b[33m';
  const LEVEL_COLORS: Record<number, string> = {
    10: '\x1b[36m', // trace → cyan
    20: '\x1b[95m', // debug → magenta brillante
    30: '\x1b[32m', // info → verde
    40: '\x1b[33m', // warn → amarillo
    50: '\x1b[31m', // error → rojo
    60: '\x1b[31m', // fatal → rojo
  };

  return {
    level: 'trace',
    stream: pretty({
      colorize: true,
      singleLine: true,
      translateTime: 'SYS:mm/dd/yyyy, h:MM:ss TT',
      // context se renderiza dentro del mensaje; pid/hostname son ruido.
      ignore: 'pid,hostname,context',
      messageFormat: (log, messageKey) => {
        const raw: unknown = log[messageKey];
        const message = typeof raw === 'string' ? raw : JSON.stringify(raw);
        const color = LEVEL_COLORS[log.level as number] ?? '';
        const context =
          typeof log.context === 'string'
            ? `${YELLOW}[${log.context}]${RESET} `
            : '';
        return `${context}${color}${message}${RESET}`;
      },
    }),
  };
};

const buildDestinations = (env: string): LogDestination[] => {
  // En test no se escriben archivos ni consola pretty: JSON plano a stdout.
  if (env === 'test') {
    return [{ level: 'trace', stream: process.stdout }];
  }
  const destinations: LogDestination[] = [
    // combined: todo desde debug; error: solo error y fatal.
    rotatingFileDestination('combined', 'debug', 14),
    rotatingFileDestination('error', 'error', 30),
  ];
  if (env === 'development') {
    destinations.push(prettyConsoleDestination());
  } else {
    // En producción también JSON a stdout (docker/orquestadores lo recolectan).
    destinations.push({ level: 'trace', stream: process.stdout });
  }
  return destinations;
};

/**
 * Configuración de nestjs-pino:
 * - request-id por petición (propaga el x-request-id entrante o genera uno)
 * - redacción de credenciales y tokens en los logs
 * - archivos combined.log / error.log con rotación y retención
 * - consola legible estilo NestJS en development, JSON puro en producción
 */
export const loggerFactory = (config: ConfigService): Params => {
  const env = config.getOrThrow<string>('app.env');

  return {
    pinoHttp: [
      {
        level: config.getOrThrow<string>('app.logLevel'),
        timestamp: pino.stdTimeFunctions.isoTime,
        genReqId: (req, res) => {
          const requestId =
            (req.headers['x-request-id'] as string) ?? randomUUID();
          res.setHeader('x-request-id', requestId);
          return requestId;
        },
        // Nunca loguear credenciales ni tokens.
        redact: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.body.password',
          'req.body.refreshToken',
        ],
        hooks: {
          // Descarta los logs cuyo context esté silenciado.
          logMethod(args, method) {
            const first: unknown = args[0];
            const context =
              typeof first === 'object' && first !== null
                ? (first as { context?: string }).context
                : undefined;
            if (context && SILENCED_CONTEXTS.has(context)) {
              return;
            }
            method.apply(this, args);
          },
        },
      },
      pino.multistream(buildDestinations(env)),
    ],
    // Sintaxis de wildcard de Express 5: evita el WARN de LegacyRouteConverter
    // que dispara el '*' legacy con el que nestjs-pino registra su middleware.
    forRoutes: ['{*splat}'],
  };
};
