import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import type { StringValue } from 'ms';
import { createHash, randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { AuthTokensDto } from './dto/auth-tokens.dto';
import { JwtPayload } from './strategies/jwt.strategy';

/** Soporte compartido de los use cases de auth: emisión y hash de tokens. */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  /** Emite access + refresh y rota el hash del refresh guardado en DB. */
  async issueTokens(userId: string, email: string): Promise<AuthTokensDto> {
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
    await this.usersRepository.update(userId, {
      refreshTokenHash: this.hashToken(refreshToken),
    });

    return { accessToken, refreshToken };
  }

  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
