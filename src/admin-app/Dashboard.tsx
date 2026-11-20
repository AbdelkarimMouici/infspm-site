/** @jsxImportSource preact */
import { useEffect, useState } from 'preact/hooks';
import type { Collection, Dashboard as DashboardData, PullRequestInfo } from './api';
import { errorText } from './Login';
import { formatDate, Icon, LangDots, Spinner, StatusChip, useApp, type IconName } from './ui';
import type { AdminKey } from './i18n';

export const COLLECTION_META: Record<Collection, { label: AdminKey; icon: IconName; newLabel?: AdminKey }> = {
  news: { label: 'navNews', icon: 'news', newLabel: 'newNews' },
  activities: { label: 'navActivities', icon: 'spark', newLabel: 'newActivity' },
  programs: { label: 'navPrograms', icon: 'book', newLabel: 'newProgram' },
  pages: { label: 'navPages', icon: 'page' },
};

function ChangeRow({ change, onAction }: { change: PullRequestInfo; onAction: () => void }) {
  const { t, api, user, toast } = useApp();
  const [busy, setBusy] = useState(false);
  const state = change.awaitingApproval
    ? { cls: 'chip-warn', text: t('awaiting'), icon: 'clock' as const }
    : change.checks === 'failure'
      ? { cls: 'chip-bad', text: t('checksFailure'), icon: 'alert' as const }
      : change.checks === 'success'
        ? { cls: 'chip-ok', text: t('checksSuccess'), icon: 'check' as const }
        : { cls: 'chip-info', text: t('checksPending'), icon: 'clock' as const };
  const act = async (kind: 'approve' | 'discard') => {
    setBusy(true);
    try {
      await (kind === 'approve' ? api.approve(change.number) : api.discard(change.number));
      onAction();
    } catch (error) {
      const message = errorText(t, error);
      toast('error', message.text, message.detail);
    } finally {
      setBusy(false);
    }
  };
  return (
    <li class="change">
      <span class={`chip ${state.cls}`}>
        <Icon name={state.icon} size={14} />
        {state.text}
      </span>
      <div class="change-main">
        <p class="change-title">{change.title}</p>
        <p class="muted small">
          {change.author && `${t('by')} ${change.author} · `}
          {formatDate(change.createdAt, 'ar')}
        </p>
      </div>
      {user.role === 'admin' && (
        <div class="change-actions">
          {(change.awaitingApproval || (!change.autoMerge && change.checks !== 'failure')) && (
            <button type="button" class="btn btn-small btn-primary" disabled={busy} onClick={() => act('approve')}>
              <Icon name="check" size={16} />
              {t('approve')}
            </button>
          )}
          <button type="button" class="btn btn-small btn-ghost" disabled={busy} onClick={() => act('discard')}>
            {t('discard')}
          </button>
        </div>
      )}
    </li>
  );
}

export function Dashboard() {
  const { api, t, user, navigate, toast, lang } = useApp();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setData(await api.dashboard());
      setError(null);
    } catch (err) {
      setError(errorText(t, err).text);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  // While changes are being published, refresh every 20 seconds.
  useEffect(() => {
    if (!data || (data.changes.length === 0 && data.live?.checks !== 'pending')) return;
    const timer = window.setInterval(() => {
      api
        .changes()
        .then(() => load())
        .catch(() => undefined);
    }, 20_000);
    return () => window.clearInterval(timer);
  }, [data]);

  const today = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-DZ-u-nu-latn' : 'fr-DZ', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

  return (
    <div class="page">
      <header class="page-head dash-head">
        <div>
          <p class="muted">{today}</p>
          <h1 class="page-title">
            {t('hello')} <span class="grad-text">{user.displayName}</span>
          </h1>
          <p class="muted">{t('dashLead')}</p>
        </div>
        <div class="quick">
          {(['news', 'activities', 'programs'] as const).map((c) => (
            <button type="button" class="btn btn-primary" key={c} onClick={() => navigate(`#/c/${c}/new`)}>
              <Icon name="plus" size={18} />
              {t(COLLECTION_META[c].newLabel ?? 'add')}
            </button>
          ))}
        </div>
      </header>

      {error && <p class="notice notice-error">{error}</p>}
      {!data && !error && (
        <div class="center-block">
          <Spinner label={t('loading')} />
        </div>
      )}

      {data && (
        <>
          <section class="stats" aria-label={t('total')}>
            {(['news', 'activities', 'programs', 'pages'] as const).map((c, i) => {
              const count = data.counts[c];
              return (
                <button type="button" class={`stat stat-${i}`} key={c} onClick={() => navigate(`#/c/${c}`)}>
                  <span class="stat-icon">
                    <Icon name={COLLECTION_META[c].icon} size={22} />
                  </span>
                  <span class="stat-label">{t(COLLECTION_META[c].label)}</span>
                  <span class="stat-value">{count?.total ?? 0}</span>
                  <span class="stat-meta">
                    {count?.published ?? 0} {t('published')} · {count?.drafts ?? 0} {t('draft')}
                    {count && count.missingTranslations > 0 && (
                      <span class="stat-warn">
                        {' '}
                        · {count.missingTranslations} {t('missingTranslations')}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </section>

          <div class="dash-grid">
            <section class="panel" aria-labelledby="pending-title">
              <div class="panel-head">
                <h2 id="pending-title">{t('pendingTitle')}</h2>
                {data.live && (
                  <span class={`live live-${data.live.checks}`}>
                    <span class="live-dot" aria-hidden="true" />
                    {data.live.checks === 'success' ? t('liveOk') : data.live.checks === 'pending' ? t('livePending') : t('liveFail')}
                  </span>
                )}
              </div>
              {data.changes.length === 0 ? (
                <p class="empty-mini">
                  <Icon name="check" />
                  {t('pendingEmpty')}
                </p>
              ) : (
                <ul class="changes" role="list">
                  {data.changes.map((change) => (
                    <ChangeRow
                      key={change.number}
                      change={change}
                      onAction={() => {
                        toast('success', t('savedPublished'));
                        void load();
                      }}
                    />
                  ))}
                </ul>
              )}
            </section>

            <section class="panel" aria-labelledby="recent-title">
              <div class="panel-head">
                <h2 id="recent-title">{t('recentTitle')}</h2>
              </div>
              <ul class="recent" role="list">
                {data.recent.map((item) => {
                  const main = item.locales.ar ?? item.locales.fr ?? item.locales.en;
                  return (
                    <li key={`${item.collection}-${item.slug}`}>
                      <a class="recent-row" href={`#/c/${item.collection}/${item.slug}`}>
                        <span class="thumb thumb-sm">
                          {main?.thumb ? <img src={api.imageUrl(main.thumb)} alt="" loading="lazy" /> : <Icon name={COLLECTION_META[item.collection].icon} />}
                        </span>
                        <span class="recent-main">
                          <span class="recent-title">{main?.title}</span>
                          <span class="muted small">
                            {t(COLLECTION_META[item.collection].label)} · {formatDate(main?.date, lang) || t('noDate')}
                          </span>
                        </span>
                        <LangDots has={item.locales} />
                        <StatusChip status={main?.status ?? 'draft'} />
                      </a>
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
