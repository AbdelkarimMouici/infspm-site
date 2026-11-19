export const locales = ['ar', 'fr'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'ar';

export const localeMeta: Record<Locale, { dir: 'rtl' | 'ltr'; label: string; hreflang: string }> = {
  ar: { dir: 'rtl', label: 'العربية', hreflang: 'ar' },
  fr: { dir: 'ltr', label: 'Français', hreflang: 'fr' },
};
