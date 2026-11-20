/**
 * Loads the home-page journey (journey.ts, Three.js + bloom) after the page has displayed, only when it is
 * worth it: no reduced motion, no data saver, a capable device and WebGL 2. Otherwise the chapters stay as
 * readable cards on illustrated backgrounds: the page is complete either way.
 */
type NetworkInformation = { saveData?: boolean; effectiveType?: string };

function worthLoading(): boolean {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  if (connection?.saveData || connection?.effectiveType === '2g' || connection?.effectiveType === 'slow-2g') return false;
  if ((navigator.hardwareConcurrency ?? 4) < 4) return false;
  try {
    return Boolean(document.createElement('canvas').getContext('webgl2'));
  } catch {
    return false;
  }
}

function whenIdle(callback: () => void): void {
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number })
    .requestIdleCallback;
  if (idle) idle(callback, { timeout: 2000 });
  else window.setTimeout(callback, 800);
}

const root = document.querySelector<HTMLElement>('[data-journey]');

if (root && worthLoading()) {
  const start = () =>
    whenIdle(() => {
      import('./journey')
        .then(({ startJourney }) => startJourney(root))
        .catch(() => {
          /* keep the static chapters */
        });
    });
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}

export {};
