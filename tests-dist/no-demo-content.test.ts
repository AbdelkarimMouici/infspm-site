import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Demo entries (`example: true`, files named *example*) hold invented details: they must never reach the
// live site. A production build (no SHOW_EXAMPLE_CONTENT, branch unset or `main`) must not contain them.
const branch = process.env['CF_PAGES_BRANCH'];
const liveBuild = process.env['SHOW_EXAMPLE_CONTENT'] !== 'true' && (!branch || branch === 'main');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

describe.runIf(liveBuild)('live build: no demo content', () => {
  it('has no demo pages', () => {
    const pages = files('dist').filter((path) => /example/.test(path) && path.endsWith('.html'));
    expect(pages).toEqual([]);
  });
});
