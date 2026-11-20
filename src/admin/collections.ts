/**
 * CMS collections built in code (merged with public/admin/config.yml by src/admin/cms.ts):
 * - "Settings": logo and contact details (src/content/settings/site.json, validated by settingsSchema);
 * - "Site texts": every interface text in Arabic, French and English (src/content/ui/*.json).
 *   The fields are generated from the Arabic file, so a new text added by a developer appears in the
 *   editor automatically. Editors change wording only; keys cannot be added or removed here.
 * Kept free of Decap imports so it can be unit-tested (tests/cms-collections.test.ts).
 */

type Field = Record<string, unknown>;
type Tree = { [key: string]: string | Tree };

const LOCALES = [
  { code: 'ar', label: 'العربية' },
  { code: 'fr', label: 'Français' },
  { code: 'en', label: 'English' },
] as const;

/** Human label for a key: "latestNews" → "Latest news". */
function humanize(key: string): string {
  const words = key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
}

/** One editor field per text; groups become collapsible sections. The Arabic text is shown as a hint. */
export function textFields(tree: Tree, reference: Tree = tree): Field[] {
  return Object.entries(tree).map(([key, value]) => {
    const ref = reference[key];
    if (typeof value === 'string') {
      return {
        name: key,
        label: humanize(key),
        widget: value.length > 90 ? 'text' : 'string',
        hint: typeof ref === 'string' ? `AR: ${ref}` : undefined,
      };
    }
    return {
      name: key,
      label: humanize(key),
      widget: 'object',
      collapsed: true,
      fields: textFields(value, typeof ref === 'object' ? ref : value),
    };
  });
}

export function siteTextsCollection(reference: Tree): Field {
  return {
    name: 'texts',
    label: 'نصوص الموقع / Textes du site / Site texts',
    description:
      'Every text of the menus, buttons, home page journey and page titles. Edit the wording only; keep it short and official.',
    editor: { preview: false },
    delete: false,
    files: LOCALES.map(({ code, label }) => ({
      name: code,
      label,
      file: `src/content/ui/${code}.json`,
      format: 'json',
      fields: textFields(reference),
    })),
  };
}

const localized = (name: string, label: string, widget = 'string'): Field => ({
  name,
  label,
  widget: 'object',
  fields: LOCALES.map(({ code, label: language }) => ({ name: code, label: language, widget, required: false })),
});

export function siteSettingsCollection(): Field {
  return {
    name: 'settings',
    label: 'الإعدادات / Réglages / Settings',
    description: 'Logo and contact details. Leave a value empty until it is officially confirmed.',
    editor: { preview: false },
    delete: false,
    files: [
      {
        name: 'site',
        label: 'Site settings',
        file: 'src/content/settings/site.json',
        format: 'json',
        fields: [
          {
            name: 'logo',
            label: 'Logo',
            hint: 'Square image (PNG or SVG, transparent background, at least 512 × 512). Shown in the header, footer and browser tab.',
            widget: 'image',
            choose_url: false,
            media_folder: '/src/assets/brand',
            public_folder: '../../assets/brand',
          },
          {
            name: 'showExamples',
            label: 'Show demo content on preview links',
            hint: 'Sample programs, news and activities for reviewing the design on preview links (…pages.dev branch previews). They are never shown on the live site.',
            widget: 'boolean',
            default: false,
          },
          {
            name: 'email',
            label: 'Official email',
            widget: 'string',
            pattern: ['^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$', 'Enter a valid email address'],
          },
          { name: 'phone', label: 'Phone', widget: 'string', required: false },
          localized('address', 'Address'),
          localized('hours', 'Opening hours', 'text'),
          {
            name: 'facebookUrl',
            label: 'Facebook page (link)',
            widget: 'string',
            required: false,
            pattern: ['^(https://([a-z0-9-]+\\.)?facebook\\.com/.+)?$', 'Use the full https://www.facebook.com/… link'],
          },
          {
            name: 'mapUrl',
            label: 'Map link (e.g. OpenStreetMap)',
            widget: 'string',
            required: false,
            pattern: ['^(https://.+)?$', 'Use a full https:// link'],
          },
        ],
      },
    ],
  };
}
