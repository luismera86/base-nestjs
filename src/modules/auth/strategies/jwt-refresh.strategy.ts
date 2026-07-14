import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthenticatedUserWithRefreshToken } from '../../../common/types/authenticated-user.type';
import { JwtPayload } from './jwt.strategy';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('jwt.refreshSecret'),
      // Necesitamos el token crudo para compararlo contra el hash guardado en DB.
      passReqToCallback: true,
    });
  }

  validate(
    request: Request,
    payload: JwtPayload,
  ): AuthenticatedUserWithRefreshToken {
    const refreshToken = ExtractJwt.fromAuthHeaderAsBearerToken()(request);
    if (!refreshToken) {
      throw new UnauthorizedException();
    }
    return { id: payload.sub, email: payload.email, refreshToken };
  }
}
