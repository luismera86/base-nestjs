import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import * as cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { MailService } from '../src/modules/mail/mail.service';

type SentMail = { to: string; subject: string; html: string; text: string };

type UserBody = {
  email: string;
  password?: string;
  refreshTokenHash?: string;
};
type HealthBody = { status: string; details: { database: { status: string } } };

/** Devuelve los headers Set-Cookie de la respuesta. */
const setCookies = (res: request.Response): string[] => {
  const header = res.headers['set-cookie'] as unknown;
  if (Array.isArray(header)) return header as string[];
  return typeof header === 'string' ? [header] : [];
};

/** Header Set-Cookie completo de una cookie por nombre. */
const findCookie = (res: request.Response, name: string): string | undefined =>
  setCookies(res).find((cookie) => cookie.startsWith(`${name}=`));

/** Valor crudo de una cookie por nombre. */
const cookieValue = (res: request.Response, name: string): string =>
  findCookie(res, name)?.split(';')[0].split('=')[1] ?? '';

/**
 * E2E del flujo de auth completo (tokens en cookies httpOnly).
 * Requiere el Postgres de docker-compose levantado y las migraciones
 * ejecutadas (pnpm migration:run).
 */
describe('Auth (e2e)', () => {
  let app: NestExpressApplication;
  const email = `e2e-${randomUUID()}@example.com`;
  const password = 'A-very-long-passw0rd!';
  let accessCookie: string;
  let refreshCookie: string;
  // Captura los correos en vez de enviarlos, para leer el token de reset.
  const sentMails: SentMail[] = [];
  const mailServiceMock = {
    sendMail: (mail: SentMail) => {
      sentMails.push(mail);
      return Promise.resolve();
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MailService)
      .useValue(mailServiceMock)
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    // Replica la configuración de main.ts que afecta al routing/validación.
    app.use(cookieParser());
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

  it('POST /api/v1/auth/register → 201 con cookies httpOnly y sin tokens en el body', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password })
      .expect(201);

    const accessSetCookie = findCookie(res, 'access_token');
    const refreshSetCookie = findCookie(res, 'refresh_token');
    expect(accessSetCookie).toContain('HttpOnly');
    expect(accessSetCookie).toContain('SameSite=Lax');
    expect(refreshSetCookie).toContain('HttpOnly');
    // La cookie de refresh solo viaja al endpoint de refresh.
    expect(refreshSetCookie).toContain('Path=/api/v1/auth/refresh');

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('accessToken');
    expect(serialized).not.toContain('refreshToken');
    expect(serialized).not.toContain('password');
  });

  it('rechaza propiedades fuera del DTO (forbidNonWhitelisted) → 400', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: `x-${email}`, password, isAdmin: true })
      .expect(400);
  });

  it('rechaza contraseñas débiles (sin mayúscula/número/símbolo) → 400', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: `weak-${email}`, password: 'alllowercaseletters' })
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

  it('POST /api/v1/auth/login OK → setea cookies de access y refresh', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);

    accessCookie = cookieValue(res, 'access_token');
    refreshCookie = cookieValue(res, 'refresh_token');
    expect(accessCookie).toBeTruthy();
    expect(refreshCookie).toBeTruthy();
  });

  it('GET /api/v1/users/me sin cookie → 401; con cookie → 200 sin campos sensibles', async () => {
    await request(app.getHttpServer()).get('/api/v1/users/me').expect(401);

    const res = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Cookie', `access_token=${accessCookie}`)
      .expect(200);

    const body = res.body as UserBody;
    expect(body.email).toBe(email);
    expect(body.password).toBeUndefined();
    expect(body.refreshTokenHash).toBeUndefined();
  });

  it('mantiene el fallback Bearer para clientes API', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessCookie}`)
      .expect(200);
  });

  it('POST /api/v1/auth/refresh → rota cookies; el refresh viejo deja de servir', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', `refresh_token=${refreshCookie}`)
      .expect(200);

    const oldRefreshCookie = refreshCookie;
    accessCookie = cookieValue(res, 'access_token');
    refreshCookie = cookieValue(res, 'refresh_token');
    expect(refreshCookie).toBeTruthy();
    expect(refreshCookie).not.toBe(oldRefreshCookie);

    // Reusar el refresh anterior debe fallar (rotación + detección de reuso).
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', `refresh_token=${oldRefreshCookie}`)
      .expect(401);
  });

  it('POST /api/v1/auth/logout → 204, limpia cookies y revoca la sesión', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', `access_token=${accessCookie}`)
      .expect(204);

    // Las cookies se limpian (valor vacío).
    expect(cookieValue(res, 'access_token')).toBe('');
    expect(cookieValue(res, 'refresh_token')).toBe('');

    // El refresh vigente quedó revocado en DB.
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', `refresh_token=${refreshCookie}`)
      .expect(401);
  });

  describe('recuperación de contraseña', () => {
    const newPassword = 'A-new-str0ng-passw0rd!';
    let resetToken: string;

    it('POST /api/v1/auth/forgot-password con email inexistente → 204 sin enviar correo', async () => {
      sentMails.length = 0;
      await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send({ email: `nadie-${randomUUID()}@example.com` })
        .expect(204);

      expect(sentMails).toHaveLength(0);
    });

    it('POST /api/v1/auth/forgot-password con email real → 204 y envía el correo con el token', async () => {
      sentMails.length = 0;
      await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send({ email })
        .expect(204);

      expect(sentMails).toHaveLength(1);
      expect(sentMails[0].to).toBe(email);
      const match = /token=([a-f0-9]+)/.exec(sentMails[0].text);
      resetToken = match?.[1] ?? '';
      expect(resetToken).toHaveLength(64); // 32 bytes en hex
    });

    it('el correo sale en el idioma del request (Accept-Language)', async () => {
      sentMails.length = 0;
      await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .set('Accept-Language', 'en')
        .send({ email })
        .expect(204);

      expect(sentMails[0].subject).toBe('Password recovery');

      // Sin header → idioma por defecto (es). Este es el token que se usa después.
      sentMails.length = 0;
      await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send({ email })
        .expect(204);

      expect(sentMails[0].subject).toBe('Recuperación de contraseña');
      const match = /token=([a-f0-9]+)/.exec(sentMails[0].text);
      resetToken = match?.[1] ?? '';
      expect(resetToken).toHaveLength(64);
    });

    it('POST /api/v1/auth/reset-password con token inválido → 401', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({ token: 'token-que-no-existe', password: newPassword })
        .expect(401);
    });

    it('POST /api/v1/auth/reset-password con contraseña débil → 400', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({ token: resetToken, password: 'debil' })
        .expect(400);
    });

    it('POST /api/v1/auth/reset-password con token válido → 204 y cambia la contraseña', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({ token: resetToken, password: newPassword })
        .expect(204);

      // La contraseña vieja ya no sirve; la nueva sí.
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password })
        .expect(401);
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: newPassword })
        .expect(200);
    });

    it('el token de reset es de un solo uso → 401 al reutilizarlo', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({ token: resetToken, password: 'A-third-passw0rd!' })
        .expect(401);
    });
  });

  it('GET /health → 200 público con check de DB', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    const body = res.body as HealthBody;
    expect(body.status).toBe('ok');
    expect(body.details.database.status).toBe('up');
  });
});
