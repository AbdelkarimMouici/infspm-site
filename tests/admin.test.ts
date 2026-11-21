import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Auth, AuthError, IDLE_MS, LOCK_MS, MAX_FAILED, type KV } from '~/server/admin/auth';
import { base32Encode, hashPassword, totpCode, verifyPassword, verifyTotp } from '~/server/admin/crypto';
import { parseMarkdown, serializeMarkdown } from '~/server/admin/frontmatter';
import { handleAdmin } from '~/server/admin/router';
import { saveEntry } from '~/server/admin/content';
import type { GitHub } from '~/server/admin/github';
import { activitySchema, newsSchema, pageSchema, programSchema } from '~/content/schemas';
import { z } from 'astro/zod';

class MemoryKV implements KV {
  readonly data = new Map<string, string>();
  async get(key: string) {
    return this.data.get(key) ?? null;
  }
  async put(key: string, value: string) {
    this.data.set(key, value);
  }
  async delete(key: string) {
    this.data.delete(key);
  }
  async list({ prefix }: { prefix: string }) {
    return { keys: [...this.data.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })) };
  }
}

const PASSWORD = 'correct horse battery';

describe('admin crypto', () => {
  it('hashes and verifies passwords', async () => {
    const hash = await hashPassword(PASSWORD);
    expect(hash).toMatch(/^pbkdf2-sha256\$100000\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
    expect(await verifyPassword(PASSWORD, hash)).toBe(true);
    expect(await verifyPassword('wrong password!', hash)).toBe(false);
  });

  it('computes TOTP codes like RFC 6238 (test vector, T = 59 s)', async () => {
    const secret = base32Encode(new TextEncoder().encode('12345678901234567890'));
    expect(await totpCode(secret, 1)).toBe('287082');
    expect(await verifyTotp(secret, '287082', 59_000)).toBe(1);
    expect(await verifyTotp(secret, '000000', 59_000)).toBeNull();
  });
});

describe('admin accounts and sessions', () => {
  const setupCode = 'setup-code-123456';

  async function ready(now = { t: 1_800_000_000_000 }) {
    const kv = new MemoryKV();
    const auth = new Auth(kv, () => now.t);
    await auth.setup(setupCode, { code: setupCode, username: 'Admin', displayName: 'المدير', password: PASSWORD });
    return { kv, auth, now };
  }

  it('creates the first administrator only once, with the setup code', async () => {
    const kv = new MemoryKV();
    const auth = new Auth(kv);
    await expect(auth.setup(setupCode, { code: 'wrong-code-000000', username: 'a.b', displayName: '', password: PASSWORD })).rejects.toThrow(
      'bad_setup_code',
    );
    const user = await auth.setup(setupCode, { code: setupCode, username: 'Admin', displayName: '', password: PASSWORD });
    expect(user).toMatchObject({ username: 'admin', role: 'admin' });
    await expect(auth.setup(setupCode, { code: setupCode, username: 'other', displayName: '', password: PASSWORD })).rejects.toThrow(
      'already_set_up',
    );
  });

  it('refuses short passwords and bad usernames', async () => {
    const { auth } = await ready();
    await expect(auth.createUser({ username: 'ed', displayName: '', role: 'editor', password: PASSWORD })).rejects.toThrow('invalid_username');
    await expect(auth.createUser({ username: 'editor1', displayName: '', role: 'editor', password: 'short' })).rejects.toThrow('weak_password');
  });

  it('logs in, keeps the session, and ends it after inactivity', async () => {
    const { auth, now } = await ready();
    const { token } = await auth.login({ username: 'ADMIN', password: PASSWORD }, '1.1.1.1');
    expect((await auth.userFromToken(token))?.username).toBe('admin');
    now.t += IDLE_MS + 1000;
    expect(await auth.userFromToken(token)).toBeNull();
  });

  it('gives the same error for unknown users and wrong passwords, and locks after repeated failures', async () => {
    const { auth, now } = await ready();
    await expect(auth.login({ username: 'nobody', password: PASSWORD }, 'a')).rejects.toThrow('bad_credentials');
    for (let i = 0; i < MAX_FAILED; i++) {
      now.t += 61_000; // stay under the per-IP limit
      await expect(auth.login({ username: 'admin', password: 'wrong password!!' }, 'b')).rejects.toThrow('bad_credentials');
    }
    await expect(auth.login({ username: 'admin', password: PASSWORD }, 'c')).rejects.toMatchObject({ code: 'locked', status: 423 });
    now.t += LOCK_MS + 1000;
    await expect(auth.login({ username: 'admin', password: PASSWORD }, 'd')).resolves.toBeTruthy();
  });

  it('limits login attempts per IP address', async () => {
    const { auth } = await ready();
    const attempts = Array.from({ length: 11 }, () => auth.login({ username: 'nobody', password: 'x' }, '9.9.9.9').catch((e: AuthError) => e.code));
    const results = [];
    for (const attempt of attempts) results.push(await attempt);
    expect(results).toContain('too_many_attempts');
  });

  it('asks for the 2-step code once enabled and refuses replays', async () => {
    const { auth, now } = await ready();
    const user = (await auth.getUser('admin'))!;
    const { secret } = await auth.startTotp(user);
    await auth.confirmTotp(user, await totpCode(secret, Math.floor(now.t / 30_000)));
    now.t += 31_000;
    await expect(auth.login({ username: 'admin', password: PASSWORD }, 'e')).rejects.toThrow('code_required');
    const code = await totpCode(secret, Math.floor(now.t / 30_000));
    await expect(auth.login({ username: 'admin', password: PASSWORD, code }, 'e')).resolves.toBeTruthy();
    await expect(auth.login({ username: 'admin', password: PASSWORD, code }, 'e')).rejects.toThrow('bad_code');
  });

  it('protects the last administrator', async () => {
    const { auth } = await ready();
    const admin = (await auth.getUser('admin'))!;
    await auth.createUser({ username: 'editor1', displayName: 'Editor', role: 'editor', password: PASSWORD });
    await expect(auth.deleteUser(admin, 'admin')).rejects.toThrow('cannot_delete_self');
    await expect(auth.updateUser(admin, 'admin', { role: 'editor' })).rejects.toThrow();
    await auth.deleteUser(admin, 'editor1');
    expect((await auth.listUsers()).map((u) => u.username)).toEqual(['admin']);
  });
});

describe('admin API', () => {
  const env = () => ({ ADMIN_KV: new MemoryKV(), ADMIN_SETUP_CODE: 'setup-code-123456' });
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    new Request(`https://site.test/api/admin/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://site.test', 'X-Admin-Request': '1', ...headers },
      body: JSON.stringify(body),
    });

  it('blocks cross-site and header-less writes', async () => {
    const e = env();
    expect((await handleAdmin(post('login', {}, { Origin: 'https://evil.test' }), e)).status).toBe(403);
    expect((await handleAdmin(post('login', {}, { 'X-Admin-Request': '' }), e)).status).toBe(403);
  });

  it('sets a secure, HttpOnly, SameSite=Strict session cookie and keeps editors out of admin routes', async () => {
    const e = env();
    const setup = await handleAdmin(post('setup', { code: 'setup-code-123456', username: 'admin', displayName: 'A', password: PASSWORD }), e);
    const cookie = setup.headers.get('Set-Cookie') ?? '';
    expect(cookie).toMatch(/^__Host-infspm_admin=[0-9a-f]{64}; Path=\/; Secure; HttpOnly; SameSite=Strict/);
    const session = cookie.split(';')[0]!;
    const created = await handleAdmin(post('users', { username: 'editor1', displayName: 'E', role: 'editor', password: PASSWORD }, { Cookie: session }), e);
    expect(created.status).toBe(201);
    const login = await handleAdmin(post('login', { username: 'editor1', password: PASSWORD }), e);
    const editor = (login.headers.get('Set-Cookie') ?? '').split(';')[0]!;
    const users = await handleAdmin(new Request('https://site.test/api/admin/users', { headers: { Cookie: editor } }), e);
    expect(users.status).toBe(403);
    const anonymous = await handleAdmin(new Request('https://site.test/api/admin/users'), e);
    expect(anonymous.status).toBe(401);
  });
});

function contentFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? contentFiles(path) : path.endsWith('.md') ? [path] : [];
  });
}

describe('admin content files', () => {
  const schemas: Record<string, z.ZodType> = {
    news: newsSchema(z.string()),
    activities: activitySchema(z.string()),
    programs: programSchema(z.string()),
    pages: pageSchema,
  };

  it('reads every content file and writes it back with the same meaning', () => {
    const files = contentFiles('src/content');
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      const collection = file.replace(/\\/g, '/').split('/')[2] ?? '';
      const parsed = parseMarkdown(readFileSync(file, 'utf8'));
      const again = parseMarkdown(serializeMarkdown(parsed.data, parsed.body));
      expect(again, file).toEqual(parsed);
      expect(schemas[collection]?.safeParse(parsed.data).success, file).toBe(true);
    }
  });
});

describe('admin saving', () => {
  function fakeGitHub(files: Record<string, string>) {
    const commits: { branch: string; changes: { path: string; content: string | null }[] }[] = [];
    const github = {
      async readFolders(folders: string[]) {
        return Object.entries(files)
          .filter(([path]) => folders.some((f) => path.startsWith(`${f}/`)))
          .map(([path, text]) => ({ path, sha: `sha-${path}`, text }));
      },
      async commitToNewBranch(branch: string, _m: string, changes: { path: string; content: string | null }[]) {
        commits.push({ branch, changes });
      },
      async openPullRequest() {
        return { number: 7, nodeId: 'PR_1', url: 'https://github.com/x/y/pull/7' };
      },
      async enableAutoMerge() {
        return true;
      },
    } as unknown as GitHub;
    return { github, commits };
  }
  const admin = { username: 'admin', displayName: 'A', role: 'admin' } as never;
  const editor = { username: 'ed', displayName: 'E', role: 'editor' } as never;

  it('creates a news item in a pull request with auto-merge for administrators', async () => {
    const { github, commits } = fakeGitHub({});
    const result = await saveEntry(github, admin, 'news', null, {
      locales: {
        ar: { data: { title: 'خبر', date: '2026-12-01', status: 'published' }, body: 'نص', sha: null },
        fr: { data: { title: 'Journée portes ouvertes', date: '2026-12-01', status: 'published' }, body: 'Texte', sha: null },
      },
    }, () => 'abcdef123456');
    expect(result).toMatchObject({ slug: '2026-12-01-journee-portes-ouvertes', awaitingApproval: false, autoMerge: true });
    expect(commits[0]?.changes.map((c) => c.path)).toEqual([
      'src/content/news/ar/2026-12-01-journee-portes-ouvertes.md',
      'src/content/news/fr/2026-12-01-journee-portes-ouvertes.md',
    ]);
  });

  it('holds an editor change to published content for approval, and preserves Facebook fields', async () => {
    const existing = `---\ntitle: "Old"\ndate: 2026-01-01\nstatus: "published"\nsource: "facebook"\nfbPostId: "1_2"\n---\n\nBody\n`;
    const { github, commits } = fakeGitHub({ 'src/content/news/ar/item.md': existing });
    const result = await saveEntry(github, editor, 'news', 'item', {
      locales: { ar: { data: { title: 'New', date: '2026-01-01', status: 'published', fbPostId: '9_9' }, body: 'B', sha: 'sha-src/content/news/ar/item.md' } },
    }, () => 'abcdef123456');
    expect(result.awaitingApproval).toBe(true);
    const written = commits[0]?.changes[0]?.content ?? '';
    expect(written).toContain('"New"');
    expect(written).toContain('fbPostId: "1_2"');
  });

  it('refuses invalid content and stale edits', async () => {
    const { github } = fakeGitHub({ 'src/content/news/ar/item.md': '---\ntitle: "T"\ndate: 2026-01-01\nstatus: "draft"\n---\n' });
    await expect(
      saveEntry(github, admin, 'news', 'item', { locales: { ar: { data: { title: '' }, body: '', sha: 'sha-src/content/news/ar/item.md' } } }, () => 'x'),
    ).rejects.toThrow('invalid');
    await expect(
      saveEntry(github, admin, 'news', 'item', { locales: { ar: { data: { title: 'T2' }, body: '', sha: 'old' } } }, () => 'x'),
    ).rejects.toThrow('changed_meanwhile');
  });

  it('accepts only WebP or JPEG uploads', async () => {
    const { github } = fakeGitHub({});
    const png = btoa('\x89PNG\r\n\x1a\nxxxxxxxx');
    await expect(
      saveEntry(github, admin, 'news', null, {
        locales: { ar: { data: { title: 'خبر', date: '2026-12-01', status: 'draft', images: [{ src: 'upload:abc123', alt: 'صورة' }] }, body: '', sha: null } },
        uploads: [{ id: 'abc123', data: png }],
      }, () => 'abcdef123456'),
    ).rejects.toThrow('bad_image');
  });
});

describe('admin GitHub client on Cloudflare Workers', () => {
  it('calls the global fetch with the right `this` (Workers throws "Illegal invocation" otherwise)', async () => {
    const { GitHub } = await import('~/server/admin/github');
    const original = globalThis.fetch;
    const calls: string[] = [];
    // Like the Workers runtime: fetch must not be called as a method of another object.
    globalThis.fetch = function (this: unknown, input: RequestInfo | URL) {
      if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation');
      calls.push(String(input));
      return Promise.resolve(new Response(JSON.stringify({ data: { repository: { f0: { entries: [] } } } }), { status: 200 }));
    } as typeof fetch;
    try {
      const github = new GitHub({ token: 't', repo: 'o/r' });
      await expect(github.readFolders(['src/content/news/ar'])).resolves.toEqual([]);
      expect(calls).toEqual(['https://api.github.com/graphql']);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe('admin pending changes', () => {
  const change = (branch: string, title = 'تعديل · news: عنوان') =>
    ({ number: 1, title, branch, author: '', createdAt: '', url: '', autoMerge: true, checks: 'pending', awaitingApproval: false }) as const;

  it('finds the item a change belongs to, even when slugs contain dashes', async () => {
    const { changeTarget, changeTitle } = await import('~/admin-app/pending');
    expect(changeTarget(change('cms/news-2026-12-01-open-day-mf3k2a'))).toEqual({ collection: 'news', slug: '2026-12-01-open-day', deleting: false });
    expect(changeTarget(change('cms/programs-example-nursing-delete-mf3k2a'))).toEqual({ collection: 'programs', slug: 'example-nursing', deleting: true });
    expect(changeTarget(change('dependabot/npm/x'))).toBeNull();
    expect(changeTitle(change('cms/news-a-b'))).toBe('عنوان');
  });

  it('sorts programs by display order', async () => {
    const files: Record<string, string> = {
      'src/content/programs/ar/b.md': '---\ntitle: "B"\norder: 20\nstatus: "published"\n---\n',
      'src/content/programs/ar/a.md': '---\ntitle: "A"\norder: 10\nduration: "3 سنوات"\nstatus: "published"\n---\n',
    };
    const github = {
      async readFolders(folders: string[]) {
        return Object.entries(files)
          .filter(([path]) => folders.some((f) => path.startsWith(`${f}/`)))
          .map(([path, text]) => ({ path, sha: 'x', text }));
      },
    } as unknown as GitHub;
    const { listEntries } = await import('~/server/admin/content');
    const list = await listEntries(github, 'programs');
    expect(list.map((e) => e.slug)).toEqual(['a', 'b']);
    expect(list[0]?.locales.ar).toMatchObject({ order: 10, duration: '3 سنوات' });
  });
});

describe('admin site settings and texts', () => {
  function fakeSite(files: Record<string, string>) {
    const commits: { path: string; content: string | null }[][] = [];
    const github = {
      async readText(path: string) {
        return path in files ? { text: files[path] as string, sha: `sha-${path}` } : null;
      },
      async commitToNewBranch(_b: string, _m: string, changes: { path: string; content: string | null }[]) {
        commits.push(changes);
      },
      async openPullRequest() {
        return { number: 9, nodeId: 'PR_9', url: 'https://github.com/x/y/pull/9' };
      },
      async enableAutoMerge() {
        return true;
      },
    } as unknown as GitHub;
    return { github, commits };
  }
  const admin = { username: 'admin', displayName: 'A', role: 'admin' } as never;
  const settingsText = readFileSync('src/content/settings/site.json', 'utf8');
  const texts = {
    'src/content/ui/ar.json': JSON.stringify({ nav: { home: 'الرئيسية', news: 'الأخبار' } }),
    'src/content/ui/fr.json': JSON.stringify({ nav: { home: 'Accueil', news: 'Actualités' } }),
    'src/content/ui/en.json': JSON.stringify({ nav: { home: 'Home', news: 'News' } }),
  };

  it('saves new wording but never a changed list of texts or an empty text', async () => {
    const { saveTexts } = await import('~/server/admin/site');
    const { github, commits } = fakeSite(texts);
    const shas = { fr: 'sha-src/content/ui/fr.json' };
    await saveTexts(github, admin, { locales: { fr: { nav: { home: 'Accueil du site', news: 'Actualités' } } }, shas }, () => 'abcd1234');
    expect(commits[0]?.[0]?.path).toBe('src/content/ui/fr.json');
    expect(commits[0]?.[0]?.content).toContain('Accueil du site');
    await expect(saveTexts(github, admin, { locales: { fr: { nav: { home: 'A', news: 'B', extra: 'C' } } }, shas }, () => 'x')).rejects.toThrow('invalid');
    await expect(saveTexts(github, admin, { locales: { fr: { nav: { home: ' ', news: 'B' } } }, shas }, () => 'x')).rejects.toThrow('invalid');
    await expect(saveTexts(github, admin, { locales: { fr: { nav: { home: 'A', news: 'B' } } }, shas: { fr: 'old' } }, () => 'x')).rejects.toThrow('changed_meanwhile');
  });

  it('validates settings and stores a new logo only in the brand folder', async () => {
    const { saveSettings } = await import('~/server/admin/site');
    const { github, commits } = fakeSite({ 'src/content/settings/site.json': settingsText });
    const sha = 'sha-src/content/settings/site.json';
    const settings = JSON.parse(settingsText) as Record<string, unknown>;
    await expect(saveSettings(github, admin, { settings: { ...settings, facebookUrl: 'https://evil.example/x' }, sha }, () => 'x')).rejects.toThrow('invalid');
    await expect(saveSettings(github, admin, { settings, sha: 'old' }, () => 'x')).rejects.toThrow('changed_meanwhile');
    const png = btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0));
    await saveSettings(github, admin, { settings: { ...settings, phone: '037 00 00 00' }, sha, logo: { data: png } }, () => 'abcdef123456');
    const paths = commits[0]?.map((c) => c.path) ?? [];
    expect(paths).toEqual(['src/assets/brand/logo-abcdef12.png', 'src/content/settings/site.json']);
    expect(commits[0]?.[1]?.content).toContain('"logo": "../../assets/brand/logo-abcdef12.png"');
    await expect(saveSettings(github, admin, { settings, sha, logo: { data: btoa('<svg onload=alert(1)>') } }, () => 'x')).rejects.toThrow('bad_image');
  });

  it('serves images only from the uploads and brand folders', async () => {
    const { imageRepoPath } = await import('~/server/admin/content');
    expect(imageRepoPath('../../../assets/uploads/news/a.webp')).toBe('src/assets/uploads/news/a.webp');
    expect(imageRepoPath('../../assets/brand/logo.png')).toBe('src/assets/brand/logo.png');
    expect(imageRepoPath('../../../assets/uploads/../../.env')).toBeNull();
    expect(imageRepoPath('../../../content/settings/site.json')).toBeNull();
    expect(imageRepoPath('../../functions/x.ts')).toBeNull();
  });
});
