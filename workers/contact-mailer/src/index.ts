/**
 * contact-mailer: a private Cloudflare Worker that turns a validated contact message into an email to the
 * institute's verified address. It has NO public route (workers_dev = false, no routes): it is reachable only
 * through the service binding CONTACT_MAILER of the Pages project (functions/api/contact.ts).
 *
 * Status: NOT tested against a live Cloudflare account (needs the domain on Cloudflare with Email Routing and
 * a verified destination address — see docs/DEPLOYMENT.md). Uses the documented `send_email` binding with
 * `EmailMessage` from "cloudflare:email" (Cloudflare marks this API as supported for backward compatibility).
 */
// @ts-expect-error -- module provided by the Workers runtime only
import { EmailMessage } from 'cloudflare:email';
import { buildPlainEmail } from '../../../src/server/mime.ts';
import { formatContactEmail, type ContactPayload } from '../../../src/server/contact-email.ts';

interface Env {
  EMAIL: { send(message: unknown): Promise<void> };
  /** Sender on the institute's domain, e.g. contact-form@<domain>. */
  MAIL_FROM: string;
  /** Verified destination: the institute's official address. */
  MAIL_TO: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    let payload: ContactPayload;
    try {
      payload = (await request.json()) as ContactPayload;
    } catch {
      return new Response(null, { status: 400 });
    }
    let formatted: { subject: string; text: string };
    try {
      // Re-validate: defence in depth, even though only the Pages Function can call this Worker.
      formatted = formatContactEmail(payload);
    } catch {
      return new Response(null, { status: 400 });
    }
    const { subject, text } = formatted;
    const raw = buildPlainEmail({
      from: env.MAIL_FROM,
      fromName: 'INFSPM – formulaire de contact',
      to: env.MAIL_TO,
      replyTo: payload.email,
      replyToName: payload.name,
      subject,
      text,
      messageIdDomain: env.MAIL_FROM.split('@')[1] ?? 'invalid',
    });
    await env.EMAIL.send(new EmailMessage(env.MAIL_FROM, env.MAIL_TO, raw));
    return new Response(null, { status: 204 });
  },
};
