import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { Server, ServerOptions } from 'socket.io';

/**
 * Adapter de socket.io con el CORS leído de la config (las opciones del
 * decorador @WebSocketGateway son estáticas y no pueden inyectar ConfigService).
 * Mantiene el mismo criterio que el CORS HTTP de main.ts: solo los orígenes
 * de CORS_ORIGINS y con credentials (la cookie de access viaja en el handshake).
 */
export class SocketIoAdapter extends IoAdapter {
  constructor(private readonly app: INestApplication) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const corsOrigins = this.app
      .get(ConfigService)
      .getOrThrow<string[]>('app.corsOrigins');

    return super.createIOServer(port, {
      ...options,
      cors: {
        origin: corsOrigins.length > 0 ? corsOrigins : false,
        credentials: true,
      },
    }) as Server;
  }
}
