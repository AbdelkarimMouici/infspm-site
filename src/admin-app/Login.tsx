/** @jsxImportSource preact */
import { useState } from 'preact/hooks';
import { ApiError, type AdminApi, type PublicUser } from './api';
import type { AdminLang, T } from './i18n';
import { Icon, Spinner } from './ui';

export function errorText(t: T, error: unknown): { text: string; detail?: string[] } {
  if (!(error instanceof ApiError)) return { text: t('errGeneric') };
  switch (error.code) {
    case 'bad_credentials':
      return { text: t('errBadCredentials') };
    case 'locked':
      return { text: t('errLocked', error.info.detail ?? '15') };
    case 'too_many_attempts':
      return { text: t('errTooMany') };
    case 'bad_code':
      return { text: t('errBadCode') };
    case 'weak_password':
      return { text: t('errWeakPassword') };
    case 'invalid_username':
      return { text: t('errUsername') };
    case 'bad_setup_code':
      return { text: t('errSetupCode') };
    case 'changed_meanwhile':
      return { text: t('errChanged') };
    case 'invalid':
      return { text: t('errInvalid'), detail: error.info.details ?? [] };
    case 'network':
      return { text: t('errNetwork') };
    case 'not_configured':
      return { text: t('errNotConfigured', error.info.missing ?? '') };
    case 'signed_out':
      return { text: t('errSignedOut') };
    default:
      return { text: t('errGeneric') };
  }
}

/** The institute logo (optimised by the build, passed on the root element by src/pages/admin/index.astro). */
export function logoUrl(): string {
  return document.getElementById('admin-root')?.dataset['logo'] || '/favicon.svg';
}

export function LangSwitch({ lang, setLang }: { lang: AdminLang; setLang: (l: AdminLang) => void }) {
  return (
    <div class="segmented" role="group" aria-label="Langue / اللغة">
      <button type="button" aria-pressed={lang === 'ar'} onClick={() => setLang('ar')} lang="ar">
        ع
      </button>
      <button type="button" aria-pressed={lang === 'fr'} onClick={() => setLang('fr')} lang="fr">
        FR
      </button>
    </div>
  );
}

function PasswordInput({ id, value, onInput, t, autoComplete }: { id: string; value: string; onInput: (v: string) => void; t: T; autoComplete: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div class="input-wrap">
      <input
        id={id}
        class="input"
        type={shown ? 'text' : 'password'}
        value={value}
        onInput={(e) => onInput((e.target as HTMLInputElement).value)}
        autoComplete={autoComplete}
        required
        dir="ltr"
      />
      <button type="button" class="input-icon" onClick={() => setShown(!shown)} aria-label={shown ? t('hidePassword') : t('showPassword')}>
        <Icon name={shown ? 'eyeOff' : 'eye'} size={18} />
      </button>
    </div>
  );
}

export function AuthScreen({
  api,
  t,
  lang,
  setLang,
  mode,
  setupAvailable,
  onSignedIn,
}: {
  api: AdminApi;
  t: T;
  lang: AdminLang;
  setLang: (l: AdminLang) => void;
  mode: 'login' | 'setup';
  setupAvailable: boolean;
  onSignedIn: (user: PublicUser) => void;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [setupCode, setSetupCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [needCode, setNeedCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: Event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user =
        mode === 'setup'
          ? await api.setup({ code: setupCode, username, displayName, password })
          : await api.login({ username, password, ...(needCode ? { code } : {}) });
      onSignedIn(user);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'code_required') {
        setNeedCode(true);
      } else {
        setError(errorText(t, err).text);
        if (err instanceof ApiError && err.code === 'bad_code') setCode('');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <main class="auth">
      <div class="auth-glow" aria-hidden="true" />
      <form class="auth-card" onSubmit={submit} noValidate={false}>
        <div class="auth-top">
          <img class="auth-logo" src={logoUrl()} alt="" width="56" height="56" />
          <LangSwitch lang={lang} setLang={setLang} />
        </div>
        <p class="eyebrow-sm">{t('institute')}</p>
        <h1 class="auth-title">{mode === 'setup' ? t('setupTitle') : t('loginTitle')}</h1>
        <p class="auth-lead">{mode === 'setup' ? t('setupLead') : t('loginLead')}</p>

        {mode === 'setup' && !setupAvailable && <p class="notice notice-warn">{t('setupUnavailable')}</p>}

        {mode === 'setup' && (
          <label class="field">
            <span class="label">{t('setupCode')}</span>
            <input class="input" value={setupCode} onInput={(e) => setSetupCode((e.target as HTMLInputElement).value)} required dir="ltr" autoComplete="off" />
          </label>
        )}
        <label class="field">
          <span class="label">{t('username')}</span>
          <input
            class="input"
            value={username}
            onInput={(e) => setUsername((e.target as HTMLInputElement).value)}
            autoComplete="username"
            autoCapitalize="none"
            spellcheck={false}
            required
            dir="ltr"
          />
        </label>
        {mode === 'setup' && (
          <label class="field">
            <span class="label">{t('displayName')}</span>
            <input class="input" value={displayName} onInput={(e) => setDisplayName((e.target as HTMLInputElement).value)} autoComplete="name" />
          </label>
        )}
        <div class="field">
          <label class="label" for="pw">
            {t('password')}
          </label>
          <PasswordInput id="pw" value={password} onInput={setPassword} t={t} autoComplete={mode === 'setup' ? 'new-password' : 'current-password'} />
          {mode === 'setup' && <span class="hint">{t('passwordRule')}</span>}
        </div>
        {needCode && (
          <label class="field">
            <span class="label">{t('code')}</span>
            <input
              class="input input-code"
              value={code}
              onInput={(e) => setCode((e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              required
              dir="ltr"
            />
            <span class="hint">{t('codeHint')}</span>
          </label>
        )}

        {error && (
          <p class="notice notice-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" class="btn btn-primary btn-block" disabled={busy}>
          {busy ? <Spinner /> : <Icon name={mode === 'setup' ? 'shield' : 'out'} />}
          {mode === 'setup' ? t('createAccount') : t('signIn')}
        </button>
        {api.dev && <p class="hint dev-hint">{t('dev')} · admin / ••••••••••</p>}
      </form>
    </main>
  );
}
