/**
 * Minimal RFC 5322 / MIME builder for a plain-text UTF-8 email (no dependency).
 * Every user-supplied value is either base64-encoded (body), RFC 2047-encoded (subject, display name)
 * or validated (addresses), so a visitor cannot inject headers.
 */

function base64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * RFC 2047 encoded-words for header text (Arabic, emoji…). Control and format characters are removed,
 * the text is cut on whole characters, and split into words of at most 45 UTF-8 bytes (60 base64 chars,
 * well under the 75-character limit), folded onto continuation lines.
 */
export function encodeHeaderText(text: string): string {
  const clean = Array.from(text.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ').trim())
    .slice(0, 200)
    .join('');
  const encoder = new TextEncoder();
  const words: string[] = [];
  let current = '';
  for (const char of clean) {
    // The first word shares its line with the header name ("Subject: "), so it is shorter.
    const limit = words.length === 0 ? 36 : 45;
    if (encoder.encode(current + char).length > limit) {
      words.push(current);
      current = '';
    }
    current += char;
  }
  if (current || words.length === 0) words.push(current);
  return words.map((word) => `=?UTF-8?B?${base64Utf8(word)}?=`).join('\r\n ');
}

const ADDRESS = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;

export function assertAddress(address: string): string {
  if (address.length > 254 || !ADDRESS.test(address)) throw new Error('Invalid email address');
  return address;
}

/** Wraps base64 at 76 characters per line (RFC 2045). */
function wrap(base64: string): string {
  return base64.match(/.{1,76}/g)?.join('\r\n') ?? '';
}

export interface PlainEmail {
  from: string;
  fromName: string;
  to: string;
  replyTo: string;
  replyToName: string;
  subject: string;
  text: string;
  messageIdDomain: string;
  date?: Date;
}

export function buildPlainEmail(mail: PlainEmail): string {
  const from = assertAddress(mail.from);
  const to = assertAddress(mail.to);
  const replyTo = assertAddress(mail.replyTo);
  if (!/^[A-Za-z0-9.-]+$/.test(mail.messageIdDomain)) throw new Error('Invalid Message-ID domain');
  const id = `<${crypto.randomUUID()}@${mail.messageIdDomain}>`;
  const headers = [
    `From: ${encodeHeaderText(mail.fromName)} <${from}>`,
    `To: <${to}>`,
    `Reply-To: ${encodeHeaderText(mail.replyToName)} <${replyTo}>`,
    `Subject: ${encodeHeaderText(mail.subject)}`,
    `Date: ${(mail.date ?? new Date()).toUTCString()}`,
    `Message-ID: ${id}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    'Auto-Submitted: auto-generated',
  ];
  return `${headers.join('\r\n')}\r\n\r\n${wrap(base64Utf8(mail.text.replace(/\r?\n/g, '\r\n')))}\r\n`;
}
