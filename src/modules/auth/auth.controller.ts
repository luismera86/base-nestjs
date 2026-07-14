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
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
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
  @ApiOperation({ summary: 'Registro: setea cookies httpOnly con los tokens' })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const tokens = await this.authService.register(dto.email, dto.password);
    this.cookieService.setAuthCookies(res, tokens);
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
}
