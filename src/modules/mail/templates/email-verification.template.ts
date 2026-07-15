import { layout, MailContent, mailTranslations } from './mail-template';

export function emailVerificationTemplate(
  lang: string,
  params: { verifyUrl: string },
): MailContent {
  const t = mailTranslations(lang).emailVerification;

  return {
    subject: t.subject,
    text: `${t.intro}\n${params.verifyUrl}\n\n${t.ignore}`,
    html: layout(
      `<p>${t.intro}</p>
<p style="margin: 24px 0;">
  <a href="${params.verifyUrl}" style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 10px 16px; border-radius: 6px;">${t.cta}</a>
</p>
<p style="color: #6b7280; font-size: 12px;">${t.ignore}</p>`,
    ),
  };
}
