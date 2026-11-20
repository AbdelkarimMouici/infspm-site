/**
 * Progressive enhancements for every page (the site works fully without them):
 * - theme toggle (light/dark, remembered) and pause-animations toggle;
 * - scroll reveal (elements with .reveal fade in when they enter the viewport);
 * - 3D tilt with a moving light on .tilt cards (mouse and pen only, not touch, not reduced motion).
 */

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

function setupThemeToggle(): void {
  const root = document.documentElement;
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]')) {
    const sync = () => button.setAttribute('aria-pressed', String(root.dataset['theme'] === 'dark'));
    sync();
    button.addEventListener('click', () => {
      const next = root.dataset['theme'] === 'dark' ? 'light' : 'dark';
      root.dataset['theme'] = next;
      try {
        localStorage.setItem('theme', next);
      } catch {
        /* storage blocked: the choice lasts for this page only */
      }
      sync();
    });
  }
}

/** "Pause animations" (WCAG 2.2.2): stops CSS animations and the 3D layer, remembered. */
function setupMotionToggle(): void {
  const root = document.documentElement;
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-motion-toggle]')) {
    const sync = () => button.setAttribute('aria-pressed', String(root.classList.contains('motion-paused')));
    sync();
    button.addEventListener('click', () => {
      const paused = root.classList.toggle('motion-paused');
      try {
        localStorage.setItem('motion', paused ? 'paused' : 'on');
      } catch {
        /* storage blocked: the choice lasts for this page only */
      }
      window.dispatchEvent(new CustomEvent('infspm:motion', { detail: { paused } }));
      sync();
    });
  }
}

function setupReveal(): void {
  const items = document.querySelectorAll<HTMLElement>('.reveal');
  if (items.length === 0) return;
  if (reducedMotion.matches || !('IntersectionObserver' in window)) {
    for (const item of items) item.classList.add('is-visible');
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
  );
  for (const item of items) observer.observe(item);
  // Safety net: content must never stay invisible (throttled background tabs, unusual browsers).
  window.setTimeout(() => {
    for (const item of items) item.classList.add('is-visible');
    observer.disconnect();
  }, 4000);
}

function setupTilt(): void {
  if (reducedMotion.matches || !finePointer.matches) return;
  const MAX = 8; // degrees
  for (const card of document.querySelectorAll<HTMLElement>('.tilt')) {
    let frame = 0;
    card.addEventListener('pointermove', (event) => {
      const rect = card.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        card.style.setProperty('--ry', `${(x - 0.5) * 2 * MAX}deg`);
        card.style.setProperty('--rx', `${(0.5 - y) * 2 * MAX}deg`);
        card.style.setProperty('--mx', `${x * 100}%`);
        card.style.setProperty('--my', `${y * 100}%`);
      });
    });
    card.addEventListener('pointerleave', () => {
      cancelAnimationFrame(frame);
      card.style.setProperty('--rx', '0deg');
      card.style.setProperty('--ry', '0deg');
    });
  }
}

/** Cursor ring (follows with a little lag) and dot (exact). Mouse and pen only. */
function setupCursor(): void {
  if (reducedMotion.matches || !finePointer.matches) return;
  const ring = document.createElement('div');
  const dot = document.createElement('div');
  ring.className = 'cursor-ring';
  dot.className = 'cursor-dot';
  for (const el of [ring, dot]) {
    el.setAttribute('aria-hidden', 'true');
    document.body.append(el);
  }
  const target = { x: -100, y: -100 };
  const pos = { x: -100, y: -100 };
  let scale = 1;
  let goal = 1;
  let frame = 0;
  const tick = () => {
    pos.x += (target.x - pos.x) * 0.2;
    pos.y += (target.y - pos.y) * 0.2;
    scale += (goal - scale) * 0.2;
    ring.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0) scale(${scale})`;
    dot.style.transform = `translate3d(${target.x}px, ${target.y}px, 0)`;
    const moving = Math.abs(target.x - pos.x) + Math.abs(target.y - pos.y) + Math.abs(goal - scale) > 0.1;
    frame = moving ? requestAnimationFrame(tick) : 0;
  };
  const kick = () => {
    if (!frame) frame = requestAnimationFrame(tick);
  };
  window.addEventListener(
    'pointermove',
    (event) => {
      if (event.pointerType === 'touch') return;
      target.x = event.clientX;
      target.y = event.clientY;
      const overLink = (event.target as Element | null)?.closest?.('a, button, summary, label, input, select, textarea');
      const grab = document.documentElement.classList.contains('is-3d-hover');
      goal = overLink ? 1.6 : grab ? 1.35 : 1;
      ring.classList.toggle('is-link', Boolean(overLink) || grab);
      ring.classList.add('is-active');
      dot.classList.add('is-active');
      kick();
    },
    { passive: true },
  );
  window.addEventListener('pointerdown', () => {
    goal = 0.8;
    kick();
  });
  window.addEventListener('pointerup', () => {
    goal = 1;
    kick();
  });
  document.documentElement.addEventListener('pointerleave', () => {
    ring.classList.remove('is-active');
    dot.classList.remove('is-active');
  });
}

/** Full-screen menu: Escape closes it and returns focus to the menu button. */
function setupMenu(): void {
  const menu = document.querySelector<HTMLDetailsElement>('[data-site-menu]');
  if (!menu) return;
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menu.open) {
      menu.open = false;
      menu.querySelector('summary')?.focus();
    }
  });
}

/** Buttons drawn slightly towards the pointer. */
function setupMagnetic(): void {
  if (reducedMotion.matches || !finePointer.matches) return;
  for (const element of document.querySelectorAll<HTMLElement>('[data-magnetic]')) {
    element.addEventListener('pointermove', (event) => {
      const rect = element.getBoundingClientRect();
      const x = event.clientX - (rect.left + rect.width / 2);
      const y = event.clientY - (rect.top + rect.height / 2);
      element.style.transform = `translate3d(${x * 0.25}px, ${y * 0.35}px, 0)`;
    });
    element.addEventListener('pointerleave', () => {
      element.style.transform = '';
    });
  }
}

setupThemeToggle();
setupMotionToggle();
setupReveal();
setupTilt();
setupCursor();
setupMenu();
setupMagnetic();
