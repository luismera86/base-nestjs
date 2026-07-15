import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { createHash } from 'node:crypto';
import { Repository } from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Injectable()
export class ResetPasswordUseCase {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async execute(token: string, newPassword: string): Promise<void> {
    const user = await this.usersRepository.findOne({
      where: { passwordResetTokenHash: this.hashToken(token) },
      // Columnas select:false: hay que pedirlas explícitamente.
      select: { id: true, passwordResetExpiresAt: true },
    });

    const expired =
      !user?.passwordResetExpiresAt ||
      user.passwordResetExpiresAt.getTime() < Date.now();
    if (!user || expired) {
      throw new UnauthorizedException('errors.INVALID_RESET_TOKEN');
    }

    const hashedPassword = await argon2.hash(newPassword, {
      type: argon2.argon2id,
    });

    await this.usersRepository.update(user.id, {
      password: hashedPassword,
      // Consumir el token (un solo uso) y revocar toda sesión activa:
      // si la cuenta estaba comprometida, el atacante queda fuera.
      passwordResetTokenHash: null,
      passwordResetExpiresAt: null,
      refreshTokenHash: null,
    });
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
