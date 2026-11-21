/**
 * Practice backend for `astro dev` only (Pages Functions do not run there). Reads the local content files,
 * keeps changes in memory, and accepts the account "admin" with any password of 10+ characters.
 * Never bundled in production (dynamic import behind import.meta.env.DEV in api.ts).
 */
import { parseMarkdown } from '../server/admin/frontmatter';
import type { AdminApi, Collection, EntrySummary, Locale, LocaleDoc, PublicUser, PullRequestInfo } from './api';
import { ApiError } from './api';
import type { SettingsData, TextTree } from './api';
import settingsFile from '../content/settings/site.json';
import arTexts from '../content/ui/ar.json';
import frTexts from '../content/ui/fr.json';
import enTexts from '../content/ui/en.json';

const raw = import.meta.glob<string>('/src/content/{news,activities,programs,pages}/{ar,fr,en}/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});

type Store = Record<Collection, Map<string, Partial<Record<Locale, LocaleDoc>>>>;

function initialStore(): Store {
  const store: Store = { news: new Map(), activities: new Map(), programs: new Map(), pages: new Map() };
  for (const [path, text] of Object.entries(raw)) {
    const match = /\/src\/content\/(\w+)\/(ar|fr|en)\/([^/]+)\.md$/.exec(path);
    if (!match) continue;
    const [, collection, locale, slug] = match as unknown as [string, Collection, Locale, string];
    const entry = store[collection].get(slug) ?? {};
    entry[locale] = { ...parseMarkdown(text), sha: `local-${slug}-${locale}` };
    store[collection].set(slug, entry);
  }
  return store;
}

const wait = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));

export function mockApi(): AdminApi {
  const store = initialStore();
  let user: PublicUser | null = null;
  let settings = structuredClone(settingsFile) as unknown as SettingsData;
  const texts: Record<Locale, TextTree> = structuredClone({ ar: arTexts, fr: frTexts, en: enTexts }) as Record<Locale, TextTree>;
  const accounts: PublicUser[] = [
    { username: 'admin', displayName: 'مدير الموقع', role: 'admin', totpEnabled: false, createdAt: new Date().toISOString() },
    { username: 'editor1', displayName: 'محرر الأخبار', role: 'editor', totpEnabled: true, createdAt: new Date().toISOString() },
  ];
  let pr = 100;
  const str = (v: unknown) => (typeof v === 'string' ? v : v === undefined ? undefined : String(v));

  const summarize = (slug: string, docs: Partial<Record<Locale, LocaleDoc>>): EntrySummary => {
    const locales: EntrySummary['locales'] = {};
    for (const locale of ['ar', 'fr', 'en'] as const) {
      const doc = docs[locale];
      if (!doc) continue;
      const images = doc.data['images'];
      const image = doc.data['image'];
      const thumb = Array.isArray(images)
        ? str((images[0] as Record<string, unknown> | undefined)?.['src'])
        : str((image as Record<string, unknown> | undefined)?.['src']);
      locales[locale] = {
        title: str(doc.data['title']) ?? slug,
        status: str(doc.data['status']) ?? 'draft',
        example: doc.data['example'] === true,
        needsReview: doc.data['needs-review'] === true,
        ...(str(doc.data['date']) ? { date: str(doc.data['date']) as string } : {}),
        ...(str(doc.data['summary'] ?? doc.data['description']) ? { summary: str(doc.data['summary'] ?? doc.data['description']) as string } : {}),
        ...(thumb ? { thumb } : {}),
        ...(typeof doc.data['order'] === 'number' ? { order: doc.data['order'] } : {}),
        ...(str(doc.data['duration']) ? { duration: str(doc.data['duration']) as string } : {}),
      };
    }
    return { slug, locales };
  };

  const list = (collection: Collection) =>
    [...store[collection]]
      .map(([slug, docs]) => summarize(slug, docs))
      .sort((a, b) =>
        collection === 'programs'
          ? (a.locales.ar?.order ?? 100) - (b.locales.ar?.order ?? 100)
          : (b.locales.ar?.date ?? '').localeCompare(a.locales.ar?.date ?? ''),
      );

  // Simulated publishing: a saved change stays "pending" for 40 seconds.
  const pending: { info: PullRequestInfo; until: number }[] = [];
  const openChanges = () => pending.filter((p) => p.until > Date.now()).map((p) => p.info);
  const track = (collection: Collection, slug: string, title: string) => {
    pending.push({
      until: Date.now() + 40_000,
      info: {
        number: ++pr,
        title: `تعديل · ${collection}: ${title}`,
        branch: `cms/${collection}-${slug}-${Date.now().toString(36)}`,
        author: 'مدير الموقع (admin)',
        createdAt: new Date().toISOString(),
        url: '#',
        autoMerge: true,
        checks: 'pending',
        awaitingApproval: false,
      },
    });
  };

  return {
    dev: true,
    async session() {
      await wait(150);
      return { user, needsSetup: false, setupAvailable: true, contentConfigured: true };
    },
    async setup(input) {
      user = { username: input.username, displayName: input.displayName || input.username, role: 'admin', totpEnabled: false, createdAt: new Date().toISOString() };
      return user;
    },
    async login(input) {
      await wait(400);
      if (input.username.toLowerCase() !== 'admin' || input.password.length < 10) throw new ApiError(401, 'bad_credentials');
      user = { username: 'admin', displayName: 'مدير الموقع', role: 'admin', totpEnabled: false, createdAt: new Date().toISOString() };
      return user;
    },
    async logout() {
      user = null;
    },
    async dashboard() {
      await wait();
      const collections: Collection[] = ['news', 'activities', 'programs', 'pages'];
      const counts = Object.fromEntries(
        collections.map((c) => {
          const items = list(c);
          return [
            c,
            {
              total: items.length,
              published: items.filter((e) => e.locales.ar?.status === 'published').length,
              drafts: items.filter((e) => e.locales.ar?.status !== 'published').length,
              missingTranslations: items.filter((e) => !e.locales.fr || !e.locales.en).length,
            },
          ];
        }),
      ) as never;
      const recent = (['news', 'activities', 'programs'] as const)
        .flatMap((c) => list(c).map((e) => ({ ...e, collection: c })))
        .sort((a, b) => (b.locales.ar?.date ?? '').localeCompare(a.locales.ar?.date ?? ''))
        .slice(0, 6);
      return {
        counts,
        changes: [
          ...openChanges(),
          {
            number: 41,
            title: 'تعديل · news: يوم مفتوح للتعريف بالمعهد',
            branch: 'cms/news-x',
            author: 'محرر (editor)',
            createdAt: new Date().toISOString(),
            url: '#',
            autoMerge: false,
            checks: 'success',
            awaitingApproval: true,
          },
        ],
        live: { sha: 'abc1234', date: new Date().toISOString(), checks: 'success' },
        recent,
      };
    },
    async list(collection) {
      await wait();
      return list(collection);
    },
    async load(collection, slug) {
      await wait();
      const entry = store[collection].get(slug);
      if (!entry) throw new ApiError(404, 'not_found');
      return structuredClone(entry);
    },
    async save(collection, slug, payload) {
      await wait(900);
      const key = slug ?? `item-${Date.now().toString(36)}`;
      const entry = store[collection].get(key) ?? {};
      for (const [locale, doc] of Object.entries(payload.locales) as [Locale, NonNullable<(typeof payload.locales)[Locale]>][]) {
        const data = { ...(entry[locale]?.data ?? {}), ...doc.data };
        if (data['example'] !== true) delete data['example'];
        entry[locale] = { data, body: doc.body, sha: `local-${Date.now()}` };
      }
      store[collection].set(key, entry);
      track(collection, key, str(entry.ar?.data['title']) ?? key);
      return { slug: key, pr, url: '#', awaitingApproval: user?.role !== 'admin', autoMerge: true };
    },
    async remove(collection, slug) {
      store[collection].delete(slug);
      return { slug, pr: ++pr, url: '#', awaitingApproval: false, autoMerge: true };
    },
    async changes() {
      return openChanges();
    },
    async approve() {},
    async discard() {},
    imageUrl(src) {
      return src.startsWith('blob:') ? src : src.replace(/^(\.\.\/)+/, '/src/');
    },
    async settings() {
      await wait();
      return { settings: structuredClone(settings), sha: 'local-settings' };
    },
    async saveSettings(input) {
      await wait(700);
      settings = structuredClone(input.settings);
      track('pages' as Collection, 'settings', 'إعدادات الموقع');
      return { slug: 'settings', pr, url: '#', awaitingApproval: false, autoMerge: true };
    },
    async texts() {
      await wait();
      return { texts: structuredClone(texts), shas: { ar: 'a', fr: 'f', en: 'e' } };
    },
    async saveTexts(input) {
      await wait(700);
      for (const [locale, tree] of Object.entries(input.locales) as [Locale, TextTree][]) texts[locale] = structuredClone(tree);
      return { slug: 'texts', pr: ++pr, url: '#', awaitingApproval: false, autoMerge: true };
    },
    async users() {
      await wait();
      return accounts.map((a) => ({ ...a }));
    },
    async createUser(input) {
      await wait(400);
      if (accounts.some((a) => a.username === input.username)) throw new ApiError(409, 'username_taken');
      if (input.password.length < 10) throw new ApiError(400, 'weak_password');
      const account: PublicUser = { username: input.username, displayName: input.displayName || input.username, role: input.role, totpEnabled: false, createdAt: new Date().toISOString() };
      accounts.push(account);
      return account;
    },
    async updateUser(username, changes) {
      const account = accounts.find((a) => a.username === username);
      if (!account) throw new ApiError(404, 'not_found');
      Object.assign(account, changes);
      return { ...account };
    },
    async resetPassword(_username, password) {
      if (password.length < 10) throw new ApiError(400, 'weak_password');
    },
    async deleteUser(username) {
      const index = accounts.findIndex((a) => a.username === username);
      if (index >= 0) accounts.splice(index, 1);
    },
    async changePassword(current, next) {
      if (current.length < 10) throw new ApiError(403, 'bad_password');
      if (next.length < 10) throw new ApiError(400, 'weak_password');
    },
    async totpStart() {
      return { secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', uri: 'otpauth://totp/INFSPM%20T%C3%A9bessa:admin?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP' };
    },
    async totpConfirm(code) {
      if (code !== '123456') throw new ApiError(403, 'bad_code');
    },
    async totpDisable(password) {
      if (password.length < 10) throw new ApiError(403, 'bad_password');
    },
  };
}
