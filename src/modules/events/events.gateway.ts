import { UseFilters, UseGuards } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsResponse,
} from '@nestjs/websockets';
import type { Namespace } from 'socket.io';
import { EventsService, userRoom } from './events.service';
import { AuthenticatedSocket } from './types/authenticated-socket.type';
import { WsExceptionsFilter } from './filters/ws-exceptions.filter';
import { WsJwtGuard } from './guards/ws-jwt.guard';
import { WsAuthService } from './ws-auth.service';

/**
 * Gateway de ejemplo. El CORS lo aporta SocketIoAdapter (main.ts); la auth
 * ocurre en el middleware del handshake (afterInit): una conexión sin access
 * token válido recibe connect_error y nunca llega a handleConnection.
 */
@UseGuards(WsJwtGuard)
@UseFilters(WsExceptionsFilter)
@WebSocketGateway({ namespace: '/events' })
export class EventsGateway implements OnGatewayInit, OnGatewayConnection {
  @WebSocketServer()
  private readonly server!: Namespace;

  constructor(
    private readonly wsAuthService: WsAuthService,
    private readonly eventsService: EventsService,
  ) {}

  afterInit(server: Namespace): void {
    // Middleware de handshake: corre antes de aceptar la conexión.
    server.use((socket: AuthenticatedSocket, next) => {
      this.wsAuthService
        .authenticate(socket)
        .then((user) => {
          socket.data.user = user;
          next();
        })
        .catch(() => next(new Error('errors.UNAUTHORIZED')));
    });
    this.eventsService.bind(server);
  }

  handleConnection(socket: AuthenticatedSocket): void {
    const user = socket.data.user;
    if (!user) {
      // No debería ocurrir: el middleware del handshake ya autenticó.
      socket.disconnect(true);
      return;
    }
    // Room por usuario: habilita eventsService.emitToUser desde cualquier módulo.
    void socket.join(userRoom(user.id));
  }

  @SubscribeMessage('ping')
  handlePing(): WsResponse<{ time: string }> {
    return { event: 'pong', data: { time: new Date().toISOString() } };
  }
}
