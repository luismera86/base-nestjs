import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import { json } from 'express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { MailService } from '../src/modules/mail/mail.service';

type SentMail = { to: string; subject: string; html: string; text: string };
type UserBody = {
  email: string;
  password?: string;
  refreshTokenHash?: string;
};
type PaginatedBody = {
  items: { email: string }[];
  total: number;
  page: number;
  limit: number;
  pages: number;
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

/** Extrae el token (hex) del texto de un correo. */
const tokenFromMail = (mail: SentMail): string =>
  /token=([a-f0-9]+)/.exec(mail.text)?.[1] ?? '';

/**
 * E2E del flujo de auth completo (tokens en cookies httpOnly, verificación
 * de email obligatoria, RBAC y paginación). Requiere el Postgres de
 * docker-compose levantado y las migraciones ejecutadas (pnpm migration:run).
 */
describe('Auth (e2e)', () => {
  let app: NestExpressApplication;
  const email = `e2e-${randomUUID()}@example.com`;
  const password = 'A-very-long-passw0rd!';
  let accessCookie: string;
  let refreshCookie: string;
  // Captura los correos en vez de enviarlos, para leer los tokens.
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
      // El suite hace más de 5 llamadas/min a /auth/*: storage no-op para evitar 429.
      .overrideProvider(ThrottlerStorage)
      .useValue({
        increment: () =>
          Promise.resolve({
            totalHits: 1,
            timeToExpire: 0,
            isBlocked: false,
            timeToBlockExpire: 0,
          }),
      })
      .compile();

    // Replica la configuración de main.ts que afecta al routing/validación:
    // bodyParser deshabilitado + solo JSON (cierra login-CSRF vía form POST).
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
    });
    app.use(json({ limit: '100kb' }));
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

    // DB de test limpia en cada corrida. Cinturón de seguridad: solo si
    // efectivamente estamos sobre la base de test (.env.test).
    const dataSource = app.get(DataSource);
    const dbName = String(dataSource.options.database);
    if (!dbName.includes('test')) {
      throw new Error(
        `Los e2e deben correr sobre la DB de test, no "${dbName}"`,
      );
    }
    await dataSource.query('TRUNCATE TABLE "users" CASCADE');
  });

  afterAll(async () => {
    await app.close();
  });

  describe('registro y verificación de email', () => {
    let verificationToken: string;

    it('POST /api/v1/auth/register → 201 sin sesión y envía el correo de verificación', async () => {
      sentMails.length = 0;
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email, password })
        .expect(201);

      // No emite sesión: sin cookies de auth hasta verificar el correo.
      expect(findCookie(res, 'access_token')).toBeUndefined();
      expect(findCookie(res, 'refresh_token')).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain('password');

      expect(sentMails).toHaveLength(1);
      expect(sentMails[0].to).toBe(email);
      verificationToken = tokenFromMail(sentMails[0]);
      expect(verificationToken).toHaveLength(64);
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

    it('bloquea el login con 403 mientras el correo no esté verificado', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password })
        .expect(403);
    });

    it('POST /api/v1/auth/verify-email con token inválido → 401', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({ token: 'token-inexistente' })
        .expect(401);
    });

    it('POST /api/v1/auth/resend-verification con email inexistente → 204 sin enviar correo', async () => {
      sentMails.length = 0;
      await request(app.getHttpServer())
        .post('/api/v1/auth/resend-verification')
        .send({ email: `nadie-${randomUUID()}@example.com` })
        .expect(204);

      expect(sentMails).toHaveLength(0);
    });

    it('el reenvío invalida el token anterior y el nuevo verifica el correo', async () => {
      sentMails.length = 0;
      await request(app.getHttpServer())
        .post('/api/v1/auth/resend-verification')
        .send({ email })
        .expect(204);

      expect(sentMails).toHaveLength(1);
      const newToken = tokenFromMail(sentMails[0]);
      expect(newToken).not.toBe(verificationToken);

      // El token del primer correo ya no sirve.
      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({ token: verificationToken })
        .expect(401);

      // El nuevo sí: habilita el login.
      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({ token: newToken })
        .expect(204);
    });

    it('reenviar a un usuario ya verificado → 204 sin enviar correo', async () => {
      sentMails.length = 0;
      await request(app.getHttpServer())
        .post('/api/v1/auth/resend-verification')
        .send({ email })
        .expect(204);

      expect(sentMails).toHaveLength(0);
    });
  });

  describe('login y sesión', () => {
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

    it('POST /api/v1/auth/login OK → setea cookies httpOnly sin tokens en el body', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password })
        .expect(200);

      const accessSetCookie = findCookie(res, 'access_token');
      const refreshSetCookie = findCookie(res, 'refresh_token');
      expect(accessSetCookie).toContain('HttpOnly');
      expect(accessSetCookie).toContain('SameSite=Lax');
      // La cookie de refresh solo viaja al endpoint de refresh.
      expect(refreshSetCookie).toContain('Path=/api/v1/auth/refresh');
      expect(JSON.stringify(res.body)).not.toContain('accessToken');

      accessCookie = cookieValue(res, 'access_token');
      refreshCookie = cookieValue(res, 'refresh_token');
      expect(accessCookie).toBeTruthy();
      expect(refreshCookie).toBeTruthy();
    });

    it('rechaza el login vía form POST cross-site (solo se parsea JSON) → 400', async () => {
      // Un <form> envía application/x-www-form-urlencoded (simple request,
      // sin preflight). Sin parser urlencoded el body llega vacío: login-CSRF cerrado.
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .type('form')
        .send(`email=${email}&password=${password}`)
        .expect(400);

      expect(findCookie(res, 'access_token')).toBeUndefined();
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
      expect(refreshCookie).not.toBe(oldRefreshCookie);

      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', `refresh_token=${oldRefreshCookie}`)
        .expect(401);
    });
  });

  describe('roles y paginación', () => {
    it('GET /api/v1/users con rol user → 403', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Cookie', `access_token=${accessCookie}`)
        .expect(403);
    });

    it('GET /api/v1/users con rol admin → 200 con respuesta paginada', async () => {
      // Promoción a admin directo en DB (en la app real: seed o admin previo).
      await app
        .get(DataSource)
        .query(`UPDATE users SET role = 'admin' WHERE email = $1`, [email]);
      // Re-login: el rol viaja en el JWT, el token anterior sigue siendo 'user'.
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password })
        .expect(200);
      accessCookie = cookieValue(login, 'access_token');
      refreshCookie = cookieValue(login, 'refresh_token');

      const res = await request(app.getHttpServer())
        .get('/api/v1/users?page=1&limit=5&order=desc')
        .set('Cookie', `access_token=${accessCookie}`)
        .expect(200);

      const body = res.body as PaginatedBody;
      expect(Array.isArray(body.items)).toBe(true);
      expect(body.items.length).toBeLessThanOrEqual(5);
      expect(body.total).toBeGreaterThanOrEqual(1);
      expect(body.page).toBe(1);
      expect(body.limit).toBe(5);
      expect(body.pages).toBeGreaterThanOrEqual(1);
      expect(JSON.stringify(res.body)).not.toContain('password');
    });

    it('rechaza paginación fuera de rango (limit > 100) → 400', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/users?limit=1000')
        .set('Cookie', `access_token=${accessCookie}`)
        .expect(400);
    });
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
      resetToken = tokenFromMail(sentMails[0]);
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

      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password })
        .expect(401);
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: newPassword })
        .expect(200);
      accessCookie = cookieValue(res, 'access_token');
    });

    it('el token de reset es de un solo uso → 401 al reutilizarlo', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({ token: resetToken, password: 'A-third-passw0rd!' })
        .expect(401);
    });
  });

  it('POST /api/v1/auth/logout → 204, limpia cookies y revoca la sesión', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', `access_token=${accessCookie}`)
      .expect(204);

    expect(cookieValue(res, 'access_token')).toBe('');
    expect(cookieValue(res, 'refresh_token')).toBe('');
  });

  it('GET /health → 200 público con check de DB', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    const body = res.body as HealthBody;
    expect(body.status).toBe('ok');
    expect(body.details.database.status).toBe('up');
  });
});
