/** @jsxImportSource preact */
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Collection, EntrySummary, PullRequestInfo } from './api';
import { COLLECTION_META } from './Dashboard';
import { errorText } from './Login';
import { changeTarget, changeTitle } from './pending';
import { formatDate, Icon, LangDots, Spinner, StatusChip, useApp } from './ui';

type Filter = 'all' | 'published' | 'draft' | 'demo' | 'missing';

export function ContentList({ collection }: { collection: Collection }) {
  const { api, t, lang, navigate } = useApp();
  const [entries, setEntries] = useState<EntrySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [changes, setChanges] = useState<PullRequestInfo[]>([]);
  const meta = COLLECTION_META[collection];
  const canCreate = collection !== 'pages';

  const load = () =>
    Promise.all([api.list(collection), api.changes().catch(() => [] as PullRequestInfo[])])
      .then(([list, open]) => {
        setEntries(list);
        setChanges(open);
      })
      .catch((err: unknown) => setError(errorText(t, err).text));

  useEffect(() => {
    setEntries(null);
    setError(null);
    void load();
  }, [collection]);

  // Changes of this section waiting to be published (pull requests not merged yet).
  const mine = changes.map((change) => ({ change, target: changeTarget(change) })).filter((c) => c.target?.collection === collection);
  const pendingSlugs = new Set(mine.map((c) => c.target?.slug));
  const newItems = mine.filter((c) => c.target && !c.target.deleting && !(entries ?? []).some((e) => e.slug === c.target?.slug));

  // While something is being published, refresh every 20 seconds.
  useEffect(() => {
    if (mine.length === 0) return;
    const timer = window.setInterval(() => void load(), 20_000);
    return () => window.clearInterval(timer);
  }, [mine.length, collection]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (entries ?? []).filter((entry) => {
      const main = entry.locales.ar ?? entry.locales.fr ?? entry.locales.en;
      if (filter === 'published' && (main?.status !== 'published' || main.example)) return false;
      if (filter === 'draft' && (main?.status === 'published' || main?.example)) return false;
      if (filter === 'demo' && !main?.example) return false;
      if (filter === 'missing' && entry.locales.ar && entry.locales.fr && entry.locales.en) return false;
      if (!q) return true;
      return Object.values(entry.locales).some((l) => `${l?.title ?? ''} ${l?.summary ?? ''}`.toLowerCase().includes(q)) || entry.slug.includes(q);
    });
  }, [entries, query, filter]);

  const filters: [Filter, string][] = [
    ['all', t('filterAll')],
    ['published', t('filterPublished')],
    ['draft', t('filterDraft')],
    ['missing', t('filterMissing')],
    // Only offered while demo entries exist.
    ...((entries ?? []).some((e) => e.locales.ar?.example) ? [['demo', t('filterDemo')] as [Filter, string]] : []),
  ];

  return (
    <div class="page">
      <header class="page-head">
        <div class="page-head-title">
          <span class="head-icon">
            <Icon name={meta.icon} size={22} />
          </span>
          <div>
            <h1 class="page-title">{t(meta.label)}</h1>
            {entries && (
              <p class="muted small">
                {entries.length} {t('items')}
              </p>
            )}
          </div>
        </div>
        {canCreate && (
          <button type="button" class="btn btn-primary" onClick={() => navigate(`#/c/${collection}/new`)}>
            <Icon name="plus" size={18} />
            {t(meta.newLabel ?? 'add')}
          </button>
        )}
      </header>

      <div class="toolbar">
        <label class="search">
          <Icon name="search" size={18} />
          <span class="sr-only">{t('search')}</span>
          <input type="search" class="search-input" placeholder={t('search')} value={query} onInput={(e) => setQuery((e.target as HTMLInputElement).value)} />
        </label>
        <div class="filters" role="group">
          {filters.map(([value, label]) => (
            <button type="button" key={value} class="filter" aria-pressed={filter === value} onClick={() => setFilter(value)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && <p class="notice notice-error">{error}</p>}
      {mine.length > 0 && (
        <p class="notice notice-info">
          <Icon name="clock" size={18} />
          {t('pendingList')}
        </p>
      )}
      {newItems.length > 0 && (
        <ul class="cards pending-cards" role="list">
          {newItems.map(({ change }) => (
            <li key={change.number}>
              <div class="card card-pending">
                <span class="card-media">
                  <span class="card-placeholder">
                    <Spinner />
                  </span>
                </span>
                <span class="card-body">
                  <span class="chip chip-info">{t('pendingNew')}</span>
                  <span class="card-title">{changeTitle(change)}</span>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {!entries && !error && (
        <div class="cards">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div class="card skeleton" key={i} aria-hidden="true" />
          ))}
          <span class="sr-only">
            <Spinner label={t('loading')} />
          </span>
        </div>
      )}
      {entries && shown.length === 0 && (
        <div class="empty">
          <Icon name={meta.icon} size={40} />
          <p>{entries.length === 0 ? t('emptyList') : t('noResults')}</p>
          {entries.length === 0 && canCreate && (
            <button type="button" class="btn btn-primary" onClick={() => navigate(`#/c/${collection}/new`)}>
              <Icon name="plus" size={18} />
              {t(meta.newLabel ?? 'add')}
            </button>
          )}
        </div>
      )}
      {entries && shown.length > 0 && (
        <ul class="cards" role="list">
          {shown.map((entry) => {
            const main = entry.locales[lang === 'fr' ? 'fr' : 'ar'] ?? entry.locales.ar ?? entry.locales.fr ?? entry.locales.en;
            return (
              <li key={entry.slug}>
                <a class="card" href={`#/c/${collection}/${entry.slug}`}>
                  <span class="card-media">
                    {main?.thumb ? (
                      <img src={api.imageUrl(main.thumb)} alt="" loading="lazy" />
                    ) : (
                      <span class="card-placeholder">
                        <Icon name={meta.icon} size={34} />
                      </span>
                    )}
                    <span class="card-status">
                      <StatusChip status={main?.status ?? 'draft'} example={main?.example} />
                      {pendingSlugs.has(entry.slug) && (
                        <span class="chip chip-info">
                          <Icon name="clock" size={13} />
                          {t('pendingBadge')}
                        </span>
                      )}
                    </span>
                  </span>
                  <span class="card-body">
                    <span class="card-title">{main?.title}</span>
                    {main?.summary && <span class="card-summary">{main.summary}</span>}
                    <span class="card-foot">
                      <span class="muted small">
                        {collection === 'programs' || collection === 'stories'
                          ? [main?.duration, main?.order !== undefined ? `${t('orderLabel')} ${main.order}` : ''].filter(Boolean).join(' · ') || ' '
                          : formatDate(main?.date, lang) || ' '}
                      </span>
                      <LangDots has={entry.locales} />
                    </span>
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
