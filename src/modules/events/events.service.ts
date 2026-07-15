import { Injectable } from '@nestjs/common';
import type { Namespace } from 'socket.io';

/** Room por usuario: todas sus conexiones (pestañas, dispositivos) la comparten. */
export const userRoom = (userId: string): string => `user:${userId}`;

/**
 * Emisor de eventos para el resto de la app: cualquier módulo puede
 * importar EventsModule e inyectar este servicio para notificar por socket.
 * El gateway se registra en bind() al inicializar; si nadie está conectado
 * las emisiones son no-op (socket.io ignora rooms vacías).
 */
@Injectable()
export class EventsService {
  private server?: Namespace;

  /** Llamado por EventsGateway en afterInit. */
  bind(server: Namespace): void {
    this.server = server;
  }

  /** Emite a todas las conexiones activas de un usuario. */
  emitToUser(userId: string, event: string, data: unknown): void {
    this.server?.to(userRoom(userId)).emit(event, data);
  }

  /** Emite a todos los clientes conectados al namespace. */
  emitToAll(event: string, data: unknown): void {
    this.server?.emit(event, data);
  }
}
