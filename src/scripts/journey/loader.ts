/**
 * Loads the 3D world after the page has displayed, only when it is worth it: no reduced motion, no data
 * saver, a capable device and WebGL 2. Otherwise pages stay complete and readable on their dark backgrounds.
 * - home page ([data-journey]): the scroll-driven journey through the body (journey.ts);
 * - other pages (<html data-backdrop="section">): the section's living backdrop (backdrop.ts).
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

function start(): void {
  const journey = document.querySelector<HTMLElement>('[data-journey]');
  const backdrop = document.documentElement.dataset['backdrop'];
  whenIdle(() => {
    const loading = journey
      ? import('./journey').then(({ startJourney }) => startJourney(journey))
      : backdrop
        ? import('./backdrop').then(({ startBackdrop }) => startBackdrop(backdrop))
        : Promise.resolve();
    loading.catch(() => {
      /* keep the static page */
    });
  });
}

if (worthLoading()) {
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}

export {};
