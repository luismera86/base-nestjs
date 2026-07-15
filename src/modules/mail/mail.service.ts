import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { MailContent } from './templates/mail-template';

/**
 * Envío de correo vía nodemailer.
 * Si no hay MAIL_HOST configurado, usa un transporte JSON que escribe el
 * correo en los logs (desarrollo) en vez de enviarlo de verdad.
 */
@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;
  private readonly from: string;
  private smtpConfigured = false;

  constructor(private readonly configService: ConfigService) {
    this.from = this.configService.getOrThrow<string>('mail.from');
  }

  onModuleInit(): void {
    const host = this.configService.getOrThrow<string>('mail.host');
    this.smtpConfigured = host.length > 0;

    if (!this.smtpConfigured) {
      // Sin SMTP: el correo se serializa a JSON y se loguea (no se envía).
      this.transporter = nodemailer.createTransport({ jsonTransport: true });
      this.logger.warn(
        'MAIL_HOST no configurado: los correos se escribirán en los logs, no se enviarán.',
      );
      return;
    }

    const user = this.configService.getOrThrow<string>('mail.user');
    this.transporter = nodemailer.createTransport({
      host,
      port: this.configService.getOrThrow<number>('mail.port'),
      secure: this.configService.getOrThrow<boolean>('mail.secure'),
      auth: user
        ? { user, pass: this.configService.get<string>('mail.password') }
        : undefined,
    });
  }

  async sendMail(options: { to: string } & MailContent): Promise<void> {
    const info = (await this.transporter.sendMail({
      from: this.from,
      ...options,
    })) as { message?: unknown };

    if (!this.smtpConfigured) {
      // Sin SMTP real: dejamos el contenido del correo en los logs.
      this.logger.debug(
        `Correo (no enviado, sin SMTP): ${String(info.message)}`,
      );
    }
  }
}
