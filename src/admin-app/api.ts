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
  counts: Record<Collection, { total: number; published: number; drafts: number; demo: number; missingTranslations: number }>;
  changes: PullRequestInfo[];
  live: { sha: string; date: string; checks: 'pending' | 'success' | 'failure' } | null;
  recent: (EntrySummary & { collection: Collection })[];
}

export interface SettingsData {
  showExamples: boolean;
  logo: string;
  email: string;
  phone: string;
  address: Record<Locale, string>;
  hours: Record<Locale, string>;
  facebookUrl: string;
  mapUrl: string;
}

export type TextTree = { [key: string]: string | TextTree };

export interface SavePayload {
  locales: Partial<Record<Locale, { data: Front; body: string; sha: string | null }>>;
  uploads: { id: string; data: string }[];
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly info: { detail?: string; details?: string[]; missing?: string; githubStatus?: number } = {},
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
  // Site settings and texts (administrators)
  settings(): Promise<{ settings: SettingsData; sha: string }>;
  saveSettings(input: { settings: SettingsData; sha: string; logo?: { data: string } | null }): Promise<SaveResult>;
  texts(): Promise<{ texts: Record<Locale, TextTree>; shas: Record<Locale, string> }>;
  saveTexts(input: { locales: Partial<Record<Locale, TextTree>>; shas: Partial<Record<Locale, string>> }): Promise<SaveResult>;
  // Accounts (administrators) and own account
  users(): Promise<PublicUser[]>;
  createUser(input: { username: string; displayName: string; role: 'admin' | 'editor'; password: string }): Promise<PublicUser>;
  updateUser(username: string, changes: { displayName?: string; role?: 'admin' | 'editor' }): Promise<PublicUser>;
  resetPassword(username: string, password: string): Promise<void>;
  deleteUser(username: string): Promise<void>;
  changePassword(current: string, next: string): Promise<void>;
  totpStart(): Promise<{ secret: string; uri: string }>;
  totpConfirm(code: string): Promise<void>;
  totpDisable(password: string): Promise<void>;
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
    const info: { detail?: string; details?: string[]; missing?: string; githubStatus?: number } = {};
    if (typeof data['detail'] === 'string') info.detail = data['detail'];
    if (Array.isArray(data['details'])) info.details = data['details'] as string[];
    if (typeof data['missing'] === 'string') info.missing = data['missing'];
    if (typeof data['status'] === 'number') info.githubStatus = data['status'];
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
  settings: () => call('GET', 'settings'),
  saveSettings: (input) => call('PUT', 'settings', input),
  texts: () => call('GET', 'texts'),
  saveTexts: (input) => call('PUT', 'texts', input),
  users: async () => (await call<{ users: PublicUser[] }>('GET', 'users')).users,
  createUser: async (input) => (await call<{ user: PublicUser }>('POST', 'users', input)).user,
  updateUser: async (username, changes) => (await call<{ user: PublicUser }>('PATCH', `users/${username}`, changes)).user,
  resetPassword: async (username, password) => void (await call('POST', `users/${username}/password`, { password })),
  deleteUser: async (username) => void (await call('DELETE', `users/${username}`, {})),
  changePassword: async (current, next) => void (await call('POST', 'me/password', { current, next })),
  totpStart: () => call('POST', 'me/2fa/start', {}),
  totpConfirm: async (code) => void (await call('POST', 'me/2fa/confirm', { code })),
  totpDisable: async (password) => void (await call('POST', 'me/2fa/disable', { password })),
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
