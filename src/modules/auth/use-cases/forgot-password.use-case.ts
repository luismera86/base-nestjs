import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { I18nContext } from 'nestjs-i18n';
import { createHash, randomBytes } from 'node:crypto';
import { Repository } from 'typeorm';
import { MailService } from '../../mail/mail.service';
import { DEFAULT_MAIL_LANGUAGE } from '../../mail/templates/mail-template';
import { passwordResetTemplate } from '../../mail/templates/password-reset.template';
import { User } from '../../users/entities/user.entity';

@Injectable()
export class ForgotPasswordUseCase {
  private readonly logger = new Logger(ForgotPasswordUseCase.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  async execute(email: string): Promise<void> {
    const user = await this.usersRepository.findOne({ where: { email } });
    // Respuesta idéntica exista o no el email: evita enumeración de usuarios.
    if (!user) {
      return;
    }

    // Token de alta entropía; en DB solo su hash (nunca el token en claro).
    const rawToken = randomBytes(32).toString('hex');
    const ttlMinutes = this.configService.getOrThrow<number>(
      'app.passwordResetTtlMinutes',
    );
    const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);

    await this.usersRepository.update(user.id, {
      passwordResetTokenHash: this.hashToken(rawToken),
      passwordResetExpiresAt: expiresAt,
    });

    const resetUrl = `${this.configService.getOrThrow<string>('app.frontendUrl')}/reset-password?token=${rawToken}`;
    // El correo sale en el idioma del request (Accept-Language), como la API.
    const lang = I18nContext.current()?.lang ?? DEFAULT_MAIL_LANGUAGE;

    try {
      await this.mailService.sendMail({
        to: user.email,
        ...passwordResetTemplate(lang, { resetUrl, ttlMinutes }),
      });
    } catch (error) {
      // No propagamos el error al cliente: revelaría que el email existe.
      this.logger.error(
        `Fallo al enviar el correo de recuperación a un usuario: ${(error as Error).message}`,
      );
    }
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
