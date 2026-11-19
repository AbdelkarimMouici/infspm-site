import { describe, expect, it, vi } from 'vitest';
import {
  STATE_COOKIE,
  handleAuth,
  handleCallback,
  safeEqual,
  scriptJson,
  type OAuthEnv,
} from '~/server/decap-oauth';

const env: OAuthEnv = { GITHUB_OAUTH_CLIENT_ID: 'test-client-id', GITHUB_OAUTH_CLIENT_SECRET: 'test-client-secret' };
const SITE = 'https://staging.example.test';

function callbackRequest(params: Record<string, string>, cookieState?: string): Request {
  const url = new URL('/api/decap/callback', SITE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const headers = new Headers();
  if (cookieState !== undefined) headers.set('Cookie', `other=1; ${STATE_COOKIE}=${cookieState}`);
  return new Request(url, { headers });
}

function tokenFetch(body: unknown, ok = true): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), { status: ok ? 200 : 500 })) as unknown as typeof fetch;
}

describe('auth endpoint', () => {
  it('redirects to GitHub with a random state stored in a secure cookie', () => {
    const res = handleAuth(new Request(`${SITE}/api/decap/auth`), env);
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get('Location') ?? '');
    expect(location.origin).toBe('https://github.com');
    expect(location.searchParams.get('client_id')).toBe('test-client-id');
    expect(location.searchParams.get('redirect_uri')).toBe(`${SITE}/api/decap/callback`);
    expect(location.searchParams.get('scope')).toBe('repo');
    const state = location.searchParams.get('state') ?? '';
    expect(state.length).toBeGreaterThanOrEqual(40);
    const cookie = res.headers.get('Set-Cookie') ?? '';
    expect(cookie).toContain(`${STATE_COOKIE}=${state}`);
    for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/']) expect(cookie).toContain(flag);
    expect(res.headers.get('Location')).not.toContain('test-client-secret');
  });

  it('uses a new state each time', () => {
    const a = handleAuth(new Request(`${SITE}/api/decap/auth`), env).headers.get('Location');
    const b = handleAuth(new Request(`${SITE}/api/decap/auth`), env).headers.get('Location');
    expect(a).not.toBe(b);
  });

  it('ignores unexpected scopes', () => {
    const res = handleAuth(new Request(`${SITE}/api/decap/auth`), { ...env, GITHUB_OAUTH_SCOPE: 'admin:org' });
    expect(new URL(res.headers.get('Location') ?? '').searchParams.get('scope')).toBe('repo');
  });

  it('fails closed when not configured', () => {
    expect(handleAuth(new Request(`${SITE}/api/decap/auth`), {}).status).toBe(503);
  });
});

describe('callback endpoint', () => {
  it('rejects a missing or mismatched state without calling GitHub', async () => {
    const fetchImpl = tokenFetch({ access_token: 'x' });
    expect((await handleCallback(callbackRequest({ code: 'c', state: 's' }), env, fetchImpl)).status).toBe(400);
    expect((await handleCallback(callbackRequest({ code: 'c', state: 's' }, 'other'), env, fetchImpl)).status).toBe(400);
    expect((await handleCallback(callbackRequest({ state: 's' }, 's'), env, fetchImpl)).status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('exchanges the code and posts the token only to the site origin, under a nonce CSP', async () => {
    const fetchImpl = tokenFetch({ access_token: 'gho_testtoken' });
    const res = await handleCallback(callbackRequest({ code: 'c0de', state: 'st4te' }, 'st4te'), env, fetchImpl);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('gho_testtoken');
    expect(html).toContain(JSON.stringify(SITE));
    expect(html).not.toMatch(/postMessage\([^)]*['"]\*['"]/); // never the wildcard origin
    expect(html).not.toContain('test-client-secret');
    const csp = res.headers.get('Content-Security-Policy') ?? '';
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    expect(nonce).toBeTruthy();
    expect(html).toContain(`<script nonce="${nonce}">`);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Set-Cookie')).toContain('Max-Age=0');

    const call = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(call?.[0]).toBe('https://github.com/login/oauth/access_token');
    expect(JSON.parse(String(call?.[1].body))).toMatchObject({ code: 'c0de', client_id: 'test-client-id' });
  });

  it('returns a generic error when GitHub refuses or fails', async () => {
    for (const fetchImpl of [
      tokenFetch({ error: 'bad_verification_code' }),
      tokenFetch({}, false),
      vi.fn(async () => {
        throw new Error('network down');
      }) as unknown as typeof fetch,
    ]) {
      const res = await handleCallback(callbackRequest({ code: 'c', state: 's' }, 's'), env, fetchImpl);
      expect(res.status).toBe(400);
      const html = await res.text();
      expect(html).toContain('authorization:github:error');
      expect(html).not.toContain('bad_verification_code');
    }
  });
});

describe('helpers', () => {
  it('compares strings in constant time semantics', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });

  it('escapes values so they cannot close the inline script', () => {
    const out = scriptJson('</script><script>alert(1)</script>');
    expect(out).not.toContain('</script>');
    expect(out).not.toContain('<');
  });

  it('escapes JavaScript line separators', () => {
    const out = scriptJson(`a${String.fromCharCode(0x2028)}b${String.fromCharCode(0x2029)}c`);
    expect(out).toBe('"a\\u2028b\\u2029c"');
  });
});
