/**
 * Decides whether to load the site-wide 3D layer (src/scripts/three/stage.ts, ~150 KB gzip with Three.js) and
 * loads it after the page has displayed. Skipped for: reduced motion, data saver, very weak devices, no WebGL.
 * Without it, each 3D spot shows its static illustration: the page is complete either way.
 */
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

const spots = [...document.querySelectorAll<HTMLElement>('[data-3d]')];

if (spots.length > 0 && worthLoading()) {
  const start = () =>
    whenIdle(() => {
      import('./three/stage')
        .then(({ startStage }) => startStage(spots))
        .catch(() => {
          /* keep the static illustrations */
        });
    });
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}

export {};
