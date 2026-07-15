import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { I18nContext } from 'nestjs-i18n';
import { createHash, randomBytes } from 'node:crypto';
import { Repository } from 'typeorm';
import { MailService } from '../../mail/mail.service';
import { emailVerificationTemplate } from '../../mail/templates/email-verification.template';
import { DEFAULT_MAIL_LANGUAGE } from '../../mail/templates/mail-template';
import { User } from '../../users/entities/user.entity';

@Injectable()
export class ResendVerificationUseCase {
  private readonly logger = new Logger(ResendVerificationUseCase.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  /** Respuesta idéntica exista o no el email (y esté o no verificado). */
  async execute(email: string): Promise<void> {
    const user = await this.usersRepository.findOne({ where: { email } });
    if (!user || user.emailVerifiedAt) {
      return;
    }

    // Token nuevo: el enlace del correo anterior queda invalidado.
    const rawToken = randomBytes(32).toString('hex');
    await this.usersRepository.update(user.id, {
      emailVerificationTokenHash: this.hashToken(rawToken),
    });

    const verifyUrl = `${this.configService.getOrThrow<string>('app.frontendUrl')}/verify-email?token=${rawToken}`;
    const lang = I18nContext.current()?.lang ?? DEFAULT_MAIL_LANGUAGE;

    try {
      await this.mailService.sendMail({
        to: user.email,
        ...emailVerificationTemplate(lang, { verifyUrl }),
      });
    } catch (error) {
      // No propagamos el error al cliente: revelaría que el email existe.
      this.logger.error(
        `Fallo al reenviar el correo de verificación: ${(error as Error).message}`,
      );
    }
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
