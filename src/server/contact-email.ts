/**
 * Shared between the Pages Function (sender side) and the mailer Worker (re-validates: defence in depth).
 */
import { z } from 'astro/zod';
import { locales } from '../i18n/config.ts';

/** Control, format (bidi overrides, zero-width…) and line/paragraph separator characters. */
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
/** Same, but line breaks and tabs are allowed (message body). */
const INVISIBLE_EXCEPT_BREAKS = /[\p{Cf}\p{Zl}\p{Zp}]|(?![\n\t])\p{Cc}/u;
const visibleLength = (value: string) => Array.from(value.replace(/\s+/g, '')).length;

/** One-line text (name, subject): no line breaks or invisible characters, so it cannot forge lines in the email. */
const singleLine = (min: number, max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((v) => !INVISIBLE.test(v), 'Invalid characters')
    .refine((v) => visibleLength(v) >= min, `At least ${min} visible characters`);

export const contactPayloadSchema = z.object({
  locale: z.enum(locales),
  name: singleLine(2, 100),
  email: z.email().max(254),
  subject: singleLine(0, 150),
  message: z
    .string()
    // Browsers submit line breaks as CRLF; count them as one character, like the textarea does.
    .transform((v) => v.replace(/\r\n?/g, '\n').trim())
    .pipe(
      z
        .string()
        .max(5000)
        .refine((v) => !INVISIBLE_EXCEPT_BREAKS.test(v), 'Invalid characters')
        .refine((v) => visibleLength(v) >= 10, 'At least 10 visible characters'),
    ),
});

export type ContactPayload = z.infer<typeof contactPayloadSchema>;

const LANGUAGE_NAME = { ar: 'العربية', fr: 'français', en: 'English' } as const;

/** Plain-text email (no HTML: nothing to escape or render in the mail client). */
export function formatContactEmail(input: unknown): { subject: string; text: string; payload: ContactPayload } {
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
  return { subject, text, payload: p };
}
