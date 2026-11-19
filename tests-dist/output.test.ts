/**
 * Checks the BUILT site (dist/) against the security headers in public/_headers.
 * Run after `npm run build`: `npm run test:dist` (CI does this).
 *
 * Guarantees:
 * - no inline <script>, no inline event handlers, no style attributes or <style> blocks
 *   (the strict CSP has no 'unsafe-inline'), no javascript: URLs;
 * - every external script/frame/stylesheet/image/font is allowed by the CSP of the page that uses it;
 * - the headers file contains the required headers, and only /admin/* relaxes script/style rules.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIST = 'dist';

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

interface HeaderRule {
  pattern: string;
  set: Map<string, string>;
  detach: Set<string>;
}

function parseHeaders(text: string): HeaderRule[] {
  const rules: HeaderRule[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      rules.push({ pattern: line.trim(), set: new Map(), detach: new Set() });
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
    rule.set.set(trimmed.slice(0, index).trim().toLowerCase(), trimmed.slice(index + 1).trim());
  }
  return rules;
}

/** Cloudflare semantics: ":name" matches one path segment, "*" matches anything. */
function matches(pattern: string, path: string): boolean {
  const regex = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/:[A-Za-z]\w*/g, '[^/]+')
    .replace(/\*/g, '.*');
  return new RegExp(`^${regex}$`).test(path);
}

/** Effective headers for a path, applying rules in order (values joined, "!" detaches). */
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
      .map(([name = '', ...values]) => [name, values]),
  );
}

/** Does a CSP source list allow this URL (relative URLs are 'self')? */
function allows(sources: string[] | undefined, url: string): boolean {
  if (!sources) return false;
  if (!/^https?:\/\//.test(url)) return sources.includes("'self'");
  const { origin } = new URL(url);
  return sources.some((source) => source === origin || url.startsWith(`${source}/`));
}

const built = existsSync(DIST);
const headersText = existsSync('public/_headers') ? readFileSync('public/_headers', 'utf8') : '';
const rules = parseHeaders(headersText);
const pages = built ? listFiles(DIST, '.html') : [];

describe.skipIf(!built)('built HTML is compatible with the strict CSP', () => {
  it('has pages to check', () => {
    expect(pages.length).toBeGreaterThan(10);
  });

  it.each(pages.map((file) => [urlPath(file), file]))('%s', (path, file) => {
    const html = readFileSync(file, 'utf8');
    const policy = csp(headersFor(rules, path).get('content-security-policy') ?? '');
    expect(policy.size, `no CSP for ${path}`).toBeGreaterThan(0);

    // Inline code the CSP would block (and must never be needed).
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/i);
    expect(html).not.toMatch(/<style[\s>]/i);
    expect(html).not.toMatch(/\sstyle\s*=/i);
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    expect(html).not.toMatch(/(href|src|action)\s*=\s*["']?\s*javascript:/i);

    // Every external resource must be allowed by this page's policy.
    for (const [, src] of html.matchAll(/<script[^>]*\bsrc=["']([^"']+)["']/gi)) {
      expect(allows(policy.get('script-src') ?? policy.get('default-src'), src ?? ''), `script ${src} on ${path}`).toBe(true);
    }
    for (const [, href] of html.matchAll(/<link[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/gi)) {
      expect(allows(policy.get('style-src') ?? policy.get('default-src'), href ?? ''), `stylesheet ${href} on ${path}`).toBe(true);
    }
    for (const [, src] of html.matchAll(/<img[^>]*\bsrc=["']([^"']+)["']/gi)) {
      expect(allows(policy.get('img-src') ?? policy.get('default-src'), src ?? ''), `image ${src} on ${path}`).toBe(true);
    }
    for (const [, action] of html.matchAll(/<form[^>]*\baction=["']([^"']+)["']/gi)) {
      expect(allows(policy.get('form-action'), action ?? ''), `form ${action} on ${path}`).toBe(true);
    }
  });

  it('built CSS loads no remote resources', () => {
    for (const file of listFiles(DIST, '.css')) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/url\(\s*["']?(https?:)?\/\//i);
    }
  });
});

describe('public/_headers', () => {
  const site = headersFor(rules, '/fr/news/');

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
  });

  it('uses a strict default policy', () => {
    const policy = csp(site.get('content-security-policy') ?? '');
    expect(policy.get('default-src')).toEqual(["'self'"]);
    expect(policy.get('script-src')).toEqual(["'self'"]);
    expect(policy.get('style-src')).toEqual(["'self'"]);
    expect(policy.get('frame-ancestors')).toEqual(["'none'"]);
    expect(policy.get('object-src')).toEqual(["'none'"]);
    expect(policy.get('base-uri')).toEqual(["'none'"]);
    expect(site.get('content-security-policy')).not.toMatch(/unsafe-(inline|eval)|\*/);
  });

  it('only relaxes the policy where needed', () => {
    const contact = headersFor(rules, '/ar/contact/').get('content-security-policy') ?? '';
    expect(contact).toContain('https://challenges.cloudflare.com');
    expect(contact).not.toMatch(/unsafe-/);
    expect(contact.split(',').length).toBe(1); // replaced, not merged

    const sent = headersFor(rules, '/ar/contact/sent/').get('content-security-policy') ?? '';
    expect(sent).not.toContain('challenges.cloudflare.com');

    const admin = headersFor(rules, '/admin/').get('content-security-policy') ?? '';
    expect(admin).toContain("'unsafe-eval'");
    expect(admin).toContain("frame-ancestors 'none'");
    expect(headersFor(rules, '/admin/').get('x-robots-tag')).toContain('noindex');

    for (const path of ['/', '/ar/', '/en/programs/x/', '/fr/contact/', '/_astro/a.js']) {
      expect(headersFor(rules, path).get('content-security-policy') ?? '', path).not.toMatch(/unsafe-/);
    }
  });
});
