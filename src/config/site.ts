/**
 * Institutional facts used across the site, edited by the administration in the CMS ("Settings" →
 * src/content/settings/site.json) and validated here at build time (an invalid value fails the build).
 * Empty values mean "not confirmed yet" (docs/CONTENT.md): the site shows "to be confirmed" instead.
 */
import type { Locale } from '~/i18n/config';
import { settingsSchema } from '~/content/schemas';
import raw from '~/content/settings/site.json';

const settings = settingsSchema.parse(raw);
const orNull = (value: string): string | null => (value.trim() === '' ? null : value.trim());

export const site = {
  /** Official email. */
  email: settings.email,
  phone: orNull(settings.phone),
  facebookUrl: orNull(settings.facebookUrl),
  mapUrl: orNull(settings.mapUrl),
  /** Show the demo entries (`example: true`) on preview links; never on the live site (src/lib/content.ts). */
  showExamples: settings.showExamples,
  /** Home page: automatic "New" story with the latest news and activities. */
  newsStory: settings.newsStory,
  /** Logo path relative to src/content/settings/ (resolved in src/lib/logo.ts). */
  logo: settings.logo,
  address: (locale: Locale): string | null => orNull(settings.address[locale]),
  hours: (locale: Locale): string | null => orNull(settings.hours[locale]),
} as const;
