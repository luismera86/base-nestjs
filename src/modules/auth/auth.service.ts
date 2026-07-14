import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import type { StringValue } from 'ms';
import { createHash, randomUUID } from 'node:crypto';
import { UsersService } from '../users/users.service';
import { AuthTokensDto } from './dto/auth-tokens.dto';
import { JwtPayload } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(email: string, password: string): Promise<AuthTokensDto> {
    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      throw new ConflictException('Email already registered');
    }
    const hashedPassword = await argon2.hash(password, {
      type: argon2.argon2id,
    });
    const user = await this.usersService.create(email, hashedPassword);
    return this.issueTokens(user.id, user.email);
  }

  async login(email: string, password: string): Promise<AuthTokensDto> {
    const user = await this.usersService.findByEmailWithSecrets(email);
    // Mismo error exista o no el email: evita enumeración de usuarios.
    if (!user || !(await argon2.verify(user.password, password))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.issueTokens(user.id, user.email);
  }

  async refreshTokens(
    userId: string,
    refreshToken: string,
  ): Promise<AuthTokensDto> {
    const user = await this.usersService.findByIdWithSecrets(userId);
    if (!user || !user.refreshTokenHash) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const incomingHash = this.hashToken(refreshToken);
    if (incomingHash !== user.refreshTokenHash) {
      // Firma válida pero hash distinto → posible reuso de un token rotado (robo).
      // Se revoca la sesión entera: el refresh vigente también deja de servir.
      await this.usersService.setRefreshTokenHash(user.id, null);
      throw new UnauthorizedException('Invalid refresh token');
    }
    return this.issueTokens(user.id, user.email);
  }

  async logout(userId: string): Promise<void> {
    await this.usersService.setRefreshTokenHash(userId, null);
  }

  /** Emite access + refresh y rota el hash del refresh guardado en DB. */
  private async issueTokens(
    userId: string,
    email: string,
  ): Promise<AuthTokensDto> {
    const payload: JwtPayload = { sub: userId, email };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.getOrThrow<string>('jwt.accessSecret'),
        expiresIn: this.configService.getOrThrow<StringValue>(
          'jwt.accessExpiresIn',
        ),
      }),
      // jti aleatorio: garantiza que cada refresh emitido es único aunque
      // se firmen dos en el mismo segundo (necesario para detectar reuso).
      this.jwtService.signAsync(
        { ...payload, jti: randomUUID() },
        {
          secret: this.configService.getOrThrow<string>('jwt.refreshSecret'),
          expiresIn: this.configService.getOrThrow<StringValue>(
            'jwt.refreshExpiresIn',
          ),
        },
      ),
    ]);

    // SHA-256 (no argon2): el token ya es de alta entropía y un hash lento
    // abriría un vector de DoS por CPU en el endpoint de refresh.
    await this.usersService.setRefreshTokenHash(
      userId,
      this.hashToken(refreshToken),
    );

    return { accessToken, refreshToken };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
