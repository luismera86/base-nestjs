import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { parse } from 'cookie';
import type { Socket } from 'socket.io';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { ACCESS_TOKEN_COOKIE } from '../auth/cookie.service';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

/**
 * Autenticación del handshake de socket.io. cookie-parser es middleware
 * HTTP y no corre en el handshake, así que la cookie se parsea acá.
 * Verifica el access token con el mismo secret y payload que JwtStrategy.
 */
@Injectable()
export class WsAuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /** Extrae y verifica el access token del handshake. Lanza si falta o es inválido. */
  async authenticate(socket: Socket): Promise<AuthenticatedUser> {
    const token = this.extractToken(socket);
    if (!token) {
      throw new WsException('errors.UNAUTHORIZED');
    }
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.configService.getOrThrow<string>('jwt.accessSecret'),
      });
      return { id: payload.sub, email: payload.email, role: payload.role };
    } catch {
      throw new WsException('errors.UNAUTHORIZED');
    }
  }

  private extractToken(socket: Socket): string | null {
    // Cookie httpOnly primero (navegadores: viaja sola con withCredentials).
    const cookieHeader = socket.handshake.headers.cookie;
    if (cookieHeader) {
      const fromCookie = parse(cookieHeader)[ACCESS_TOKEN_COOKIE];
      if (fromCookie) {
        return fromCookie;
      }
    }
    // Fallback para clientes no-browser: io(url, { auth: { token } }).
    const fromAuth = (socket.handshake.auth as Record<string, unknown>).token;
    return typeof fromAuth === 'string' ? fromAuth : null;
  }
}
