import {
  interpolate,
  layout,
  MailContent,
  mailTranslations,
} from './mail-template';

export function passwordResetTemplate(
  lang: string,
  params: { resetUrl: string; ttlMinutes: number },
): MailContent {
  const t = mailTranslations(lang).passwordReset;
  const intro = interpolate(t.intro, { ttlMinutes: params.ttlMinutes });

  return {
    subject: t.subject,
    text: `${intro}\n${params.resetUrl}\n\n${t.ignore}`,
    html: layout(
      `<p>${intro}</p>
<p style="margin: 24px 0;">
  <a href="${params.resetUrl}" style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 10px 16px; border-radius: 6px;">${t.cta}</a>
</p>
<p style="color: #6b7280; font-size: 12px;">${t.ignore}</p>`,
    ),
  };
}
