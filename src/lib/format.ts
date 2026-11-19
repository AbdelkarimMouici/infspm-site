import type { Locale } from '~/i18n/config';

const intlLocale: Record<Locale, string> = {
  // Latin digits in Arabic (as used in Algeria), Gregorian calendar.
  ar: 'ar-DZ-u-ca-gregory-nu-latn',
  fr: 'fr-DZ',
  en: 'en-GB',
};

/** Human-readable date in the page language, e.g. "15 janvier 2026". Uses UTC (dates have no time). */
export function formatDate(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale[locale], {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/** Machine-readable date for <time datetime>. */
export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
