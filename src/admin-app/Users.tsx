/** @jsxImportSource preact */
import { useEffect, useState } from 'preact/hooks';
import type { PublicUser } from './api';
import { errorText } from './Login';
import { Dialog, formatDate, Icon, Spinner, useApp, useConfirm } from './ui';

type Role = 'admin' | 'editor';

export function UsersPage() {
  const { api, t, toast, user: me, lang } = useApp();
  const [users, setUsers] = useState<PublicUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState<PublicUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ username: '', displayName: '', role: 'editor' as Role, password: '' });
  const [newPassword, setNewPassword] = useState('');
  const [confirm, confirmElement] = useConfirm();

  const load = () =>
    api
      .users()
      .then(setUsers)
      .catch((err: unknown) => setError(errorText(t, err).text));

  useEffect(() => {
    void load();
  }, []);

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await action();
      toast('success', success);
      await load();
      return true;
    } catch (err) {
      const message = errorText(t, err);
      toast('error', message.text, message.detail);
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="page narrow">
      {confirmElement}
      <header class="page-head">
        <div class="page-head-title">
          <span class="head-icon">
            <Icon name="users" size={22} />
          </span>
          <div>
            <h1 class="page-title">{t('usersTitle')}</h1>
            <p class="muted small">{t('usersLead')}</p>
          </div>
        </div>
        <button type="button" class="btn btn-primary" onClick={() => setAdding(true)}>
          <Icon name="plus" size={18} />
          {t('addUser')}
        </button>
      </header>

      {error && <p class="notice notice-error">{error}</p>}
      {!users && !error && (
        <div class="center-block">
          <Spinner label={t('loading')} />
        </div>
      )}

      {users && (
        <ul class="user-list" role="list">
          {users.map((u) => {
            const self = u.username === me.username;
            return (
              <li class="user-card" key={u.username}>
                <span class="avatar" aria-hidden="true">
                  {u.displayName.slice(0, 1)}
                </span>
                <div class="user-main">
                  <p class="user-name">
                    {u.displayName} {self && <span class="chip chip-info">{t('you')}</span>}
                  </p>
                  <p class="muted small" dir="ltr">
                    @{u.username} · {formatDate(u.createdAt, lang)}
                  </p>
                  <p class="small">
                    <span class={`chip ${u.totpEnabled ? 'chip-ok' : 'chip-muted'}`}>
                      <Icon name="shield" size={13} />
                      {t('twoStep')}: {u.totpEnabled ? t('enabled') : t('disabled')}
                    </span>
                  </p>
                </div>
                <div class="user-actions">
                  <label class="sr-only" for={`role-${u.username}`}>
                    {t('role')}
                  </label>
                  <select
                    id={`role-${u.username}`}
                    class="input input-small"
                    value={u.role}
                    disabled={busy || self}
                    onChange={(e) => void run(() => api.updateUser(u.username, { role: (e.target as HTMLSelectElement).value as Role }), t('userSaved'))}
                  >
                    <option value="admin">{t('roleAdmin')}</option>
                    <option value="editor">{t('roleEditor')}</option>
                  </select>
                  {!self && (
                    <>
                      <button type="button" class="icon-btn" title={t('resetPassword')} aria-label={`${t('resetPassword')} · ${u.displayName}`} onClick={() => setResetting(u)}>
                        <Icon name="shield" />
                      </button>
                      <button
                        type="button"
                        class="icon-btn danger"
                        title={t('delete')}
                        aria-label={`${t('delete')} · ${u.displayName}`}
                        onClick={async () => {
                          if (await confirm(t('confirmDeleteUser'))) void run(() => api.deleteUser(u.username), t('userDeleted'));
                        }}
                      >
                        <Icon name="trash" />
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={adding} title={t('addUser')} onClose={() => setAdding(false)}>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run(() => api.createUser(form), t('userCreated'))) {
              setAdding(false);
              setForm({ username: '', displayName: '', role: 'editor', password: '' });
            }
          }}
        >
          <div class="field">
            <label class="label" for="nu-username">
              {t('username')}
            </label>
            <input id="nu-username" class="input" dir="ltr" autoComplete="off" required value={form.username} onInput={(e) => setForm({ ...form, username: (e.target as HTMLInputElement).value })} />
            <span class="hint">{t('errUsername')}</span>
          </div>
          <div class="field">
            <label class="label" for="nu-name">
              {t('displayName')}
            </label>
            <input id="nu-name" class="input" value={form.displayName} onInput={(e) => setForm({ ...form, displayName: (e.target as HTMLInputElement).value })} />
          </div>
          <div class="field">
            <label class="label" for="nu-role">
              {t('role')}
            </label>
            <select id="nu-role" class="input" value={form.role} onChange={(e) => setForm({ ...form, role: (e.target as HTMLSelectElement).value as Role })}>
              <option value="editor">{t('roleEditor')}</option>
              <option value="admin">{t('roleAdmin')}</option>
            </select>
          </div>
          <div class="field">
            <label class="label" for="nu-password">
              {t('tempPassword')}
            </label>
            <input id="nu-password" class="input" dir="ltr" type="text" autoComplete="new-password" required minLength={10} value={form.password} onInput={(e) => setForm({ ...form, password: (e.target as HTMLInputElement).value })} />
            <span class="hint">{t('tempHint')}</span>
          </div>
          <div class="dialog-actions">
            <button type="button" class="btn btn-ghost" onClick={() => setAdding(false)}>
              {t('cancel')}
            </button>
            <button type="submit" class="btn btn-primary" disabled={busy}>
              {busy ? <Spinner /> : <Icon name="plus" size={18} />}
              {t('addUser')}
            </button>
          </div>
        </form>
      </Dialog>

      <Dialog open={resetting !== null} title={`${t('resetPassword')} · ${resetting?.displayName ?? ''}`} onClose={() => setResetting(null)}>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (resetting && (await run(() => api.resetPassword(resetting.username, newPassword), t('passwordReset')))) {
              setResetting(null);
              setNewPassword('');
            }
          }}
        >
          <div class="field">
            <label class="label" for="rp-password">
              {t('tempPassword')}
            </label>
            <input id="rp-password" class="input" dir="ltr" type="text" autoComplete="new-password" required minLength={10} value={newPassword} onInput={(e) => setNewPassword((e.target as HTMLInputElement).value)} />
            <span class="hint">{t('tempHint')}</span>
          </div>
          <div class="dialog-actions">
            <button type="button" class="btn btn-ghost" onClick={() => setResetting(null)}>
              {t('cancel')}
            </button>
            <button type="submit" class="btn btn-primary" disabled={busy}>
              {t('confirm')}
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
