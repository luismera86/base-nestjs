import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';
import type { StringValue } from 'ms';
import * as ms from 'ms';
import { AuthTokensDto } from './dto/auth-tokens.dto';

export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

/** Extractor de JWT desde cookie para las estrategias de passport. */
export const cookieExtractor =
  (cookieName: string) =>
  (req: Request): string | null =>
    (req.cookies as Record<string, string> | undefined)?.[cookieName] ?? null;

/**
 * Soporte compartido: entrega y limpieza de tokens en cookies httpOnly.
 * httpOnly → JS del navegador no puede leerlas (mitiga robo por XSS).
 * sameSite lax → no viajan en peticiones cross-site (mitiga CSRF).
 */
@Injectable()
export class CookieService {
  constructor(private readonly configService: ConfigService) {}

  setAuthCookies(res: Response, tokens: AuthTokensDto): void {
    res.cookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
      ...this.baseOptions(),
      maxAge: ms(
        this.configService.getOrThrow<StringValue>('jwt.accessExpiresIn'),
      ),
    });
    // La cookie de refresh solo viaja al endpoint que la necesita:
    // reduce la superficie de exposición del token de larga vida.
    res.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
      ...this.baseOptions(),
      path: this.refreshPath(),
      maxAge: ms(
        this.configService.getOrThrow<StringValue>('jwt.refreshExpiresIn'),
      ),
    });
  }

  clearAuthCookies(res: Response): void {
    res.clearCookie(ACCESS_TOKEN_COOKIE, this.baseOptions());
    res.clearCookie(REFRESH_TOKEN_COOKIE, {
      ...this.baseOptions(),
      path: this.refreshPath(),
    });
  }

  private baseOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.configService.getOrThrow<boolean>('app.cookieSecure'),
      sameSite: 'lax',
      path: '/',
    };
  }

  private refreshPath(): string {
    const prefix = this.configService.getOrThrow<string>('app.apiPrefix');
    return `/${prefix}/v1/auth/refresh`;
  }
}
