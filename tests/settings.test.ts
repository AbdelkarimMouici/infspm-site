import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { settingsSchema } from '~/content/schemas';
import ar from '~/content/ui/ar.json';
import fr from '~/content/ui/fr.json';
import en from '~/content/ui/en.json';

type Tree = { [key: string]: string | Tree };

function paths(tree: Tree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string' ? [`${prefix}${key}`] : paths(value, `${prefix}${key}.`),
  );
}

describe('site texts', () => {
  it('keeps the same texts in Arabic, French and English', () => {
    const reference = paths(ar as Tree).sort();
    expect(paths(fr as Tree).sort()).toEqual(reference);
    expect(paths(en as Tree).sort()).toEqual(reference);
  });
});

describe('site settings', () => {
  const settings = JSON.parse(readFileSync('src/content/settings/site.json', 'utf8')) as Record<string, unknown>;

  it('the committed settings file is valid', () => {
    expect(() => settingsSchema.parse(settings)).not.toThrow();
  });

  it('rejects a logo outside the brand folder and non-Facebook links', () => {
    expect(() => settingsSchema.parse({ ...settings, logo: '../../assets/uploads/photo.jpg' })).toThrow();
    expect(() => settingsSchema.parse({ ...settings, facebookUrl: 'https://evil.example/page' })).toThrow();
    expect(() => settingsSchema.parse({ ...settings, mapUrl: 'javascript:alert(1)' })).toThrow();
  });
});
