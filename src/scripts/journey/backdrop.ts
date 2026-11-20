/**
 * Living 3D backdrop for the inner pages: each section has its organ or cells, in the same cinematic
 * style as the home journey (bloom, fog, glowing dust).
 *   about / privacy / default → DNA · programs / contact → heart · admissions → lungs
 *   news → neuron brain · activities / gallery → blood cells
 *
 * The scene sits beside the page title and drifts up as you scroll (parallax), leaving the content on
 * a calm dark field. Click on an empty area to play (spin, heartbeat, breath, signal, burst); press and
 * hold for a breath on the admissions page. Links, buttons and fields always keep working.
 */
import {
  ACESFilmicToneMapping,
  AmbientLight,
  DirectionalLight,
  FogExp2,
  Group,
  HalfFloatType,
  MathUtils,
  PerspectiveCamera,
  PointLight,
  Scene,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { BG, buildBrain, buildCells, buildDust, buildHeart, buildIntro, buildLungs, type Quality } from './scenes';

const INTERACTIVE = 'a, button, input, textarea, select, label, summary, [contenteditable], [role="button"]';

interface Feature {
  group: Group;
  update: (time: number, dt: number) => void;
  poke: () => void;
  hold?: (on: boolean) => void;
  scale: number;
  bloom: number;
}

function buildFeature(kind: string, q: Quality, side: number): Feature {
  switch (kind) {
    case 'programs':
    case 'contact': {
      const heart = buildHeart(q);
      return { group: heart.group, update: heart.update, poke: heart.boost, scale: 0.55, bloom: 0.8 };
    }
    case 'admissions': {
      const lungs = buildLungs(q);
      return {
        group: lungs.group,
        update: lungs.update,
        poke: () => {
          lungs.setHold(true);
          window.setTimeout(() => lungs.setHold(false), 1400);
        },
        hold: lungs.setHold,
        scale: 0.62,
        bloom: 0.65,
      };
    }
    case 'news': {
      const brain = buildBrain(q);
      return {
        group: brain.group,
        update: (time, dt) => brain.update(time, dt, true),
        poke: () => brain.fire(undefined, 8),
        scale: 0.75,
        bloom: 1.05,
      };
    }
    case 'activities':
    case 'gallery': {
      const cells = buildCells(q);
      return { group: cells.group, update: cells.update, poke: cells.burst, scale: 0.6, bloom: 0.6 };
    }
    default: {
      const dna = buildIntro(side, false);
      dna.group.position.x = -side * 6.5; // the helix is offset inside its group: re-centre it
      dna.group.position.z = 6;
      return { group: dna.group, update: dna.update, poke: dna.poke, scale: 0.85, bloom: 0.95 };
    }
  }
}

export function startBackdrop(kind: string): () => void {
  const html = document.documentElement;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const q: Quality = { low: true };
  const side = html.dir === 'rtl' ? -1 : 1;

  const canvas = document.createElement('canvas');
  canvas.className = 'backdrop-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);

  const renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'default' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, coarse ? 1 : 1.25));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(BG, 1);

  const scene = new Scene();
  scene.background = BG;
  scene.fog = new FogExp2(BG, 0.012);
  const camera = new PerspectiveCamera(50, 1, 0.1, 300);
  camera.position.set(0, 0, 34);
  scene.add(new AmbientLight(0xffffff, 0.45));
  const sun = new DirectionalLight(0xffffff, 1.2);
  sun.position.set(5, 10, 8);
  scene.add(sun);
  const glow = new PointLight(0xff3355, kind === 'programs' || kind === 'contact' ? 260 : 0, 50, 1.4);
  scene.add(glow);

  const dust = buildDust(q);
  dust.points.position.z = -60;
  scene.add(dust.points);
  const holder = new Group();
  const feature = buildFeature(kind, q, side);
  feature.group.scale.multiplyScalar(feature.scale);
  holder.add(feature.group);
  scene.add(holder);

  const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new Vector2(1, 1), feature.bloom, 0.6, 0.2);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  let width = 1;
  let height = 1;
  let unitsPerPx = 0.03;
  const resize = () => {
    width = window.innerWidth;
    height = window.innerHeight;
    renderer.setSize(width, height, false);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(width, height);
    bloom.resolution.set(width / 2, height / 2);
    camera.aspect = width / height;
    camera.fov = camera.aspect < 0.8 ? 68 : 50;
    camera.updateProjectionMatrix();
    unitsPerPx = (2 * camera.position.z * Math.tan(MathUtils.degToRad(camera.fov / 2))) / height;
    // Beside the title on wide screens (inline-end side), behind the title on phones.
    const wide = camera.aspect > 1.1;
    holder.position.set(wide ? side * Math.min(camera.aspect * 7, 15) : 0, wide ? 1 : 5, wide ? 0 : -14);
    glow.position.copy(holder.position);
  };

  // ---------- Interaction ----------
  const pointer = new Vector2();
  const isInteractive = (event: Event) => Boolean((event.target as Element | null)?.closest?.(INTERACTIVE));
  const onMove = (event: PointerEvent) => {
    pointer.set((event.clientX / width) * 2 - 1, -(event.clientY / height) * 2 + 1);
  };
  const onClick = (event: MouseEvent) => {
    if (isInteractive(event) || window.getSelection()?.toString()) return;
    feature.poke();
    kick = 1;
    wake();
  };
  const onDown = (event: PointerEvent) => {
    if (feature.hold && event.pointerType === 'mouse' && !isInteractive(event)) feature.hold(true);
  };
  const onUp = () => feature.hold?.(false);
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('click', onClick);
  window.addEventListener('pointerdown', onDown);
  window.addEventListener('pointerup', onUp, { passive: true });

  // ---------- Loop ----------
  let time = 0;
  let last = performance.now();
  let frame = 0;
  let running = false;
  let paused = html.classList.contains('motion-paused');
  let kick = 0;
  let camY = 0;

  function step(dt: number): void {
    time += dt;
    // Scroll parallax: the camera moves down more slowly than the page, so the organ drifts up and away.
    const goalY = -window.scrollY * unitsPerPx * 0.45;
    camY = dt === 0 ? goalY : camY + (goalY - camY) * (1 - Math.exp(-6 * dt));
    camera.position.x = MathUtils.lerp(camera.position.x, coarse ? 0 : pointer.x * 1.6, 0.05);
    camera.position.y = camY + (coarse ? 0 : pointer.y * 1);
    camera.lookAt(camera.position.x * 0.4, camY, 0);
    kick *= Math.exp(-2 * dt);
    holder.rotation.y = pointer.x * 0.25 + kick * 0.3;
    holder.rotation.x = -pointer.y * 0.12;
    // Dim the glow once the organ has drifted away, so long pages stay calm.
    const away = MathUtils.clamp(window.scrollY / (height * 1.2), 0, 1);
    bloom.strength = feature.bloom * (1 - away * 0.55);
    dust.update(time);
    if (away < 0.999 || dt === 0) feature.update(time, dt);
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
  window.addEventListener('resize', resize, { passive: true });

  resize();
  step(1 / 60);
  html.classList.add('has-backdrop');
  wake();

  return () => {
    sleep();
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('click', onClick);
    window.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('infspm:motion', onMotion);
    window.removeEventListener('resize', resize);
    document.removeEventListener('visibilitychange', onVisibility);
    composer.dispose();
    renderer.dispose();
    canvas.remove();
    html.classList.remove('has-backdrop');
  };
}
