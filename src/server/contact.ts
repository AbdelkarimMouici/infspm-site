/**
 * Contact form handler (Cloudflare Pages Function: POST /api/contact).
 *
 * Works without JavaScript on our side: the HTML form posts here and gets a 303 redirect to a static
 * "sent" or "not sent" page. Cloudflare Turnstile is the only script on the contact page.
 *
 * Defences (CLAUDE.md): same-origin check, size limit, honeypot, zod validation, Turnstile siteverify
 * (hostname + action checked), best-effort rate limit, header-injection-safe email, nothing stored, nothing logged.
 */
import { z } from 'astro/zod';
import { locales, type Locale } from '../i18n/config.ts';
import { contactPayloadSchema, type ContactPayload } from './contact-email.ts';
import { RateLimiter } from './rate-limit.ts';
import { verifyTurnstile, type TurnstileResult } from './turnstile.ts';

/**
 * Form-urlencoded Arabic takes up to 6 bytes per character ("%D8%A7"): 5,000 characters of message plus
 * the other fields need about 32 KB. 64 KB leaves room without allowing abuse.
 */
export const MAX_BODY_BYTES = 64 * 1024;

/** Why a message was not sent. Each reason has its own static page: /{locale}/contact/not-sent/{reason}/. */
export const FAILURE_REASONS = ['invalid', 'busy', 'check', 'unavailable'] as const;
export type FailureReason = (typeof FAILURE_REASONS)[number];

/** Form fields: the shared payload (also re-validated by the mailer Worker) + honeypot + Turnstile token. */
export const contactSchema = contactPayloadSchema.extend({
  subject: contactPayloadSchema.shape.subject.optional().default(''),
  /** Honeypot: humans never see or fill it. */
  website: z.string().max(0).optional().default(''),
  'cf-turnstile-response': z.string().min(1).max(2048),
});

export type ContactMessage = ContactPayload;

export interface ContactEnv {
  TURNSTILE_SECRET_KEY?: string;
}

export interface ContactDeps {
  verify?: (token: string, ip: string | null) => Promise<TurnstileResult>;
  send: (message: ContactMessage) => Promise<void>;
  limiter?: RateLimiter;
}

const defaultLimiter = new RateLimiter({ limit: 5, windowMs: 10 * 60 * 1000 });

function redirect(origin: string, path: string): Response {
  return new Response(null, {
    status: 303,
    headers: {
      Location: new URL(path, origin).href,
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function plain(status: number, text: string): Response {
  return new Response(text, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}

function localeOf(value: unknown): Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value) ? (value as Locale) : 'ar';
}

/** Locale of the page that posted the form (same-origin Referer), used before the body is parsed. */
function localeFromReferer(request: Request, origin: string): Locale {
  try {
    const referer = new URL(request.headers.get('referer') ?? '');
    return referer.origin === origin ? localeOf(referer.pathname.split('/')[1]) : 'ar';
  } catch {
    return 'ar';
  }
}

const failedPath = (locale: Locale, reason: FailureReason) => `/${locale}/contact/not-sent/${reason}/`;

async function readLimitedText(request: Request, limit: number): Promise<string | null> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > limit) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export async function handleContact(request: Request, env: ContactEnv, deps: ContactDeps): Promise<Response> {
  const url = new URL(request.url);
  const origin = url.origin;

  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });

  // Same-origin form posts only (blocks cross-site submissions; browsers send Origin on POST).
  // Requires a Referrer-Policy that is not "no-referrer" on the contact pages (public/_headers).
  const requestOrigin = request.headers.get('origin');
  if (requestOrigin !== origin) return plain(403, 'Forbidden');

  const refererLocale = localeFromReferer(request, origin);
  const type = (request.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase();
  if (type !== 'application/x-www-form-urlencoded') return redirect(origin, failedPath(refererLocale, 'invalid'));

  const raw = await readLimitedText(request, MAX_BODY_BYTES);
  if (raw === null) return redirect(origin, failedPath(refererLocale, 'invalid'));
  const fields = Object.fromEntries(new URLSearchParams(raw));
  const locale = localeOf(fields['locale']);
  const sent = `/${locale}/contact/sent/`;

  // Honeypot filled: answer like a success so bots learn nothing, but send nothing.
  if (fields['website']) return redirect(origin, sent);

  const ip = request.headers.get('cf-connecting-ip');
  const limiter = deps.limiter ?? defaultLimiter;
  if (!(await limiter.allow(ip ?? 'unknown'))) return redirect(origin, failedPath(locale, 'busy'));

  const parsed = contactSchema.safeParse(fields);
  if (!parsed.success) return redirect(origin, failedPath(locale, 'invalid'));

  const secret = env.TURNSTILE_SECRET_KEY;
  if (!secret) return redirect(origin, failedPath(locale, 'unavailable'));
  const verify = deps.verify ?? ((token: string, remoteIp: string | null) => verifyTurnstile({ secret, token, remoteIp }));
  const check = await verify(parsed.data['cf-turnstile-response'], ip);
  if (!check.success || check.hostname !== url.hostname || check.action !== 'contact') {
    return redirect(origin, failedPath(locale, 'check'));
  }

  try {
    const { name, email, subject, message } = parsed.data;
    await deps.send({ locale: parsed.data.locale, name, email, subject, message });
  } catch {
    // Never log the message or the sender: nothing is stored.
    return redirect(origin, failedPath(locale, 'unavailable'));
  }
  return redirect(origin, sent);
}
