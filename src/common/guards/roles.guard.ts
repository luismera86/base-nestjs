import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { Role } from '../enums/role.enum';
import { AuthenticatedUser } from '../types/authenticated-user.type';

/**
 * Guard global de autorización. Corre después del JwtAuthGuard:
 * sin @Roles() la ruta no exige rol; con @Roles(...) el usuario
 * autenticado debe tener alguno de los roles indicados.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const user = this.extractUser(context);
    return user !== undefined && requiredRoles.includes(user.role);
  }

  /**
   * En HTTP el user lo pone passport en request.user; en WS lo puso
   * WsAuthService en socket.data.user durante el handshake. Tipo
   * estructural para no acoplar common/ a socket.io.
   */
  private extractUser(
    context: ExecutionContext,
  ): AuthenticatedUser | undefined {
    if (context.getType() === 'ws') {
      return context
        .switchToWs()
        .getClient<{ data: { user?: AuthenticatedUser } }>().data.user;
    }
    return context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>().user;
  }
}
