/**
 * Shared between the Pages Function (sender side) and the mailer Worker (re-validates: defence in depth).
 */
import { z } from 'astro/zod';
import { locales } from '../i18n/config.ts';

// Character sets are built from code points (no invisible characters or escapes in the source).
const cp = (...codes: number[]) => String.fromCodePoint(...codes);
/** Harmless marks added by keyboards, Word or copied text (ZWSP, LRM, RLM, ALM, word joiner, BOM): removed. */
const HARMLESS = new RegExp(`[${cp(0x200b, 0x200e, 0x200f, 0x061c, 0x2060, 0xfeff)}]`, 'gu');
/** Bidi embeddings/overrides (U+202A–U+202E) and isolates (U+2066–U+2069): can reorder what staff read. */
const BIDI_CONTROLS = `${cp(0x202a)}-${cp(0x202e)}${cp(0x2066)}-${cp(0x2069)}`;
const BIDI = new RegExp(`[${BIDI_CONTROLS}]`, 'u');
const BIDI_ALL = new RegExp(`[${BIDI_CONTROLS}]`, 'gu');

const visibleLength = (value: string) =>
  Array.from(value.replace(/[\s\p{Cf}]+/gu, '')).length;

/**
 * One-line text (name, subject): line breaks, control characters and bidi controls are refused, so a sender
 * cannot forge lines in the email. Legitimate joiners (ZWNJ/ZWJ) and diacritics are kept.
 */
const singleLine = (min: number, max: number) =>
  z
    .string()
    .transform((v) => v.replace(HARMLESS, '').trim())
    .pipe(
      z
        .string()
        .max(max)
        .refine((v) => !/[\p{Cc}\p{Zl}\p{Zp}]/u.test(v) && !BIDI.test(v), 'Invalid characters')
        .refine((v) => visibleLength(v) >= min, `At least ${min} visible characters`),
    );

export const contactPayloadSchema = z.object({
  locale: z.enum(locales),
  name: singleLine(2, 100),
  email: z.email().max(254),
  subject: singleLine(0, 150),
  message: z
    .string()
    // Browsers submit line breaks as CRLF; count them as one character, like the textarea does.
    // Harmless marks and bidi controls are removed (not refused): copied Arabic text often contains them.
    .transform((v) =>
      v
        .replace(/\r\n?/g, '\n')
        .replace(/[\p{Zl}\p{Zp}]/gu, '\n')
        .replace(HARMLESS, '')
        .replace(BIDI_ALL, '')
        .trim(),
    )
    .pipe(
      z
        .string()
        .max(5000)
        .refine((v) => !/(?![\n\t])\p{Cc}/u.test(v), 'Invalid characters')
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
