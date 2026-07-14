import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { Repository } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { AuthTokensDto } from '../dto/auth-tokens.dto';
import { TokenService } from '../token.service';

@Injectable()
export class RegisterUseCase {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly tokenService: TokenService,
  ) {}

  async execute(email: string, password: string): Promise<AuthTokensDto> {
    const existing = await this.usersRepository.findOne({ where: { email } });
    if (existing) {
      throw new ConflictException('errors.EMAIL_ALREADY_REGISTERED');
    }
    const hashedPassword = await argon2.hash(password, {
      type: argon2.argon2id,
    });
    const user = await this.usersRepository.save(
      this.usersRepository.create({ email, password: hashedPassword }),
    );
    return this.tokenService.issueTokens(user.id, user.email);
  }
}
