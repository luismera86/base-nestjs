import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CookieService } from './cookie.service';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TokenService } from './token.service';
import { ForgotPasswordUseCase } from './use-cases/forgot-password.use-case';
import { LoginUseCase } from './use-cases/login.use-case';
import { LogoutUseCase } from './use-cases/logout.use-case';
import { RefreshTokensUseCase } from './use-cases/refresh-tokens.use-case';
import { RegisterUseCase } from './use-cases/register.use-case';
import { ResetPasswordUseCase } from './use-cases/reset-password.use-case';

@Module({
  // JwtModule sin secret global: cada firma pasa secret/expiresIn explícitos
  // (access y refresh usan secrets distintos).
  imports: [
    TypeOrmModule.forFeature([User]),
    PassportModule,
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    CookieService,
    RegisterUseCase,
    LoginUseCase,
    RefreshTokensUseCase,
    LogoutUseCase,
    ForgotPasswordUseCase,
    ResetPasswordUseCase,
    JwtStrategy,
    JwtRefreshStrategy,
  ],
})
export class AuthModule {}
