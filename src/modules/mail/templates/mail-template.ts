import * as en from './i18n/en.json';
import * as es from './i18n/es.json';

/** Contenido renderizado de un correo, listo para MailService.sendMail. */
export type MailContent = {
  subject: string;
  html: string;
  text: string;
};

// Las traducciones de los correos viven junto a los templates (templates/i18n).
// Para agregar un idioma: crear el JSON y sumarlo acá.
const TRANSLATIONS = { es, en };

export type MailLanguage = keyof typeof TRANSLATIONS;
export const DEFAULT_MAIL_LANGUAGE: MailLanguage = 'es';

/** Traducciones del idioma pedido, con fallback al idioma por defecto. */
export function mailTranslations(lang: string) {
  return (
    TRANSLATIONS[lang as MailLanguage] ?? TRANSLATIONS[DEFAULT_MAIL_LANGUAGE]
  );
}

/** Reemplaza placeholders {clave} por su valor: "válido por {ttl} min". */
export function interpolate(
  text: string,
  params: Record<string, string | number>,
): string {
  return text.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match,
  );
}

/** Layout HTML común a todos los correos (estilos inline, requisito de los clientes de mail). */
export function layout(bodyHtml: string): string {
  return `<div style="font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #1f2937;">${bodyHtml}</div>`;
}
