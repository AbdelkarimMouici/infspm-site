import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appSecretProof, fetchPublishedPosts, GraphError, redact } from '~/server/facebook/graph';
import { detectCareFlags, hasHashtag, markdownText, postFileStem, titleFrom, toDraftNews } from '~/server/facebook/transform';
import { downloadImage, isAllowedImageUrl } from '~/server/facebook/images';
import { knownPostIds, runSync } from '~/server/facebook/sync';
import { findExif } from './helpers/exif';

const fixture = (name: string): unknown => JSON.parse(readFileSync(`tests/fixtures/facebook/${name}`, 'utf8'));
const PAGE_ID = '100000000000001';
const TOKEN = 'EAAFixtureToken1234567890';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** Graph API mock: page 1, then page 2 (via paging.next). Records requested URLs. */
function graphMock() {
  const urls: string[] = [];
  const impl = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    urls.push(url);
    return jsonResponse(fixture(url.includes('after=') ? 'published_posts.page2.json' : 'published_posts.page1.json'));
  });
  return { impl: impl as unknown as typeof fetch, urls };
}

async function jpegWithExif(): Promise<Buffer> {
  return sharp({ create: { width: 64, height: 48, channels: 3, background: '#336699' } })
    .jpeg()
    .withExif({ IFD0: { Copyright: 'fixture', ImageDescription: 'GPS test' } })
    .toBuffer();
}

describe('Graph API client', () => {
  it('reads published_posts (v27.0) with the documented fields and follows pagination', async () => {
    const { impl, urls } = graphMock();
    const posts = await fetchPublishedPosts({ pageId: PAGE_ID, token: TOKEN, maxPosts: 10, fetchImpl: impl });
    expect(posts.map((p) => p.id)).toEqual([
      '100000000000001_200000000000003',
      '100000000000001_200000000000002',
      '100000000000001_200000000000001',
      '100000000000001_200000000000000',
    ]);
    const first = new URL(urls[0] ?? '');
    expect(first.origin + first.pathname).toBe(`https://graph.facebook.com/v27.0/${PAGE_ID}/published_posts`);
    expect(first.searchParams.get('fields')).toContain('attachments');
    expect(first.searchParams.get('limit')).toBe('10');
    expect(new URL(urls[1] ?? '').searchParams.get('access_token')).toBe(TOKEN); // fixture token replaced by ours
  });

  it('adds appsecret_proof when an app secret is configured', async () => {
    const { impl, urls } = graphMock();
    await fetchPublishedPosts({ pageId: PAGE_ID, token: TOKEN, appSecret: 'app-secret-fixture', maxPosts: 2, fetchImpl: impl });
    expect(new URL(urls[0] ?? '').searchParams.get('appsecret_proof')).toBe(appSecretProof(TOKEN, 'app-secret-fixture'));
  });

  it('fails loudly on an expired token (code 190) without leaking it', async () => {
    const impl = vi.fn(async () => jsonResponse(fixture('error-190.json'), 400)) as unknown as typeof fetch;
    const error = await fetchPublishedPosts({ pageId: PAGE_ID, token: TOKEN, fetchImpl: impl }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GraphError);
    expect((error as GraphError).tokenProblem).toBe(true);
    expect((error as GraphError).message).toMatch(/token invalid or expired/);
    expect((error as GraphError).message).not.toContain(TOKEN);
  });

  it('refuses pagination links to other hosts and invalid page ids', async () => {
    const impl = vi.fn(async () =>
      jsonResponse({ data: [], paging: { next: 'https://evil.example/steal?access_token=x' } }),
    ) as unknown as typeof fetch;
    await expect(fetchPublishedPosts({ pageId: PAGE_ID, token: TOKEN, maxPosts: 5, fetchImpl: impl })).rejects.toThrow(
      /pagination host/,
    );
    await expect(fetchPublishedPosts({ pageId: '../me', token: TOKEN, fetchImpl: impl })).rejects.toThrow(/digits/);
  });

  it('redacts tokens and secrets from any text', () => {
    const text = `failed https://graph.facebook.com/x?access_token=${TOKEN}&appsecret_proof=abc ${TOKEN}`;
    const out = redact(text, [TOKEN]);
    expect(out).not.toContain(TOKEN);
    expect(out).not.toContain('appsecret_proof=abc');
  });
});

describe('post → draft news', () => {
  it('flags memorial vocabulary and every post with photos', () => {
    expect(detectCareFlags('إنا لله وإنا إليه راجعون', false)).toContain('memorial');
    expect(detectCareFlags('تعزية', false)).toContain('memorial');
    expect(detectCareFlags('Sincères condoléances', false)).toContain('memorial');
    expect(detectCareFlags('عيد ميلاد سعيد', false)).toContain('personal');
    expect(detectCareFlags('إعلان', true)).toEqual(['identifiable-people']);
    expect(detectCareFlags('إعلان عادي', false)).toEqual([]);
  });

  it('builds a draft with source, id, permalink, needs-review and a title from the first line', () => {
    const page1 = fixture('published_posts.page1.json') as { data: Parameters<typeof toDraftNews>[0][] };
    const draft = toDraftNews(page1.data[0]!);
    expect(draft.fileStem).toBe('fb-100000000000001-200000000000003');
    expect(draft.frontmatter).toMatchObject({
      title: 'إعلان تجريبي للاختبار',
      date: '2026-11-18',
      status: 'draft',
      source: 'facebook',
      fbPostId: '100000000000001_200000000000003',
      'needs-review': true,
      careFlags: ['identifiable-people'],
    });
    expect(draft.imageUrls).toEqual(['https://scontent.xx.fbcdn.net/v/t39/fixture-3.jpg']);
  });

  it('auto-publishes only with the agreed hashtag and no care flag', () => {
    const page2 = fixture('published_posts.page2.json') as { data: Parameters<typeof toDraftNews>[0][] };
    expect(toDraftNews(page2.data[0]!).frontmatter.status).toBe('draft');
    expect(toDraftNews(page2.data[0]!, { autoPublishHashtag: '#موقع_المعهد' }).frontmatter.status).toBe('published');
    const page1 = fixture('published_posts.page1.json') as { data: Parameters<typeof toDraftNews>[0][] };
    const memorial = { ...page1.data[1]!, message: `${page1.data[1]!.message} #موقع_المعهد` };
    expect(toDraftNews(memorial, { autoPublishHashtag: '#موقع_المعهد' }).frontmatter.status).toBe('draft');
  });

  it('escapes Markdown and HTML so post text renders as plain text', () => {
    const out = markdownText('*bold* <b>x</b> [a](javascript:alert(1))\n- item');
    expect(out).not.toMatch(/(^|[^\\])<b>/);
    expect(out).toContain('\\*bold\\*');
    expect(out).toContain('\\[a\\]\\(javascript:alert\\(1\\)\\)');
    expect(out).toContain('\\- item');
  });

  it('shortens long titles and rejects unexpected ids', () => {
    expect(titleFrom('word '.repeat(60), new Date('2026-01-01')).length).toBeLessThanOrEqual(121);
    expect(titleFrom('', new Date('2026-01-01T00:00:00Z'))).toContain('2026-01-01');
    expect(() => postFileStem('../../evil')).toThrow();
  });
});

describe('image download', () => {
  it('accepts only https Facebook CDN hosts', () => {
    expect(isAllowedImageUrl('https://scontent.xx.fbcdn.net/a.jpg')).toBe(true);
    expect(isAllowedImageUrl('http://scontent.xx.fbcdn.net/a.jpg')).toBe(false);
    expect(isAllowedImageUrl('https://fbcdn.net.evil.example/a.jpg')).toBe(false);
    expect(isAllowedImageUrl('https://user:pass@scontent.fbcdn.net/a.jpg')).toBe(false);
    expect(isAllowedImageUrl('https://169.254.169.254/latest/meta-data')).toBe(false);
  });

  it('converts to WebP without EXIF and resizes', async () => {
    const jpeg = await jpegWithExif();
    expect(findExif(jpeg)).toBe('JPEG APP1 Exif'); // the fixture really has EXIF
    const impl = vi.fn(async () => new Response(new Uint8Array(jpeg), { headers: { 'content-type': 'image/jpeg' } })) as unknown as typeof fetch;
    const webp = await downloadImage('https://scontent.xx.fbcdn.net/a.jpg', impl);
    expect(webp.subarray(8, 12).toString('ascii')).toBe('WEBP');
    expect(findExif(webp)).toBeNull();
  });

  it('refuses redirects off the CDN, wrong content types and oversized files', async () => {
    const redirect = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'https://evil.example/x.jpg' } })) as unknown as typeof fetch;
    await expect(downloadImage('https://scontent.xx.fbcdn.net/a.jpg', redirect)).rejects.toThrow(/left Facebook/);
    const html = vi.fn(async () => new Response('<html>', { headers: { 'content-type': 'text/html' } })) as unknown as typeof fetch;
    await expect(downloadImage('https://scontent.xx.fbcdn.net/a.jpg', html)).rejects.toThrow(/content type/);
    const huge = vi.fn(async () => new Response('x', { headers: { 'content-type': 'image/jpeg', 'content-length': String(50 * 1024 * 1024) } })) as unknown as typeof fetch;
    await expect(downloadImage('https://scontent.xx.fbcdn.net/a.jpg', huge)).rejects.toThrow(/too large/);
  });
});

describe('sync run (temporary repository)', () => {
  let root: string;
  let imageFetch: typeof fetch;

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'fb-sync-'));
    mkdirSync(join(root, 'src/content/news/ar'), { recursive: true });
    mkdirSync(join(root, 'src/content/news/fr'), { recursive: true });
    const jpeg = await jpegWithExif();
    imageFetch = vi.fn(async () => new Response(new Uint8Array(jpeg), { headers: { 'content-type': 'image/jpeg' } })) as unknown as typeof fetch;
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('writes drafts and WebP images, skips empty posts, and never overwrites existing files', async () => {
    // An admin already edited post ...001 (French version only): it must not be recreated or touched.
    const edited = join(root, 'src/content/news/fr/my-edit.md');
    writeFileSync(edited, '---\ntitle: "Édité"\nfbPostId: "100000000000001_200000000000001"\n---\nTexte édité.\n');
    const before = readFileSync(edited, 'utf8');

    const { impl } = graphMock();
    const result = await runSync({ root, pageId: PAGE_ID, token: TOKEN, maxPosts: 10, fetchImpl: impl, imageFetch });

    expect(result.fetched).toBe(4);
    expect(result.created).toEqual([
      'src/content/news/ar/fb-100000000000001-200000000000003.md',
      'src/content/news/ar/fb-100000000000001-200000000000002.md',
    ]);
    expect(result.skippedExisting).toBe(1);
    expect(result.skippedEmpty).toBe(1); // video-only post without text
    expect(result.flagged).toBe(2);
    expect(readFileSync(edited, 'utf8')).toBe(before);

    const md = readFileSync(join(root, result.created[0]!), 'utf8');
    expect(md).toContain('status: "draft"');
    expect(md).toContain('source: "facebook"');
    expect(md).toContain('fbPostId: "100000000000001_200000000000003"');
    expect(md).toContain('src: "../../../assets/uploads/facebook/fb-100000000000001-200000000000003-1.webp"');
    expect(md).not.toContain('fbcdn'); // never hotlink the CDN
    const images = readdirSync(join(root, 'src/assets/uploads/facebook'));
    expect(images).toEqual(['fb-100000000000001-200000000000003-1.webp']);
    expect(findExif(readFileSync(join(root, 'src/assets/uploads/facebook', images[0]!)))).toBeNull();

    // Second run: nothing new.
    const again = await runSync({ root, pageId: PAGE_ID, token: TOKEN, maxPosts: 10, fetchImpl: graphMock().impl, imageFetch });
    expect(again.created).toEqual([]);
  });

  it('honours the ignore list', async () => {
    writeFileSync(join(root, 'src/content/news/facebook-ignored.txt'), '# rejected by the administration\n100000000000001_200000000000002\n');
    expect(knownPostIds(root).has('100000000000001_200000000000002')).toBe(true);
    const result = await runSync({ root, pageId: PAGE_ID, token: TOKEN, maxPosts: 10, fetchImpl: graphMock().impl, imageFetch });
    expect(result.created.some((f) => f.includes('200000000000002'))).toBe(false);
  });

  it('keeps going when an image fails, and writes nothing when the API fails', async () => {
    const failingImages = vi.fn(async () => new Response('nope', { status: 500 })) as unknown as typeof fetch;
    const result = await runSync({ root, pageId: PAGE_ID, token: TOKEN, maxPosts: 10, fetchImpl: graphMock().impl, imageFetch: failingImages });
    expect(result.imageErrors).toBe(1);
    expect(result.created).toHaveLength(3); // text-only draft of the photo post is still created

    const root2 = mkdtempSync(join(tmpdir(), 'fb-sync-'));
    const expired = vi.fn(async () => jsonResponse(fixture('error-190.json'), 400)) as unknown as typeof fetch;
    await expect(runSync({ root: root2, pageId: PAGE_ID, token: TOKEN, fetchImpl: expired, imageFetch })).rejects.toThrow(/expired/);
    expect(existsSync(join(root2, 'src/content/news'))).toBe(false);
    rmSync(root2, { recursive: true, force: true });
  });
});

describe('markdownText paragraphs', () => {
  it('keeps paragraphs and line breaks of the post', () => {
    expect(markdownText('line one\nline two\n\nsecond paragraph')).toBe('line one  \nline two\n\nsecond paragraph');
    expect(markdownText('\n\n\nonly\n\n\n')).toBe('only');
  });
});

describe('review round 1 fixes', () => {
  it('escapes lines that would become headings or rules', () => {
    expect(markdownText('Intro line\n---')).toBe('Intro line  \n\\-\\-\\-');
    expect(markdownText('Title\n===')).toBe('Title  \n\\=\\=\\=');
  });

  it('matches the exact hashtag only', () => {
    expect(hasHashtag('خبر #موقع_المعهد', '#موقع_المعهد')).toBe(true);
    expect(hasHashtag('خبر #موقع_المعهد.', '#موقع_المعهد')).toBe(true);
    expect(hasHashtag('خبر #موقع_المعهد_القديم', '#موقع_المعهد')).toBe(false);
    expect(hasHashtag('a+b', 'a+b')).toBe(true);
  });

  it('skips malformed posts instead of failing the whole run', async () => {
    const root = mkdtempSync(join(tmpdir(), 'fb-sync-'));
    const impl = vi.fn(async () =>
      jsonResponse({
        data: [
          { id: '../etc', created_time: '2026-11-01T00:00:00+0000', message: 'bad id' },
          { id: '1_2', created_time: 'not a date', message: 'bad date' },
          { id: '1_3', created_time: '2026-11-01T00:00:00+0000', message: 'نص سليم' },
        ],
      }),
    ) as unknown as typeof fetch;
    const result = await runSync({ root, pageId: PAGE_ID, token: TOKEN, fetchImpl: impl });
    expect(result.skippedInvalid).toBe(2);
    expect(result.created).toEqual(['src/content/news/ar/fb-1-3.md']);

    const allBad = vi.fn(async () => jsonResponse({ data: [{ id: 'x', created_time: 'y' }] })) as unknown as typeof fetch;
    await expect(runSync({ root, pageId: PAGE_ID, token: TOKEN, fetchImpl: allBad })).rejects.toThrow(/format/);
    rmSync(root, { recursive: true, force: true });
  });
});
