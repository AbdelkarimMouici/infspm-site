import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Demo entries (`example: true`, files named *example*) hold invented details: they must never reach the
// official domain. A production build for a real domain (no SHOW_EXAMPLE_CONTENT, branch unset or `main`,
// SITE_URL not a temporary *.pages.dev address) must not contain them.
const branch = process.env['CF_PAGES_BRANCH'];
// The build's own address, read from robots.txt (written with SITE_URL), so the check cannot be skipped by
// running the tests with different variables than the build.
const sitemapLine = /^Sitemap: (\S+)$/m.exec(readFileSync('dist/robots.txt', 'utf8'))?.[1] ?? '';
const temporary = /^https:\/\/[^/]+\.pages\.dev\//.test(sitemapLine);
const liveBuild = process.env['SHOW_EXAMPLE_CONTENT'] !== 'true' && (!branch || branch === 'main') && !temporary;
const demoPages = () => files('dist').filter((path) => /example/.test(path) && path.endsWith('.html'));

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

describe.runIf(liveBuild)('live build: no demo content', () => {
  it('has no demo pages', () => {
    expect(demoPages()).toEqual([]);
  });
});

describe('demo content is never indexed', () => {
  it('keeps search engines out of the whole site whenever demo pages are built', () => {
    if (demoPages().length === 0) return;
    expect(readFileSync('dist/robots.txt', 'utf8')).toMatch(/^Disallow: \/$/m);
  });

  it('shows demo pages only on a temporary *.pages.dev address or a preview', () => {
    if (demoPages().length === 0) return;
    expect(temporary || process.env['SHOW_EXAMPLE_CONTENT'] === 'true' || (Boolean(branch) && branch !== 'main')).toBe(true);
  });
});
