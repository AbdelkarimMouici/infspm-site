import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { siteSettingsCollection, siteTextsCollection, textFields } from '~/admin/collections';
import { settingsSchema } from '~/content/schemas';
import ar from '~/content/ui/ar.json';
import fr from '~/content/ui/fr.json';
import en from '~/content/ui/en.json';

type Tree = { [key: string]: string | Tree };
type Field = { name: string; widget: string; fields?: Field[] };

/** Paths of every text in a nested dictionary: "home.intro", … */
function paths(tree: Tree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string' ? [`${prefix}${key}`] : paths(value, `${prefix}${key}.`),
  );
}

/** Paths covered by the generated editor fields. */
function fieldPaths(fields: Field[], prefix = ''): string[] {
  return fields.flatMap((field) =>
    field.widget === 'object' ? fieldPaths(field.fields ?? [], `${prefix}${field.name}.`) : [`${prefix}${field.name}`],
  );
}

describe('CMS: site texts', () => {
  it('offers an editor field for every text, in every language file', () => {
    const collection = siteTextsCollection(ar as Tree) as { files: { name: string; file: string; fields: Field[] }[] };
    expect(collection.files.map((f) => f.name)).toEqual(['ar', 'fr', 'en']);
    for (const file of collection.files) {
      expect(fieldPaths(file.fields).sort()).toEqual(paths(ar as Tree).sort());
      expect(file.file).toBe(`src/content/ui/${file.name}.json`);
    }
  });

  it('keeps the same texts in Arabic, French and English', () => {
    const reference = paths(ar as Tree).sort();
    expect(paths(fr as Tree).sort()).toEqual(reference);
    expect(paths(en as Tree).sort()).toEqual(reference);
  });

  it('uses a multi-line editor for long texts', () => {
    const fields = textFields({ group: { short: 'Hi', long: 'x'.repeat(120) } }) as Field[];
    const inner = fields[0]?.fields ?? [];
    expect(inner.find((f) => f.name === 'short')?.widget).toBe('string');
    expect(inner.find((f) => f.name === 'long')?.widget).toBe('text');
  });
});

describe('CMS: site settings', () => {
  const settings = JSON.parse(readFileSync('src/content/settings/site.json', 'utf8')) as Record<string, unknown>;

  it('the committed settings file is valid', () => {
    expect(() => settingsSchema.parse(settings)).not.toThrow();
  });

  it('every settings field has an editor field', () => {
    const collection = siteSettingsCollection() as { files: { fields: Field[] }[] };
    const names = (collection.files[0]?.fields ?? []).map((f) => f.name).sort();
    expect(names).toEqual(Object.keys(settings).sort());
  });

  it('rejects a logo outside the brand folder and non-Facebook links', () => {
    expect(() => settingsSchema.parse({ ...settings, logo: '../../assets/uploads/photo.jpg' })).toThrow();
    expect(() => settingsSchema.parse({ ...settings, facebookUrl: 'https://evil.example/page' })).toThrow();
    expect(() => settingsSchema.parse({ ...settings, mapUrl: 'javascript:alert(1)' })).toThrow();
  });
});
