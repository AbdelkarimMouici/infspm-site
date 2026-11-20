/**
 * Checks the BUILT site (dist/) against the security headers in public/_headers.
 * Run after `npm run build`: `npm run test:dist` (CI runs it with and without the contact form).
 *
 * Guarantees:
 * - no inline code: no <script> without src (except JSON-LD data blocks), no <style>, no style=, no on*=
 *   handlers, no javascript: URLs (the strict CSP has no 'unsafe-inline');
 * - every resource a page loads (scripts, styles, images and srcset, media, frames, objects, preload/icon/manifest
 *   links, form targets) is allowed by THAT page's CSP, resolved like a browser would (relative, protocol-relative,
 *   data:, blob:);
 * - meta refresh only redirects within the site; CSS loads nothing remote;
 * - the headers file sets the required headers, and the exceptions keep the protective directives.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIST = 'dist';
const SITE = 'https://site.invalid';

function listFiles(dir: string, ext: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return listFiles(path, ext);
    return path.endsWith(ext) ? [path] : [];
  });
}

/** URL path of a built HTML file: dist/fr/contact/index.html → /fr/contact/ */
function urlPath(file: string): string {
  const rel = relative(DIST, file).split('\\').join('/');
  return `/${rel.replace(/index\.html$/, '').replace(/\.html$/, '')}`;
}

// ---------- _headers emulation (Cloudflare Pages semantics) ----------

interface HeaderRule {
  pattern: string;
  set: [string, string][];
  detach: Set<string>;
}

function parseHeaders(text: string): HeaderRule[] {
  const rules: HeaderRule[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      rules.push({ pattern: line.trim(), set: [], detach: new Set() });
      continue;
    }
    const rule = rules.at(-1);
    if (!rule) throw new Error('Header line before any URL pattern');
    const trimmed = line.trim();
    if (trimmed.startsWith('! ')) {
      rule.detach.add(trimmed.slice(2).trim().toLowerCase());
      continue;
    }
    const index = trimmed.indexOf(':');
    rule.set.push([trimmed.slice(0, index).trim().toLowerCase(), trimmed.slice(index + 1).trim()]);
  }
  return rules;
}

/** ":name" matches one path segment, "*" matches anything. */
function matches(pattern: string, path: string): boolean {
  const regex = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/:[A-Za-z]\w*/g, '[^/]+')
    .replace(/\*/g, '.*');
  return new RegExp(`^${regex}$`).test(path);
}

/** Effective headers: rules in order, duplicate values joined with ", ", "!" detaches earlier values. */
function headersFor(rules: HeaderRule[], path: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const rule of rules) {
    if (!matches(rule.pattern, path)) continue;
    for (const name of rule.detach) result.delete(name);
    for (const [name, value] of rule.set) result.set(name, result.has(name) ? `${result.get(name)}, ${value}` : value);
  }
  return result;
}

function csp(policy: string): Map<string, string[]> {
  return new Map(
    policy
      .split(';')
      .map((part) => part.trim().split(/\s+/))
      .filter((parts) => parts[0])
      .map(([name = '', ...values]) => [name.toLowerCase(), values]),
  );
}

/** CSP fallback chain: e.g. img-src → default-src. */
function sourcesFor(policy: Map<string, string[]>, directive: string): string[] | undefined {
  if (directive === 'form-action' || directive === 'frame-ancestors' || directive === 'base-uri') {
    return policy.get(directive) ?? ['*'];
  }
  return policy.get(directive) ?? policy.get('default-src');
}

/** Would this policy source list allow loading `raw` from a page of this site? */
export function allows(sources: string[] | undefined, raw: string): boolean {
  if (!sources) return false;
  if (sources.includes("'none'")) return false;
  let url: URL;
  try {
    url = new URL(raw.trim(), `${SITE}/page/`);
  } catch {
    return false;
  }
  if (url.protocol === 'data:' || url.protocol === 'blob:') return sources.includes(url.protocol);
  if (url.origin === SITE) return sources.includes("'self'") || sources.includes('*');
  return sources.some((source) => source === '*' || source === url.origin || url.href.startsWith(`${source}/`));
}

// ---------- HTML scanning (no parser dependency: tags and attributes, quoted or not) ----------

interface Tag {
  name: string;
  attrs: Map<string, string>;
  raw: string;
}

export function scanTags(html: string): Tag[] {
  const tags: Tag[] = [];
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, '');
  for (const match of withoutComments.matchAll(/<([a-zA-Z][\w-]*)(\s[^>]*)?>/g)) {
    const attrs = new Map<string, string>();
    for (const attr of (match[2] ?? '').matchAll(/([^\s=/>]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/g)) {
      const value = attr[2] ?? '';
      attrs.set((attr[1] ?? '').toLowerCase(), value.replace(/^["']|["']$/g, ''));
    }
    tags.push({ name: (match[1] ?? '').toLowerCase(), attrs, raw: match[0] });
  }
  return tags;
}

const srcsetUrls = (value: string) => value.split(',').map((part) => part.trim().split(/\s+/)[0] ?? '').filter(Boolean);

/** [directive, url] pairs for everything a tag loads. */
function resources(tag: Tag): [string, string][] {
  const a = tag.attrs;
  const out: [string, string][] = [];
  const add = (directive: string, url: string | undefined) => url && out.push([directive, url]);
  switch (tag.name) {
    case 'script':
      add('script-src', a.get('src'));
      break;
    case 'img':
      add('img-src', a.get('src'));
      for (const url of srcsetUrls(a.get('srcset') ?? '')) add('img-src', url);
      break;
    case 'source':
      add(a.has('srcset') ? 'img-src' : 'media-src', a.get('src'));
      for (const url of srcsetUrls(a.get('srcset') ?? '')) add('img-src', url);
      break;
    case 'video':
    case 'audio':
    case 'track':
      add('media-src', a.get('src'));
      add('img-src', a.get('poster'));
      break;
    case 'iframe':
    case 'frame':
      add('frame-src', a.get('src'));
      break;
    case 'object':
      add('object-src', a.get('data'));
      break;
    case 'embed':
      add('object-src', a.get('src'));
      break;
    case 'form':
      add('form-action', a.get('action'));
      break;
    case 'link': {
      const rel = (a.get('rel') ?? '').toLowerCase().split(/\s+/);
      const href = a.get('href');
      if (rel.includes('stylesheet')) add('style-src', href);
      else if (rel.includes('icon') || rel.includes('apple-touch-icon')) add('img-src', href);
      else if (rel.includes('manifest')) add('manifest-src', href);
      else if (rel.includes('preload') || rel.includes('modulepreload') || rel.includes('prefetch')) {
        const as = a.get('as') ?? 'script';
        const directive = { style: 'style-src', image: 'img-src', font: 'font-src', fetch: 'connect-src' }[as] ?? 'script-src';
        add(directive, href);
      }
      break;
    }
    default:
      break;
  }
  return out;
}

const URL_ATTRIBUTES = ['href', 'src', 'action', 'formaction', 'data', 'poster', 'srcset', 'xlink:href'];

// ---------- tests ----------

const built = existsSync(DIST);
const headersText = existsSync('public/_headers') ? readFileSync('public/_headers', 'utf8') : '';
const rules = parseHeaders(headersText);
const pages = built ? listFiles(DIST, '.html') : [];

describe('build output is present', () => {
  it.runIf(Boolean(process.env['CI']))('dist/ exists in CI (run npm run build first)', () => {
    expect(built).toBe(true);
  });
});

describe.skipIf(!built)('built HTML is compatible with the CSP of each page', () => {
  it('has pages to check', () => {
    expect(pages.length).toBeGreaterThan(10);
  });

  it.each(pages.map((file) => [urlPath(file), file]))('%s', (path, file) => {
    const html = readFileSync(file, 'utf8');
    const policy = csp(headersFor(rules, path).get('content-security-policy') ?? '');
    expect(policy.size, `no CSP for ${path}`).toBeGreaterThan(0);
    const tags = scanTags(html);

    for (const tag of tags) {
      // Inline code the CSP would block.
      if (tag.name === 'script' && !tag.attrs.has('src')) {
        expect(tag.attrs.get('type'), `inline script on ${path}`).toBe('application/ld+json');
      }
      expect(tag.name, `<style> on ${path}`).not.toBe('style');
      for (const name of tag.attrs.keys()) {
        expect(name.startsWith('on'), `${name}= on ${path}`).toBe(false);
        expect(name, `style= on ${path}`).not.toBe('style');
      }
      for (const name of URL_ATTRIBUTES) {
        const value = tag.attrs.get(name);
        if (value) expect(/^\s*javascript:/i.test(value), `javascript: URL on ${path}`).toBe(false);
      }
      // Every loaded resource must be allowed by this page's policy.
      for (const [directive, url] of resources(tag)) {
        expect(allows(sourcesFor(policy, directive), url), `${directive} ${url} on ${path}`).toBe(true);
      }
      // Meta refresh may only go to this site.
      if (tag.name === 'meta' && tag.attrs.get('http-equiv')?.toLowerCase() === 'refresh') {
        const target = /url\s*=\s*(.+)$/i.exec(tag.attrs.get('content') ?? '')?.[1]?.trim() ?? '';
        expect(new URL(target, `${SITE}/`).origin, `meta refresh on ${path}`).toBe(SITE);
      }
    }

    // JSON-LD blocks must be valid JSON and unable to close their element.
    for (const [, body] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      expect(() => JSON.parse(body ?? ''), `JSON-LD on ${path}`).not.toThrow();
    }
  });

  it('built CSS loads no remote resources', () => {
    for (const file of listFiles(DIST, '.css')) {
      const css = readFileSync(file, 'utf8');
      expect(css, file).not.toMatch(/url\(\s*["']?\s*(https?:)?\/\//i);
      expect(css, file).not.toMatch(/@import\s+(url\()?\s*["']?\s*(https?:)?\/\//i);
    }
  });
});

describe('the checker itself', () => {
  it('resolves URLs like a browser', () => {
    expect(allows(["'self'"], '/_astro/a.js')).toBe(true);
    expect(allows(["'self'"], '//scontent.fbcdn.net/x.jpg')).toBe(false);
    expect(allows(["'self'"], 'data:image/png;base64,AAAA')).toBe(false);
    expect(allows(["'self'", 'data:'], 'data:image/png;base64,AAAA')).toBe(true);
    expect(allows(["'self'", 'https://challenges.cloudflare.com'], 'https://challenges.cloudflare.com/turnstile/v0/api.js')).toBe(true);
    expect(allows(["'none'"], '/x')).toBe(false);
  });

  it('reads unquoted and upper-case attributes', () => {
    const [tag] = scanTags('<IMG SRC=//evil.example/x.png ONERROR=alert(1)>');
    expect(tag?.attrs.get('src')).toBe('//evil.example/x.png');
    expect(tag?.attrs.has('onerror')).toBe(true);
  });
});

describe('public/_headers', () => {
  const site = headersFor(rules, '/fr/news/');
  const PROTECTIVE: [string, string][] = [
    ['frame-ancestors', "'none'"],
    ['base-uri', "'none'"],
    ['object-src', "'none'"],
  ];

  it('sets the required security headers on every page', () => {
    for (const name of [
      'content-security-policy',
      'strict-transport-security',
      'x-content-type-options',
      'referrer-policy',
      'permissions-policy',
      'cross-origin-opener-policy',
    ]) {
      expect(site.get(name), name).toBeTruthy();
    }
    expect(site.get('x-content-type-options')).toBe('nosniff');
    expect(site.get('strict-transport-security')).toMatch(/max-age=(\d{8,})/);
    // The contact form's same-origin check needs the Origin header: never "no-referrer".
    expect(site.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
  });

  it('uses a strict default policy', () => {
    const policy = csp(site.get('content-security-policy') ?? '');
    expect(policy.get('default-src')).toEqual(["'self'"]);
    expect(policy.get('script-src')).toEqual(["'self'"]);
    expect(policy.get('style-src')).toEqual(["'self'"]);
    for (const [name, value] of PROTECTIVE) expect(policy.get(name)).toEqual([value]);
    expect(site.get('content-security-policy')).not.toMatch(/unsafe-(inline|eval)|\s\*/);
  });

  it('keeps every exception narrow and protective', () => {
    for (const path of ['/ar/contact/', '/admin/']) {
      const header = headersFor(rules, path).get('content-security-policy') ?? '';
      expect(header.split(',').length, `${path}: policy replaced, not merged`).toBe(1);
      const policy = csp(header);
      for (const [name, value] of PROTECTIVE) expect(policy.get(name), `${path} ${name}`).toEqual([value]);
      expect(policy.get('form-action'), `${path} form-action`).toEqual(["'self'"]);
    }

    const contact = headersFor(rules, '/ar/contact/').get('content-security-policy') ?? '';
    expect(contact).toContain('https://challenges.cloudflare.com');
    expect(contact).not.toMatch(/unsafe-/);
    expect(headersFor(rules, '/ar/contact/sent/').get('content-security-policy')).not.toContain('challenges.cloudflare.com');

    // Admin panel: same-origin only, no unsafe-*, no third party; blob: only for image previews.
    const admin = headersFor(rules, '/admin/');
    const adminPolicy = csp(admin.get('content-security-policy') ?? '');
    expect(admin.get('content-security-policy')).not.toMatch(/unsafe-|https?:/);
    expect(adminPolicy.get('script-src')).toEqual(["'self'"]);
    expect(adminPolicy.get('connect-src')).toEqual(["'self'"]);
    expect(adminPolicy.get('img-src')).toEqual(["'self'", 'blob:']);
    expect(admin.get('cross-origin-opener-policy')).toBe('same-origin');
    expect(admin.get('x-robots-tag')).toContain('noindex');
    expect(admin.get('cache-control')).toBe('no-store');

    for (const path of ['/', '/ar/', '/en/programs/x/', '/fr/contact/', '/_astro/a.js', '/ar/contact/not-sent/busy/']) {
      expect(headersFor(rules, path).get('content-security-policy') ?? '', path).not.toMatch(/unsafe-/);
      expect(headersFor(rules, path).get('cross-origin-opener-policy'), path).toBe('same-origin');
    }
  });
});
