/** @jsxImportSource preact */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Collection, Front, Locale, LocaleDoc, SavePayload } from './api';
import { COLLECTION_META } from './Dashboard';
import type { AdminKey } from './i18n';
import { prepareImage, type PreparedImage } from './image';
import { errorText } from './Login';
import { changeTarget } from './pending';
import { renderMarkdown } from './markdown';
import { formatDate, Icon, Spinner, useApp, useConfirm, type IconName } from './ui';

const LOCALES: Locale[] = ['ar', 'fr', 'en'];
const LOCALE_LABEL: Record<Locale, string> = { ar: 'العربية', fr: 'Français', en: 'English' };
const DIR: Record<Locale, 'rtl' | 'ltr'> = { ar: 'rtl', fr: 'ltr', en: 'ltr' };

interface Field {
  name: string;
  label: AdminKey;
  kind: 'text' | 'textarea' | 'date' | 'number' | 'select';
  required?: boolean;
  max?: number;
  /** Select fields: fixed choices, or the list of programs (loaded from the server). */
  options?: 'programs' | readonly { value: string; label: AdminKey }[];
  /** Left-to-right value (links, abbreviations). */
  ltr?: boolean;
  hint?: AdminKey;
}

// Named colours and icons (same lists as src/content/schemas.ts; the server validates them).
export const COLOR_OPTIONS = [
  { value: 'navy', label: 'colorNavy' },
  { value: 'sky', label: 'colorSky' },
  { value: 'rose', label: 'colorRose' },
  { value: 'violet', label: 'colorViolet' },
  { value: 'teal', label: 'colorTeal' },
  { value: 'amber', label: 'colorAmber' },
] as const satisfies readonly { value: string; label: AdminKey }[];

const ICON_OPTIONS = [
  { value: 'graduation', label: 'iconGraduation' },
  { value: 'baby', label: 'iconBaby' },
  { value: 'stethoscope', label: 'iconStethoscope' },
  { value: 'syringe', label: 'iconSyringe' },
  { value: 'xray', label: 'iconXray' },
  { value: 'microscope', label: 'iconMicroscope' },
  { value: 'care', label: 'iconCare' },
  { value: 'flask', label: 'iconFlask' },
  { value: 'heart', label: 'iconHeart' },
  { value: 'cross', label: 'iconCross' },
  { value: 'news', label: 'iconNews' },
  { value: 'calendar', label: 'iconCalendar' },
  { value: 'megaphone', label: 'iconMegaphone' },
  { value: 'star', label: 'iconStar' },
] as const satisfies readonly { value: string; label: AdminKey }[];

const CONFIG: Record<Collection, { shared: Field[]; local: Field[]; images: 'list' | 'single' | 'none'; body?: false }> = {
  news: {
    shared: [{ name: 'date', label: 'fDate', kind: 'date', required: true }],
    local: [
      { name: 'title', label: 'fTitle', kind: 'text', required: true, max: 200 },
      { name: 'summary', label: 'fSummary', kind: 'textarea', max: 400 },
    ],
    images: 'list',
  },
  activities: {
    shared: [
      { name: 'date', label: 'fDate', kind: 'date', required: true },
      { name: 'endDate', label: 'fEndDate', kind: 'date' },
    ],
    local: [
      { name: 'title', label: 'fTitle', kind: 'text', required: true, max: 200 },
      { name: 'summary', label: 'fSummary', kind: 'textarea', max: 400 },
      { name: 'location', label: 'fLocation', kind: 'text', max: 200 },
    ],
    images: 'list',
  },
  programs: {
    shared: [
      { name: 'order', label: 'fOrder', kind: 'number' },
      { name: 'abbr', label: 'fAbbr', kind: 'text', max: 12, ltr: true },
      { name: 'color', label: 'fColor', kind: 'select', options: COLOR_OPTIONS, required: true },
      { name: 'icon', label: 'fIcon', kind: 'select', options: ICON_OPTIONS, required: true },
    ],
    local: [
      { name: 'title', label: 'fTitle', kind: 'text', required: true, max: 200 },
      { name: 'shortTitle', label: 'fShortTitle', kind: 'text', max: 40, hint: 'hShortTitle' },
      { name: 'summary', label: 'fSummary', kind: 'textarea', max: 400 },
      { name: 'duration', label: 'fDuration', kind: 'text', max: 120 },
      { name: 'diploma', label: 'fDiploma', kind: 'text', max: 200 },
      { name: 'admission', label: 'fAdmission', kind: 'textarea', max: 600 },
    ],
    images: 'single',
  },
  stories: {
    shared: [
      { name: 'order', label: 'fOrder', kind: 'number' },
      { name: 'program', label: 'fProgram', kind: 'select', options: 'programs', hint: 'hProgram' },
      { name: 'color', label: 'fColor', kind: 'select', options: COLOR_OPTIONS, required: true },
      { name: 'icon', label: 'fIcon', kind: 'select', options: ICON_OPTIONS, required: true },
      { name: 'link', label: 'fLink', kind: 'text', max: 300, ltr: true, hint: 'hLink' },
    ],
    local: [
      { name: 'title', label: 'fStoryTitle', kind: 'text', required: true, max: 60 },
      { name: 'summary', label: 'fStoryText', kind: 'textarea', max: 300 },
      { name: 'linkLabel', label: 'fLinkLabel', kind: 'text', max: 40 },
    ],
    images: 'list',
    body: false,
  },
  pages: {
    shared: [],
    local: [
      { name: 'title', label: 'fTitle', kind: 'text', required: true, max: 200 },
      { name: 'description', label: 'fDescription', kind: 'textarea', required: true, max: 170 },
    ],
    images: 'none',
  },
};

interface ImageItem {
  key: string;
  src: string; // existing path or "upload:<id>"
  preview: string;
  alts: Partial<Record<Locale, string>>;
}

interface LocaleState {
  present: boolean;
  fields: Record<string, string>;
  body: string;
  needsReview: boolean;
}

/** Shared with App.tsx: navigation asks before leaving unsaved changes. */
export const editorState = { dirty: false };

const str = (value: unknown): string => (value === undefined || value === null ? '' : String(value));

function imagesOf(data: Front | undefined): { src: string; alt: string }[] {
  if (!data) return [];
  const list = data['images'];
  if (Array.isArray(list)) {
    return list
      .filter((i): i is Record<string, Front[string]> => Boolean(i) && typeof i === 'object' && !Array.isArray(i))
      .map((i) => ({ src: str(i['src']), alt: str(i['alt']) }));
  }
  const single = data['image'];
  if (single && typeof single === 'object' && !Array.isArray(single)) return [{ src: str(single['src']), alt: str(single['alt']) }];
  return [];
}

// ---------- Markdown editor ----------
function MarkdownField({ value, onChange, dir, id }: { value: string; onChange: (v: string) => void; dir: 'rtl' | 'ltr'; id: string }) {
  const { t } = useApp();
  const area = useRef<HTMLTextAreaElement>(null);

  const apply = (kind: string) => {
    const el = area.current;
    if (!el) return;
    const { selectionStart: start, selectionEnd: end } = el;
    const selected = value.slice(start, end);
    let insert = selected;
    let cursor = 0;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const prefixLines = (prefix: (i: number) => string) => {
      const before = value.slice(0, lineStart);
      const block = value.slice(lineStart, end) || '';
      const lines = (block || ' ').split('\n').map((line, i) => `${prefix(i)}${line.replace(/^(#{2,3} |[-*] |\d+\. |> )/, '')}`);
      const next = `${before}${lines.join('\n')}${value.slice(end)}`;
      onChange(next);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(lineStart, lineStart + lines.join('\n').length);
      });
    };
    switch (kind) {
      case 'bold':
        insert = `**${selected || '…'}**`;
        cursor = selected ? insert.length : 2;
        break;
      case 'italic':
        insert = `*${selected || '…'}*`;
        cursor = selected ? insert.length : 1;
        break;
      case 'link': {
        const url = window.prompt(t('linkPrompt'), 'https://');
        if (!url || !/^(https:\/\/|mailto:)/.test(url)) return;
        insert = `[${selected || url}](${url})`;
        cursor = insert.length;
        break;
      }
      case 'h2':
        return prefixLines(() => '## ');
      case 'h3':
        return prefixLines(() => '### ');
      case 'list':
        return prefixLines(() => '- ');
      case 'olist':
        return prefixLines((i) => `${i + 1}. `);
      case 'quote':
        return prefixLines(() => '> ');
      default:
        return;
    }
    const next = value.slice(0, start) + insert + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + cursor, start + (selected ? insert.length : cursor + 1));
    });
  };

  const tools: [string, IconName, AdminKey][] = [
    ['bold', 'bold', 'mdBold'],
    ['italic', 'italic', 'mdItalic'],
    ['h2', 'h', 'mdH2'],
    ['h3', 'text', 'mdH3'],
    ['list', 'list', 'mdList'],
    ['olist', 'olist', 'mdNumbered'],
    ['quote', 'quote', 'mdQuote'],
    ['link', 'link', 'mdLink'],
  ];
  return (
    <div class="md">
      <div class="md-tools" role="toolbar" aria-label={t('fBody')}>
        {tools.map(([kind, icon, label]) => (
          <button type="button" key={kind} class="md-tool" onClick={() => apply(kind)} title={t(label)} aria-label={t(label)}>
            <Icon name={icon} size={18} />
          </button>
        ))}
      </div>
      <textarea
        id={id}
        ref={area}
        class="input md-area"
        dir={dir}
        value={value}
        onInput={(e) => onChange((e.target as HTMLTextAreaElement).value)}
        rows={14}
      />
    </div>
  );
}

// ---------- Images ----------
function ImagesField({
  mode,
  items,
  setItems,
  locale,
  onUpload,
}: {
  mode: 'list' | 'single';
  items: ImageItem[];
  setItems: (items: ImageItem[]) => void;
  locale: Locale;
  onUpload: (image: PreparedImage) => void;
}) {
  const { t, toast } = useApp();
  const [busy, setBusy] = useState(0);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const add = async (files: FileList | File[]) => {
    const list = Array.from(files).slice(0, mode === 'single' ? 1 : 10);
    setBusy((n) => n + list.length);
    const added: ImageItem[] = [];
    for (const file of list) {
      try {
        const image = await prepareImage(file);
        onUpload(image);
        added.push({ key: image.id, src: `upload:${image.id}`, preview: image.url, alts: {} });
      } catch {
        toast('error', t('imageError'));
      } finally {
        setBusy((n) => n - 1);
      }
    }
    setItems(mode === 'single' ? added.slice(0, 1) : [...items, ...added]);
  };

  const move = (index: number, delta: number) => {
    const next = [...items];
    const [item] = next.splice(index, 1);
    if (!item) return;
    next.splice(index + delta, 0, item);
    setItems(next);
  };

  return (
    <div class="images">
      {items.length > 0 && (
        <ul class="image-list" role="list">
          {items.map((item, index) => (
            <li class="image-item" key={item.key}>
              <img src={item.preview} alt="" class="image-thumb" />
              <div class="image-meta">
                <label class="field">
                  <span class="label">
                    {t('alt')} · {LOCALE_LABEL[locale]}
                  </span>
                  <input
                    class="input"
                    dir={DIR[locale]}
                    value={item.alts[locale] ?? ''}
                    maxLength={250}
                    onInput={(e) => {
                      const value = (e.target as HTMLInputElement).value;
                      setItems(items.map((i) => (i.key === item.key ? { ...i, alts: { ...i.alts, [locale]: value } } : i)));
                    }}
                  />
                </label>
                <div class="image-actions">
                  {mode === 'list' && index > 0 && (
                    <button type="button" class="icon-btn" onClick={() => move(index, -1)} aria-label={t('moveUp')} title={t('moveUp')}>
                      <Icon name="up" size={18} />
                    </button>
                  )}
                  {mode === 'list' && index < items.length - 1 && (
                    <button type="button" class="icon-btn" onClick={() => move(index, 1)} aria-label={t('moveDown')} title={t('moveDown')}>
                      <Icon name="down" size={18} />
                    </button>
                  )}
                  <button type="button" class="icon-btn danger" onClick={() => setItems(items.filter((i) => i.key !== item.key))} aria-label={t('remove')} title={t('remove')}>
                    <Icon name="trash" size={18} />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {(mode === 'list' || items.length === 0) && (
        <button
          type="button"
          class={`drop ${over ? 'is-over' : ''}`}
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            if (e.dataTransfer?.files) void add(e.dataTransfer.files);
          }}
        >
          {busy > 0 ? <Spinner label={t('processing')} /> : <Icon name="image" size={28} />}
          <span class="drop-title">{busy > 0 ? t('processing') : t('dropImages')}</span>
          <span class="hint">{t('dropHint')}</span>
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        multiple={mode === 'list'}
        hidden
        onChange={(e) => {
          const files = (e.target as HTMLInputElement).files;
          if (files) void add(files);
          (e.target as HTMLInputElement).value = '';
        }}
      />
      <p class="hint consent">
        <Icon name="alert" size={16} />
        {t('photoConsent')}
      </p>
    </div>
  );
}

// ---------- Preview (looks like the site) ----------
function Preview({ collection, locale, state, shared, images }: { collection: Collection; locale: Locale; state: LocaleState; shared: Record<string, string>; images: ImageItem[] }) {
  const { t } = useApp();
  const html = useMemo(() => renderMarkdown(state.body), [state.body]);
  const title = state.fields['title'] || '';
  const lead = state.fields['summary'] || state.fields['description'] || '';
  const meta = [shared['date'] ? formatDate(shared['date'], locale === 'ar' ? 'ar' : 'fr') : '', state.fields['location'] ?? ''].filter(Boolean).join(' · ');
  if (!state.present) return <div class="preview-empty">{t('previewEmpty')}</div>;
  if (collection === 'stories') {
    return (
      <div class="story-preview" lang={locale} dir={DIR[locale]}>
        <div class={`story-phone c-${shared['color'] || 'navy'}`}>
          <div class="story-phone-bars" aria-hidden="true">
            {Array.from({ length: Math.max(1, (lead ? 1 : 0) + images.length) }, (_, i) => (
              <span key={i} class={i === 0 ? 'on' : ''} />
            ))}
          </div>
          {images[0] && !lead ? (
            <div class="story-phone-photo">
              <img src={images[0].preview} alt={images[0].alts[locale] ?? ''} />
              <p>{title || '…'}</p>
            </div>
          ) : (
            <div class="story-phone-text">
              <p class="story-phone-title">{title || '…'}</p>
              {lead && <p>{lead}</p>}
            </div>
          )}
          {shared['link'] && <span class="story-phone-cta">{state.fields['linkLabel'] || shared['link']}</span>}
        </div>
        {images.length > 0 && (
          <div class="story-strip">
            {images.map((image) => (
              <img key={image.key} src={image.preview} alt={image.alts[locale] ?? ''} />
            ))}
          </div>
        )}
      </div>
    );
  }
  return (
    <article class="preview" lang={locale} dir={DIR[locale]}>
      <div class="preview-hero">
        {meta && <p class="preview-meta">{meta}</p>}
        <h1 class="preview-title">{title || '…'}</h1>
        {lead && <p class="preview-lead">{lead}</p>}
      </div>
      {collection === 'programs' && (state.fields['duration'] || state.fields['diploma'] || state.fields['admission']) && (
        <dl class="preview-facts">
          {state.fields['duration'] && (
            <div>
              <dt>{t('fDuration')}</dt>
              <dd>{state.fields['duration']}</dd>
            </div>
          )}
          {state.fields['diploma'] && (
            <div>
              <dt>{t('fDiploma')}</dt>
              <dd>{state.fields['diploma']}</dd>
            </div>
          )}
          {state.fields['admission'] && (
            <div>
              <dt>{t('fAdmission')}</dt>
              <dd>{state.fields['admission']}</dd>
            </div>
          )}
        </dl>
      )}
      {images[0] && <img class="preview-image" src={images[0].preview} alt={images[0].alts[locale] ?? ''} />}
      {/* Rendered by renderMarkdown: every character is escaped first; only safe tags are produced. */}
      <div class="preview-prose" dangerouslySetInnerHTML={{ __html: html }} />
      {images.length > 1 && (
        <div class="preview-gallery">
          {images.slice(1).map((image) => (
            <img key={image.key} src={image.preview} alt={image.alts[locale] ?? ''} />
          ))}
        </div>
      )}
    </article>
  );
}

// ---------- Editor ----------
export function Editor({ collection, slug }: { collection: Collection; slug: string | null }) {
  const { api, t, user, toast, navigate, lang } = useApp();
  const config = CONFIG[collection];
  const [original, setOriginal] = useState<Partial<Record<Locale, LocaleDoc>> | null>(slug ? null : {});
  const [error, setError] = useState<string | null>(null);
  const [locales, setLocales] = useState<Record<Locale, LocaleState>>(() => ({
    ar: { present: true, fields: {}, body: '', needsReview: false },
    fr: { present: false, fields: {}, body: '', needsReview: true },
    en: { present: false, fields: {}, body: '', needsReview: true },
  }));
  const [shared, setShared] = useState<Record<string, string>>(() => ({
    status: 'draft',
    ...(collection === 'news' || collection === 'activities' ? { date: new Date().toISOString().slice(0, 10) } : {}),
    ...(collection === 'programs' ? { order: '100', color: 'navy', icon: 'graduation' } : {}),
    ...(collection === 'stories' ? { order: '100', color: 'navy', icon: 'star' } : {}),
  }));
  // Choices for "linked program" (stories): loaded once from the programs list.
  const [programOptions, setProgramOptions] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    if (!config.shared.some((f) => f.options === 'programs')) return;
    api
      .list('programs')
      .then((list) => setProgramOptions(list.map((p) => ({ value: p.slug, label: p.locales.ar?.title ?? p.locales.fr?.title ?? p.slug }))))
      .catch(() => undefined);
  }, [collection]);
  const [images, setImages] = useState<ImageItem[]>([]);
  const uploads = useRef(new Map<string, PreparedImage>());
  const [active, setActive] = useState<Locale>(lang === 'fr' ? 'fr' : 'ar');
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirtyState] = useState(false);
  const [published, setPublished] = useState<string | null>(null);
  const [pendingElsewhere, setPendingElsewhere] = useState(false);
  const [makeReal, setMakeReal] = useState(false);
  const [confirm, confirmElement] = useConfirm();

  const setDirty = (value: boolean) => {
    editorState.dirty = value;
    setDirtyState(value);
  };

  useEffect(() => {
    if (!slug) return;
    api
      .changes()
      .then((open) => setPendingElsewhere(open.some((c) => changeTarget(c)?.collection === collection && changeTarget(c)?.slug === slug)))
      .catch(() => undefined);
    api
      .load(collection, slug)
      .then((docs) => {
        setOriginal(docs);
        const first = docs.ar ?? docs.fr ?? docs.en;
        setShared({
          status: str(first?.data['status']) || 'draft',
          ...Object.fromEntries(config.shared.map((f) => [f.name, str(first?.data[f.name])])),
        });
        const base = imagesOf(first?.data);
        setImages(
          base.map((image, index) => ({
            key: `${index}-${image.src}`,
            src: image.src,
            preview: api.imageUrl(image.src),
            alts: Object.fromEntries(LOCALES.map((l) => [l, imagesOf(docs[l]?.data)[index]?.alt ?? ''])) as Partial<Record<Locale, string>>,
          })),
        );
        setLocales(
          Object.fromEntries(
            LOCALES.map((l) => {
              const doc = docs[l];
              return [
                l,
                {
                  present: Boolean(doc),
                  fields: Object.fromEntries(config.local.map((f) => [f.name, str(doc?.data[f.name])])),
                  body: doc?.body ?? '',
                  needsReview: doc ? doc.data['needs-review'] === true : l !== 'ar',
                },
              ];
            }),
          ) as Record<Locale, LocaleState>,
        );
        if (!docs[active]) setActive(docs.ar ? 'ar' : docs.fr ? 'fr' : 'en');
      })
      .catch((err: unknown) => setError(errorText(t, err).text));
  }, [collection, slug]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (editorState.dirty) event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      editorState.dirty = false;
    };
  }, []);

  const current = locales[active];
  const updateLocal = (patch: Partial<LocaleState>) => {
    setLocales({ ...locales, [active]: { ...current, ...patch } });
    setDirty(true);
  };
  const updateField = (name: string, value: string) => updateLocal({ fields: { ...current.fields, [name]: value } });
  const updateShared = (name: string, value: string) => {
    setShared({ ...shared, [name]: value });
    setDirty(true);
  };

  const validate = (): string[] => {
    const problems: string[] = [];
    if (!locales.ar.present || !locales.ar.fields['title']?.trim()) problems.push(t('errArabic'));
    for (const field of config.shared) if (field.required && !shared[field.name]) problems.push(`${t(field.label)}: ${t('required')}`);
    for (const l of LOCALES) {
      if (!locales[l].present) continue;
      for (const field of config.local) {
        if (field.required && !locales[l].fields[field.name]?.trim()) problems.push(`${LOCALE_LABEL[l]} · ${t(field.label)}: ${t('required')}`);
      }
    }
    if (images.some((image) => !(image.alts.ar ?? '').trim())) problems.push(t('errAlt'));
    if (shared['endDate'] && shared['date'] && shared['endDate'] < shared['date']) problems.push(t('errEndDate'));
    return problems;
  };

  const isDemo = LOCALES.some((l) => original?.[l]?.data['example'] === true);
  const save = async () => {
    const problems = validate();
    if (problems.length > 0) {
      toast('error', t('errInvalid'), problems);
      return;
    }
    setSaving(true);
    const payload: SavePayload = { locales: {}, uploads: [] };
    for (const l of LOCALES) {
      const state = locales[l];
      if (!state.present) continue;
      const data: Front = { status: shared['status'] ?? 'draft' };
      for (const field of config.shared) {
        const value = shared[field.name] ?? '';
        data[field.name] = field.kind === 'number' && value ? Number(value) : value;
      }
      for (const field of config.local) data[field.name] = (state.fields[field.name] ?? '').trim();
      data['needs-review'] = l === 'ar' ? (original?.ar?.data['needs-review'] === true) : state.needsReview;
      if (isDemo && makeReal) data['example'] = false;
      if (config.images === 'list') {
        data['images'] = images.map((i) => ({ src: i.src, alt: (i.alts[l] || i.alts.ar || '').trim() }));
      } else if (config.images === 'single') {
        const first = images[0];
        data['image'] = first ? { src: first.src, alt: (first.alts[l] || first.alts.ar || '').trim() } : '';
      }
      payload.locales[l] = { data, body: state.body, sha: original?.[l]?.sha ?? null };
    }
    for (const image of images) {
      const upload = image.src.startsWith('upload:') ? uploads.current.get(image.src.slice(7)) : undefined;
      if (upload) payload.uploads.push({ id: upload.id, data: upload.data });
    }
    try {
      const result = await api.save(collection, slug, payload);
      setDirty(false);
      const message = result.awaitingApproval ? t('savedReview') : shared['status'] === 'published' ? t('savedPublished') : t('savedDraft');
      toast('success', message);
      setPublished(message);
      if (!slug) navigate(`#/c/${collection}/${result.slug}`);
    } catch (err) {
      const message = errorText(t, err);
      toast('error', message.text, message.detail);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!slug || !(await confirm(t('confirmDelete')))) return;
    try {
      await api.remove(collection, slug);
      setDirty(false);
      toast('success', t('deleted'));
      navigate(`#/c/${collection}`);
    } catch (err) {
      toast('error', errorText(t, err).text);
    }
  };

  if (error) {
    return (
      <div class="page">
        <p class="notice notice-error">{error}</p>
        <button type="button" class="btn btn-ghost" onClick={() => navigate(`#/c/${collection}`)}>
          <Icon name="back" class="flip-rtl" />
          {t('back')}
        </button>
      </div>
    );
  }
  if (!original) {
    return (
      <div class="center-block">
        <Spinner label={t('loading')} />
      </div>
    );
  }

  const publishing = shared['status'] === 'published';
  const primaryLabel = publishing ? (user.role === 'admin' ? t('publishNow') : t('sendForReview')) : t('save');
  const titleText = locales.ar.fields['title'] || locales.fr.fields['title'] || (slug ? slug : t('newItem'));

  return (
    <div class="editor">
      {confirmElement}
      <header class="editor-bar">
        <button type="button" class="icon-btn" onClick={() => navigate(`#/c/${collection}`)} aria-label={t('back')} title={t('back')}>
          <Icon name="back" class="flip-rtl" />
        </button>
        <div class="editor-bar-title">
          <span class="muted small">{t(COLLECTION_META[collection].label)}</span>
          <span class="editor-title">{titleText}</span>
        </div>
        <span class={`dirty-dot ${dirty ? 'is-on' : ''}`} aria-hidden="true" />
        <button
          type="button"
          class="btn btn-ghost hide-wide"
          onClick={() => setShowPreview(!showPreview)}
          aria-pressed={showPreview}
          aria-label={showPreview ? t('edit') : t('preview')}
        >
          <Icon name={showPreview ? 'text' : 'eye'} size={18} />
          <span class="btn-label">{showPreview ? t('edit') : t('preview')}</span>
        </button>
        {slug && user.role === 'admin' && collection !== 'pages' && (
          <button type="button" class="icon-btn danger" onClick={remove} aria-label={t('delete')} title={t('delete')}>
            <Icon name="trash" />
          </button>
        )}
        <button type="button" class="btn btn-primary" disabled={saving} onClick={save}>
          {saving ? <Spinner /> : <Icon name={publishing ? 'globe' : 'check'} size={18} />}
          {saving ? t('saving') : primaryLabel}
        </button>
      </header>

      {isDemo && !published && (
        <div class="notice notice-warn editor-notice demo-notice">
          <Icon name="alert" size={18} />
          <div>
            <p>{t('demoEditor')}</p>
            <label class="check">
              <input type="checkbox" checked={makeReal} onChange={(e) => { setMakeReal((e.target as HTMLInputElement).checked); setDirty(true); }} />
              {t('demoMakeReal')}
            </label>
            <p class="hint">{t('demoMakeRealHint')}</p>
          </div>
        </div>
      )}
      {pendingElsewhere && !published && (
        <p class="notice notice-warn editor-notice">
          <Icon name="clock" size={18} />
          {t('pendingEditor')}
        </p>
      )}
      {published && (
        <p class="notice notice-ok editor-notice">
          <Icon name="clock" size={18} />
          {published}
        </p>
      )}

      <div class={`editor-body ${showPreview ? 'show-preview' : ''}`}>
        <section class="editor-form" aria-label={t('edit')}>
          <div class="panel">
            <div class="row">
              <div class="field grow">
                <label class="label" for="shared-status">
                  {t('status')}
                </label>
                <select id="shared-status" class="input" value={shared['status']} onChange={(e) => updateShared('status', (e.target as HTMLSelectElement).value)}>
                  <option value="draft">{t('statusDraft')}</option>
                  <option value="published">{t('statusPublished')}</option>
                </select>
              </div>
              {config.shared.map((field) => (
                <div class="field grow" key={field.name}>
                  <label class="label" for={`shared-${field.name}`}>
                    {t(field.label)}
                    {field.required && <span class="req" aria-hidden="true"> *</span>}
                  </label>
                  {field.kind === 'select' ? (
                    <select
                      id={`shared-${field.name}`}
                      class={`input ${field.name === 'color' ? `swatch c-${shared[field.name] ?? 'navy'}` : ''}`}
                      value={shared[field.name] ?? ''}
                      onChange={(e) => updateShared(field.name, (e.target as HTMLSelectElement).value)}
                      required={field.required}
                    >
                      {field.options === 'programs' ? (
                        <>
                          <option value="">{t('noProgram')}</option>
                          {programOptions.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </>
                      ) : (
                        (field.options ?? []).map((o) => (
                          <option key={o.value} value={o.value}>
                            {t(o.label)}
                          </option>
                        ))
                      )}
                    </select>
                  ) : (
                    <input
                      id={`shared-${field.name}`}
                      class="input"
                      type={field.kind === 'date' ? 'date' : field.kind === 'number' ? 'number' : 'text'}
                      value={shared[field.name] ?? ''}
                      onInput={(e) => updateShared(field.name, (e.target as HTMLInputElement).value)}
                      required={field.required}
                      maxLength={field.max}
                      aria-describedby={field.hint ? `hint-${field.name}` : undefined}
                      dir="ltr"
                    />
                  )}
                  {field.hint && (
                    <p class="hint" id={`hint-${field.name}`}>
                      {t(field.hint)}
                    </p>
                  )}
                </div>
              ))}
            </div>
            {publishing && user.role !== 'admin' && <p class="hint">{t('editorCannotPublish')}</p>}
          </div>

          <div class="tabs" role="tablist">
            {LOCALES.map((l) => (
              <button
                type="button"
                role="tab"
                key={l}
                class="tab"
                aria-selected={active === l}
                onClick={() => setActive(l)}
                lang={l}
              >
                {LOCALE_LABEL[l]}
                <span class={`tab-dot ${locales[l].present ? (locales[l].fields['title'] ? 'ok' : 'warn') : ''}`} aria-hidden="true" />
              </button>
            ))}
          </div>

          <div class="panel" role="tabpanel" lang={active} dir={DIR[active]}>
            {!current.present ? (
              <div class="empty-mini column">
                <p>{t('missingTranslation')}</p>
                <button
                  type="button"
                  class="btn btn-primary"
                  onClick={() => updateLocal({ present: true, needsReview: active !== 'ar' })}
                >
                  <Icon name="plus" size={18} />
                  {t('addTranslation')}
                </button>
              </div>
            ) : (
              <>
                {config.local.map((field) => (
                  <div class="field" key={`${active}-${field.name}`}>
                    <div class="label-row">
                      <label class="label" for={`f-${active}-${field.name}`}>
                        {t(field.label)}
                        {field.required && <span class="req" aria-hidden="true"> *</span>}
                      </label>
                      {field.max && (
                        <span class="counter" aria-hidden="true">
                          {(current.fields[field.name] ?? '').length}/{field.max}
                        </span>
                      )}
                    </div>
                    {field.kind === 'textarea' ? (
                      <textarea
                        id={`f-${active}-${field.name}`}
                        required={field.required}
                        class="input"
                        rows={3}
                        maxLength={field.max}
                        value={current.fields[field.name] ?? ''}
                        onInput={(e) => updateField(field.name, (e.target as HTMLTextAreaElement).value)}
                      />
                    ) : (
                      <input
                        id={`f-${active}-${field.name}`}
                        required={field.required}
                        class={`input ${field.name === 'title' ? 'input-lg' : ''}`}
                        dir={field.ltr ? 'ltr' : undefined}
                        aria-describedby={field.hint ? `hint-${active}-${field.name}` : undefined}
                        maxLength={field.max}
                        value={current.fields[field.name] ?? ''}
                        onInput={(e) => updateField(field.name, (e.target as HTMLInputElement).value)}
                      />
                    )}
                    {field.hint && (
                      <p class="hint" id={`hint-${active}-${field.name}`}>
                        {t(field.hint)}
                      </p>
                    )}
                  </div>
                ))}
                {config.body !== false && (
                  <div class="field">
                    <label class="label" for={`body-${active}`}>
                      {t('fBody')}
                    </label>
                    <MarkdownField id={`body-${active}`} value={current.body} onChange={(body) => updateLocal({ body })} dir={DIR[active]} />
                  </div>
                )}
                {active !== 'ar' && (
                  <label class="check">
                    <input type="checkbox" checked={current.needsReview} onChange={(e) => updateLocal({ needsReview: (e.target as HTMLInputElement).checked })} />
                    {t('needsReview')}
                  </label>
                )}
              </>
            )}
          </div>

          {config.images !== 'none' && (
            <div class="panel">
              <h2 class="panel-title">{collection === 'stories' ? t('storyPictures') : config.images === 'list' ? t('images') : t('image')}</h2>
              {collection === 'stories' && <p class="hint">{t('storyPicturesHint')}</p>}
              <ImagesField
                mode={config.images}
                items={images}
                setItems={(items) => {
                  setImages(items);
                  setDirty(true);
                }}
                locale={active}
                onUpload={(image) => uploads.current.set(image.id, image)}
              />
            </div>
          )}
        </section>

        <section class="editor-preview" aria-label={t('preview')}>
          <div class="preview-frame">
            <div class="preview-bar" aria-hidden="true">
              <span />
              <span />
              <span />
              <span class="preview-url">infspm · {LOCALE_LABEL[active]}</span>
            </div>
            <Preview collection={collection} locale={active} state={current} shared={shared} images={images} />
          </div>
        </section>
      </div>
    </div>
  );
}
