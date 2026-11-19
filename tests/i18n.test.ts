import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { locales } from '~/i18n/config';
import { ui } from '~/i18n/ui';
import { getDir, getLocaleFromUrl, localizedPath, t } from '~/i18n/utils';

describe('localizedPath', () => {
  it('swaps the locale prefix and keeps the rest of the path', () => {
    expect(localizedPath('/ar/news/some-article/', 'fr')).toBe('/fr/news/some-article/');
    expect(localizedPath('/fr/', 'ar')).toBe('/ar/');
  });

  it('adds a locale prefix to paths without one', () => {
    expect(localizedPath('/', 'ar')).toBe('/ar/');
    expect(localizedPath('/contact', 'fr')).toBe('/fr/contact/');
  });
});

describe('getLocaleFromUrl', () => {
  it('reads the first segment and falls back to Arabic', () => {
    expect(getLocaleFromUrl(new URL('https://x.test/fr/news/'))).toBe('fr');
    expect(getLocaleFromUrl(new URL('https://x.test/ar/'))).toBe('ar');
    expect(getLocaleFromUrl(new URL('https://x.test/en/'))).toBe('ar');
    expect(getLocaleFromUrl(new URL('https://x.test/'))).toBe('ar');
  });
});

describe('direction', () => {
  it('is RTL for Arabic and LTR for French', () => {
    expect(getDir('ar')).toBe('rtl');
    expect(getDir('fr')).toBe('ltr');
  });
});

describe('UI dictionaries', () => {
  it('define the same keys in every language, with no empty strings', () => {
    const reference = Object.keys(ui.ar).sort();
    for (const locale of locales) {
      expect(Object.keys(ui[locale]).sort()).toEqual(reference);
      for (const value of Object.values(ui[locale])) expect(value.trim()).not.toBe('');
    }
  });

  it('use the exact Arabic name confirmed in docs/CONTENT.md', () => {
    const doc = readFileSync('docs/CONTENT.md', 'utf8');
    const match = doc.match(/^- Name \(AR\): (.+)$/m);
    expect(match?.[1]?.trim()).toBe(t('ar', 'site.name'));
  });

  it('contain no Persian/Urdu look-alike letters in Arabic text', () => {
    // U+06CC (Persian yeh), U+06A9 (keheh), U+06C1 (heh goal) look like Arabic letters but are different.
    for (const value of Object.values(ui.ar)) expect(value).not.toMatch(/[یکہ]/);
  });
});
