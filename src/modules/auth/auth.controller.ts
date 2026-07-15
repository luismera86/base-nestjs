import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import {
  AuthenticatedUser,
  AuthenticatedUserWithRefreshToken,
} from '../../common/types/authenticated-user.type';
import { AuthService } from './auth.service';
import { CookieService } from './cookie.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';

// Los endpoints de auth son el blanco de fuerza bruta: límite estricto (5/min).
// Los tokens se entregan SOLO en cookies httpOnly, nunca en el body:
// si viajaran en el body, un XSS podría llamar a /refresh y leerlos.
@Throttle({ default: { limit: 5, ttl: 60000 } })
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly cookieService: CookieService,
  ) {}

  @Public()
  @Post('register')
  @ApiOperation({
    summary: 'Registro: envía un correo de verificación (no inicia sesión)',
  })
  async register(@Body() dto: RegisterDto): Promise<void> {
    await this.authService.register(dto.email, dto.password);
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Verifica el correo con el token recibido; habilita el login',
  })
  async verifyEmail(@Body() dto: VerifyEmailDto): Promise<void> {
    await this.authService.verifyEmail(dto.token);
  }

  @Public()
  @Post('resend-verification')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Reenvía el correo de verificación (invalida el enlace anterior)',
  })
  async resendVerification(@Body() dto: ResendVerificationDto): Promise<void> {
    // Siempre 204, exista o no el email (evita enumeración de usuarios).
    await this.authService.resendVerification(dto.email);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login: setea cookies httpOnly con los tokens' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const tokens = await this.authService.login(dto.email, dto.password);
    this.cookieService.setAuthCookies(res, tokens);
  }

  @Public()
  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Rota los tokens: lee el refresh de la cookie y setea las nuevas',
  })
  async refresh(
    @CurrentUser() user: AuthenticatedUserWithRefreshToken,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const tokens = await this.authService.refreshTokens(
      user.id,
      user.refreshToken,
    );
    this.cookieService.setAuthCookies(res, tokens);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoca el refresh token y limpia las cookies' })
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.authService.logout(user.id);
    this.cookieService.clearAuthCookies(res);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Envía un correo con el enlace para recuperar la contraseña',
  })
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    // Siempre 204, exista o no el email (evita enumeración de usuarios).
    await this.authService.forgotPassword(dto.email);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Restablece la contraseña con el token recibido por correo',
  })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.authService.resetPassword(dto.token, dto.password);
  }
}
