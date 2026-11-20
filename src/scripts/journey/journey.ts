/**
 * Home-page journey through the human body.
 *
 * A fixed full-window WebGL canvas sits behind the page. Scrolling moves the camera along a rail:
 * DNA intro → blood vessel → heart → lungs → brain → pull back. Each chapter of the page
 * (<section data-chapter>) maps to a stretch of the rail. Cinematic look: bloom, fog, ACES tone mapping.
 *
 * Interactions (links, buttons and text always keep working; the canvas never takes clicks):
 * - intro: click to spin the DNA;
 * - vessel: click to speed up the blood flow (warp);
 * - heart: click the heart to raise its beat (live BPM counter);
 * - lungs: press and hold (or the "breathe" button) to inhale, oxygen flows to the alveoli;
 * - brain: click to fire a neural signal (or the "fire" button) that cascades through the network.
 *
 * Loaded lazily by loader.ts only on capable devices without reduced motion. Pauses with the
 * "pause animations" button and when the tab is hidden.
 */
import {
  ACESFilmicToneMapping,
  AmbientLight,
  CatmullRomCurve3,
  DirectionalLight,
  FogExp2,
  HalfFloatType,
  MathUtils,
  PerspectiveCamera,
  PointLight,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { BG, buildBrain, buildDust, buildHeart, buildIntro, buildLungs, buildVessel, type Quality } from './scenes';

const INTERACTIVE = 'a, button, input, textarea, select, label, summary, [contenteditable], [role="button"]';

// Camera rail: [camera position, look-at target]. Chapters map to stretches of these keys.
const KEYS: [number, number, number, number, number, number][] = [
  [0, 0, 16, 0, 0, 0], // 0 intro
  [0, 0, 7, 0, 0, -10],
  [0, 0, -12, 0, 0, -30], // 2 vessel
  [2.4, 1, -40, 2.6, 1, -55],
  [-2, -0.8, -66, -1, -0.3, -80],
  [0.5, 0.3, -96, 0, 0, -115], // 5 vessel end
  [0, 0, -122, 0, 0, -150], // 6 heart ahead
  [17, 4, -146, 0, 0, -150], // 7 orbit
  [4, 9, -170, 0, -1, -205], // 8 towards lungs
  [0, 4, -190, 0, -1, -215], // 9 lungs
  [-17, -2, -208, 0, -2, -216], // 10 lungs side
  [0, 2, -252, 0, 0, -280], // 11 brain
  [7, 2, -270, 0, 0, -282], // 12 inside the brain
  [0, 26, -232, 0, 0, -280], // 13 pull back
];
const CHAPTER_KEYS: [number, number][] = [
  [0, 2],
  [2, 5],
  [5, 8],
  [8, 10],
  [10, 12],
  [12, 13],
];
const VESSEL_POINTS = [
  [0, 0, -9],
  [0, 0, -24],
  [3, 1.2, -42],
  [-2.5, -1, -64],
  [1.5, 0.8, -86],
  [0, 0, -104],
  [0, 0, -116],
].map(([x, y, z]) => new Vector3(x, y, z));

export function startJourney(root: HTMLElement): () => void {
  const html = document.documentElement;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const q: Quality = { low: coarse || (navigator.hardwareConcurrency ?? 8) < 6 };
  const side = html.dir === 'rtl' ? -1 : 1;

  const canvas = document.createElement('canvas');
  canvas.className = 'journey-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  root.prepend(canvas);

  const renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.low ? 1 : 1.5));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.setClearColor(BG, 1);

  const scene = new Scene();
  scene.background = BG;
  scene.fog = new FogExp2(BG, 0.014);
  const camera = new PerspectiveCamera(60, 1, 0.1, 400);
  scene.add(camera);
  scene.add(new AmbientLight(0xffffff, 0.45));
  const sun = new DirectionalLight(0xffffff, 1.2);
  sun.position.set(5, 10, 8);
  scene.add(sun);
  const headLight = new PointLight(0xffe2e8, 14, 30, 1.6);
  camera.add(headLight);

  // ---------- World ----------
  const dust = buildDust(q);
  scene.add(dust.points);
  const intro = buildIntro(side);
  scene.add(intro.group);
  const vessel = buildVessel(VESSEL_POINTS, q);
  scene.add(vessel.group);
  const heart = buildHeart(q);
  heart.group.position.set(0, 0, -150);
  scene.add(heart.group);
  const heartLight = new PointLight(0xff3355, 400, 60, 1.4);
  heartLight.position.set(0, 0, -150);
  scene.add(heartLight);
  const lungs = buildLungs(q);
  lungs.group.position.set(0, -2, -216);
  scene.add(lungs.group);
  const brain = buildBrain(q);
  brain.group.position.set(0, 0, -282);
  scene.add(brain.group);

  const camPath = new CatmullRomCurve3(KEYS.map((k) => new Vector3(k[0], k[1], k[2])));
  const lookPath = new CatmullRomCurve3(KEYS.map((k) => new Vector3(k[3], k[4], k[5])));

  // ---------- Post-processing ----------
  const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: q.low ? 0 : 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new Vector2(1, 1), q.low ? 0.75 : 0.95, 0.65, 0.18);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  let width = 1;
  let height = 1;
  const resize = () => {
    width = window.innerWidth;
    height = window.innerHeight;
    renderer.setSize(width, height, false);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(width, height);
    bloom.resolution.set(width / 2, height / 2);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    measure();
  };

  // ---------- Chapters and scroll ----------
  const chapters = [...root.querySelectorAll<HTMLElement>('section[data-chapter]')];
  const hudLinks = [...root.querySelectorAll<HTMLAnchorElement>('[data-hud] a')];
  let spans: { top: number; height: number }[] = [];
  function measure(): void {
    spans = chapters.map((el) => {
      const rect = el.getBoundingClientRect();
      return { top: rect.top + window.scrollY, height: rect.height };
    });
  }

  let active = 0;
  function scrollTarget(): number {
    const y = window.scrollY + height * 0.3;
    let key = 0;
    for (let i = 0; i < spans.length; i++) {
      const span = spans[i];
      const keys = CHAPTER_KEYS[i];
      if (!span || !keys) continue;
      const local = MathUtils.clamp((y - span.top) / span.height, 0, 1);
      if (y >= span.top || i === 0) {
        key = keys[0] + (keys[1] - keys[0]) * local;
        active = i;
      }
    }
    return key / (KEYS.length - 1);
  }

  function setActiveUi(index: number): void {
    if (root.dataset['active'] === String(index)) return;
    root.dataset['active'] = String(index);
    hudLinks.forEach((link, i) => {
      if (i === index) link.setAttribute('aria-current', 'step');
      else link.removeAttribute('aria-current');
    });
  }

  // ---------- Pointer and interactions ----------
  const pointer = new Vector2();
  const raycaster = new Raycaster();
  let warp = 0;
  const onMove = (event: PointerEvent) => {
    pointer.set((event.clientX / width) * 2 - 1, -(event.clientY / height) * 2 + 1);
  };
  const isInteractive = (event: Event) => Boolean((event.target as Element | null)?.closest?.(INTERACTIVE));
  const onClick = (event: MouseEvent) => {
    if (isInteractive(event)) return;
    pointer.set((event.clientX / width) * 2 - 1, -(event.clientY / height) * 2 + 1);
    if (active === 0) intro.poke();
    else if (active === 1) warp = 1;
    else if (active === 2) {
      raycaster.setFromCamera(pointer, camera);
      if (raycaster.intersectObject(heart.hit, true).length > 0) heart.boost();
    } else if (active === 4 || active === 5) {
      if (!brain.fireNearest(pointer, camera)) brain.fire(undefined, 6);
    }
    wake();
  };
  const onDown = (event: PointerEvent) => {
    if (active === 3 && event.pointerType === 'mouse' && !isInteractive(event)) lungs.setHold(true);
  };
  const onUp = () => {
    if (!breathing) lungs.setHold(false);
  };
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('click', onClick);
  window.addEventListener('pointerdown', onDown);
  window.addEventListener('pointerup', onUp, { passive: true });

  // Buttons in the chapter cards (keyboard and touch friendly).
  let breathing = false;
  const breathe = root.querySelector<HTMLButtonElement>('[data-breathe]');
  const holdOn = () => {
    breathing = true;
    lungs.setHold(true);
    breathe?.classList.add('is-holding');
    breathe?.setAttribute('aria-pressed', 'true');
  };
  const holdOff = () => {
    breathing = false;
    lungs.setHold(false);
    breathe?.classList.remove('is-holding');
    breathe?.setAttribute('aria-pressed', 'false');
  };
  breathe?.addEventListener('pointerdown', holdOn);
  breathe?.addEventListener('pointerup', holdOff);
  breathe?.addEventListener('pointerleave', holdOff);
  breathe?.addEventListener('pointercancel', holdOff);
  breathe?.addEventListener('keydown', (event) => {
    if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
      event.preventDefault();
      holdOn();
    }
  });
  breathe?.addEventListener('keyup', (event) => {
    if (event.key === ' ' || event.key === 'Enter') holdOff();
  });
  breathe?.addEventListener('contextmenu', (event) => event.preventDefault());
  root.querySelector<HTMLButtonElement>('[data-fire]')?.addEventListener('click', () => {
    brain.fire(undefined, 8);
    wake();
  });
  root.querySelector<HTMLButtonElement>('[data-pump]')?.addEventListener('click', () => {
    heart.boost();
    wake();
  });
  const bpmEl = root.querySelector<HTMLElement>('[data-bpm]');
  const o2El = root.querySelector<HTMLElement>('[data-o2]');

  // ---------- Loop ----------
  let t = scrollTarget();
  let time = 0;
  let last = performance.now();
  let frame = 0;
  let running = false;
  let paused = html.classList.contains('motion-paused');
  let uiTimer = 0;
  const look = new Vector3();
  const right = new Vector3();
  const up = new Vector3();

  function step(dt: number): void {
    time += dt;
    const goal = scrollTarget();
    t += (goal - t) * (1 - Math.exp(-3.2 * dt));
    if (dt === 0) t = goal;
    setActiveUi(active);

    camPath.getPoint(t, camera.position);
    lookPath.getPoint(t, look);
    camera.lookAt(look);
    if (!coarse) {
      right.setFromMatrixColumn(camera.matrixWorld, 0);
      up.setFromMatrixColumn(camera.matrixWorld, 1);
      camera.position.addScaledVector(right, pointer.x * 0.9).addScaledVector(up, pointer.y * 0.6);
      camera.lookAt(look);
    }
    warp *= Math.exp(-1.6 * dt);
    const fov = (camera.aspect < 0.8 ? 76 : 60) + warp * 18;
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }

    const z = camera.position.z;
    intro.group.visible = z > -40;
    vessel.group.visible = z > -118 && z < 10;
    heart.group.visible = z < -90 && z > -215;
    lungs.group.visible = z < -160 && z > -265;
    brain.group.visible = z < -215;

    dust.update(time);
    if (intro.group.visible) intro.update(time, dt);
    if (vessel.group.visible) vessel.update(time, dt, warp);
    if (heart.group.visible) heart.update(time, dt);
    if (lungs.group.visible) lungs.update(time, dt);
    if (brain.group.visible) brain.update(time, dt, active >= 4);

    uiTimer -= dt;
    if (uiTimer <= 0) {
      uiTimer = 0.2;
      const bpm = heart.bpm();
      if (bpmEl) {
        bpmEl.textContent = String(Math.round(bpm));
        bpmEl.parentElement?.style.setProperty('--beat', `${(60 / bpm).toFixed(2)}s`);
      }
      o2El?.style.setProperty('--fill', lungs.fill().toFixed(2));
    }

    // Glow strength per chapter (the vessel is already bright).
    const glow = [0.95, 0.42, 0.75, 0.62, 1.05, 1][active] ?? 0.9;
    bloom.strength += (glow - bloom.strength) * (1 - Math.exp(-2 * dt));
    if (dt === 0) bloom.strength = glow;
    composer.render(dt);
  }

  function loop(): void {
    if (!running) return;
    frame = requestAnimationFrame(loop);
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 1 / 20);
    last = now;
    step(dt);
  }
  function wake(): void {
    if (running || paused || document.hidden) return;
    running = true;
    last = performance.now();
    loop();
  }
  function sleep(): void {
    running = false;
    cancelAnimationFrame(frame);
  }

  // While paused, scrolling still moves the camera (one still frame per scroll).
  let pending = 0;
  const onScroll = () => {
    if (!paused || pending) return;
    pending = requestAnimationFrame(() => {
      pending = 0;
      step(0);
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  const onVisibility = () => (document.hidden ? sleep() : wake());
  document.addEventListener('visibilitychange', onVisibility);
  const onMotion = (event: Event) => {
    paused = Boolean((event as CustomEvent<{ paused: boolean }>).detail?.paused);
    if (paused) sleep();
    else wake();
  };
  window.addEventListener('infspm:motion', onMotion);
  const onResize = () => resize();
  window.addEventListener('resize', onResize, { passive: true });
  const resizeObserver = new ResizeObserver(() => measure());
  resizeObserver.observe(root);

  resize();
  step(0);
  html.classList.add('has-journey');
  wake();

  return () => {
    sleep();
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('click', onClick);
    window.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('infspm:motion', onMotion);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVisibility);
    resizeObserver.disconnect();
    composer.dispose();
    renderer.dispose();
    canvas.remove();
    html.classList.remove('has-journey');
  };
}
