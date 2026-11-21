/** @jsxImportSource preact */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Locale, SettingsData } from './api';
import { editorState } from './Editor';
import { prepareLogo } from './image';
import { errorText } from './Login';
import { Icon, Spinner, useApp } from './ui';

const LOCALES: { code: Locale; label: string; dir: 'rtl' | 'ltr' }[] = [
  { code: 'ar', label: 'العربية', dir: 'rtl' },
  { code: 'fr', label: 'Français', dir: 'ltr' },
  { code: 'en', label: 'English', dir: 'ltr' },
];

export function SettingsPage() {
  const { api, t, toast } = useApp();
  const [data, setData] = useState<{ settings: SettingsData; sha: string } | null>(null);
  const [form, setForm] = useState<SettingsData | null>(null);
  const [logo, setLogo] = useState<{ data: string; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .settings()
      .then((result) => {
        setData(result);
        setForm(structuredClone(result.settings));
      })
      .catch((err: unknown) => setError(errorText(t, err).text));
    return () => {
      editorState.dirty = false;
    };
  }, []);

  if (error) return <p class="notice notice-error">{error}</p>;
  if (!form || !data) {
    return (
      <div class="center-block">
        <Spinner label={t('loading')} />
      </div>
    );
  }

  const update = (patch: Partial<SettingsData>) => {
    setForm({ ...form, ...patch });
    editorState.dirty = true;
    setSaved(false);
  };

  const pickLogo = async (file: File | undefined) => {
    if (!file) return;
    try {
      setLogo(await prepareLogo(file));
      editorState.dirty = true;
      setSaved(false);
    } catch {
      toast('error', t('imageError'));
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.saveSettings({ settings: form, sha: data.sha, ...(logo ? { logo: { data: logo.data } } : {}) });
      editorState.dirty = false;
      setSaved(true);
      toast('success', t('savedPublished'));
    } catch (err) {
      const message = errorText(t, err);
      toast('error', message.text, message.detail);
    } finally {
      setSaving(false);
    }
  };

  const text = (id: string, label: string, value: string, onChange: (v: string) => void, opts: { dir?: 'rtl' | 'ltr'; type?: string; placeholder?: string } = {}) => (
    <div class="field">
      <label class="label" for={id}>
        {label}
      </label>
      <input
        id={id}
        class="input"
        type={opts.type ?? 'text'}
        value={value}
        dir={opts.dir}
        placeholder={opts.placeholder}
        onInput={(e) => onChange((e.target as HTMLInputElement).value)}
      />
    </div>
  );

  return (
    <div class="page narrow">
      <header class="page-head">
        <div class="page-head-title">
          <span class="head-icon">
            <Icon name="gear" size={22} />
          </span>
          <div>
            <h1 class="page-title">{t('settingsTitle')}</h1>
            <p class="muted small">{t('settingsLead')}</p>
          </div>
        </div>
        <button type="button" class="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? <Spinner /> : <Icon name="check" size={18} />}
          {saving ? t('saving') : t('save')}
        </button>
      </header>

      {saved && (
        <p class="notice notice-ok">
          <Icon name="clock" size={18} />
          {t('savedPublished')}
        </p>
      )}

      <section class="panel" aria-labelledby="logo-title">
        <h2 id="logo-title" class="panel-title">
          {t('logo')}
        </h2>
        <div class="logo-row">
          <img class="logo-preview" src={logo?.url ?? api.imageUrl(form.logo)} alt={t('logo')} width="120" height="120" />
          <div class="logo-meta">
            <p class="hint">{t('logoHint')}</p>
            <button type="button" class="btn btn-ghost" onClick={() => fileInput.current?.click()}>
              <Icon name="image" size={18} />
              {t('changeLogo')}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/webp,image/svg+xml,image/jpeg"
              hidden
              onChange={(e) => {
                void pickLogo((e.target as HTMLInputElement).files?.[0]);
                (e.target as HTMLInputElement).value = '';
              }}
            />
          </div>
        </div>
      </section>

      <section class="panel" aria-labelledby="contact-title">
        <h2 id="contact-title" class="panel-title">
          {t('contactSection')}
        </h2>
        <div class="row">
          <div class="grow">{text('s-email', t('officialEmail'), form.email, (email) => update({ email }), { dir: 'ltr', type: 'email' })}</div>
          <div class="grow">{text('s-phone', t('phone'), form.phone, (phone) => update({ phone }), { dir: 'ltr', type: 'tel' })}</div>
        </div>
        {(['address', 'hours'] as const).map((field) => (
          <fieldset class="fieldset" key={field}>
            <legend class="label">{t(field)}</legend>
            {LOCALES.map((l) => (
              <div class="field" key={l.code}>
                <label class="label sub-label" for={`s-${field}-${l.code}`}>
                  {l.label}
                </label>
                <input
                  id={`s-${field}-${l.code}`}
                  class="input"
                  dir={l.dir}
                  lang={l.code}
                  value={form[field][l.code]}
                  onInput={(e) => update({ [field]: { ...form[field], [l.code]: (e.target as HTMLInputElement).value } })}
                />
              </div>
            ))}
          </fieldset>
        ))}
        {text('s-facebook', t('facebook'), form.facebookUrl, (facebookUrl) => update({ facebookUrl }), {
          dir: 'ltr',
          type: 'url',
          placeholder: 'https://www.facebook.com/…',
        })}
        {text('s-map', t('map'), form.mapUrl, (mapUrl) => update({ mapUrl }), { dir: 'ltr', type: 'url', placeholder: 'https://…' })}
      </section>

      <section class="panel">
        <label class="check">
          <input type="checkbox" checked={form.showExamples} onChange={(e) => update({ showExamples: (e.target as HTMLInputElement).checked })} />
          {t('demo')}
        </label>
        <p class="hint">{t('demoHint')}</p>
      </section>
    </div>
  );
}
