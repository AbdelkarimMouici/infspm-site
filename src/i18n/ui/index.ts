/**
 * Interface texts in Arabic, French and English.
 *
 * The texts live in src/content/ui/{ar,fr,en}.json so the administration can edit them in the CMS
 * ("Site texts"). The files are nested by group ({ "home": { "intro": "…" } }); the site uses flat keys
 * ("home.intro"). Arabic is the reference: every other language must define exactly the same keys
 * (tests/i18n.test.ts).
 */
import ar from '../../content/ui/ar.json';
import fr from '../../content/ui/fr.json';
import en from '../../content/ui/en.json';
import type { Locale } from '../config';

type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

export type UIKey = Leaves<typeof ar>;
export type UIStrings = Record<UIKey, string>;

/** { a: { b: "x" } } → { "a.b": "x" } */
export function flatten(tree: object, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    if (typeof value === 'string') out[`${prefix}${key}`] = value;
    else if (value && typeof value === 'object') Object.assign(out, flatten(value as object, `${prefix}${key}.`));
  }
  return out;
}

export const ui: Record<Locale, UIStrings> = {
  ar: flatten(ar) as UIStrings,
  fr: flatten(fr) as UIStrings,
  en: flatten(en) as UIStrings,
};
