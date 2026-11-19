/**
 * Facebook → news drafts. Reads posts, skips known ones, writes new Markdown files and WebP images.
 * Never modifies or deletes an existing file.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, dirname, posix } from 'node:path';
import { z } from 'astro/zod';
import { newsSchema } from '../../content/schemas.ts';
import { fetchPublishedPosts, type GraphConfig, type GraphPost } from './graph.ts';
import { GENERIC_ALT, toDraftNews, type DraftNews } from './transform.ts';
import { downloadImage } from './images.ts';

export interface SyncOptions extends GraphConfig {
  /** Repository root (contains src/). */
  root: string;
  autoPublishHashtag?: string | undefined;
  /** Injected for tests. */
  imageFetch?: typeof fetch;
  log?: (line: string) => void;
}

export interface SyncResult {
  fetched: number;
  created: string[];
  skippedExisting: number;
  skippedEmpty: number;
  flagged: number;
  imageErrors: number;
}

const NEWS_DIR = 'src/content/news';
const ARABIC_DIR = `${NEWS_DIR}/ar`;
const IMAGE_DIR = 'src/assets/uploads/facebook';

function listMarkdown(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listMarkdown(path);
    return entry.name.endsWith('.md') ? [path] : [];
  });
}

/** Post ids an admin decided never to import (one per line, `#` comments allowed). */
export const IGNORE_FILE = `${NEWS_DIR}/facebook-ignored.txt`;

export function ignoredPostIds(root: string): Set<string> {
  const path = join(root, IGNORE_FILE);
  if (!existsSync(path)) return new Set();
  return new Set(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.replace(/#.*/, '').trim())
      .filter((line) => /^\d+(_\d+)?$/.test(line)),
  );
}

/**
 * fbPostIds already present in any language folder, plus ignored ones
 * (dedupe; existing files are never touched).
 */
export function knownPostIds(root: string): Set<string> {
  const ids = ignoredPostIds(root);
  for (const file of listMarkdown(join(root, NEWS_DIR))) {
    const match = /^fbPostId:\s*['"]?(\d+(?:_\d+)?)['"]?\s*$/m.exec(readFileSync(file, 'utf8'));
    if (match?.[1]) ids.add(match[1]);
  }
  return ids;
}

/** YAML scalar quoting that is always safe (JSON strings are valid YAML). */
function yamlValue(value: unknown): string {
  return JSON.stringify(value);
}

export function serialize(draft: DraftNews): string {
  const fm = draft.frontmatter;
  const lines = ['---'];
  for (const [key, value] of Object.entries(fm)) {
    if (value === undefined) continue;
    if (key === 'images') {
      const images = value as { src: string; alt: string }[];
      if (images.length === 0) {
        lines.push('images: []');
        continue;
      }
      lines.push('images:');
      for (const image of images) lines.push(`  - src: ${yamlValue(image.src)}`, `    alt: ${yamlValue(image.alt)}`);
      continue;
    }
    if (Array.isArray(value)) {
      lines.push(`${key}: [${value.map(yamlValue).join(', ')}]`);
      continue;
    }
    lines.push(`${key}: ${typeof value === 'boolean' ? String(value) : yamlValue(value)}`);
  }
  lines.push('---', '', draft.body, '');
  return lines.join('\n');
}

/** Validates the draft with the same schema as the site build (images as plain strings). */
function validate(draft: DraftNews): void {
  const result = newsSchema(z.string()).safeParse(draft.frontmatter);
  if (!result.success) throw new Error(`Generated draft is invalid: ${result.error.issues.map((i) => i.message).join('; ')}`);
}

export async function runSync(options: SyncOptions): Promise<SyncResult> {
  const log = options.log ?? (() => {});
  const posts: GraphPost[] = await fetchPublishedPosts(options);
  const known = knownPostIds(options.root);
  const result: SyncResult = { fetched: posts.length, created: [], skippedExisting: 0, skippedEmpty: 0, flagged: 0, imageErrors: 0 };

  for (const post of posts) {
    if (known.has(post.id)) {
      result.skippedExisting++;
      continue;
    }
    const draft = toDraftNews(post, { autoPublishHashtag: options.autoPublishHashtag });
    if (!draft.body.trim() && draft.imageUrls.length === 0) {
      result.skippedEmpty++; // nothing to show (e.g. video-only or shared link without text)
      continue;
    }

    const mdPath = join(options.root, ARABIC_DIR, `${draft.fileStem}.md`);
    if (existsSync(mdPath)) {
      result.skippedExisting++;
      continue;
    }

    // Images: download, convert, store next to other uploads. A failed image is skipped, not fatal.
    for (const [index, url] of draft.imageUrls.entries()) {
      const imagePath = join(options.root, IMAGE_DIR, `${draft.fileStem}-${index + 1}.webp`);
      try {
        if (!existsSync(imagePath)) {
          const webp = await downloadImage(url, options.imageFetch);
          mkdirSync(dirname(imagePath), { recursive: true });
          writeFileSync(imagePath, webp, { flag: 'wx' });
        }
        const rel = relative(dirname(mdPath), imagePath).split('\\').join(posix.sep);
        draft.frontmatter.images.push({ src: rel.startsWith('.') ? rel : `./${rel}`, alt: GENERIC_ALT });
      } catch (error) {
        result.imageErrors++;
        log(`Image ${index + 1} of post ${draft.fileStem} skipped: ${(error as Error).message}`);
      }
    }
    if (draft.imageUrls.length > 0 && draft.frontmatter.images.length === 0 && !draft.body.trim()) {
      result.skippedEmpty++;
      continue;
    }

    validate(draft);
    mkdirSync(dirname(mdPath), { recursive: true });
    writeFileSync(mdPath, serialize(draft), { encoding: 'utf8', flag: 'wx' }); // wx: never overwrite
    known.add(post.id);
    result.created.push(relative(options.root, mdPath).split('\\').join('/'));
    if (draft.frontmatter.careFlags.length > 0) result.flagged++;
  }
  return result;
}
