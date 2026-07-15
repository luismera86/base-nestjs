import { Injectable } from '@nestjs/common';
import { AuthTokensDto } from './dto/auth-tokens.dto';
import { ForgotPasswordUseCase } from './use-cases/forgot-password.use-case';
import { LoginUseCase } from './use-cases/login.use-case';
import { LogoutUseCase } from './use-cases/logout.use-case';
import { RefreshTokensUseCase } from './use-cases/refresh-tokens.use-case';
import { RegisterUseCase } from './use-cases/register.use-case';
import { ResetPasswordUseCase } from './use-cases/reset-password.use-case';
import { VerifyEmailUseCase } from './use-cases/verify-email.use-case';

/**
 * Fachada del módulo: canaliza los use cases.
 * La lógica de negocio vive en use-cases/, uno por operación.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly registerUseCase: RegisterUseCase,
    private readonly loginUseCase: LoginUseCase,
    private readonly refreshTokensUseCase: RefreshTokensUseCase,
    private readonly logoutUseCase: LogoutUseCase,
    private readonly forgotPasswordUseCase: ForgotPasswordUseCase,
    private readonly resetPasswordUseCase: ResetPasswordUseCase,
    private readonly verifyEmailUseCase: VerifyEmailUseCase,
  ) {}

  register(email: string, password: string): Promise<void> {
    return this.registerUseCase.execute(email, password);
  }

  verifyEmail(token: string): Promise<void> {
    return this.verifyEmailUseCase.execute(token);
  }

  login(email: string, password: string): Promise<AuthTokensDto> {
    return this.loginUseCase.execute(email, password);
  }

  refreshTokens(userId: string, refreshToken: string): Promise<AuthTokensDto> {
    return this.refreshTokensUseCase.execute(userId, refreshToken);
  }

  logout(userId: string): Promise<void> {
    return this.logoutUseCase.execute(userId);
  }

  forgotPassword(email: string): Promise<void> {
    return this.forgotPasswordUseCase.execute(email);
  }

  resetPassword(token: string, password: string): Promise<void> {
    return this.resetPasswordUseCase.execute(token, password);
  }
}
