import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);

  const config = app.get(ConfigService);

  app.use(helmet());

  const corsOrigins = config.getOrThrow<string[]>('app.corsOrigins');
  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : false,
    credentials: false,
  });

  // Rutas: /api/v1/... — /health queda fuera del prefijo para los probes de infra.
  app.setGlobalPrefix(config.getOrThrow<string>('app.apiPrefix'), {
    exclude: ['health'],
  });
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  app.useGlobalPipes(
    new ValidationPipe({
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
