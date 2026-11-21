/**
 * Site-wide files edited in the admin panel (administrators only):
 * - settings: src/content/settings/site.json (logo, contact details, demo switch), validated by settingsSchema;
 *   a new logo is stored in src/assets/brand/ (the only folder the site reads logos from);
 * - texts: src/content/ui/{ar,fr,en}.json. Wording only: the set of keys must stay exactly the same as the
 *   current Arabic file (developers add or remove texts in code).
 * Saved like content: one commit on a cms/ branch, a pull request, auto-merge after the checks.
 */
import { settingsSchema, type Settings } from '../../content/schemas';
import type { User } from './auth';
import { ContentError, decodeBase64, imageKind, LOCALES, type Locale, type SaveResult } from './content';
import type { FileChange, GitHub } from './github';

export const SETTINGS_PATH = 'src/content/settings/site.json';
const TEXT_PATH = (locale: Locale) => `src/content/ui/${locale}.json`;
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const MAX_TEXT = 2000;

export type TextTree = { [key: string]: string | TextTree };

async function publish(
  github: GitHub,
  user: User,
  kind: 'settings' | 'texts',
  title: string,
  changes: FileChange[],
  random: () => string,
): Promise<SaveResult> {
  const branch = `cms/${kind}-site-${Date.now().toString(36)}`;
  await github.commitToNewBranch(branch, `Update site ${kind}`, changes, { name: `${user.displayName} (admin panel)` });
  const pr = await github.openPullRequest(
    branch,
    title,
    ['Change made in the admin panel.', '', `Author: ${user.displayName} (${user.username})`, 'Awaiting approval: no'].join('\n'),
  );
  const autoMerge = await github.enableAutoMerge(pr.nodeId);
  return { slug: `${kind}-${random().slice(0, 4)}`, pr: pr.number, url: pr.url, awaitingApproval: false, autoMerge };
}

// ---------- Settings ----------
export async function readSettings(github: GitHub): Promise<{ settings: Settings; sha: string }> {
  const file = await github.readText(SETTINGS_PATH);
  if (!file) throw new ContentError(404, 'not_found');
  return { settings: settingsSchema.parse(JSON.parse(file.text)), sha: file.sha };
}

export async function saveSettings(
  github: GitHub,
  user: User,
  input: { settings?: unknown; sha?: unknown; logo?: { data?: unknown } | null },
  random: () => string,
): Promise<SaveResult> {
  const current = await readSettings(github);
  if (input.sha !== current.sha) throw new ContentError(409, 'changed_meanwhile');
  const submitted = (input.settings ?? {}) as Record<string, unknown>;
  const changes: FileChange[] = [];
  let logo = current.settings.logo;
  if (input.logo && typeof input.logo.data === 'string') {
    const bytes = decodeBase64(input.logo.data);
    const kind = imageKind(bytes);
    if (!kind || bytes.length > MAX_LOGO_BYTES) throw new ContentError(400, 'bad_image');
    const file = `logo-${random().slice(0, 8)}.${kind}`;
    changes.push({ path: `src/assets/brand/${file}`, content: input.logo.data, encoding: 'base64' });
    logo = `../../assets/brand/${file}`;
  }
  const result = settingsSchema.safeParse({ ...current.settings, ...submitted, logo });
  if (!result.success) {
    throw new ContentError(422, 'invalid', result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`));
  }
  changes.push({ path: SETTINGS_PATH, content: `${JSON.stringify(result.data, null, 2)}\n` });
  return publish(github, user, 'settings', 'تعديل · إعدادات الموقع', changes, random);
}

// ---------- Texts ----------
function shape(tree: TextTree, prefix = ''): string[] {
  return Object.entries(tree)
    .flatMap(([key, value]) => (typeof value === 'string' ? [`${prefix}${key}`] : shape(value, `${prefix}${key}.`)))
    .sort();
}

function checkTexts(tree: unknown, reference: string[], locale: Locale): TextTree {
  if (!tree || typeof tree !== 'object' || Array.isArray(tree)) throw new ContentError(400, 'bad_texts');
  const problems: string[] = [];
  const walk = (node: Record<string, unknown>, prefix: string) => {
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === 'string') {
        const text = value.trim();
        if (!text) problems.push(`${locale}.${prefix}${key}: empty`);
        if (text.length > MAX_TEXT) problems.push(`${locale}.${prefix}${key}: too long`);
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        walk(value as Record<string, unknown>, `${prefix}${key}.`);
      } else {
        problems.push(`${locale}.${prefix}${key}: not text`);
      }
    }
  };
  walk(tree as Record<string, unknown>, '');
  const keys = shape(tree as TextTree);
  if (keys.join('\n') !== reference.join('\n')) problems.push(`${locale}: the list of texts changed (only the wording can be edited)`);
  if (problems.length) throw new ContentError(422, 'invalid', problems.slice(0, 20));
  return tree as TextTree;
}

export async function readTexts(github: GitHub): Promise<{ texts: Record<Locale, TextTree>; shas: Record<Locale, string> }> {
  const files = await Promise.all(LOCALES.map((locale) => github.readText(TEXT_PATH(locale))));
  const texts = {} as Record<Locale, TextTree>;
  const shas = {} as Record<Locale, string>;
  LOCALES.forEach((locale, i) => {
    const file = files[i];
    if (!file) throw new ContentError(404, 'not_found');
    texts[locale] = JSON.parse(file.text) as TextTree;
    shas[locale] = file.sha;
  });
  return { texts, shas };
}

export async function saveTexts(
  github: GitHub,
  user: User,
  input: { locales?: Partial<Record<Locale, unknown>>; shas?: Partial<Record<Locale, unknown>> },
  random: () => string,
): Promise<SaveResult> {
  const current = await readTexts(github);
  const reference = shape(current.texts.ar);
  const changes: FileChange[] = [];
  for (const locale of LOCALES) {
    const tree = input.locales?.[locale];
    if (tree === undefined) continue;
    if (input.shas?.[locale] !== current.shas[locale]) throw new ContentError(409, 'changed_meanwhile', [locale]);
    const checked = checkTexts(tree, reference, locale);
    changes.push({ path: TEXT_PATH(locale), content: `${JSON.stringify(checked, null, 2)}\n` });
  }
  if (changes.length === 0) throw new ContentError(400, 'nothing_to_save');
  return publish(github, user, 'texts', 'تعديل · نصوص الموقع', changes, random);
}
