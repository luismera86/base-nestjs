import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { I18nContext } from 'nestjs-i18n';
import { createHash, randomBytes } from 'node:crypto';
import { Repository } from 'typeorm';
import { MailService } from '../../mail/mail.service';
import { emailVerificationTemplate } from '../../mail/templates/email-verification.template';
import { DEFAULT_MAIL_LANGUAGE } from '../../mail/templates/mail-template';
import { User } from '../../users/entities/user.entity';

@Injectable()
export class RegisterUseCase {
  private readonly logger = new Logger(RegisterUseCase.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Crea el usuario SIN emitir sesión: primero debe verificar su correo
   * (el login está bloqueado hasta entonces).
   */
  async execute(email: string, password: string): Promise<void> {
    const existing = await this.usersRepository.findOne({ where: { email } });
    if (existing) {
      throw new ConflictException('errors.EMAIL_ALREADY_REGISTERED');
    }

    const hashedPassword = await argon2.hash(password, {
      type: argon2.argon2id,
    });
    // Token de verificación de alta entropía; en DB solo su hash.
    const rawToken = randomBytes(32).toString('hex');

    const user = await this.usersRepository.save(
      this.usersRepository.create({
        email,
        password: hashedPassword,
        emailVerificationTokenHash: this.hashToken(rawToken),
      }),
    );

    const verifyUrl = `${this.configService.getOrThrow<string>('app.frontendUrl')}/verify-email?token=${rawToken}`;
    const lang = I18nContext.current()?.lang ?? DEFAULT_MAIL_LANGUAGE;

    try {
      await this.mailService.sendMail({
        to: user.email,
        ...emailVerificationTemplate(lang, { verifyUrl }),
      });
    } catch (error) {
      // El registro ya se concretó: logueamos el fallo de envío sin romper el alta.
      this.logger.error(
        `Fallo al enviar el correo de verificación: ${(error as Error).message}`,
      );
    }
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
