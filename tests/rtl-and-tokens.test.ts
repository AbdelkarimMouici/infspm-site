import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

describe('RTL safety', () => {
  // Physical direction utilities break RTL. Use logical ones: ms-/me-, ps-/pe-, start-/end-, text-start/text-end.
  const physicalClass =
    /(?<![\w-])-?(?:ml|mr|pl|pr|left|right|border-l|border-r|rounded-l|rounded-r|rounded-tl|rounded-tr|rounded-bl|rounded-br|text-left|text-right|float-left|float-right)(?:-[\w./[\]]+)?(?![\w-])/;
  const physicalCss =
    /\b(?:margin|padding|border)-(?:left|right)\b|(?<![\w-])(?:left|right)\s*:|text-align:\s*(?:left|right)|float:\s*(?:left|right)/;

  const files = listFiles('src');

  it('templates use no physical left/right Tailwind classes', () => {
    const offenders: string[] = [];
    for (const file of files.filter((f) => f.endsWith('.astro'))) {
      const source = readFileSync(file, 'utf8');
      for (const [, classes = ''] of source.matchAll(/class(?::list)?=\{?["'`]([^"'`]*)["'`]/g)) {
        for (const cls of classes.split(/\s+/)) {
          const base = cls.split(':').pop() ?? '';
          if (physicalClass.test(base)) offenders.push(`${file}: ${cls}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('stylesheets use no physical left/right properties', () => {
    const offenders = files
      .filter((f) => f.endsWith('.css'))
      .flatMap((file) =>
        readFileSync(file, 'utf8')
          .split('\n')
          .filter((line) => physicalCss.test(line))
          .map((line) => `${file}: ${line.trim()}`),
      );
    expect(offenders).toEqual([]);
  });
});

// WCAG 2.x relative luminance and contrast ratio.
function luminance(hex: string): number {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('design tokens contrast (WCAG 2.2 AA)', () => {
  const css = readFileSync('src/styles/global.css', 'utf8');
  const token = (name: string): string => {
    const value = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1];
    if (!value) throw new Error(`token --color-${name} not found`);
    return value;
  };

  const textPairs: [string, string][] = [
    ['text', 'surface'],
    ['text', 'surface-alt'],
    ['muted', 'surface'],
    ['muted', 'surface-alt'],
    ['primary', 'surface'],
    ['primary', 'surface-alt'],
    ['primary-hover', 'surface'],
    ['on-primary', 'primary'],
  ];

  it.each(textPairs)('%s on %s is at least 4.5:1', (fg, bg) => {
    expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it.each([['focus', 'surface'], ['focus', 'surface-alt']])('%s ring on %s is at least 3:1', (fg, bg) => {
    expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(3);
  });
});
