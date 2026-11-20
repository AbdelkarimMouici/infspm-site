// Cloudflare Pages Function: POST /api/contact (contact form). Logic and tests: src/server/contact.ts.
import { handleContact, type ContactEnv, type ContactMessage } from '../../src/server/contact';

interface Env extends ContactEnv {
  /** Service binding to the private contact-mailer Worker (workers/contact-mailer). */
  CONTACT_MAILER?: { fetch(request: Request): Promise<Response> };
}

async function sendThroughMailer(env: Env, message: ContactMessage): Promise<void> {
  if (!env.CONTACT_MAILER) throw new Error('Mailer not configured');
  // The host name is ignored by service bindings; the request never leaves Cloudflare.
  const response = await env.CONTACT_MAILER.fetch(
    new Request('https://contact-mailer.internal/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    }),
  );
  if (!response.ok) throw new Error(`Mailer responded ${response.status}`);
}

export const onRequestPost = ({ request, env }: { request: Request; env: Env }): Promise<Response> =>
  handleContact(request, env, { send: (message) => sendThroughMailer(env, message) });
