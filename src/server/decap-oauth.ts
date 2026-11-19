/**
 * GitHub OAuth for Decap CMS, run as Cloudflare Pages Functions (functions/api/decap/*).
 *
 * Flow: /api/decap/auth → GitHub consent → /api/decap/callback → token sent to the CMS window
 * with postMessage, restricted to this site's own origin.
 *
 * Security:
 * - CSRF protection with a random `state` stored in a __Host- cookie (HttpOnly, Secure, SameSite=Lax),
 *   compared in constant time and cleared after use.
 * - The client secret is read from platform secrets only (never logged, never sent to the browser).
 * - The callback page carries its own strict CSP with a per-response nonce, no caching, no referrer.
 * - Nothing is stored server-side.
 */

export interface OAuthEnv {
  GITHUB_OAUTH_CLIENT_ID?: string;
  GITHUB_OAUTH_CLIENT_SECRET?: string;
  /** "repo" for a private repository, "public_repo" for a public one. Default: "repo". */
  GITHUB_OAUTH_SCOPE?: string;
}

export const STATE_COOKIE = '__Host-decap_oauth_state';
const AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const ALLOWED_SCOPES = new Set(['repo', 'public_repo']);

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomToken(byteLength = 32): string {
  return base64url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

/** Constant-time string comparison (avoids leaking how many characters matched). */
export function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  const length = Math.max(ea.length, eb.length);
  for (let i = 0; i < length; i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get('Cookie') ?? '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return undefined;
}

function textResponse(status: number, message: string): Response {
  return new Response(message, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

function isConfigured(env: OAuthEnv): env is Required<Pick<OAuthEnv, 'GITHUB_OAUTH_CLIENT_ID' | 'GITHUB_OAUTH_CLIENT_SECRET'>> & OAuthEnv {
  return Boolean(env.GITHUB_OAUTH_CLIENT_ID && env.GITHUB_OAUTH_CLIENT_SECRET);
}

function callbackUrl(request: Request): string {
  return new URL('/api/decap/callback', request.url).href;
}

/** GET /api/decap/auth — start the GitHub OAuth flow. */
export function handleAuth(request: Request, env: OAuthEnv): Response {
  if (!isConfigured(env)) return textResponse(503, 'Sign-in is not configured.');

  const scope = env.GITHUB_OAUTH_SCOPE && ALLOWED_SCOPES.has(env.GITHUB_OAUTH_SCOPE) ? env.GITHUB_OAUTH_SCOPE : 'repo';
  const state = randomToken();
  const target = new URL(AUTHORIZE_URL);
  target.searchParams.set('client_id', env.GITHUB_OAUTH_CLIENT_ID);
  target.searchParams.set('redirect_uri', callbackUrl(request));
  target.searchParams.set('scope', scope);
  target.searchParams.set('state', state);
  target.searchParams.set('allow_signup', 'false');

  return new Response(null, {
    status: 302,
    headers: {
      Location: target.href,
      'Set-Cookie': `${STATE_COOKIE}=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

type Outcome = { ok: true; token: string } | { ok: false };

/** Serializes a value for safe embedding inside an inline <script>. */
export function scriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .split(String.fromCharCode(0x2028))
    .join('\\u2028')
    .split(String.fromCharCode(0x2029))
    .join('\\u2029');
}

/** Popup page that hands the result to the Decap window (same origin only), then closes. */
export function renderCallbackPage(origin: string, outcome: Outcome): Response {
  const nonce = randomToken(16);
  const message = outcome.ok
    ? `authorization:github:success:${JSON.stringify({ token: outcome.token, provider: 'github' })}`
    : `authorization:github:error:${JSON.stringify({ message: 'Sign-in failed. Please try again.' })}`;

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Signing in…</title></head>
<body><p>Signing in…</p>
<script nonce="${nonce}">
(function () {
  var origin = ${scriptJson(origin)};
  var message = ${scriptJson(message)};
  if (!window.opener) { document.body.textContent = 'Please close this window.'; return; }
  function onMessage(event) {
    if (event.origin !== origin) return;
    window.removeEventListener('message', onMessage);
    window.opener.postMessage(message, origin);
    setTimeout(function () { window.close(); }, 200);
  }
  window.addEventListener('message', onMessage);
  window.opener.postMessage('authorizing:github', origin);
})();
</script></body></html>`;

  return new Response(html, {
    status: outcome.ok ? 200 : 400,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
      // Clear the one-time state cookie.
      'Set-Cookie': `${STATE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
    },
  });
}

/** GET /api/decap/callback — verify state, exchange the code, hand the token to the CMS. */
export async function handleCallback(
  request: Request,
  env: OAuthEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const url = new URL(request.url);
  const origin = url.origin;
  if (!isConfigured(env)) return textResponse(503, 'Sign-in is not configured.');

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expected = readCookie(request, STATE_COOKIE);

  if (!code || code.length > 200 || !state || !expected || !safeEqual(state, expected)) {
    return renderCallbackPage(origin, { ok: false });
  }

  try {
    const response = await fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'infspm-site-decap-oauth',
      },
      body: JSON.stringify({
        client_id: env.GITHUB_OAUTH_CLIENT_ID,
        client_secret: env.GITHUB_OAUTH_CLIENT_SECRET,
        code,
        redirect_uri: callbackUrl(request),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return renderCallbackPage(origin, { ok: false });
    const data = (await response.json()) as { access_token?: unknown; error?: unknown };
    if (typeof data.access_token !== 'string' || data.access_token.length === 0) {
      return renderCallbackPage(origin, { ok: false });
    }
    return renderCallbackPage(origin, { ok: true, token: data.access_token });
  } catch {
    // Never log the code, the secret or the response body.
    return renderCallbackPage(origin, { ok: false });
  }
}
