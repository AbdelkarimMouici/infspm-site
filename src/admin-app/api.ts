/**
 * Client of the admin API (/api/admin/*, src/server/admin/router.ts). Same origin only: the browser never
 * talks to GitHub. In development (`astro dev`, no Pages Functions) a practice backend is used instead
 * (src/admin-app/mock.ts); it is not part of production builds.
 */
import type { PublicUser } from '../server/admin/auth';
import type { EntrySummary, LocaleDoc, SaveResult } from '../server/admin/content';
import type { Front } from '../server/admin/frontmatter';
import type { PullRequestInfo } from '../server/admin/github';

export type Collection = 'news' | 'activities' | 'programs' | 'pages';
export type Locale = 'ar' | 'fr' | 'en';
export type { EntrySummary, Front, LocaleDoc, PublicUser, PullRequestInfo, SaveResult };

export interface SessionInfo {
  user: PublicUser | null;
  needsSetup: boolean;
  setupAvailable: boolean;
  contentConfigured: boolean;
}

export interface Dashboard {
  counts: Record<Collection, { total: number; published: number; drafts: number; missingTranslations: number }>;
  changes: PullRequestInfo[];
  live: { sha: string; date: string; checks: 'pending' | 'success' | 'failure' } | null;
  recent: (EntrySummary & { collection: Collection })[];
}

export interface SavePayload {
  locales: Partial<Record<Locale, { data: Front; body: string; sha: string | null }>>;
  uploads: { id: string; data: string }[];
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly info: { detail?: string; details?: string[]; missing?: string } = {},
  ) {
    super(code);
  }
}

export interface AdminApi {
  dev: boolean;
  session(): Promise<SessionInfo>;
  setup(input: { code: string; username: string; displayName: string; password: string }): Promise<PublicUser>;
  login(input: { username: string; password: string; code?: string }): Promise<PublicUser>;
  logout(): Promise<void>;
  dashboard(): Promise<Dashboard>;
  list(collection: Collection): Promise<EntrySummary[]>;
  load(collection: Collection, slug: string): Promise<Partial<Record<Locale, LocaleDoc>>>;
  save(collection: Collection, slug: string | null, payload: SavePayload): Promise<SaveResult>;
  remove(collection: Collection, slug: string): Promise<SaveResult>;
  changes(): Promise<PullRequestInfo[]>;
  approve(pr: number): Promise<void>;
  discard(pr: number): Promise<void>;
  /** URL to display an image referenced in a content file. */
  imageUrl(src: string): string;
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/admin/${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(method === 'GET' ? {} : { 'Content-Type': 'application/json', 'X-Admin-Request': '1' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError(0, 'network');
  }
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const info: { detail?: string; details?: string[]; missing?: string } = {};
    if (typeof data['detail'] === 'string') info.detail = data['detail'];
    if (Array.isArray(data['details'])) info.details = data['details'] as string[];
    if (typeof data['missing'] === 'string') info.missing = data['missing'];
    throw new ApiError(response.status, String(data['error'] ?? 'server'), info);
  }
  return data as T;
}

const http: AdminApi = {
  dev: false,
  session: () => call('GET', 'session'),
  setup: async (input) => (await call<{ user: PublicUser }>('POST', 'setup', input)).user,
  login: async (input) => (await call<{ user: PublicUser }>('POST', 'login', input)).user,
  logout: async () => void (await call('POST', 'logout', {})),
  dashboard: () => call('GET', 'dashboard'),
  list: async (collection) => (await call<{ entries: EntrySummary[] }>('GET', `content/${collection}`)).entries,
  load: async (collection, slug) =>
    (await call<{ locales: Partial<Record<Locale, LocaleDoc>> }>('GET', `content/${collection}/${slug}`)).locales,
  save: (collection, slug, payload) =>
    slug ? call('PUT', `content/${collection}/${slug}`, payload) : call('POST', `content/${collection}`, payload),
  remove: (collection, slug) => call('DELETE', `content/${collection}/${slug}`, {}),
  changes: async () => (await call<{ changes: PullRequestInfo[] }>('GET', 'changes')).changes,
  approve: async (pr) => void (await call('POST', `changes/${pr}/approve`, {})),
  discard: async (pr) => void (await call('POST', `changes/${pr}/discard`, {})),
  imageUrl: (src) => `/api/admin/file?src=${encodeURIComponent(src)}`,
};

export async function createApi(): Promise<AdminApi> {
  if (import.meta.env.DEV) {
    const probe = await fetch('/api/admin/session').catch(() => null);
    if (!probe?.headers.get('content-type')?.includes('application/json')) {
      const { mockApi } = await import('./mock');
      return mockApi();
    }
  }
  return http;
}
