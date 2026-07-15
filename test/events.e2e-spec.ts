import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import { json } from 'express';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { io, Socket as ClientSocket } from 'socket.io-client';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { SocketIoAdapter } from '../src/common/adapters/socket-io.adapter';
import { EventsService } from '../src/modules/events/events.service';
import { MailService } from '../src/modules/mail/mail.service';

type SentMail = { to: string; subject: string; html: string; text: string };

const setCookies = (res: request.Response): string[] => {
  const header = res.headers['set-cookie'] as unknown;
  if (Array.isArray(header)) return header as string[];
  return typeof header === 'string' ? [header] : [];
};

const cookieValue = (res: request.Response, name: string): string =>
  setCookies(res)
    .find((cookie) => cookie.startsWith(`${name}=`))
    ?.split(';')[0]
    .split('=')[1] ?? '';

const tokenFromMail = (mail: SentMail): string =>
  /token=([a-f0-9]+)/.exec(mail.text)?.[1] ?? '';

/** Conecta y resuelve al evento connect, o rechaza con el connect_error. */
const connectOk = (socket: ClientSocket): Promise<void> =>
  new Promise((resolve, reject) => {
    socket.on('connect', () => resolve());
    socket.on('connect_error', (err) => reject(err));
  });

/** Espera un evento con timeout corto. */
const waitFor = <T>(socket: ClientSocket, event: string): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timeout esperando "${event}"`)),
      3000,
    );
    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });

/**
 * E2E de WebSockets: handshake autenticado (cookie y auth.token), rechazo
 * sin token, ping→pong y emisión dirigida por usuario (rooms). Requiere el
 * Postgres de test (mismo setup que auth.e2e-spec).
 */
describe('Events / WebSockets (e2e)', () => {
  let app: NestExpressApplication;
  let baseUrl: string;
  let accessToken: string;
  let userId: string;
  const email = `ws-${randomUUID()}@example.com`;
  const password = 'A-very-long-passw0rd!';
  const sentMails: SentMail[] = [];
  const openSockets: ClientSocket[] = [];

  /** Crea un cliente y lo registra para cierre en afterAll. */
  const client = (opts: Parameters<typeof io>[1]): ClientSocket => {
    const socket = io(`${baseUrl}/events`, {
      transports: ['websocket'],
      reconnection: false,
      ...opts,
    });
    openSockets.push(socket);
    return socket;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MailService)
      .useValue({
        sendMail: (mail: SentMail) => {
          sentMails.push(mail);
          return Promise.resolve();
        },
      })
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
    // Espejo de main.ts: sin el adapter no hay servidor socket.io.
    app.useWebSocketAdapter(new SocketIoAdapter(app));

    const dataSource = app.get(DataSource);
    const dbName = String(dataSource.options.database);
    if (!dbName.includes('test')) {
      throw new Error(
        `Los e2e deben correr sobre la DB de test, no "${dbName}"`,
      );
    }

    // socket.io necesita un servidor HTTP real escuchando (supertest no basta).
    await app.listen(0);
    const { port } = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;

    // Usuario de prueba: registro → verificación → login (flujo real).
    await request(baseUrl)
      .post('/api/v1/auth/register')
      .send({ email, password })
      .expect(201);
    await request(baseUrl)
      .post('/api/v1/auth/verify-email')
      .send({ token: tokenFromMail(sentMails.at(-1)!) })
      .expect(204);
    const loginRes = await request(baseUrl)
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    accessToken = cookieValue(loginRes, 'access_token');

    const meRes = await request(baseUrl)
      .get('/api/v1/users/me')
      .set('Cookie', `access_token=${accessToken}`)
      .expect(200);
    userId = (meRes.body as { id: string }).id;
  });

  afterAll(async () => {
    for (const socket of openSockets) {
      socket.disconnect();
    }
    await app.close();
  });

  it('rechaza la conexión sin token (connect_error)', async () => {
    const socket = client({});

    await expect(connectOk(socket)).rejects.toMatchObject({
      message: 'errors.UNAUTHORIZED',
    });
  });

  it('rechaza la conexión con un token inválido', async () => {
    const socket = client({ auth: { token: 'not-a-valid-jwt' } });

    await expect(connectOk(socket)).rejects.toMatchObject({
      message: 'errors.UNAUTHORIZED',
    });
  });

  it('conecta con la cookie de access (navegadores) y responde ping→pong', async () => {
    const socket = client({
      extraHeaders: { cookie: `access_token=${accessToken}` },
    });

    await connectOk(socket);
    const pong = waitFor<{ time: string }>(socket, 'pong');
    socket.emit('ping');

    const { time } = await pong;
    expect(typeof time).toBe('string');
  });

  it('conecta con auth.token (clientes no-browser)', async () => {
    const socket = client({ auth: { token: accessToken } });

    await expect(connectOk(socket)).resolves.toBeUndefined();
  });

  it('EventsService.emitToUser llega a las conexiones del usuario (rooms)', async () => {
    const socket = client({ auth: { token: accessToken } });
    await connectOk(socket);

    const notification = waitFor<{ text: string }>(socket, 'notify');
    app.get(EventsService).emitToUser(userId, 'notify', { text: 'hola' });

    await expect(notification).resolves.toEqual({ text: 'hola' });
  });

  it('emitToUser a otro usuario NO llega (aislamiento de rooms)', async () => {
    const socket = client({ auth: { token: accessToken } });
    await connectOk(socket);

    let received = false;
    socket.on('private', () => {
      received = true;
    });
    app.get(EventsService).emitToUser('other-user-id', 'private', {});

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(received).toBe(false);
  });
});
