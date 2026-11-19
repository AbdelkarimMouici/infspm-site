import { defaultLocale, localeMeta, locales, type Locale } from './config';
import { ui, type UIKey } from './ui';

export function isLocale(value: string | undefined): value is Locale {
  return value !== undefined && (locales as readonly string[]).includes(value);
}

/** Reads the locale from the first URL segment ("/fr/news/" -> "fr"). Falls back to Arabic. */
export function getLocaleFromUrl(url: URL): Locale {
  const [, first] = url.pathname.split('/');
  return isLocale(first) ? first : defaultLocale;
}

export function t(locale: Locale, key: UIKey): string {
  return ui[locale][key];
}

export function getDir(locale: Locale): 'rtl' | 'ltr' {
  return localeMeta[locale].dir;
}

/**
 * Returns the same page in another locale.
 * "/ar/news/" + "fr" -> "/fr/news/". Paths always end with "/" (trailingSlash: 'always').
 */
export function localizedPath(pathname: string, target: Locale): string {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length > 0 && isLocale(segments[0])) segments.shift();
  const rest = segments.length > 0 ? `${segments.join('/')}/` : '';
  return `/${target}/${rest}`;
}
