/**
 * Decides whether to load the 3D hero (src/scripts/hero-3d.ts, ~150 KB with Three.js) and loads it after the
 * page has displayed. Skipped for: reduced motion, data saver, very weak devices, no WebGL.
 * Without it, the animated CSS logo stays: the page is complete either way.
 */
const container = document.querySelector<HTMLElement>('[data-hero-3d]');
const canvas = container?.querySelector<HTMLCanvasElement>('canvas');
const logoUrl = container?.dataset['logo'];

type NetworkInformation = { saveData?: boolean; effectiveType?: string };

function worthLoading(): boolean {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  if (connection?.saveData || connection?.effectiveType === '2g' || connection?.effectiveType === 'slow-2g') return false;
  if ((navigator.hardwareConcurrency ?? 4) < 4) return false;
  try {
    const probe = document.createElement('canvas');
    return Boolean(probe.getContext('webgl2') ?? probe.getContext('webgl'));
  } catch {
    return false;
  }
}

function whenIdle(callback: () => void): void {
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number })
    .requestIdleCallback;
  if (idle) idle(callback, { timeout: 2500 });
  else window.setTimeout(callback, 1200);
}

if (container && canvas && logoUrl && worthLoading()) {
  const start = () =>
    whenIdle(() => {
      import('./hero-3d')
        .then(({ startHero }) => startHero(container, canvas, logoUrl))
        .catch(() => {
          /* keep the CSS version */
        });
    });
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}
