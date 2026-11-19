import { describe, expect, it, vi } from 'vitest';
import { handleContact, MAX_BODY_BYTES, type ContactDeps } from '~/server/contact';
import { formatContactEmail } from '~/server/contact-email';
import { buildPlainEmail, encodeHeaderText } from '~/server/mime';
import { RateLimiter } from '~/server/rate-limit';
import { verifyTurnstile, SITEVERIFY_URL } from '~/server/turnstile';

const SITE = 'https://staging.example.test';
const env = { TURNSTILE_SECRET_KEY: 'turnstile-secret-fixture' };
const valid = {
  locale: 'fr',
  name: 'Amina Test',
  email: 'amina@example.org',
  subject: 'Question',
  message: 'Bonjour, ceci est un message de test.',
  website: '',
  'cf-turnstile-response': 'token-fixture',
};

function post(fields: Record<string, string>, headers: Record<string, string> = {}): Request {
  return new Request(`${SITE}/api/contact`, {
    method: 'POST',
    headers: {
      origin: SITE,
      'content-type': 'application/x-www-form-urlencoded',
      'cf-connecting-ip': '203.0.113.7',
      ...headers,
    },
    body: new URLSearchParams(fields).toString(),
  });
}

function deps(overrides: Partial<ContactDeps> = {}) {
  const send = vi.fn(async () => {});
  const verify = vi.fn(async () => ({ success: true, hostname: 'staging.example.test', action: 'contact', errorCodes: [] }));
  return { send, verify, limiter: new RateLimiter({ limit: 100, windowMs: 60_000 }), ...overrides };
}

const location = (res: Response) => new URL(res.headers.get('location') ?? '').pathname;

describe('contact handler', () => {
  it('sends a valid message and redirects to the "sent" page', async () => {
    const d = deps();
    const res = await handleContact(post(valid), env, d);
    expect(res.status).toBe(303);
    expect(location(res)).toBe('/fr/contact/sent/');
    expect(d.verify).toHaveBeenCalledWith('token-fixture', '203.0.113.7');
    expect(d.send).toHaveBeenCalledWith({ locale: 'fr', name: 'Amina Test', email: 'amina@example.org', subject: 'Question', message: valid.message });
  });

  it('silently drops honeypot submissions', async () => {
    const d = deps();
    const res = await handleContact(post({ ...valid, website: 'https://spam.example' }), env, d);
    expect(location(res)).toBe('/fr/contact/sent/');
    expect(d.send).not.toHaveBeenCalled();
    expect(d.verify).not.toHaveBeenCalled();
  });

  it('rejects cross-site posts, wrong content types, other methods and oversized bodies', async () => {
    const d = deps();
    expect((await handleContact(post(valid, { origin: 'https://evil.example' }), env, d)).status).toBe(403);
    expect((await handleContact(post(valid, { origin: 'null' }), env, d)).status).toBe(403);
    const wrongType = await handleContact(post(valid, { 'content-type': 'application/json', referer: `${SITE}/en/contact/` }), env, d);
    expect(location(wrongType)).toBe('/en/contact/not-sent/invalid/');
    expect((await handleContact(new Request(`${SITE}/api/contact`), env, d)).status).toBe(405);
    const big = post({ ...valid, message: 'x'.repeat(MAX_BODY_BYTES) });
    expect(location(await handleContact(big, env, d))).toBe('/ar/contact/not-sent/invalid/'); // no Referer: Arabic
    expect(d.send).not.toHaveBeenCalled();
  });

  it('accepts a 5,000-character Arabic message (6 bytes per character once encoded)', async () => {
    const d = deps();
    const res = await handleContact(post({ ...valid, locale: 'ar', message: 'م'.repeat(5000) }), env, d);
    expect(location(res)).toBe('/ar/contact/sent/');
  });

  it('counts browser line breaks (CRLF) as one character', async () => {
    const d = deps();
    const message = Array.from({ length: 2400 }, () => 'a').join('\r\n'); // 2,400 chars + 2,399 CRLF
    const res = await handleContact(post({ ...valid, message }), env, d);
    expect(location(res)).toBe('/fr/contact/sent/');
    const sent = (d.send as unknown as { mock: { calls: [{ message: string }][] } }).mock.calls[0]?.[0];
    expect(sent?.message).not.toContain('\r');
  });

  it.each([
    ['empty name', { name: '' }],
    ['bad email', { email: 'not-an-email' }],
    ['short message', { message: 'hi' }],
    ['long message', { message: 'x'.repeat(5001) }],
    ['missing captcha', { 'cf-turnstile-response': '' }],
    ['unknown locale falls back to ar', { locale: 'xx' }],
    ['line break in the name (forged email line)', { name: 'Ali\nCourriel : boss@inpfp.dz' }],
    ['line break in the subject', { subject: 'Hello\r\nObjet : urgent' }],
    ['invisible characters as a name', { name: '​​' }],
    ['control characters as a name', { name: '\u0007\u0007' }],
    ['bidi override in the subject', { subject: 'abc‮dcba' }],
    ['message of spaces', { message: '          x         ' }],
  ])('refuses invalid input: %s', async (_label, change) => {
    const d = deps();
    const res = await handleContact(post({ ...valid, ...change }), env, d);
    expect(location(res)).toMatch(/^\/(fr|ar)\/contact\/not-sent\/invalid\/$/);
    expect(d.send).not.toHaveBeenCalled();
  });

  it('refuses failed or mismatched Turnstile checks', async () => {
    for (const result of [
      { success: false, errorCodes: ['invalid-input-response'] },
      { success: true, hostname: 'evil.example', action: 'contact', errorCodes: [] },
      { success: true, hostname: 'staging.example.test', action: 'login', errorCodes: [] },
    ]) {
      const d = deps({ verify: vi.fn(async () => result) });
      const res = await handleContact(post(valid), env, d);
      expect(location(res)).toBe('/fr/contact/not-sent/check/');
      expect(d.send).not.toHaveBeenCalled();
    }
  });

  it('fails closed without a Turnstile secret, and reports delivery failures', async () => {
    const d = deps();
    expect(location(await handleContact(post(valid), {}, d))).toBe('/fr/contact/not-sent/unavailable/');
    expect(d.send).not.toHaveBeenCalled();
    const failing = deps({ send: vi.fn(async () => Promise.reject(new Error('down'))) });
    expect(location(await handleContact(post(valid), env, failing))).toBe('/fr/contact/not-sent/unavailable/');
  });

  it('rate-limits a client', async () => {
    const d = deps({ limiter: new RateLimiter({ limit: 2, windowMs: 60_000 }) });
    await handleContact(post(valid), env, d);
    await handleContact(post(valid), env, d);
    const third = await handleContact(post(valid), env, d);
    expect(location(third)).toBe('/fr/contact/not-sent/busy/');
    expect(d.send).toHaveBeenCalledTimes(2);
  });
});

describe('rate limiter', () => {
  it('allows again after the window', async () => {
    let now = 0;
    const limiter = new RateLimiter({ limit: 1, windowMs: 1000, now: () => now });
    expect(await limiter.allow('a')).toBe(true);
    expect(await limiter.allow('a')).toBe(false);
    expect(await limiter.allow('b')).toBe(true);
    now = 1500;
    expect(await limiter.allow('a')).toBe(true);
  });
});

describe('Turnstile siteverify', () => {
  it('posts secret, token and IP, and fails closed on errors', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = new URLSearchParams(String(init?.body));
      expect(body.get('secret')).toBe('s');
      expect(body.get('response')).toBe('t');
      expect(body.get('remoteip')).toBe('203.0.113.7');
      expect(body.has('idempotency_key')).toBe(false); // a fresh key per call would add nothing
      return new Response(JSON.stringify({ success: true, hostname: 'h', action: 'contact' }));
    }) as unknown as typeof fetch;
    const ok = await verifyTurnstile({ secret: 's', token: 't', remoteIp: '203.0.113.7', fetchImpl });
    expect(ok).toEqual({ success: true, hostname: 'h', action: 'contact', errorCodes: [] });
    expect((fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]?.[0]).toBe(SITEVERIFY_URL);

    const down = vi.fn(async () => Promise.reject(new Error('timeout'))) as unknown as typeof fetch;
    expect((await verifyTurnstile({ secret: 's', token: 't', remoteIp: null, fetchImpl: down })).success).toBe(false);
    expect((await verifyTurnstile({ secret: 's', token: 'x'.repeat(2049), remoteIp: null, fetchImpl: down })).success).toBe(false);
  });
});

describe('email', () => {
  it('cannot be used for header injection', () => {
    const raw = buildPlainEmail({
      from: 'contact-form@example.dz',
      fromName: 'Site',
      to: 'office@example.dz',
      replyTo: 'amina@example.org',
      replyToName: 'Evil\r\nBcc: victim@example.org',
      subject: 'Hi\nBcc: victim@example.org',
      text: 'Body\nBcc: not-a-header',
      messageIdDomain: 'example.dz',
    });
    const [head] = raw.split('\r\n\r\n');
    expect(head).not.toMatch(/^Bcc:/im);
    expect(head?.split('\r\n').every((line) => /^[A-Za-z-]+: /.test(line))).toBe(true);
    expect(() => buildPlainEmail({ from: 'a@b.c', fromName: '', to: 'x\r\nBcc: y@z.w', replyTo: 'a@b.c', replyToName: '', subject: '', text: '', messageIdDomain: 'b.c' })).toThrow();
  });

  it('encodes Arabic headers and formats a plain-text body', () => {
    expect(encodeHeaderText('سؤال')).toMatch(/^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=$/);
    const { subject, text } = formatContactEmail({ ...valid, locale: 'ar' });
    expect(subject).toContain('Amina Test');
    expect(text).toContain('Courriel : amina@example.org');
    expect(text).toContain(valid.message);
    expect(() => formatContactEmail({ ...valid, email: 'bad' })).toThrow();
  });
});

describe('review round 1 fixes', () => {
  it('folds long Arabic headers into encoded words of at most 75 characters, without splitting characters', () => {
    const encoded = encodeHeaderText('سؤال '.repeat(40) + '😀');
    const words = encoded.split('\r\n ');
    expect(words.length).toBeGreaterThan(1);
    for (const word of words) {
      expect(word.length).toBeLessThanOrEqual(75);
      const bytes = Uint8Array.from(atob(word.slice(10, -2)), (c) => c.charCodeAt(0));
      expect(() => new TextDecoder('utf-8', { fatal: true }).decode(bytes)).not.toThrow();
    }
  });

  it('keeps the rate limiter memory bounded', async () => {
    const limiter = new RateLimiter({ limit: 1, windowMs: 60_000 });
    for (let i = 0; i < 5100; i++) await limiter.allow(`client-${i}`);
    expect((limiter as unknown as { hits: Map<string, number[]> }).hits.size).toBeLessThanOrEqual(5000);
  });
});
