/**
 * Home-page stories viewer (Stories.astro): full-screen slides with progress bars, auto-advance,
 * tap / swipe / keyboard navigation, hold to pause, swipe down or Escape to close.
 * "Forward" follows the reading direction: left in Arabic, right in French and English.
 */
const DURATION = 6000;

function init(root: HTMLElement): void {
  const viewerEl = root.querySelector<HTMLElement>('[data-viewer]');
  const cardEl = root.querySelector<HTMLElement>('[data-card]');
  if (!viewerEl || !cardEl) return;
  const viewer: HTMLElement = viewerEl;
  const card: HTMLElement = cardEl;
  const q = <T extends HTMLElement>(sel: string) => viewer.querySelector<T>(sel) as T;
  const bars = q('[data-bars]');
  const body = q('[data-body]');
  const nameEl = q('[data-name]');
  const avatar = q('[data-av]');
  const cta = q<HTMLAnchorElement>('[data-cta]');
  const ctaLabel = q('[data-cta-label]');
  const pauseBtn = q<HTMLButtonElement>('[data-pause]');
  const circles = [...root.querySelectorAll<HTMLButtonElement>('[data-story]')];
  const templates = [...root.querySelectorAll<HTMLTemplateElement>('template[data-story-slides]')];
  const icons = root.querySelector<HTMLTemplateElement>('template[data-story-icons]');
  const rtl = document.documentElement.dir === 'rtl';
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('motion-paused');

  const seenKey = 'stories-seen';
  const seen = new Set<string>();
  try {
    for (const key of JSON.parse(localStorage.getItem(seenKey) ?? '[]') as string[]) seen.add(key);
  } catch {
    /* storage blocked: nothing remembered */
  }
  const markSeen = (index: number) => {
    const circle = circles[index];
    if (!circle) return;
    circle.classList.add('is-seen');
    seen.add(circle.dataset['key'] ?? '');
    try {
      localStorage.setItem(seenKey, JSON.stringify([...seen].slice(-50)));
    } catch {
      /* ignore */
    }
  };
  circles.forEach((circle) => {
    if (seen.has(circle.dataset['key'] ?? '')) circle.classList.add('is-seen');
  });

  const slidesOf = (index: number) => [...(templates[index]?.content.children ?? [])] as HTMLElement[];
  let story = 0;
  let slide = 0;
  let started = 0;
  let elapsed = 0;
  let paused = false;
  let frame = 0;
  let opener: HTMLElement | null = null;
  let suppressClick = false;

  function open(index: number, from: HTMLElement): void {
    opener = from;
    story = index;
    slide = 0;
    viewer.hidden = false;
    document.documentElement.classList.add('story-open');
    setPaused(false);
    show();
    q<HTMLButtonElement>('[data-close]').focus();
  }

  function close(): void {
    cancelAnimationFrame(frame);
    viewer.hidden = true;
    document.documentElement.classList.remove('story-open');
    opener?.focus();
  }

  function fill(ratio: number): void {
    const bar = bars.children[slide]?.firstElementChild as HTMLElement | null;
    if (bar) bar.style.transform = `scaleX(${ratio})`;
  }

  function show(): void {
    const template = templates[story];
    const slides = slidesOf(story);
    const current = slides[slide];
    if (!template || !current) return close();
    for (const name of ['navy', 'sky', 'rose', 'violet', 'teal', 'amber']) card.classList.toggle(`c-${name}`, template.dataset['color'] === name);
    nameEl.textContent = template.dataset['name'] ?? '';
    avatar.replaceChildren(...[...(icons?.content.querySelector(`[data-icon-for="${story}"]`)?.cloneNode(true).childNodes ?? [])]);
    bars.replaceChildren(
      ...slides.map((_, k) => {
        const bar = document.createElement('span');
        bar.className = k < slide ? 'v-bar is-done' : 'v-bar';
        bar.append(document.createElement('i'));
        return bar;
      }),
    );
    const node = current.cloneNode(true) as HTMLElement;
    body.replaceChildren(node);
    if (!still) node.classList.add('slide-in');
    const href = current.dataset['href'];
    cta.hidden = !href;
    if (href) {
      cta.href = href;
      ctaLabel.textContent = current.dataset['label'] ?? '';
    }
    markSeen(story);
    elapsed = 0;
    started = performance.now();
    cancelAnimationFrame(frame);
    if (still) {
      fill(1);
      return;
    }
    tick();
  }

  function tick(): void {
    frame = requestAnimationFrame(() => {
      if (!paused) {
        const time = elapsed + (performance.now() - started);
        fill(Math.min(1, time / DURATION));
        if (time >= DURATION) {
          next();
          return;
        }
      }
      tick();
    });
  }

  function setPaused(value: boolean): void {
    if (value === paused) return;
    if (value) elapsed += performance.now() - started;
    else started = performance.now();
    paused = value;
    viewer.classList.toggle('is-paused', value);
    pauseBtn.setAttribute('aria-label', (value ? pauseBtn.dataset['labelPlay'] : pauseBtn.dataset['labelPause']) ?? '');
  }

  function next(): void {
    if (slide < slidesOf(story).length - 1) slide++;
    else if (story < templates.length - 1) {
      story++;
      slide = 0;
    } else return close();
    show();
  }

  function prev(): void {
    if (slide > 0) slide--;
    else if (story > 0) {
      story--;
      slide = slidesOf(story).length - 1;
    }
    show();
  }

  function jump(delta: number): void {
    const target = story + delta;
    if (target < 0) return show();
    if (target >= templates.length) return close();
    story = target;
    slide = 0;
    show();
  }

  circles.forEach((circle) => circle.addEventListener('click', () => open(Number(circle.dataset['story']), circle)));
  q('[data-close]').addEventListener('click', close);
  pauseBtn.addEventListener('click', () => setPaused(!paused));
  q('[data-next]').addEventListener('click', () => {
    if (!suppressClick) next();
  });
  q('[data-prev]').addEventListener('click', () => {
    if (!suppressClick) prev();
  });
  viewer.addEventListener('click', (event) => {
    if (event.target === viewer) close();
  });

  document.addEventListener('keydown', (event) => {
    if (viewer.hidden) return;
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
    const back = rtl ? 'ArrowRight' : 'ArrowLeft';
    if (event.key === 'Escape') close();
    else if (event.key === forward) next();
    else if (event.key === back) prev();
    else if (event.key === 'Tab') {
      const focusable = [...card.querySelectorAll<HTMLElement>('button, a[href]')].filter((el) => !el.hidden && el.offsetParent !== null);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  });

  // Hold to pause; swipe sideways for the next/previous story, swipe down to close.
  let down: { x: number; y: number } | null = null;
  let held = false;
  let holdTimer = 0;
  const swallowClick = () => {
    suppressClick = true;
    setTimeout(() => {
      suppressClick = false;
    }, 0);
  };
  card.addEventListener('pointerdown', (event) => {
    if ((event.target as HTMLElement).closest('.v-btn, .v-cta')) return;
    down = { x: event.clientX, y: event.clientY };
    held = false;
    holdTimer = window.setTimeout(() => {
      held = true;
      setPaused(true);
    }, 250);
  });
  card.addEventListener('pointerup', (event) => {
    clearTimeout(holdTimer);
    if (!down) return;
    const dx = event.clientX - down.x;
    const dy = event.clientY - down.y;
    down = null;
    if (held) {
      held = false;
      setPaused(false);
      swallowClick();
      return;
    }
    if (dy > 90 && Math.abs(dy) > Math.abs(dx)) {
      swallowClick();
      close();
    } else if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
      swallowClick();
      // The next story comes in from the reading direction's end: swipe right in Arabic, left in French/English.
      const forward = rtl ? dx > 0 : dx < 0;
      jump(forward ? 1 : -1);
    }
  });
  card.addEventListener('pointercancel', () => {
    clearTimeout(holdTimer);
    down = null;
    if (held) {
      held = false;
      setPaused(false);
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (!viewer.hidden) setPaused(document.hidden);
  });
}

for (const root of document.querySelectorAll<HTMLElement>('.stories-block')) init(root);
