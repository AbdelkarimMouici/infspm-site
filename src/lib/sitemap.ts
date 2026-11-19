import { locales, type Locale } from '~/i18n/config';
import { mainNav } from '~/config/navigation';
import { getPublishedPage, translationAlternates } from './localized';
import { getCollection } from 'astro:content';
import { showExamples, splitId } from './content';

/** A page and its translations: locale → path. */
export type PageGroup = Partial<Record<Locale, string>>;

const SECTION_PAGES = ['', 'programs', 'activities', 'news', 'gallery', 'contact'];
const CONTENT_PAGES = ['about', 'admissions', 'privacy'];

/** Fixed pages (every language) and institutional pages (only languages with their own published text). */
export async function listedPages(): Promise<PageGroup[]> {
  const groups: PageGroup[] = SECTION_PAGES.map((slug) =>
    Object.fromEntries(locales.map((code) => [code, slug ? `/${code}/${slug}/` : `/${code}/`])),
  );
  for (const slug of CONTENT_PAGES) {
    const group: PageGroup = {};
    for (const code of locales) if (await getPublishedPage(slug, code)) group[code] = `/${code}/${slug}/`;
    if (Object.keys(group).length > 0) groups.push(group);
  }
  // Sanity: every main navigation item is covered.
  for (const item of mainNav) {
    if (!SECTION_PAGES.includes(item.slug) && !CONTENT_PAGES.includes(item.slug)) {
      throw new Error(`sitemap: navigation item "${item.slug}" is not listed`);
    }
  }
  return groups;
}

/** Detail pages with their own translation (Arabic-fallback pages are noindex and not listed). */
export async function listedTranslations(): Promise<PageGroup[]> {
  const groups: PageGroup[] = [];
  for (const collection of ['news', 'activities', 'programs'] as const) {
    const slugs = new Set<string>();
    for (const entry of await getCollection(collection)) {
      const data = entry.data as { status: string; example: boolean };
      if (data.status === 'published' && (showExamples || !data.example)) slugs.add(splitId(entry.id).slug);
    }
    for (const slug of slugs) groups.push(await translationAlternates(collection, slug, collection));
  }
  return groups;
}
