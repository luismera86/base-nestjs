import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

type TokensBody = { accessToken: string; refreshToken: string };
type UserBody = {
  email: string;
  password?: string;
  refreshTokenHash?: string;
};
type HealthBody = { status: string; details: { database: { status: string } } };

/**
 * E2E del flujo de auth completo. Requiere el Postgres de docker-compose
 * levantado y las migraciones ejecutadas (pnpm migration:run).
 */
describe('Auth (e2e)', () => {
  let app: NestExpressApplication;
  const email = `e2e-${randomUUID()}@example.com`;
  const password = 'a-very-long-password-123';
  let accessToken: string;
  let refreshToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    // Replica la configuración de main.ts que afecta al routing/validación.
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/v1/auth/register → 201 sin exponer password ni refreshTokenHash', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password })
      .expect(201);

    const body = res.body as TokensBody;
    expect(body.accessToken).toBeDefined();
    expect(body.refreshToken).toBeDefined();
    expect(JSON.stringify(res.body)).not.toContain('password');
    expect(JSON.stringify(res.body)).not.toContain('refreshTokenHash');
  });

  it('rechaza propiedades fuera del DTO (forbidNonWhitelisted) → 400', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: `x-${email}`, password, isAdmin: true })
      .expect(400);
  });

  it('POST /api/v1/auth/login con credenciales malas → 401 con formato estándar', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'not-the-right-password' })
      .expect(401);

    const body = res.body as Record<string, unknown>;
    expect(body.statusCode).toBe(401);
    expect(typeof body.path).toBe('string');
    expect(typeof body.timestamp).toBe('string');
  });

  it('POST /api/v1/auth/login OK → tokens', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);

    const body = res.body as TokensBody;
    accessToken = body.accessToken;
    refreshToken = body.refreshToken;
    expect(accessToken).toBeDefined();
    expect(refreshToken).toBeDefined();
  });

  it('GET /api/v1/users/me sin token → 401; con token → 200 sin campos sensibles', async () => {
    await request(app.getHttpServer()).get('/api/v1/users/me').expect(401);

    const res = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const body = res.body as UserBody;
    expect(body.email).toBe(email);
    expect(body.password).toBeUndefined();
    expect(body.refreshTokenHash).toBeUndefined();
  });

  it('POST /api/v1/auth/refresh → rota tokens; el refresh viejo deja de servir', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Authorization', `Bearer ${refreshToken}`)
      .expect(200);

    const oldRefreshToken = refreshToken;
    refreshToken = (res.body as TokensBody).refreshToken;
    expect(refreshToken).not.toBe(oldRefreshToken);

    // Reusar el refresh anterior debe fallar (rotación + detección de reuso).
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Authorization', `Bearer ${oldRefreshToken}`)
      .expect(401);
  });

  it('GET /health → 200 público con check de DB', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    const body = res.body as HealthBody;
    expect(body.status).toBe('ok');
    expect(body.details.database.status).toBe('up');
  });
});
