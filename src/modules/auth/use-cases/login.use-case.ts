import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { Repository } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { AuthTokensDto } from '../dto/auth-tokens.dto';
import { TokenService } from '../token.service';

@Injectable()
export class LoginUseCase {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly tokenService: TokenService,
  ) {}

  async execute(email: string, password: string): Promise<AuthTokensDto> {
    // addSelect: password es select:false y el login la necesita.
    const user = await this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.email = :email', { email })
      .getOne();

    // Mismo error exista o no el email: evita enumeración de usuarios.
    if (!user || !(await argon2.verify(user.password, password))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.tokenService.issueTokens(user.id, user.email);
  }
}
