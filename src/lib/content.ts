import { getCollection, type CollectionEntry } from 'astro:content';
import { isLocale } from '~/i18n/utils';
import { site } from '~/config/site';
import type { Locale } from '~/i18n/config';

type Collection = 'news' | 'activities' | 'programs' | 'pages';

/**
 * Example (demo) entries (`example: true`, always shown with a "demo content" badge) are visible:
 * - in development and when SHOW_EXAMPLE_CONTENT=true (staging builds);
 * - when the administration leaves "Show demo content" on in the CMS settings, so the site looks complete
 *   until the official content is entered. Turn it off before the public launch (docs/CMS.md).
 */
export const showExamples: boolean =
  import.meta.env.DEV || import.meta.env['SHOW_EXAMPLE_CONTENT'] === 'true' || site.showExamples;

/** Splits an entry id "fr/my-slug" into its locale and slug. */
export function splitId(id: string): { locale: Locale; slug: string } {
  const [first = '', ...rest] = id.split('/');
  if (!isLocale(first) || rest.length === 0) {
    throw new Error(`Content entry "${id}" must live in a language folder (ar/, fr/ or en/).`);
  }
  return { locale: first, slug: rest.join('/') };
}

/** Published entries of a collection in one language (drafts never render; examples per `showExamples`). */
export async function getPublished<C extends Collection>(
  collection: C,
  locale: Locale,
): Promise<CollectionEntry<C>[]> {
  const entries = await getCollection(collection);
  return entries.filter((entry) => {
    const data = entry.data as { status: string; example: boolean };
    return (
      splitId(entry.id).locale === locale &&
      data.status === 'published' &&
      (showExamples || !data.example)
    );
  });
}

/** Which languages have a published version of the same slug (for hreflang and the language switcher). */
export async function getTranslations<C extends Collection>(
  collection: C,
  slug: string,
  pathFor: (locale: Locale, slug: string) => string,
): Promise<Partial<Record<Locale, string>>> {
  const entries = await getCollection(collection);
  const result: Partial<Record<Locale, string>> = {};
  for (const entry of entries) {
    const { locale, slug: entrySlug } = splitId(entry.id);
    const data = entry.data as { status: string; example: boolean };
    if (entrySlug === slug && data.status === 'published' && (showExamples || !data.example)) {
      result[locale] = pathFor(locale, slug);
    }
  }
  return result;
}

/** Newest first. */
export function byDateDesc<T extends { data: { date: Date } }>(a: T, b: T): number {
  return b.data.date.getTime() - a.data.date.getTime();
}
