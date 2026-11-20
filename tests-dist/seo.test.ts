/**
 * SEO and document checks on the BUILT site (run after `npm run build`: `npm run test:dist`).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIST = 'dist';
const built = existsSync(DIST);

function listHtml(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return listHtml(path);
    return path.endsWith('.html') ? [path] : [];
  });
}

const urlPath = (file: string) => `/${relative(DIST, file).split('\\').join('/').replace(/index\.html$/, '')}`;
const pathExists = (path: string) =>
  existsSync(join(DIST, path, 'index.html')) || existsSync(join(DIST, path)) || existsSync(join(DIST, `${path}.html`));

interface Page {
  path: string;
  html: string;
  title: string;
  description: string;
  noindex: boolean;
  lang: string;
  dir: string;
}

const pages: Page[] = built
  ? listHtml(DIST).map((file) => {
      const html = readFileSync(file, 'utf8');
      return {
        path: urlPath(file),
        html,
        title: /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? '',
        description: /<meta name="description" content="([^"]*)"/.exec(html)?.[1] ?? '',
        noindex: /<meta name="robots" content="[^"]*noindex/.test(html),
        lang: /<html[^>]*\blang="([^"]+)"/.exec(html)?.[1] ?? '',
        dir: /<html[^>]*\bdir="([^"]+)"/.exec(html)?.[1] ?? '',
      };
    })
  : [];
const indexable = pages.filter((p) => !p.noindex);

describe.skipIf(!built)('built pages: SEO and document basics', () => {
  it('every page declares lang and dir matching its locale', () => {
    for (const page of pages.filter((p) => /^\/(ar|fr|en)\//.test(p.path))) {
      const locale = page.path.split('/')[1];
      expect(page.lang, page.path).toBe(locale);
      expect(page.dir, page.path).toBe(locale === 'ar' ? 'rtl' : 'ltr');
    }
  });

  it('indexable pages have unique titles and unique, reasonable descriptions', () => {
    const titles = new Map<string, string>();
    const descriptions = new Map<string, string>();
    for (const page of indexable.filter((p) => p.path !== '/')) {
      expect(page.title, page.path).not.toBe('');
      expect(page.description.length, `${page.path} description length`).toBeGreaterThanOrEqual(30);
      expect(page.description.length, `${page.path} description length`).toBeLessThanOrEqual(200);
      expect(titles.get(page.title), `duplicate title on ${page.path}`).toBeUndefined();
      expect(descriptions.get(page.description), `duplicate description on ${page.path}`).toBeUndefined();
      titles.set(page.title, page.path);
      descriptions.set(page.description, page.path);
    }
  });

  it('canonical and hreflang links point to pages that exist and are indexable', () => {
    const indexablePaths = new Set(indexable.map((p) => p.path));
    for (const page of indexable.filter((p) => p.path !== '/')) {
      const canonical = /<link rel="canonical" href="([^"]+)"/.exec(page.html)?.[1];
      expect(canonical, `canonical on ${page.path}`).toBeTruthy();
      expect(new URL(canonical ?? '').pathname).toBe(page.path);
      for (const [, href] of page.html.matchAll(/<link rel="alternate" hreflang="[^"]+" href="([^"]+)"/g)) {
        const target = new URL(href ?? '').pathname;
        expect(indexablePaths.has(target), `hreflang ${target} on ${page.path}`).toBe(true);
      }
    }
  });

  it('every indexable page has valid EducationalOrganization structured data', () => {
    for (const page of indexable.filter((p) => p.path !== '/')) {
      const blocks = [...page.html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
      expect(blocks.length, page.path).toBe(1);
      const data = JSON.parse(blocks[0]?.[1] ?? '') as Record<string, unknown>;
      expect(data['@type']).toBe('EducationalOrganization');
      expect(data['email']).toBe('infspmtebessa@inpfp.dz');
    }
  });

  it('sitemap.xml lists exactly the indexable locale pages', () => {
    const xml = readFileSync(join(DIST, 'sitemap.xml'), 'utf8');
    const listed = new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1] ?? '').pathname));
    const expected = new Set(indexable.map((p) => p.path).filter((p) => /^\/(ar|fr|en)\//.test(p)));
    expect([...listed].sort()).toEqual([...expected].sort());
    for (const path of listed) expect(pathExists(path), path).toBe(true);
  });

  /** hreflang set of a page: "lang path" strings, including itself and x-default. */
  const hreflangSet = (html: string) =>
    [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)]
      .map((m) => `${m[1]} ${new URL(m[2] ?? '').pathname}`)
      .sort();

  it('hreflang annotations are reciprocal, self-referencing, and x-default is the Arabic page', () => {
    const byPath = new Map(indexable.map((p) => [p.path, p]));
    for (const page of indexable.filter((p) => /^\/(ar|fr|en)\//.test(p.path))) {
      const set = hreflangSet(page.html);
      const locale = page.path.split('/')[1];
      expect(set, `${page.path} references itself`).toContain(`${locale} ${page.path}`);
      const arabic = set.find((entry) => entry.startsWith('ar '));
      const xDefault = set.find((entry) => entry.startsWith('x-default '));
      if (arabic) expect(xDefault?.split(' ')[1], `${page.path} x-default`).toBe(arabic.split(' ')[1]);
      for (const entry of set) {
        const target = byPath.get(entry.split(' ')[1] ?? '');
        expect(target, `${entry} from ${page.path}`).toBeTruthy();
        expect(hreflangSet(target?.html ?? ''), `${target?.path} reciprocates ${page.path}`).toEqual(set);
      }
    }
  });

  it('sitemap alternates match each page’s hreflang links', () => {
    const xml = readFileSync(join(DIST, 'sitemap.xml'), 'utf8');
    const byPath = new Map(indexable.map((p) => [p.path, p]));
    for (const [, block] of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
      const loc = new URL(/<loc>([^<]+)<\/loc>/.exec(block ?? '')?.[1] ?? '').pathname;
      const alternates = [...(block ?? '').matchAll(/hreflang="([^"]+)" href="([^"]+)"/g)]
        .map((m) => `${m[1]} ${new URL(m[2] ?? '').pathname}`)
        .sort();
      expect(alternates, `sitemap alternates for ${loc}`).toEqual(hreflangSet(byPath.get(loc)?.html ?? ''));
    }
  });

  it('robots.txt keeps the CMS and API out and points to the sitemap', () => {
    const robots = readFileSync(join(DIST, 'robots.txt'), 'utf8');
    expect(robots).toMatch(/^Disallow: \/admin\/$/m);
    expect(robots).toMatch(/^Disallow: \/api\/$/m);
    expect(robots).toMatch(/^Sitemap: https?:\/\/[^\s]+\/sitemap\.xml$/m);
  });

  it('internal links point to pages that exist', () => {
    for (const page of pages) {
      for (const [, href] of page.html.matchAll(/<a [^>]*href="(\/[^"#?]*)"/g)) {
        if (href?.startsWith('/api/')) continue;
        expect(pathExists(href ?? ''), `${href} linked from ${page.path}`).toBe(true);
      }
    }
  });
});
