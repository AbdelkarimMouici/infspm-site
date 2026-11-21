/** @jsxImportSource preact */
import { useState } from 'preact/hooks';
import { errorText } from './Login';
import { Icon, Spinner, useApp } from './ui';

export function AccountPage({ onUserChange }: { onUserChange: (totpEnabled: boolean) => void }) {
  const { api, t, toast, user } = useApp();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState('');
  const [disablePassword, setDisablePassword] = useState('');
  const [copied, setCopied] = useState(false);

  const fail = (err: unknown) => {
    const message = errorText(t, err);
    toast('error', message.text, message.detail);
  };

  return (
    <div class="page narrow">
      <header class="page-head">
        <div class="page-head-title">
          <span class="head-icon">
            <Icon name="user" size={22} />
          </span>
          <div>
            <h1 class="page-title">{t('accountTitle')}</h1>
            <p class="muted small" dir="ltr">
              {user.displayName} · @{user.username}
            </p>
          </div>
        </div>
      </header>

      <section class="panel" aria-labelledby="pw-title">
        <h2 id="pw-title" class="panel-title">
          {t('changePassword')}
        </h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await api.changePassword(current, next);
              toast('success', t('passwordChanged'));
              setCurrent('');
              setNext('');
            } catch (err) {
              fail(err);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div class="row">
            <div class="field grow">
              <label class="label" for="pw-current">
                {t('currentPassword')}
              </label>
              <input id="pw-current" class="input" type="password" dir="ltr" autoComplete="current-password" required value={current} onInput={(e) => setCurrent((e.target as HTMLInputElement).value)} />
            </div>
            <div class="field grow">
              <label class="label" for="pw-next">
                {t('newPassword')}
              </label>
              <input id="pw-next" class="input" type="password" dir="ltr" autoComplete="new-password" required minLength={10} value={next} onInput={(e) => setNext((e.target as HTMLInputElement).value)} />
              <span class="hint">{t('passwordRule')}</span>
            </div>
          </div>
          <button type="submit" class="btn btn-primary" disabled={busy}>
            {busy ? <Spinner /> : <Icon name="check" size={18} />}
            {t('changePassword')}
          </button>
        </form>
      </section>

      <section class="panel" aria-labelledby="tf-title">
        <div class="panel-head">
          <h2 id="tf-title">{t('twoStep')}</h2>
          <span class={`chip ${user.totpEnabled ? 'chip-ok' : 'chip-muted'}`}>
            <Icon name="shield" size={13} />
            {user.totpEnabled ? t('enabled') : t('disabled')}
          </span>
        </div>
        <p class="muted">{t('twoStepLead')}</p>

        {!user.totpEnabled && !setup && (
          <button
            type="button"
            class="btn btn-primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                setSetup(await api.totpStart());
              } catch (err) {
                fail(err);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Icon name="shield" size={18} />
            {t('enable')}
          </button>
        )}

        {!user.totpEnabled && setup && (
          <ol class="steps">
            <li>{t('step1')}</li>
            <li>
              {t('step2')}
              <div class="secret-box">
                <code dir="ltr">{setup.secret.replace(/(.{4})/g, '$1 ').trim()}</code>
                <button
                  type="button"
                  class="btn btn-ghost btn-small"
                  onClick={async () => {
                    await navigator.clipboard?.writeText(setup.secret).catch(() => undefined);
                    setCopied(true);
                  }}
                >
                  {copied ? t('copied') : t('copy')}
                </button>
              </div>
              <a class="small" href={setup.uri}>
                {t('step2Link')}
              </a>
            </li>
            <li>
              <form
                class="code-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  try {
                    await api.totpConfirm(code);
                    toast('success', t('twoStepDone'));
                    setSetup(null);
                    setCode('');
                    onUserChange(true);
                  } catch (err) {
                    fail(err);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <label class="label" for="tf-code">
                  {t('step3')}
                </label>
                <div class="row">
                  <input
                    id="tf-code"
                    class="input input-code grow"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    dir="ltr"
                    required
                    value={code}
                    onInput={(e) => setCode((e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 6))}
                  />
                  <button type="submit" class="btn btn-primary" disabled={busy || code.length !== 6}>
                    {t('confirm')}
                  </button>
                </div>
              </form>
            </li>
          </ol>
        )}

        {user.totpEnabled && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await api.totpDisable(disablePassword);
                toast('success', t('twoStepRemoved'));
                setDisablePassword('');
                onUserChange(false);
              } catch (err) {
                fail(err);
              } finally {
                setBusy(false);
              }
            }}
          >
            <div class="field">
              <label class="label" for="tf-disable">
                {t('confirmPasswordToDisable')}
              </label>
              <input id="tf-disable" class="input" type="password" dir="ltr" autoComplete="current-password" required value={disablePassword} onInput={(e) => setDisablePassword((e.target as HTMLInputElement).value)} />
            </div>
            <button type="submit" class="btn btn-ghost" disabled={busy}>
              {t('disable')}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
