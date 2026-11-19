import { getCollection, getEntry, type CollectionEntry } from 'astro:content';
import { defaultLocale, locales, type Locale } from '~/i18n/config';
import { showExamples, splitId } from './content';

type Listable = 'news' | 'activities' | 'programs';

export interface LocalizedEntry<C extends Listable> {
  entry: CollectionEntry<C>;
  slug: string;
  /** Language the entry is written in. Differs from the page language for Arabic fallbacks. */
  contentLocale: Locale;
  /** True when no translation exists and the Arabic original is shown instead (CLAUDE.md, step 5). */
  isFallback: boolean;
}

function isVisible(data: { status: string; example: boolean }): boolean {
  return data.status === 'published' && (showExamples || !data.example);
}

/**
 * Items to show on a page in `locale`: the translation when it exists, otherwise the Arabic original
 * (marked as a fallback so the page can say so and set lang="ar").
 */
export async function getLocalizedEntries<C extends Listable>(
  collection: C,
  locale: Locale,
): Promise<LocalizedEntry<C>[]> {
  const entries = (await getCollection(collection)) as CollectionEntry<C>[];
  const bySlug = new Map<string, Partial<Record<Locale, CollectionEntry<C>>>>();
  for (const entry of entries) {
    if (!isVisible(entry.data as { status: string; example: boolean })) continue;
    const { locale: entryLocale, slug } = splitId(entry.id);
    const group = bySlug.get(slug) ?? {};
    group[entryLocale] = entry;
    bySlug.set(slug, group);
  }

  const result: LocalizedEntry<C>[] = [];
  for (const [slug, group] of bySlug) {
    const own = group[locale];
    const fallback = group[defaultLocale];
    if (own) result.push({ entry: own, slug, contentLocale: locale, isFallback: false });
    else if (fallback) result.push({ entry: fallback, slug, contentLocale: defaultLocale, isFallback: true });
  }
  return result;
}

/** Static paths for detail pages in every locale (translations + Arabic fallbacks). */
export async function localizedPaths<C extends Listable>(collection: C) {
  const paths = [];
  for (const locale of locales) {
    for (const item of await getLocalizedEntries(collection, locale)) {
      paths.push({ params: { locale, slug: item.slug }, props: { item } });
    }
  }
  return paths;
}

/**
 * Language-switcher targets for a detail page: the same slug in each locale where it can be shown
 * (own translation or Arabic fallback). Only real translations are listed for hreflang by BaseLayout,
 * so fallbacks are excluded from `alternates` and the switcher sends those locales to the section index.
 */
export async function translationAlternates<C extends Listable>(
  collection: C,
  slug: string,
  section: string,
): Promise<Partial<Record<Locale, string>>> {
  const entries = (await getCollection(collection)) as CollectionEntry<C>[];
  const result: Partial<Record<Locale, string>> = {};
  for (const entry of entries) {
    const { locale, slug: entrySlug } = splitId(entry.id);
    if (entrySlug === slug && isVisible(entry.data as { status: string; example: boolean })) {
      result[locale] = `/${locale}/${section}/${slug}/`;
    }
  }
  return result;
}

/** A published institutional page (`pages` collection) in one language, or undefined. */
export async function getPublishedPage(slug: string, locale: Locale) {
  const entry = await getEntry('pages', `${locale}/${slug}`);
  if (!entry || !isVisible(entry.data)) return undefined;
  return entry;
}
