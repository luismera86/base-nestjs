import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { AuthenticatedSocket } from '../types/authenticated-socket.type';

/**
 * Defensa en profundidad para handlers @SubscribeMessage: el handshake ya
 * autenticó (WsAuthService), este guard solo exige que el user esté presente.
 * Aplicarlo con @UseGuards a nivel de gateway en todo gateway nuevo.
 */
@Injectable()
export class WsJwtGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const socket = context.switchToWs().getClient<AuthenticatedSocket>();
    if (!socket.data.user) {
      throw new WsException('errors.UNAUTHORIZED');
    }
    return true;
  }
}
