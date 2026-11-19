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

export const MAX_BODY_BYTES = 16 * 1024;

/** Form fields: the shared payload (also re-validated by the mailer Worker) + honeypot + Turnstile token. */
export const contactSchema = contactPayloadSchema.extend({
  subject: z.string().trim().max(150).optional().default(''),
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
    headers: { Location: new URL(path, origin).href, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  });
}

function plain(status: number, text: string): Response {
  return new Response(text, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}

function localeOf(value: unknown): Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value) ? (value as Locale) : 'ar';
}

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

  // Same-origin form posts only (blocks cross-site submissions; browsers always send Origin on POST).
  const requestOrigin = request.headers.get('origin');
  if (requestOrigin !== origin) return plain(403, 'Forbidden');

  const type = (request.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase();
  if (type !== 'application/x-www-form-urlencoded') return plain(415, 'Unsupported content type');

  const raw = await readLimitedText(request, MAX_BODY_BYTES);
  if (raw === null) return plain(413, 'Message too large');
  const fields = Object.fromEntries(new URLSearchParams(raw));
  const locale = localeOf(fields['locale']);
  const sent = `/${locale}/contact/sent/`;
  const failed = `/${locale}/contact/not-sent/`;

  // Honeypot filled: answer like a success so bots learn nothing, but send nothing.
  if (fields['website']) return redirect(origin, sent);

  const ip = request.headers.get('cf-connecting-ip');
  const limiter = deps.limiter ?? defaultLimiter;
  if (!(await limiter.allow(ip ?? 'unknown'))) return redirect(origin, failed);

  const parsed = contactSchema.safeParse(fields);
  if (!parsed.success) return redirect(origin, failed);

  const secret = env.TURNSTILE_SECRET_KEY;
  if (!secret) return redirect(origin, failed);
  const verify = deps.verify ?? ((token: string, remoteIp: string | null) => verifyTurnstile({ secret, token, remoteIp }));
  const check = await verify(parsed.data['cf-turnstile-response'], ip);
  if (!check.success || check.hostname !== url.hostname || check.action !== 'contact') {
    return redirect(origin, failed);
  }

  try {
    const { name, email, subject, message } = parsed.data;
    await deps.send({ locale: parsed.data.locale, name, email, subject, message });
  } catch {
    // Never log the message or the sender: nothing is stored.
    return redirect(origin, failed);
  }
  return redirect(origin, sent);
}
