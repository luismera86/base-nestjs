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
      getHandler: () => handler,
      getClass: () => class {},
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
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
});
