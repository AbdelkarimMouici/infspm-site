/** @jsxImportSource preact */
import { createContext, type ComponentChildren } from 'preact';
import { useContext, useEffect, useRef, useState } from 'preact/hooks';
import type { AdminApi, Locale, PublicUser } from './api';
import type { AdminLang, T } from './i18n';

// ---------- App context ----------
export interface Toast {
  id: number;
  kind: 'success' | 'error' | 'info';
  text: string;
  detail?: string[];
}

export interface Ctx {
  api: AdminApi;
  t: T;
  lang: AdminLang;
  setLang: (lang: AdminLang) => void;
  user: PublicUser;
  toast: (kind: Toast['kind'], text: string, detail?: string[]) => void;
  navigate: (hash: string) => void;
  signOut: () => void;
}

export const AppContext = createContext<Ctx | null>(null);
export function useApp(): Ctx {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('AppContext missing');
  return ctx;
}

// ---------- Icons (stroke icons, 24×24) ----------
const paths = {
  home: 'M3 11l9-7 9 7M5 10v10h5v-6h4v6h5V10',
  news: 'M4 5h13v14H6a2 2 0 0 1-2-2V5Zm13 4h3v8a2 2 0 0 1-2 2M8 9h5M8 13h5',
  spark: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6',
  book: 'M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2V5Zm0 14a2 2 0 0 1 2-2h12',
  page: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
  story: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.3l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2.2-1.3L14.3 3h-4l-.4 2.4a7.6 7.6 0 0 0-2.2 1.3l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.6l-2 1.6 2 3.4 2.4-1c.7.6 1.4 1 2.2 1.3l.4 2.4h4l.4-2.4c.8-.3 1.5-.7 2.2-1.3l2.4 1 2-3.4-2-1.6c.1-.4.1-.9.1-1.3Z',
  text: 'M4 6h16M4 12h10M4 18h7',
  users: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 9v-1a4 4 0 0 0-3-3.9M16 2.1a4 4 0 0 1 0 7.8',
  user: 'M20 21v-1a5 5 0 0 0-5-5H9a5 5 0 0 0-5 5v1M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  out: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3',
  plus: 'M12 5v14M5 12h14',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-5-5',
  back: 'M15 18l-6-6 6-6',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  eyeOff: 'M3 3l18 18M10.6 10.6a3 3 0 0 0 4.2 4.2M9.9 5.1A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 4M6.1 6.1C3.6 7.8 2 12 2 12s4 7 10 7c1.6 0 3-.4 4.3-1',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  check: 'M5 13l4 4L19 7',
  x: 'M6 6l12 12M18 6 6 18',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2',
  alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  menu: 'M4 7h16M4 12h16M4 17h16',
  bold: 'M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z',
  italic: 'M10 5h8M6 19h8M14 5l-4 14',
  h: 'M5 5v14M15 5v14M5 12h10M19 19v-6l-2 1',
  list: 'M9 6h11M9 12h11M9 18h11M5 6h.01M5 12h.01M5 18h.01',
  olist: 'M10 6h10M10 12h10M10 18h10M4 5h1v4M4 15h2l-2 3h2',
  quote: 'M7 7h4v5c0 3-2 4-4 4M15 7h4v5c0 3-2 4-4 4',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 20, class: className }: { name: IconName; size?: number; class?: string }) {
  return (
    <svg class={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d={paths[name]} stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span class="spinner" role="status">
      <span class="spinner-ring" aria-hidden="true" />
      {label && <span class="sr-only">{label}</span>}
    </span>
  );
}

// ---------- Status chips and language dots ----------
export function StatusChip({ status, example = false }: { status: string; example?: boolean | undefined }) {
  const { t } = useApp();
  if (example) {
    return (
      <span class="chip chip-warn" title={t('demoChipHint')}>
        {t('demoChip')}
      </span>
    );
  }
  return <span class={`chip ${status === 'published' ? 'chip-ok' : 'chip-muted'}`}>{status === 'published' ? t('published') : t('draft')}</span>;
}

export function LangDots({ has }: { has: Partial<Record<Locale, unknown>> }) {
  const labels: Record<Locale, string> = { ar: 'ع', fr: 'FR', en: 'EN' };
  return (
    <span class="lang-dots">
      {(['ar', 'fr', 'en'] as const).map((l) => (
        <span class={`lang-dot ${has[l] ? 'is-on' : ''}`} title={labels[l]} key={l}>
          {labels[l]}
        </span>
      ))}
    </span>
  );
}

// ---------- Toasts ----------
export function Toasts({ items, dismiss }: { items: Toast[]; dismiss: (id: number) => void }) {
  return (
    <div class="toasts" aria-live="polite" aria-atomic="false">
      {items.map((item) => (
        <div class={`toast toast-${item.kind}`} key={item.id} role={item.kind === 'error' ? 'alert' : 'status'}>
          <Icon name={item.kind === 'error' ? 'alert' : item.kind === 'success' ? 'check' : 'clock'} />
          <div class="toast-body">
            <p>{item.text}</p>
            {item.detail && item.detail.length > 0 && (
              <ul>
                {item.detail.slice(0, 6).map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            )}
          </div>
          <button type="button" class="icon-btn" onClick={() => dismiss(item.id)} aria-label="×">
            <Icon name="x" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ---------- Dialog ----------
export function Dialog({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ComponentChildren;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog ref={ref} class="dialog" onClose={onClose} aria-labelledby="dialog-title">
      <h2 id="dialog-title" class="dialog-title">
        {title}
      </h2>
      {children}
    </dialog>
  );
}

export function useConfirm(): [(text: string) => Promise<boolean>, preact.JSX.Element] {
  const { t } = useApp();
  const [state, setState] = useState<{ text: string; resolve: (v: boolean) => void } | null>(null);
  const ask = (text: string) => new Promise<boolean>((resolve) => setState({ text, resolve }));
  const finish = (value: boolean) => {
    state?.resolve(value);
    setState(null);
  };
  const element = (
    <Dialog open={state !== null} title={t('confirm')} onClose={() => finish(false)}>
      <p class="dialog-text">{state?.text}</p>
      <div class="dialog-actions">
        <button type="button" class="btn btn-ghost" onClick={() => finish(false)}>
          {t('cancel')}
        </button>
        <button type="button" class="btn btn-danger" onClick={() => finish(true)}>
          {t('confirm')}
        </button>
      </div>
    </Dialog>
  );
  return [ask, element];
}

export function formatDate(value: string | undefined, lang: AdminLang): string {
  if (!value) return '';
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-DZ-u-nu-latn' : 'fr-DZ', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}
