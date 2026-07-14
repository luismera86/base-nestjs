import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtRefreshGuard extends AuthGuard('jwt-refresh') {
  // Passport lanza UnauthorizedException con mensaje fijo en inglés;
  // se reemplaza por una clave de traducción para el filtro global.
  handleRequest<TUser>(err: unknown, user: TUser): TUser {
    if (err || !user) {
      throw err instanceof Error
        ? err
        : new UnauthorizedException('errors.UNAUTHORIZED');
    }
    return user;
  }
}
