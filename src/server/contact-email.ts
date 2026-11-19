/**
 * Shared between the Pages Function (sender side) and the mailer Worker (re-validates: defence in depth).
 */
import { z } from 'astro/zod';
import { locales } from '../i18n/config.ts';

export const contactPayloadSchema = z.object({
  locale: z.enum(locales),
  name: z.string().trim().min(2).max(100),
  email: z.email().max(254),
  subject: z.string().trim().max(150),
  message: z.string().trim().min(10).max(5000),
});

export type ContactPayload = z.infer<typeof contactPayloadSchema>;

const LANGUAGE_NAME = { ar: 'العربية', fr: 'français', en: 'English' } as const;

/** Plain-text email (no HTML: nothing to escape or render in the mail client). */
export function formatContactEmail(input: unknown): { subject: string; text: string } {
  const p = contactPayloadSchema.parse(input);
  const subject = `[Site web INFSPM] ${p.subject || 'Message'} – ${p.name}`;
  const text = [
    'Message envoyé depuis le formulaire de contact du site web.',
    'Répondre à ce courriel répond directement à l’expéditeur.',
    '',
    `Nom : ${p.name}`,
    `Courriel : ${p.email}`,
    `Langue du site : ${LANGUAGE_NAME[p.locale]}`,
    `Objet : ${p.subject || '—'}`,
    '',
    '----------------------------------------',
    p.message,
    '----------------------------------------',
    '',
    'Ce message n’est pas conservé sur le site web.',
  ].join('\n');
  return { subject, text };
}
