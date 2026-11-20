/**
 * Cryptography for the admin panel, using only the Web Crypto API (Cloudflare Workers and Node 24).
 * - Passwords: PBKDF2-SHA-256, 100 000 iterations (the Workers runtime maximum), 16-byte random salt.
 * - Session ids: 32 random bytes; only their SHA-256 hash is stored.
 * - 2-step verification: TOTP (RFC 6238, SHA-1, 6 digits, 30 s), compatible with authenticator apps.
 */

const encoder = new TextEncoder();
export const PBKDF2_ITERATIONS = 100_000;

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length));
}

export function randomToken(bytes = 32): string {
  return toHex(randomBytes(bytes));
}

export async function sha256Hex(value: string): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
}

/** Constant-time comparison of two strings of the same alphabet. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password.normalize('NFKC')), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

/** "pbkdf2-sha256$<iterations>$<salt hex>$<hash hex>" */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${toHex(salt)}$${toHex(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterations, salt, hash] = stored.split('$');
  if (scheme !== 'pbkdf2-sha256' || !iterations || !salt || !hash) return false;
  const actual = await pbkdf2(password, fromHex(salt), Number(iterations));
  return safeEqual(toHex(actual), hash);
}

/** A hash to compare against when the user does not exist, so timing does not reveal valid usernames. */
export const DUMMY_HASH = `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${'00'.repeat(16)}$${'00'.repeat(32)}`;

// ---------- TOTP ----------
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Uint8Array<ArrayBuffer> {
  const clean = text.replace(/[\s=-]/g, '').toUpperCase();
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error('Invalid base32');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export async function totpCode(secret: string, counter: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', base32Decode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const message = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    message[i] = c & 255;
    c = Math.floor(c / 256);
  }
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, message));
  const offset = (mac[mac.length - 1] ?? 0) & 15;
  const binary =
    (((mac[offset] ?? 0) & 0x7f) << 24) |
    ((mac[offset + 1] ?? 0) << 16) |
    ((mac[offset + 2] ?? 0) << 8) |
    (mac[offset + 3] ?? 0);
  return String(binary % 1_000_000).padStart(6, '0');
}

/**
 * Checks a 6-digit code, allowing one 30-second step of clock drift either way.
 * Returns the matched time step (to refuse replays) or null.
 */
export async function verifyTotp(secret: string, code: string, now = Date.now()): Promise<number | null> {
  if (!/^\d{6}$/.test(code)) return null;
  const step = Math.floor(now / 30_000);
  for (const delta of [0, -1, 1]) {
    if (safeEqual(await totpCode(secret, step + delta), code)) return step + delta;
  }
  return null;
}

export function otpauthUri(secret: string, account: string, issuer = 'INFSPM Tébessa'): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
