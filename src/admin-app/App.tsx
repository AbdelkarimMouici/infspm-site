/** @jsxImportSource preact */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { AdminApi, Collection, PublicUser, SessionInfo } from './api';
import { ContentList } from './ContentList';
import { COLLECTION_META, Dashboard } from './Dashboard';
import { AccountPage } from './Account';
import { Editor, editorState } from './Editor';
import { SettingsPage } from './Settings';
import { TextsPage } from './Texts';
import { UsersPage } from './Users';
import { storedLang, storeLang, translator, type AdminLang, type AdminKey } from './i18n';
import { AuthScreen, LangSwitch, logoUrl } from './Login';
import { AppContext, Icon, Spinner, Toasts, useApp, type Ctx, type IconName, type Toast } from './ui';

type Route =
  | { name: 'dashboard' }
  | { name: 'list'; collection: Collection }
  | { name: 'edit'; collection: Collection; slug: string | null }
  | { name: 'settings' }
  | { name: 'texts' }
  | { name: 'users' }
  | { name: 'account' };

const COLLECTIONS: Collection[] = ['news', 'activities', 'programs', 'pages'];

function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'c' && COLLECTIONS.includes(parts[1] as Collection)) {
    const collection = parts[1] as Collection;
    if (parts[2] === 'new') return { name: 'edit', collection, slug: null };
    if (parts[2] && /^[a-z0-9-]+$/.test(parts[2])) return { name: 'edit', collection, slug: parts[2] };
    return { name: 'list', collection };
  }
  if (parts[0] === 'settings') return { name: 'settings' };
  if (parts[0] === 'texts') return { name: 'texts' };
  if (parts[0] === 'users') return { name: 'users' };
  if (parts[0] === 'account') return { name: 'account' };
  return { name: 'dashboard' };
}

function Shell({ route, children }: { route: Route; children: preact.ComponentChildren }) {
  const ctx = useApp();
  const { t, user, signOut, lang, setLang } = ctx;
  const [open, setOpen] = useState(false);
  const active = route.name === 'list' || route.name === 'edit' ? `c/${route.collection}` : route.name;
  const nav: { href: string; key: string; label: AdminKey; icon: IconName; soon?: boolean; admin?: boolean }[] = [
    { href: '#/', key: 'dashboard', label: 'navDashboard', icon: 'home' },
    ...COLLECTIONS.map((c) => ({ href: `#/c/${c}`, key: `c/${c}`, label: COLLECTION_META[c].label, icon: COLLECTION_META[c].icon })),
  ];
  const more: typeof nav = [
    { href: '#/settings', key: 'settings', label: 'navSettings', icon: 'gear', admin: true },
    { href: '#/texts', key: 'texts', label: 'navTexts', icon: 'text', admin: true },
    { href: '#/users', key: 'users', label: 'navUsers', icon: 'users', admin: true },
    { href: '#/account', key: 'account', label: 'navAccount', icon: 'user' },
  ];
  const link = (item: (typeof nav)[number]) =>
    item.admin && user.role !== 'admin' ? null : (
      <li key={item.key}>
        <a class="nav-link" href={item.href} aria-current={active === item.key ? 'page' : undefined} onClick={() => setOpen(false)}>
          <Icon name={item.icon} />
          <span>{t(item.label)}</span>
          {item.soon && <span class="soon">{t('soon')}</span>}
        </a>
      </li>
    );

  return (
    <div class={`shell ${open ? 'nav-open' : ''}`}>
      <a class="skip" href="#main">
        {t('appName')}
      </a>
      <header class="topbar">
        <button type="button" class="icon-btn" onClick={() => setOpen(true)} aria-label={t('menu')} aria-expanded={open}>
          <Icon name="menu" />
        </button>
        <span class="topbar-title">{t('appName')}</span>
        <img src={logoUrl()} alt="" width="32" height="32" class="topbar-logo" />
      </header>
      <div class="scrim" onClick={() => setOpen(false)} aria-hidden="true" />
      <aside class="sidebar" aria-label={t('menu')}>
        <div class="brand">
          <img src={logoUrl()} alt="" width="44" height="44" class="brand-logo" />
          <div>
            <p class="brand-name">{t('institute')}</p>
            <p class="brand-sub">{t('appName')}</p>
          </div>
        </div>
        <nav>
          <ul class="nav" role="list">
            {nav.map(link)}
          </ul>
          <p class="nav-heading">⋯</p>
          <ul class="nav" role="list">
            {more.map(link)}
          </ul>
        </nav>
        <div class="sidebar-foot">
          <a class="nav-link" href={`/${lang === 'fr' ? 'fr' : 'ar'}/`} target="_blank" rel="noopener">
            <Icon name="external" />
            <span>{t('viewSite')}</span>
          </a>
          <div class="me">
            <span class="avatar" aria-hidden="true">
              {user.displayName.slice(0, 1)}
            </span>
            <span class="me-text">
              <span class="me-name">{user.displayName}</span>
              <span class="muted small">{user.role === 'admin' ? t('roleAdmin') : t('roleEditor')}</span>
            </span>
            <button type="button" class="icon-btn" onClick={signOut} aria-label={t('signOut')} title={t('signOut')}>
              <Icon name="out" class="flip-rtl" />
            </button>
          </div>
          <LangSwitch lang={lang} setLang={setLang} />
        </div>
      </aside>
      <main id="main" class="main" tabIndex={-1}>
        {ctx.api.dev && <p class="dev-banner">{t('dev')}</p>}
        {children}
      </main>
    </div>
  );
}

export function App({ api }: { api: AdminApi }) {
  const [lang, setLangState] = useState<AdminLang>(storedLang);
  const t = useMemo(() => translator(lang), [lang]);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [route, setRoute] = useState<Route>(() => parseRoute(location.hash));
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);
  const lastHash = useRef(location.hash);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  useEffect(() => {
    api
      .session()
      .then((info) => {
        setSession(info);
        setUser(info.user);
      })
      .catch(() => setSession({ user: null, needsSetup: false, setupAvailable: false, contentConfigured: false }));
  }, []);

  useEffect(() => {
    const onHash = () => {
      if (editorState.dirty && !window.confirm(t('confirmLeave'))) {
        history.replaceState(null, '', lastHash.current || '#/');
        return;
      }
      editorState.dirty = false;
      lastHash.current = location.hash;
      setRoute(parseRoute(location.hash));
      document.getElementById('main')?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [t]);

  const setLang = (next: AdminLang) => {
    storeLang(next);
    setLangState(next);
  };

  const toast = (kind: Toast['kind'], text: string, detail?: string[]) => {
    const id = ++toastId.current;
    setToasts((list) => [...list, { id, kind, text, ...(detail ? { detail } : {}) }]);
    window.setTimeout(() => setToasts((list) => list.filter((item) => item.id !== id)), kind === 'error' ? 12_000 : 6_000);
  };

  if (!session) {
    return (
      <div class="center-screen">
        <Spinner label={t('loading')} />
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <AuthScreen
          api={api}
          t={t}
          lang={lang}
          setLang={setLang}
          mode={session.needsSetup ? 'setup' : 'login'}
          setupAvailable={session.setupAvailable}
          onSignedIn={(signedIn) => {
            setUser(signedIn);
            setSession({ ...session, needsSetup: false });
          }}
        />
        <Toasts items={toasts} dismiss={(id) => setToasts((list) => list.filter((item) => item.id !== id))} />
      </>
    );
  }

  const ctx: Ctx = {
    api,
    t,
    lang,
    setLang,
    user,
    toast,
    navigate: (hash) => {
      location.hash = hash;
    },
    signOut: () => {
      void api.logout().finally(() => setUser(null));
    },
  };

  let page: preact.JSX.Element;
  if (route.name === 'list') page = <ContentList collection={route.collection} key={route.collection} />;
  else if (route.name === 'edit') page = <Editor collection={route.collection} slug={route.slug} key={`${route.collection}/${route.slug ?? 'new'}`} />;
  else if (route.name === 'settings' && user.role === 'admin') page = <SettingsPage />;
  else if (route.name === 'texts' && user.role === 'admin') page = <TextsPage />;
  else if (route.name === 'users' && user.role === 'admin') page = <UsersPage />;
  else if (route.name === 'account') page = <AccountPage onUserChange={(totpEnabled) => setUser({ ...user, totpEnabled })} />;
  else page = <Dashboard />;

  return (
    <AppContext.Provider value={ctx}>
      <Shell route={route}>{page}</Shell>
      <Toasts items={toasts} dismiss={(id) => setToasts((list) => list.filter((item) => item.id !== id))} />
    </AppContext.Provider>
  );
}
