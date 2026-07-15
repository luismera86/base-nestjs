import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { Repository } from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Injectable()
export class VerifyEmailUseCase {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async execute(token: string): Promise<void> {
    const user = await this.usersRepository.findOne({
      where: { emailVerificationTokenHash: this.hashToken(token) },
      select: { id: true },
    });
    if (!user) {
      throw new UnauthorizedException('errors.INVALID_VERIFICATION_TOKEN');
    }

    await this.usersRepository.update(user.id, {
      emailVerifiedAt: new Date(),
      // Consumir el token: un solo uso.
      emailVerificationTokenHash: null,
    });
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
