import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Roles } from '../decorators/roles.decorator';
import { Role } from '../enums/role.enum';
import { AuthenticatedUser } from '../types/authenticated-user.type';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  /** Contexto mínimo: handler real decorado + usuario autenticado (o no). */
  const contextFor = (
    handler: () => void,
    user?: Pick<AuthenticatedUser, 'role'>,
  ): ExecutionContext =>
    ({
      getType: () => 'http',
      getHandler: () => handler,
      getClass: () => class {},
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as unknown as ExecutionContext;

  /** Variante WS: el user vive en socket.data.user (lo puso WsAuthService). */
  const wsContextFor = (
    handler: () => void,
    user?: Pick<AuthenticatedUser, 'role'>,
  ): ExecutionContext =>
    ({
      getType: () => 'ws',
      getHandler: () => handler,
      getClass: () => class {},
      switchToWs: () => ({ getClient: () => ({ data: { user } }) }),
    }) as unknown as ExecutionContext;

  it('permite rutas sin @Roles (basta autenticarse)', () => {
    const handler = () => {};
    expect(guard.canActivate(contextFor(handler, { role: Role.USER }))).toBe(
      true,
    );
  });

  it('deniega si la ruta exige rol y no hay usuario (ej. @Public mal combinado)', () => {
    class Dummy {
      @Roles(Role.ADMIN)
      handler(this: void) {}
    }
    expect(guard.canActivate(contextFor(Dummy.prototype.handler))).toBe(false);
  });

  it('permite con el rol correcto y deniega con otro', () => {
    class Dummy {
      @Roles(Role.ADMIN)
      handler(this: void) {}
    }
    const ctx = (role: Role) => contextFor(Dummy.prototype.handler, { role });
    expect(guard.canActivate(ctx(Role.ADMIN))).toBe(true);
    expect(guard.canActivate(ctx(Role.USER))).toBe(false);
  });

  it('en contexto ws lee el user de socket.data (mismo criterio de roles)', () => {
    class Dummy {
      @Roles(Role.ADMIN)
      handler(this: void) {}
    }
    const ctx = (user?: Pick<AuthenticatedUser, 'role'>) =>
      wsContextFor(Dummy.prototype.handler, user);
    expect(guard.canActivate(ctx({ role: Role.ADMIN }))).toBe(true);
    expect(guard.canActivate(ctx({ role: Role.USER }))).toBe(false);
    expect(guard.canActivate(ctx(undefined))).toBe(false);
  });
});
