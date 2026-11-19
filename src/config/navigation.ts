import type { Locale } from '~/i18n/config';
import type { UIKey } from '~/i18n/ui';

export interface NavItem {
  /** UI dictionary key for the label. */
  label: UIKey;
  /** Path segment after the locale ('' for the home page). Same slug in every language. */
  slug: string;
}

/** Main navigation, in display order. Slugs are shared by all languages (routes: /{locale}/{slug}/). */
export const mainNav: NavItem[] = [
  { label: 'nav.home', slug: '' },
  { label: 'nav.about', slug: 'about' },
  { label: 'nav.programs', slug: 'programs' },
  { label: 'nav.admissions', slug: 'admissions' },
  { label: 'nav.activities', slug: 'activities' },
  { label: 'nav.news', slug: 'news' },
  { label: 'nav.gallery', slug: 'gallery' },
  { label: 'nav.contact', slug: 'contact' },
];

export const footerNav: NavItem[] = [...mainNav.slice(1), { label: 'nav.privacy', slug: 'privacy' }];

export function navHref(locale: Locale, slug: string): string {
  return slug ? `/${locale}/${slug}/` : `/${locale}/`;
}

/** True when `pathname` is the item's page or one of its sub-pages (the home item only matches exactly). */
export function isCurrent(pathname: string, locale: Locale, slug: string): boolean {
  const href = navHref(locale, slug);
  const normalized = pathname.endsWith('/') ? pathname : `${pathname}/`;
  return slug ? normalized.startsWith(href) : normalized === href;
}
