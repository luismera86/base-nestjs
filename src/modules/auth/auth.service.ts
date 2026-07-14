import { Injectable } from '@nestjs/common';
import { AuthTokensDto } from './dto/auth-tokens.dto';
import { LoginUseCase } from './use-cases/login.use-case';
import { LogoutUseCase } from './use-cases/logout.use-case';
import { RefreshTokensUseCase } from './use-cases/refresh-tokens.use-case';
import { RegisterUseCase } from './use-cases/register.use-case';

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
  ) {}

  register(email: string, password: string): Promise<AuthTokensDto> {
    return this.registerUseCase.execute(email, password);
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
}
