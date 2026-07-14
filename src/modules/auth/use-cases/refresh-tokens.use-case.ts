import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { AuthTokensDto } from '../dto/auth-tokens.dto';
import { TokenService } from '../token.service';

@Injectable()
export class RefreshTokensUseCase {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly tokenService: TokenService,
  ) {}

  async execute(userId: string, refreshToken: string): Promise<AuthTokensDto> {
    // addSelect: refreshTokenHash es select:false y acá hay que compararlo.
    const user = await this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.refreshTokenHash')
      .where('user.id = :id', { id: userId })
      .getOne();

    if (!user || !user.refreshTokenHash) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const incomingHash = this.tokenService.hashToken(refreshToken);
    if (incomingHash !== user.refreshTokenHash) {
      // Firma válida pero hash distinto → posible reuso de un token rotado (robo).
      // Se revoca la sesión entera: el refresh vigente también deja de servir.
      await this.usersRepository.update(user.id, { refreshTokenHash: null });
      throw new UnauthorizedException('Invalid refresh token');
    }
    return this.tokenService.issueTokens(user.id, user.email);
  }
}
