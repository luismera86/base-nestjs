import { VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { json } from 'express';
import helmet from 'helmet';
import { I18nValidationPipe } from 'nestjs-i18n';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap() {
  // bodyParser: false → se registra SOLO el parser JSON (abajo). Sin el parser
  // urlencoded, un <form> cross-site (simple request, sin preflight de CORS)
  // llega con body vacío y la validación lo rechaza: cierra el login-CSRF.
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });
  const logger = app.get(Logger);
  app.useLogger(logger);

  const config = app.get(ConfigService);

  app.use(helmet());
  app.use(compression());
  app.use(json({ limit: config.getOrThrow<string>('app.bodyLimit') }));
  app.use(cookieParser());

  const corsOrigins = config.getOrThrow<string[]>('app.corsOrigins');
  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : false,
    // Los tokens viajan en cookies: el frontend debe pedir con credentials: 'include'.
    credentials: true,
  });

  // Rutas: /api/v1/... — /health queda fuera del prefijo para los probes de infra.
  app.setGlobalPrefix(config.getOrThrow<string>('app.apiPrefix'), {
    exclude: ['health'],
  });
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // I18nValidationPipe = ValidationPipe + mensajes de error traducibles.
  app.useGlobalPipes(
    new I18nValidationPipe({
      whitelist: true, // descarta propiedades fuera del DTO
      forbidNonWhitelisted: true, // ...y además rechaza la petición si vienen
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  const swaggerEnabled = config.getOrThrow<boolean>('app.swaggerEnabled');
  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('API')
      .setDescription('Documentación de la API')
      .setVersion('1.0')
      .addBearerAuth()
      .addCookieAuth('access_token')
      .addGlobalParameters({
        name: 'Accept-Language',
        in: 'header',
        required: false,
        description: 'Idioma de los mensajes de error (por defecto: es)',
        schema: { type: 'string', enum: ['es', 'en'], default: 'es' },
      })
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  app.enableShutdownHooks();

  await app.listen(config.getOrThrow<number>('app.port'));

  const url = (await app.getUrl()).replace(/\[::1?\]|0\.0\.0\.0/, 'localhost');
  logger.log(
    `Servidor escuchando en ${url}/${config.getOrThrow<string>('app.apiPrefix')}/v1`,
  );
  if (swaggerEnabled) {
    logger.log(`Documentación disponible en ${url}/docs`);
  }
}
void bootstrap();
