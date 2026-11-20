/**
 * HTTP API of the admin panel: /api/admin/* (Cloudflare Pages Function functions/api/admin/[[path]].ts).
 *
 * Security:
 * - Session cookie "__Host-infspm_admin": Secure, HttpOnly, SameSite=Strict, Path=/ (no JavaScript access).
 * - Every state-changing request must come from this origin (Origin header) and carry the header
 *   "X-Admin-Request: 1" (a cross-site form cannot set it): together with SameSite=Strict, this blocks CSRF.
 * - Roles: editors write; administrators publish, approve, delete and manage accounts.
 * - Responses are never cached; errors never include secrets or stack traces.
 */
import { Auth, AuthError, publicUser, SESSION_COOKIE, SESSION_TTL, type KV, type User } from './auth';
import { ContentError, deleteEntry, imageRepoPath, listEntries, loadEntry, saveEntry, COLLECTIONS, LOCALES } from './content';
import { randomToken } from './crypto';
import { GitHub, GitHubError } from './github';

export interface AdminEnv {
  ADMIN_KV?: KV;
  GITHUB_CMS_TOKEN?: string;
  GITHUB_REPO?: string;
  ADMIN_SETUP_CODE?: string;
}

export interface AdminDeps {
  now?: () => number;
  fetch?: typeof fetch;
}

const MAX_BODY = 24 * 1024 * 1024;

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });
}

function cookie(token: string, maxAge: number): string {
  return `${SESSION_COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;
}

function readCookie(request: Request): string | undefined {
  const header = request.headers.get('Cookie') ?? '';
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE) return rest.join('=');
  }
  return undefined;
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get('Content-Length') ?? '0');
  if (length > MAX_BODY) throw new AuthError(413, 'too_large');
  const text = await request.text();
  if (text.length > MAX_BODY) throw new AuthError(413, 'too_large');
  try {
    const value = JSON.parse(text || '{}') as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not an object');
    return value as Record<string, unknown>;
  } catch {
    throw new AuthError(400, 'bad_json');
  }
}

function requireRole(user: User, role: 'admin'): void {
  if (role === 'admin' && user.role !== 'admin') throw new AuthError(403, 'admin_only');
}

export async function handleAdmin(request: Request, env: AdminEnv, deps: AdminDeps = {}): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/admin\/?/, '').replace(/\/+$/, '');
  const method = request.method.toUpperCase();
  try {
    if (!env.ADMIN_KV) return json(503, { error: 'not_configured', missing: 'ADMIN_KV' });
    const auth = new Auth(env.ADMIN_KV, deps.now);

    if (method !== 'GET' && method !== 'HEAD') {
      const origin = request.headers.get('Origin');
      if (origin !== url.origin || request.headers.get('X-Admin-Request') !== '1') return json(403, { error: 'forbidden' });
    }

    const token = readCookie(request);
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';

    // ---------- Public endpoints ----------
    if (path === 'session' && method === 'GET') {
      const user = await auth.userFromToken(token);
      return json(200, {
        user: user ? publicUser(user) : null,
        needsSetup: !(await auth.hasUsers()),
        setupAvailable: Boolean(env.ADMIN_SETUP_CODE && env.ADMIN_SETUP_CODE.length >= 12),
        contentConfigured: Boolean(env.GITHUB_CMS_TOKEN),
      });
    }
    if (path === 'setup' && method === 'POST') {
      const body = await readJson(request);
      const user = await auth.setup(env.ADMIN_SETUP_CODE, {
        code: body['code'],
        username: body['username'],
        displayName: body['displayName'],
        password: body['password'],
      });
      const session = await auth.login({ username: user.username, password: body['password'] }, ip);
      return json(200, { user: session.user }, { 'Set-Cookie': cookie(session.token, SESSION_TTL) });
    }
    if (path === 'login' && method === 'POST') {
      const body = await readJson(request);
      const session = await auth.login({ username: body['username'], password: body['password'], code: body['code'] }, ip);
      return json(200, { user: session.user }, { 'Set-Cookie': cookie(session.token, SESSION_TTL) });
    }
    if (path === 'logout' && method === 'POST') {
      await auth.logout(token);
      return json(200, { ok: true }, { 'Set-Cookie': cookie('', 0) });
    }

    // ---------- Signed-in endpoints ----------
    const user = await auth.userFromToken(token);
    if (!user) return json(401, { error: 'signed_out' }, token ? { 'Set-Cookie': cookie('', 0) } : {});

    // Own account
    if (path === 'me/password' && method === 'POST') {
      const body = await readJson(request);
      await auth.changeOwnPassword(user, body['current'], body['next']);
      return json(200, { ok: true });
    }
    if (path === 'me/2fa/start' && method === 'POST') return json(200, await auth.startTotp(user));
    if (path === 'me/2fa/confirm' && method === 'POST') {
      await auth.confirmTotp(user, (await readJson(request))['code']);
      return json(200, { ok: true });
    }
    if (path === 'me/2fa/disable' && method === 'POST') {
      await auth.disableTotp(user, (await readJson(request))['password']);
      return json(200, { ok: true });
    }

    // Accounts (administrators)
    if (path === 'users' && method === 'GET') {
      requireRole(user, 'admin');
      return json(200, { users: await auth.listUsers() });
    }
    if (path === 'users' && method === 'POST') {
      requireRole(user, 'admin');
      const body = await readJson(request);
      return json(201, {
        user: await auth.createUser({
          username: body['username'],
          displayName: body['displayName'],
          role: body['role'],
          password: body['password'],
        }),
      });
    }
    const userMatch = /^users\/([a-z0-9._-]{3,32})(\/password)?$/.exec(path);
    if (userMatch) {
      requireRole(user, 'admin');
      const target = userMatch[1] ?? '';
      if (userMatch[2] && method === 'POST') {
        await auth.resetPassword(target, (await readJson(request))['password']);
        return json(200, { ok: true });
      }
      if (!userMatch[2] && method === 'PATCH') {
        const body = await readJson(request);
        return json(200, { user: await auth.updateUser(user, target, { displayName: body['displayName'], role: body['role'] }) });
      }
      if (!userMatch[2] && method === 'DELETE') {
        await auth.deleteUser(user, target);
        return json(200, { ok: true });
      }
    }

    // ---------- Content (needs the GitHub token) ----------
    if (!env.GITHUB_CMS_TOKEN) return json(503, { error: 'not_configured', missing: 'GITHUB_CMS_TOKEN' });
    const github = new GitHub({
      token: env.GITHUB_CMS_TOKEN,
      repo: env.GITHUB_REPO ?? 'AbdelkarimMouici/infspm-site',
      ...(deps.fetch ? { fetch: deps.fetch } : {}),
    });

    // Administrators only: facts about the configured GitHub key, never the key itself.
    if (path === 'diagnostics' && method === 'GET') {
      requireRole(user, 'admin');
      const token = env.GITHUB_CMS_TOKEN;
      const repo = env.GITHUB_REPO ?? 'AbdelkarimMouici/infspm-site';
      const probe = await (deps.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init)))(
        `https://api.github.com/repos/${repo}`,
        {
          headers: {
            Authorization: `Bearer ${token.trim()}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'infspm-admin',
          },
        },
      ).catch(() => null);
      return json(200, {
        token: {
          length: token.length,
          trimmedLength: token.trim().length,
          looksFineGrained: token.trim().startsWith('github_pat_'),
          looksClassic: token.trim().startsWith('ghp_'),
          hasInnerWhitespace: /\s/.test(token.trim()),
          hasOuterWhitespace: token !== token.trim(),
        },
        repo,
        githubRepoStatus: probe?.status ?? null,
      });
    }

    if (path === 'dashboard' && method === 'GET') {
      const [lists, changes, live] = await Promise.all([
        Promise.all((Object.keys(COLLECTIONS) as (keyof typeof COLLECTIONS)[]).map(async (name) => [name, await listEntries(github, name)] as const)),
        github.openChanges(),
        github.liveStatus().catch(() => null),
      ]);
      const counts = Object.fromEntries(
        lists.map(([name, entries]) => [
          name,
          {
            total: entries.length,
            published: entries.filter((e) => e.locales.ar?.status === 'published').length,
            drafts: entries.filter((e) => e.locales.ar?.status !== 'published').length,
            missingTranslations: entries.filter((e) => LOCALES.some((l) => !e.locales[l])).length,
          },
        ]),
      );
      const recent = lists
        .filter(([name]) => name !== 'pages')
        .flatMap(([name, entries]) => entries.map((e) => ({ collection: name, ...e })))
        .sort((a, b) => (b.locales.ar?.date ?? '').localeCompare(a.locales.ar?.date ?? ''))
        .slice(0, 6);
      return json(200, { counts, changes, live, recent });
    }

    if (path === 'changes' && method === 'GET') {
      const changes = await github.openChanges();
      // Merge ready changes that could not use auto-merge (repository setting off).
      for (const change of changes) {
        if (!change.awaitingApproval && !change.autoMerge && change.checks === 'success') await github.tryMerge(change.number);
      }
      return json(200, { changes: await github.openChanges() });
    }
    const changeMatch = /^changes\/(\d+)\/(approve|discard)$/.exec(path);
    if (changeMatch && method === 'POST') {
      requireRole(user, 'admin');
      const number = Number(changeMatch[1]);
      const change = (await github.openChanges()).find((c) => c.number === number);
      if (!change) return json(404, { error: 'not_found' });
      if (changeMatch[2] === 'discard') {
        await github.closePullRequest(number, change.branch);
        return json(200, { ok: true });
      }
      const merged = change.checks === 'success' ? await github.tryMerge(number) : false;
      const autoMerge = merged ? false : await github.enableAutoMerge(await github.pullRequestNodeId(number));
      return json(200, { merged, autoMerge });
    }

    if (path === 'file' && method === 'GET') {
      const repoPath = imageRepoPath(url.searchParams.get('src') ?? '');
      if (!repoPath) return json(400, { error: 'bad_path' });
      const { bytes } = await github.readBytes(repoPath);
      const type = repoPath.endsWith('.webp') ? 'image/webp' : repoPath.endsWith('.png') ? 'image/png' : 'image/jpeg';
      return new Response(bytes, {
        headers: { 'Content-Type': type, 'Cache-Control': 'private, max-age=600', 'X-Content-Type-Options': 'nosniff' },
      });
    }

    const contentMatch = /^content\/([a-z]+)(?:\/([a-z0-9-]+))?$/.exec(path);
    if (contentMatch) {
      const collection = contentMatch[1] ?? '';
      const slug = contentMatch[2];
      if (!slug && method === 'GET') return json(200, { entries: await listEntries(github, collection) });
      if (!slug && method === 'POST') {
        const body = await readJson(request);
        return json(201, await saveEntry(github, user, collection, null, body as never, () => randomToken(8)));
      }
      if (slug && method === 'GET') return json(200, { slug, locales: await loadEntry(github, collection, slug) });
      if (slug && method === 'PUT') {
        const body = await readJson(request);
        return json(200, await saveEntry(github, user, collection, slug, body as never, () => randomToken(8)));
      }
      if (slug && method === 'DELETE') {
        requireRole(user, 'admin');
        return json(200, await deleteEntry(github, user, collection, slug));
      }
    }

    return json(404, { error: 'not_found' });
  } catch (error) {
    if (error instanceof AuthError) return json(error.status, { error: error.code, detail: error.message !== error.code ? error.message : undefined });
    if (error instanceof ContentError) return json(error.status, { error: error.code, details: error.details });
    if (error instanceof GitHubError) {
      console.error('admin github error', error.status);
      return json(502, { error: 'github', status: error.status });
    }
    // Name and message only (never request bodies, cookies or tokens), for the Cloudflare logs.
    console.error('admin error', error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 300) : 'unknown');
    return json(500, { error: 'server' });
  }
}
