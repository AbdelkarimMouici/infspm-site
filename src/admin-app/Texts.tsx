/** @jsxImportSource preact */
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Locale, TextTree } from './api';
import { editorState } from './Editor';
import { errorText } from './Login';
import { Icon, Spinner, useApp } from './ui';

const LOCALES: { code: Locale; label: string; dir: 'rtl' | 'ltr' }[] = [
  { code: 'ar', label: 'العربية', dir: 'rtl' },
  { code: 'fr', label: 'Français', dir: 'ltr' },
  { code: 'en', label: 'English', dir: 'ltr' },
];

function flatten(tree: TextTree, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    if (typeof value === 'string') out[`${prefix}${key}`] = value;
    else Object.assign(out, flatten(value, `${prefix}${key}.`));
  }
  return out;
}

function setPath(tree: TextTree, path: string, value: string): void {
  const parts = path.split('.');
  let node = tree;
  parts.forEach((part, i) => {
    if (i === parts.length - 1) node[part] = value;
    else node = node[part] as TextTree;
  });
}

const humanize = (key: string) => key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\./g, ' › ');

export function TextsPage() {
  const { api, t, toast } = useApp();
  const [data, setData] = useState<{ texts: Record<Locale, TextTree>; shas: Record<Locale, string> } | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({}); // "locale|path" → value
  const [query, setQuery] = useState('');
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .texts()
      .then(setData)
      .catch((err: unknown) => setError(errorText(t, err).text));
    return () => {
      editorState.dirty = false;
    };
  }, []);

  const flat = useMemo(
    () => (data ? (Object.fromEntries(LOCALES.map((l) => [l.code, flatten(data.texts[l.code])])) as Record<Locale, Record<string, string>>) : null),
    [data],
  );

  if (error) return <p class="notice notice-error">{error}</p>;
  if (!data || !flat) {
    return (
      <div class="center-block">
        <Spinner label={t('loading')} />
      </div>
    );
  }

  const keys = Object.keys(flat.ar);
  const value = (locale: Locale, key: string) => edits[`${locale}|${key}`] ?? flat[locale][key] ?? '';
  const changed = (locale: Locale, key: string) => `${locale}|${key}` in edits && edits[`${locale}|${key}`] !== flat[locale][key];
  const changeCount = Object.keys(edits).filter((k) => {
    const [locale, key] = k.split('|') as [Locale, string];
    return changed(locale, key);
  }).length;

  const q = query.trim().toLowerCase();
  const shown = keys.filter((key) => {
    if (onlyChanged && !LOCALES.some((l) => changed(l.code, key))) return false;
    if (!q) return true;
    return key.toLowerCase().includes(q) || LOCALES.some((l) => value(l.code, key).toLowerCase().includes(q));
  });
  const groups = [...new Set(shown.map((key) => key.split('.')[0] ?? ''))];

  const edit = (locale: Locale, key: string, next: string) => {
    setEdits({ ...edits, [`${locale}|${key}`]: next });
    editorState.dirty = true;
  };

  const save = async () => {
    const empty = Object.entries(edits).filter(([, v]) => !v.trim());
    if (empty.length > 0) {
      toast('error', t('textEmpty'), empty.map(([k]) => k.replace('|', ' · ')));
      return;
    }
    const locales: Partial<Record<Locale, TextTree>> = {};
    const shas: Partial<Record<Locale, string>> = {};
    for (const [k, v] of Object.entries(edits)) {
      const [locale, key] = k.split('|') as [Locale, string];
      if (!changed(locale, key)) continue;
      locales[locale] ??= structuredClone(data.texts[locale]);
      shas[locale] = data.shas[locale];
      setPath(locales[locale], key, v.trim());
    }
    if (Object.keys(locales).length === 0) return;
    setSaving(true);
    try {
      await api.saveTexts({ locales, shas });
      editorState.dirty = false;
      toast('success', t('savedPublished'));
      setData(await api.texts());
      setEdits({});
    } catch (err) {
      const message = errorText(t, err);
      toast('error', message.text, message.detail);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div class="page">
      <header class="page-head">
        <div class="page-head-title">
          <span class="head-icon">
            <Icon name="text" size={22} />
          </span>
          <div>
            <h1 class="page-title">{t('textsTitle')}</h1>
            <p class="muted small">{t('textsLead')}</p>
          </div>
        </div>
      </header>

      <div class="toolbar">
        <label class="search">
          <Icon name="search" size={18} />
          <span class="sr-only">{t('search')}</span>
          <input type="search" class="search-input" placeholder={t('search')} value={query} onInput={(e) => setQuery((e.target as HTMLInputElement).value)} />
        </label>
        <button type="button" class="filter" aria-pressed={onlyChanged} onClick={() => setOnlyChanged(!onlyChanged)}>
          {t('onlyChanged')}
        </button>
      </div>

      {groups.length === 0 && (
        <div class="empty">
          <Icon name="text" size={40} />
          <p>{t('noResults')}</p>
        </div>
      )}

      {groups.map((group) => (
        <section class="panel text-group" key={group} aria-labelledby={`g-${group}`}>
          <h2 id={`g-${group}`} class="panel-title">
            {humanize(group)}
          </h2>
          <div class="text-rows">
            {shown
              .filter((key) => key.split('.')[0] === group)
              .map((key) => (
                <div class="text-row" key={key}>
                  <p class="text-key" dir="ltr">
                    {humanize(key.split('.').slice(1).join('.') || key)}
                  </p>
                  <div class="text-cells">
                    {LOCALES.map((l) => {
                      const id = `t-${l.code}-${key}`;
                      const v = value(l.code, key);
                      return (
                        <div class={`text-cell ${changed(l.code, key) ? 'is-changed' : ''}`} key={l.code}>
                          <label class="sr-only" for={id}>
                            {`${key} · ${l.label}`}
                          </label>
                          <span class="text-lang" aria-hidden="true">
                            {l.code === 'ar' ? 'ع' : l.code.toUpperCase()}
                          </span>
                          <textarea
                            id={id}
                            class="input text-input"
                            dir={l.dir}
                            lang={l.code}
                            rows={Math.min(6, Math.max(1, Math.ceil(v.length / 48)))}
                            value={v}
                            onInput={(e) => edit(l.code, key, (e.target as HTMLTextAreaElement).value)}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
          </div>
        </section>
      ))}

      {changeCount > 0 && (
        <div class="save-bar" role="region" aria-label={t('save')}>
          <span>{t('changedCount', changeCount)}</span>
          <button
            type="button"
            class="btn btn-ghost btn-small"
            onClick={() => {
              setEdits({});
              editorState.dirty = false;
            }}
          >
            {t('cancel')}
          </button>
          <button type="button" class="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? <Spinner /> : <Icon name="check" size={18} />}
            {saving ? t('saving') : t('save')}
          </button>
        </div>
      )}
    </div>
  );
}
