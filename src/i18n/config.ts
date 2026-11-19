export const locales = ['ar', 'fr', 'en'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'ar';

export const localeMeta: Record<
  Locale,
  { dir: 'rtl' | 'ltr'; label: string; hreflang: string; ogLocale: string }
> = {
  ar: { dir: 'rtl', label: 'العربية', hreflang: 'ar', ogLocale: 'ar_AR' },
  fr: { dir: 'ltr', label: 'Français', hreflang: 'fr', ogLocale: 'fr_FR' },
  en: { dir: 'ltr', label: 'English', hreflang: 'en', ogLocale: 'en_US' },
};
