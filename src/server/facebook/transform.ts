/**
 * Turns a Facebook post into a draft news item (frontmatter + Markdown body).
 * Pure functions: no network, no file system (tested with fixtures).
 */
import type { GraphAttachment, GraphPost } from './graph.ts';

export type CareFlag = 'memorial' | 'identifiable-people' | 'personal' | 'other';

// Vocabulary that suggests a post needs a human decision (CLAUDE.md: memorials, personal content).
const MEMORIAL_PATTERNS = [
  /إنا لله وإنا إليه راجعون/,
  /انا لله وانا اليه راجعون/,
  /رحمه الله|رحمها الله|رحمهم الله|يرحمه|يرحمها/,
  /تعزية|تعازي|التعازي|نعي|ينعى|تنعى/,
  /وفاة|توفي|توفيت|انتقل(ت)? إلى رحمة الله|الفقيد|الفقيدة|المرحوم|المرحومة/,
  /\b(condoléances|décès|deces|in memoriam|condolences|passed away)\b/i,
];
const PERSONAL_PATTERNS = [/عيد ميلاد|ميلاد سعيد|تهنئة|نهنئ|مبروك|زفاف|خطوبة/, /\b(joyeux anniversaire|félicitations|happy birthday|congratulations)\b/i];

export function detectCareFlags(message: string, hasImages: boolean): CareFlag[] {
  const flags: CareFlag[] = [];
  if (MEMORIAL_PATTERNS.some((re) => re.test(message))) flags.push('memorial');
  if (PERSONAL_PATTERNS.some((re) => re.test(message))) flags.push('personal');
  // Any photo may show students or patients: a person must confirm consent before publishing.
  if (hasImages) flags.push('identifiable-people');
  return flags;
}

/** Numeric post id part safe for file names ("123_456" → "123_456"). */
export function postFileStem(postId: string): string {
  if (!/^\d+(_\d+)?$/.test(postId)) throw new Error(`Unexpected Facebook post id format`);
  return `fb-${postId.replace('_', '-')}`;
}

/** Image URLs of a post, in order, without duplicates (photos and albums; videos and links ignored). */
export function imageUrls(post: GraphPost, max = 10): string[] {
  const urls: string[] = [];
  const visit = (attachment: GraphAttachment) => {
    const isPhoto = attachment.media_type === 'photo' || attachment.type === 'photo';
    const src = attachment.media?.image?.src;
    if (isPhoto && src) urls.push(src);
    for (const child of attachment.subattachments?.data ?? []) visit(child);
  };
  for (const attachment of post.attachments?.data ?? []) visit(attachment);
  if (urls.length === 0 && post.full_picture && (post.attachments?.data ?? []).some((a) => a.media_type === 'photo' || a.media_type === 'album')) {
    urls.push(post.full_picture);
  }
  return [...new Set(urls)].slice(0, max);
}

/** Title: the first non-empty line of the post, shortened at a word boundary. */
export function titleFrom(message: string, date: Date): string {
  const firstLine = message
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!firstLine) return `منشور فيسبوك بتاريخ ${date.toISOString().slice(0, 10)}`;
  const clean = firstLine.replace(/\s+/g, ' ');
  if (clean.length <= 120) return clean;
  const cut = clean.slice(0, 120);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > 60 ? lastSpace : 120)}…`;
}

/** Escapes characters that Markdown would interpret, so post text renders as plain text. */
export function markdownText(message: string): string {
  const escapeLine = (line: string) =>
    line
      .trim()
      .replace(/([\\`*_{}[\]()#+!|<>~])/g, '\\$1')
      .replace(/^(-|\d+\.)(\s)/, '\\$1$2')
      // A line of only "-" or "=" would become a heading underline or a horizontal rule.
      .replace(/^[-=][-=\s]*$/, (rule) => rule.replace(/[-=]/g, (char) => `\\${char}`));
  const HARD_BREAK = `${' '.repeat(2)}\n`;
  return message
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/) // blank lines separate paragraphs
    .map((paragraph) => paragraph.split('\n').map(escapeLine).filter(Boolean).join(HARD_BREAK))
    .filter(Boolean)
    .join('\n\n');
}

/** True when the exact hashtag appears (not as the start of a longer hashtag). */
export function hasHashtag(message: string, hashtag: string): boolean {
  const escaped = hashtag.replace(/[.*+?^${}()|[\]\\]/g, (char) => `\\${char}`);
  // \p{M}: combining marks such as Arabic diacritics belong to the word.
  return new RegExp(`${escaped}(?![\\p{L}\\p{M}\\p{N}_])`, 'u').test(message);
}

export interface DraftNews {
  fileStem: string;
  frontmatter: {
    title: string;
    summary?: string;
    date: string;
    status: 'draft' | 'published';
    source: 'facebook';
    fbPostId: string;
    fbPermalink?: string;
    'needs-review': boolean;
    careFlags: CareFlag[];
    images: { src: string; alt: string }[];
  };
  body: string;
  imageUrls: string[];
}

export const GENERIC_ALT = 'صورة من منشور المعهد على فيسبوك';

export function toDraftNews(post: GraphPost, options: { autoPublishHashtag?: string | undefined } = {}): DraftNews {
  const message = (post.message ?? '').trim();
  const date = new Date(post.created_time);
  if (Number.isNaN(date.getTime())) throw new Error('Facebook post has an invalid created_time');
  const urls = imageUrls(post);
  const careFlags = detectCareFlags(message, urls.length > 0);
  const hashtag = options.autoPublishHashtag?.trim();
  const autoPublish = Boolean(hashtag && hasHashtag(message, hashtag) && careFlags.length === 0);
  const permalink =
    post.permalink_url && /^https:\/\/([a-z0-9-]+\.)*facebook\.com\//i.test(post.permalink_url) ? post.permalink_url : undefined;
  const title = titleFrom(message, date);

  return {
    fileStem: postFileStem(post.id),
    frontmatter: {
      title,
      date: date.toISOString().slice(0, 10),
      status: autoPublish ? 'published' : 'draft',
      source: 'facebook',
      fbPostId: post.id,
      ...(permalink ? { fbPermalink: permalink } : {}),
      // Generic alt texts and an automatic title always need a human pass.
      'needs-review': true,
      careFlags,
      images: [],
    },
    body: markdownText(message),
    imageUrls: urls,
  };
}
