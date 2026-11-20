import { describe, expect, it } from 'vitest';
import { z } from 'astro/zod';
import { activitySchema, newsSchema, pageSchema, programSchema } from '~/content/schemas';

// Outside the Astro build, images are plain strings.
const news = newsSchema(z.string());
const activity = activitySchema(z.string());
const program = programSchema(z.string());

describe('news schema', () => {
  const valid = { title: 'Title', date: '2026-01-15' };

  it('defaults to draft, manual source, no images, not an example', () => {
    const data = news.parse(valid);
    expect(data.status).toBe('draft');
    expect(data.source).toBe('manual');
    expect(data.images).toEqual([]);
    expect(data.example).toBe(false);
    expect(data['needs-review']).toBe(false);
  });

  it('requires fbPostId for Facebook posts and validates its format', () => {
    expect(news.safeParse({ ...valid, source: 'facebook' }).success).toBe(false);
    expect(news.safeParse({ ...valid, source: 'facebook', fbPostId: '123_456' }).success).toBe(true);
    expect(news.safeParse({ ...valid, source: 'facebook', fbPostId: '../etc/passwd' }).success).toBe(false);
  });

  it('only accepts https facebook.com permalinks', () => {
    expect(news.safeParse({ ...valid, fbPermalink: 'https://www.facebook.com/x/posts/1' }).success).toBe(true);
    expect(news.safeParse({ ...valid, fbPermalink: 'http://www.facebook.com/x' }).success).toBe(false);
    expect(news.safeParse({ ...valid, fbPermalink: 'https://evil.example/facebook.com' }).success).toBe(false);
    expect(news.safeParse({ ...valid, fbPermalink: 'javascript:alert(1)' }).success).toBe(false);
  });

  it('requires alt text on every image of a published entry', () => {
    const pub = { ...valid, status: 'published' };
    expect(news.safeParse({ ...pub, images: [{ src: 'a.webp', alt: '' }] }).success).toBe(false);
    expect(news.safeParse({ ...pub, images: [{ src: 'a.webp', alt: '   ' }] }).success).toBe(false);
    expect(news.safeParse({ ...pub, images: [{ src: 'a.webp', alt: 'Students in the lab' }] }).success).toBe(true);
  });

  it('never resolves the images of unpublished entries (so they are not deployed)', () => {
    const draft = news.parse({ ...valid, status: 'draft', images: [{ src: 'a.webp', alt: 'x' }] });
    expect(draft.images).toEqual([]);
    const pub = news.parse({ ...valid, status: 'published', images: [{ src: 'a.webp', alt: 'x' }] });
    expect(pub.images).toHaveLength(1);
    expect(program.parse({ title: 'P', image: { src: 'a.webp', alt: 'x' } }).image).toBeUndefined();
  });

  it('refuses to publish a post that still carries a care flag', () => {
    expect(news.safeParse({ ...valid, status: 'published', careFlags: ['memorial'] }).success).toBe(false);
    expect(news.safeParse({ ...valid, status: 'draft', careFlags: ['memorial'] }).success).toBe(true);
  });

  it('rejects unknown status values and empty titles', () => {
    expect(news.safeParse({ ...valid, status: 'public' }).success).toBe(false);
    expect(news.safeParse({ ...valid, title: '  ' }).success).toBe(false);
  });
});

describe('activity schema', () => {
  it('rejects an end date before the start date', () => {
    expect(activity.safeParse({ title: 'A', date: '2026-02-10', endDate: '2026-02-01' }).success).toBe(false);
    expect(activity.safeParse({ title: 'A', date: '2026-02-10', endDate: '2026-02-12' }).success).toBe(true);
  });
});

describe('program schema', () => {
  it('keeps unconfirmed facts optional', () => {
    const data = program.parse({ title: 'P' });
    expect(data.duration).toBeUndefined();
    expect(data.diploma).toBeUndefined();
    expect(data.order).toBe(100);
  });
});

describe('page schema', () => {
  it('requires a meta description of at most 170 characters', () => {
    expect(pageSchema.safeParse({ title: 'About' }).success).toBe(false);
    expect(pageSchema.safeParse({ title: 'About', description: 'x'.repeat(171) }).success).toBe(false);
    expect(pageSchema.safeParse({ title: 'About', description: 'About the institute.' }).success).toBe(true);
  });
});
