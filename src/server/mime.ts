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

/** RFC 2047 encoded-word for header text (handles Arabic and strips control characters). */
export function encodeHeaderText(text: string): string {
  // eslint-disable-next-line no-control-regex
  const clean = text.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 200);
  return `=?UTF-8?B?${base64Utf8(clean)}?=`;
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
