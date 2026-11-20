/**
 * Content operations of the admin panel: list, load and save entries of the content collections
 * (src/content/<collection>/<locale>/<slug>.md), validated with the same Zod schemas as the site build.
 */
import { z } from 'astro/zod';
import { activitySchema, newsSchema, pageSchema, programSchema } from '../../content/schemas';
import type { User } from './auth';
import { parseMarkdown, serializeMarkdown, type Front } from './frontmatter';
import type { FileChange, GitHub } from './github';

export const LOCALES = ['ar', 'fr', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export type CollectionName = 'news' | 'activities' | 'programs' | 'pages';

interface CollectionDef {
  folder: string;
  /** Fields the panel may write; other frontmatter keys (Facebook ids, care flags…) are preserved. */
  editable: string[];
  dated: boolean;
  images: 'list' | 'single' | 'none';
  create: boolean;
  schema: z.ZodType;
}

const imageSrc = z.string().regex(/^\.\.\/\.\.\/\.\.\/assets\/uploads\/[\w./-]+\.(webp|png|jpe?g)$/i);

export const COLLECTIONS: Record<CollectionName, CollectionDef> = {
  news: {
    folder: 'src/content/news',
    editable: ['title', 'summary', 'date', 'status', 'needs-review', 'images'],
    dated: true,
    images: 'list',
    create: true,
    schema: newsSchema(imageSrc),
  },
  activities: {
    folder: 'src/content/activities',
    editable: ['title', 'summary', 'date', 'endDate', 'location', 'status', 'needs-review', 'images'],
    dated: true,
    images: 'list',
    create: true,
    schema: activitySchema(imageSrc),
  },
  programs: {
    folder: 'src/content/programs',
    editable: ['title', 'summary', 'order', 'duration', 'diploma', 'admission', 'status', 'needs-review', 'image'],
    dated: false,
    images: 'single',
    create: true,
    schema: programSchema(imageSrc),
  },
  pages: {
    folder: 'src/content/pages',
    editable: ['title', 'description', 'status', 'needs-review'],
    dated: false,
    images: 'none',
    create: false,
    schema: pageSchema,
  },
};

export class ContentError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly details: string[] = [],
  ) {
    super(code);
  }
}

export interface LocaleSummary {
  title: string;
  status: string;
  date?: string;
  summary?: string;
  thumb?: string;
  example: boolean;
  needsReview: boolean;
}

export interface EntrySummary {
  slug: string;
  locales: Partial<Record<Locale, LocaleSummary>>;
}

export interface LocaleDoc {
  data: Front;
  body: string;
  sha: string | null;
}

export interface SaveInput {
  locales: Partial<Record<Locale, { data: Front; body: string; sha: string | null }>>;
  uploads?: { id: string; data: string }[];
}

export function collectionOf(name: string): CollectionDef & { name: CollectionName } {
  if (!(name in COLLECTIONS)) throw new ContentError(404, 'unknown_collection');
  return { ...COLLECTIONS[name as CollectionName], name: name as CollectionName };
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export function checkSlug(slug: string): string {
  if (!SLUG.test(slug) || slug.length > 80) throw new ContentError(400, 'invalid_slug');
  return slug;
}

/** Path of an image as written in a content file → repository path (src/assets/…). */
export function imageRepoPath(src: string): string | null {
  const match = /^\.\.\/\.\.\/\.\.\/(assets\/uploads\/[\w./-]+)$/.exec(src);
  return match?.[1] && !match[1].includes('..') ? `src/${match[1]}` : null;
}

function firstImage(data: Front): string | undefined {
  const images = data['images'];
  if (Array.isArray(images)) {
    const first = images[0];
    if (first && typeof first === 'object' && !Array.isArray(first) && typeof first['src'] === 'string') return first['src'];
  }
  const image = data['image'];
  if (image && typeof image === 'object' && !Array.isArray(image) && typeof image['src'] === 'string') return image['src'];
  return undefined;
}

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : value === undefined || value === null ? undefined : String(value);

async function readCollection(github: GitHub, def: CollectionDef): Promise<Map<string, Partial<Record<Locale, LocaleDoc>>>> {
  const files = await github.readFolders(LOCALES.map((l) => `${def.folder}/${l}`));
  const entries = new Map<string, Partial<Record<Locale, LocaleDoc>>>();
  for (const file of files) {
    const match = /\/(ar|fr|en)\/([^/]+)\.md$/.exec(file.path);
    if (!match || file.text === null) continue;
    const locale = match[1] as Locale;
    const slug = match[2] ?? '';
    const parsed = parseMarkdown(file.text);
    const entry = entries.get(slug) ?? {};
    entry[locale] = { data: parsed.data, body: parsed.body, sha: file.sha };
    entries.set(slug, entry);
  }
  return entries;
}

export async function listEntries(github: GitHub, name: string): Promise<EntrySummary[]> {
  const def = collectionOf(name);
  const entries = await readCollection(github, def);
  const list: EntrySummary[] = [];
  for (const [slug, docs] of entries) {
    const locales: Partial<Record<Locale, LocaleSummary>> = {};
    for (const locale of LOCALES) {
      const doc = docs[locale];
      if (!doc) continue;
      const summary: LocaleSummary = {
        title: asString(doc.data['title']) ?? slug,
        status: asString(doc.data['status']) ?? 'draft',
        example: doc.data['example'] === true,
        needsReview: doc.data['needs-review'] === true,
      };
      const date = asString(doc.data['date']);
      if (date) summary.date = date;
      const text = asString(doc.data['summary']) ?? asString(doc.data['description']);
      if (text) summary.summary = text;
      const thumb = firstImage(doc.data);
      if (thumb) summary.thumb = thumb;
      locales[locale] = summary;
    }
    list.push({ slug, locales });
  }
  return list.sort((a, b) => {
    const da = a.locales.ar?.date ?? a.locales.fr?.date ?? '';
    const db = b.locales.ar?.date ?? b.locales.fr?.date ?? '';
    return db.localeCompare(da) || a.slug.localeCompare(b.slug);
  });
}

export async function loadEntry(github: GitHub, name: string, slug: string): Promise<Partial<Record<Locale, LocaleDoc>>> {
  const def = collectionOf(name);
  const entry = (await readCollection(github, def)).get(checkSlug(slug));
  if (!entry) throw new ContentError(404, 'not_found');
  return entry;
}

// ---------- Saving ----------
/** Accepted upload formats (already re-encoded in the browser, which drops all metadata). */
function imageKind(bytes: Uint8Array): 'webp' | 'jpg' | null {
  if (bytes.length > 12 && String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP') {
    return 'webp';
  }
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  return null;
}

function decodeBase64(data: string): Uint8Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_UPLOADS = 12;

function replaceUploads(value: unknown, paths: Map<string, string>): unknown {
  if (typeof value === 'string' && value.startsWith('upload:')) {
    const path = paths.get(value.slice(7));
    if (!path) throw new ContentError(400, 'missing_upload');
    return path;
  }
  if (Array.isArray(value)) return value.map((v) => replaceUploads(v, paths));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, replaceUploads(v, paths)]));
  }
  return value;
}

export interface SaveResult {
  slug: string;
  pr: number;
  url: string;
  awaitingApproval: boolean;
  autoMerge: boolean;
}

export async function saveEntry(
  github: GitHub,
  user: User,
  name: string,
  requestedSlug: string | null,
  input: SaveInput,
  random: () => string,
): Promise<SaveResult> {
  const def = collectionOf(name);
  const existing = await readCollection(github, def);
  const creating = requestedSlug === null;
  if (creating && !def.create) throw new ContentError(403, 'create_not_allowed');
  let slug: string;
  if (creating) {
    const date = asString(input.locales.ar?.data['date']) ?? asString(input.locales.fr?.data['date']) ?? '';
    const latin = (asString(input.locales.fr?.data['title']) ?? asString(input.locales.en?.data['title']) ?? '')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .split('-')
      .slice(0, 6)
      .join('-');
    const base = [def.dated && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '', latin || `item-${random().slice(0, 6)}`]
      .filter(Boolean)
      .join('-');
    slug = checkSlug(base.slice(0, 70));
    if (existing.has(slug)) slug = checkSlug(`${slug}-${random().slice(0, 4)}`);
  } else {
    slug = checkSlug(requestedSlug);
    if (!existing.has(slug)) throw new ContentError(404, 'not_found');
  }
  const current = existing.get(slug) ?? {};
  if (!input.locales.ar && !current.ar) throw new ContentError(400, 'arabic_required');

  // Images uploaded in this save (already resized to WebP and stripped of metadata in the browser).
  const uploads = input.uploads ?? [];
  if (uploads.length > MAX_UPLOADS) throw new ContentError(400, 'too_many_images');
  const changes: FileChange[] = [];
  const uploadPaths = new Map<string, string>();
  for (const upload of uploads) {
    if (!/^[a-z0-9]{6,32}$/.test(upload.id)) throw new ContentError(400, 'bad_upload');
    const bytes = decodeBase64(upload.data);
    const kind = imageKind(bytes);
    if (!kind || bytes.length > MAX_IMAGE_BYTES) throw new ContentError(400, 'bad_image');
    const file = `${slug}-${random().slice(0, 8)}.${kind}`;
    changes.push({ path: `src/assets/uploads/${def.name}/${file}`, content: upload.data, encoding: 'base64' });
    uploadPaths.set(upload.id, `../../../assets/uploads/${def.name}/${file}`);
  }

  const errors: string[] = [];
  let touchesPublished = false;
  for (const locale of LOCALES) {
    const submitted = input.locales[locale];
    if (!submitted) continue;
    const before = current[locale];
    if ((before?.sha ?? null) !== (submitted.sha ?? null)) throw new ContentError(409, 'changed_meanwhile', [locale]);
    const editable: Front = {};
    for (const key of def.editable) {
      if (key in submitted.data) editable[key] = replaceUploads(submitted.data[key], uploadPaths) as Front[string];
    }
    // Empty values remove the field (e.g. a cleared summary or a removed single image).
    const data: Front = Object.fromEntries(
      Object.entries({ ...(before?.data ?? {}), ...editable }).filter(([, value]) => value !== '' && value !== null),
    );
    if (creating && def.name === 'programs' && data['fileSlug'] === undefined) data['fileSlug'] = slug;
    const result = def.schema.safeParse(data);
    if (!result.success) {
      errors.push(...result.error.issues.map((issue) => `${locale}.${issue.path.join('.') || 'entry'}: ${issue.message}`));
      continue;
    }
    if (data['status'] === 'published' || before?.data['status'] === 'published') touchesPublished = true;
    const body = String(submitted.body ?? '').slice(0, 100_000);
    changes.push({ path: `${def.folder}/${locale}/${slug}.md`, content: serializeMarkdown(data, body) });
  }
  if (errors.length > 0) throw new ContentError(422, 'invalid', errors);
  if (changes.every((c) => !c.path.endsWith('.md'))) throw new ContentError(400, 'nothing_to_save');

  const awaitingApproval = user.role !== 'admin' && touchesPublished;
  const title = asString(input.locales.ar?.data['title']) ?? asString(current.ar?.data['title']) ?? slug;
  const branch = `cms/${def.name}-${slug}-${Date.now().toString(36)}`.slice(0, 120);
  await github.commitToNewBranch(branch, `${creating ? 'Add' : 'Update'} ${def.name}: ${slug}`, changes, {
    name: `${user.displayName} (admin panel)`,
  });
  const pr = await github.openPullRequest(
    branch,
    `${creating ? 'جديد' : 'تعديل'} · ${def.name}: ${title}`.slice(0, 200),
    [`Change made in the admin panel.`, '', `Author: ${user.displayName} (${user.username})`, `Awaiting approval: ${awaitingApproval ? 'yes' : 'no'}`].join('\n'),
  );
  const autoMerge = awaitingApproval ? false : await github.enableAutoMerge(pr.nodeId);
  return { slug, pr: pr.number, url: pr.url, awaitingApproval, autoMerge };
}

export async function deleteEntry(github: GitHub, user: User, name: string, slug: string): Promise<SaveResult> {
  const def = collectionOf(name);
  if (!def.create) throw new ContentError(403, 'delete_not_allowed');
  const entry = await loadEntry(github, name, slug);
  const changes: FileChange[] = LOCALES.filter((l) => entry[l]).map((l) => ({ path: `${def.folder}/${l}/${slug}.md`, content: null }));
  const branch = `cms/${def.name}-${slug}-delete-${Date.now().toString(36)}`.slice(0, 120);
  await github.commitToNewBranch(branch, `Delete ${def.name}: ${slug}`, changes, { name: `${user.displayName} (admin panel)` });
  const title = asString(entry.ar?.data['title']) ?? slug;
  const pr = await github.openPullRequest(
    branch,
    `حذف · ${def.name}: ${title}`.slice(0, 200),
    ['Deletion requested in the admin panel.', '', `Author: ${user.displayName} (${user.username})`, 'Awaiting approval: no'].join('\n'),
  );
  const autoMerge = await github.enableAutoMerge(pr.nodeId);
  return { slug, pr: pr.number, url: pr.url, awaitingApproval: false, autoMerge };
}
