/**
 * Practice backend for `astro dev` only (Pages Functions do not run there). Reads the local content files,
 * keeps changes in memory, and accepts the account "admin" with any password of 10+ characters.
 * Never bundled in production (dynamic import behind import.meta.env.DEV in api.ts).
 */
import { parseMarkdown } from '../server/admin/frontmatter';
import type { AdminApi, Collection, EntrySummary, Locale, LocaleDoc, PublicUser } from './api';
import { ApiError } from './api';

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
      };
    }
    return { slug, locales };
  };

  const list = (collection: Collection) =>
    [...store[collection]].map(([slug, docs]) => summarize(slug, docs)).sort((a, b) => (b.locales.ar?.date ?? '').localeCompare(a.locales.ar?.date ?? ''));

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
        entry[locale] = { data: { ...(entry[locale]?.data ?? {}), ...doc.data }, body: doc.body, sha: `local-${Date.now()}` };
      }
      store[collection].set(key, entry);
      return { slug: key, pr: ++pr, url: '#', awaitingApproval: user?.role !== 'admin', autoMerge: true };
    },
    async remove(collection, slug) {
      store[collection].delete(slug);
      return { slug, pr: ++pr, url: '#', awaitingApproval: false, autoMerge: true };
    },
    async changes() {
      return [];
    },
    async approve() {},
    async discard() {},
    imageUrl(src) {
      return src.startsWith('blob:') ? src : src.replace(/^(\.\.\/)+/, '/src/');
    },
  };
}
