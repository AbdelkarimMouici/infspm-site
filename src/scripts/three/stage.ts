/**
 * Site-wide interactive 3D layer.
 *
 * One transparent WebGL canvas covers the window (fixed, under the header, pointer-events: none so the page
 * stays fully usable). Every element with data-3d="scene" in the page gets its own group of 3D objects that
 * follows the element while scrolling (see recipes.ts). Visitors can:
 * - hover an object (it grows and leans towards the pointer);
 * - click or tap it (it jumps, spins, bursts particles and does its own trick: the heart races, capsules open…);
 * - grab it with the mouse and throw it (it springs back home);
 * - scroll (objects wobble with the scroll speed).
 * Links, buttons and form fields always win over the 3D objects.
 *
 * Loaded lazily by src/scripts/stage-loader.ts. Pauses when the tab is hidden or when the visitor presses
 * "pause animations". All assets are generated in code (strict CSP, no requests).
 */
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  Group,
  MathUtils,
  PerspectiveCamera,
  PMREMGenerator,
  PointLight,
  Points,
  PointsMaterial,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Mesh,
  type Object3D,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildModel, type Model } from './models';
import { recipes, type Spec } from './recipes';

const CAMERA_Z = 10;
const FOV = 35;
const INTERACTIVE = 'a, button, input, textarea, select, label, summary, [contenteditable], [role="button"]';

interface Anchor {
  el: HTMLElement;
  root: Group;
  things: Thing[];
  visible: boolean;
  ax: number;
  ay: number;
  /** "rotate": dragging turns the object in place (anatomy explorer). */
  rotate: boolean;
}

/** A piece of a model that flies into place when the scene first appears. */
interface Part {
  obj: Object3D;
  pos: Vector3;
  scale: Vector3;
  from: Vector3;
  settled: boolean;
}

interface Thing {
  anchor: Anchor;
  spec: Spec;
  model: Model;
  holder: Group;
  pos: Vector3;
  vel: Vector3;
  home: Vector3;
  ang: Vector3;
  angVel: Vector3;
  base: Vector3;
  idleSpin: number;
  phase: number;
  energy: number;
  hover: number;
  bounce: number;
  grabbed: boolean;
  /** Seconds since the scene became visible (negative = waiting for its turn). */
  intro: number;
  parts: Part[];
}

const easeOutBack = (t: number) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2;
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const clamp01 = (t: number) => Math.min(Math.max(t, 0), 1);

function dotTexture(): CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.7)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  return new CanvasTexture(canvas);
}

export function startStage(elements: HTMLElement[]): () => void {
  const root = document.documentElement;
  const coarse = window.matchMedia('(pointer: coarse)').matches;

  const canvas = document.createElement('canvas');
  canvas.className = 'stage-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.append(canvas);

  const renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    antialias: !coarse,
    powerPreference: 'default',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, coarse ? 1.25 : 1.5));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  const camera = new PerspectiveCamera(FOV, 1, 0.1, 100);
  camera.position.set(0, 0, CAMERA_Z);
  scene.add(new AmbientLight(0xffffff, 0.35));
  const key = new DirectionalLight(0xffffff, 1.6);
  key.position.set(4, 6, 8);
  scene.add(key);
  const rim = new PointLight(0x35a6dd, 40, 30);
  rim.position.set(-6, -3, 4);
  scene.add(rim);

  // ---------- Scenes ----------
  function populate(anchor: Anchor, name: string): void {
    for (const thing of anchor.things) {
      anchor.root.remove(thing.holder);
      thing.holder.traverse((node) => (node as Partial<Mesh>).geometry?.dispose());
    }
    anchor.things = [];
    const specs = recipes[name] ?? recipes['default'] ?? [];
    specs.forEach((spec, index) => {
      const model = buildModel(spec.m);
      const holder = new Group();
      holder.add(model.group);
      anchor.root.add(holder);
      const base = new Vector3(spec.rx ?? 0, 0, spec.rz ?? 0);
      // Pieces that assemble themselves: the model's own list, or its direct children.
      const pieces = model.parts ?? (model.group.children.length > 2 ? model.group.children : []);
      const parts: Part[] = pieces.map((obj, i) => {
        const angle = i * 2.4;
        return {
          obj,
          pos: obj.position.clone(),
          scale: obj.scale.clone(),
          from: new Vector3(Math.cos(angle) * 2.2, 1.6 + (i % 3) * 0.6, Math.sin(angle) * 1.5),
          settled: false,
        };
      });
      const thing: Thing = {
        anchor,
        spec,
        model,
        holder,
        pos: new Vector3(spec.x, spec.y, spec.z ?? 0),
        vel: new Vector3(),
        home: new Vector3(),
        ang: base.clone().add(new Vector3(0, -1.2, 0)),
        angVel: new Vector3(),
        base,
        idleSpin: anchor.rotate ? 0.25 : (Math.random() * 0.5 + 0.25) * (Math.random() < 0.5 ? -1 : 1),
        phase: Math.random() * Math.PI * 2,
        energy: 0,
        hover: 0,
        bounce: 0,
        grabbed: false,
        intro: -index * 0.12,
        parts,
      };
      holder.userData['thing'] = thing;
      anchor.things.push(thing);
    });
  }

  const anchors: Anchor[] = elements.map((el) => {
    const group = new Group();
    scene.add(group);
    const anchor: Anchor = {
      el,
      root: group,
      things: [],
      visible: false,
      ax: 1,
      ay: 1,
      rotate: el.dataset['3dMode'] === 'rotate',
    };
    populate(anchor, el.dataset['3d'] ?? '');
    return anchor;
  });

  // Anatomy explorer: buttons swap the model shown in the scene of the same section.
  const explorerButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-explore]')];
  const onExplore = (event: Event) => {
    const button = event.currentTarget as HTMLButtonElement;
    const section = button.closest('[data-explorer]');
    const anchor = anchors.find((item) => section?.contains(item.el));
    if (!anchor || button.getAttribute('aria-pressed') === 'true') return;
    for (const other of explorerButtons) other.setAttribute('aria-pressed', String(other === button));
    populate(anchor, button.dataset['explore'] ?? '');
    wake();
  };
  for (const button of explorerButtons) button.addEventListener('click', onExplore);

  // ---------- Particles: ambient dust + click bursts ----------
  const sprite = dotTexture();
  const DUST = coarse ? 70 : 140;
  const dustBase = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i++) {
    dustBase[i * 3] = Math.random();
    dustBase[i * 3 + 1] = Math.random();
    dustBase[i * 3 + 2] = -4 + Math.random() * 5;
  }
  const dustGeo = new BufferGeometry();
  dustGeo.setAttribute('position', new BufferAttribute(new Float32Array(DUST * 3), 3));
  const dust = new Points(
    dustGeo,
    new PointsMaterial({
      size: 0.07,
      map: sprite,
      color: 0x6cc4ef,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: AdditiveBlending,
    }),
  );
  dust.renderOrder = 2;
  scene.add(dust);

  const BURST = 360;
  const burstPos = new Float32Array(BURST * 3).fill(9999);
  const burstCol = new Float32Array(BURST * 3);
  const burstVel = new Float32Array(BURST * 3);
  const burstLife = new Float32Array(BURST);
  let burstNext = 0;
  const burstGeo = new BufferGeometry();
  burstGeo.setAttribute('position', new BufferAttribute(burstPos, 3));
  burstGeo.setAttribute('color', new BufferAttribute(burstCol, 3));
  const bursts = new Points(
    burstGeo,
    new PointsMaterial({
      size: 0.14,
      map: sprite,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    }),
  );
  bursts.renderOrder = 3;
  scene.add(bursts);
  const tmpColor = new Color();
  function burst(at: Vector3, color: number, count = 28): void {
    for (let n = 0; n < count; n++) {
      const i = burstNext;
      burstNext = (burstNext + 1) % BURST;
      burstPos.set([at.x, at.y, at.z], i * 3);
      const dir = new Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize();
      const speed = 1.5 + Math.random() * 2.5;
      burstVel.set([dir.x * speed, dir.y * speed, dir.z * speed], i * 3);
      tmpColor.set(n % 3 === 0 ? 0xffffff : color);
      burstCol.set([tmpColor.r, tmpColor.g, tmpColor.b], i * 3);
      burstLife[i] = 1;
    }
  }

  // ---------- Viewport mapping ----------
  let width = 1;
  let height = 1;
  let unitsPerPx = 1;
  const resize = () => {
    width = window.innerWidth;
    height = window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    unitsPerPx = (2 * CAMERA_Z * Math.tan(MathUtils.degToRad(FOV / 2))) / height;
  };
  resize();
  window.addEventListener('resize', resize, { passive: true });

  function placeAnchors(): void {
    for (const anchor of anchors) {
      const rect = anchor.el.getBoundingClientRect();
      const margin = rect.height * 0.5;
      anchor.visible = rect.width > 0 && rect.bottom > -margin && rect.top < height + margin;
      anchor.root.visible = anchor.visible;
      if (!anchor.visible) continue;
      const r = (Math.min(rect.width, rect.height) / 2) * unitsPerPx;
      anchor.root.position.set(
        (rect.left + rect.width / 2 - width / 2) * unitsPerPx,
        -(rect.top + rect.height / 2 - height / 2) * unitsPerPx,
        0,
      );
      anchor.root.scale.setScalar(Math.max(r, 0.001));
      anchor.ax = rect.width / Math.max(Math.min(rect.width, rect.height), 1);
      anchor.ay = rect.height / Math.max(Math.min(rect.width, rect.height), 1);
    }
  }

  // ---------- Pointer ----------
  const raycaster = new Raycaster();
  const ndc = new Vector2(-10, -10);
  let needsPick = false;
  let hovered: Thing | null = null;
  let grabbed: Thing | null = null;
  let down: { x: number; y: number; thing: Thing } | null = null;
  const dragTarget = new Vector3();
  const lastClient = { x: 0, y: 0 };
  const lastDrag = new Vector3();
  let lastDragTime = 0;

  function pick(): Thing | null {
    raycaster.setFromCamera(ndc, camera);
    const targets: Object3D[] = [];
    for (const anchor of anchors) if (anchor.visible) for (const thing of anchor.things) targets.push(thing.holder);
    const hit = raycaster.intersectObjects(targets, true)[0];
    let node: Object3D | null = hit?.object ?? null;
    while (node && !node.userData['thing']) node = node.parent;
    return (node?.userData['thing'] as Thing | undefined) ?? null;
  }

  function pointerToLocal(thing: Thing, out: Vector3): void {
    raycaster.setFromCamera(ndc, camera);
    const { origin, direction } = raycaster.ray;
    const world = thing.holder.getWorldPosition(new Vector3());
    const t = (world.z - origin.z) / (direction.z || -1);
    out.copy(direction).multiplyScalar(t).add(origin);
    thing.anchor.root.worldToLocal(out);
  }

  function setNdc(event: PointerEvent): void {
    ndc.set((event.clientX / width) * 2 - 1, -(event.clientY / height) * 2 + 1);
  }

  function poke(thing: Thing): void {
    thing.energy = 1;
    thing.bounce = 1;
    thing.vel.add(new Vector3((Math.random() - 0.5) * 2, 2.2, 1.2));
    thing.angVel.set(
      (Math.random() - 0.5) * 14,
      (Math.random() < 0.5 ? -1 : 1) * (8 + Math.random() * 6),
      (Math.random() - 0.5) * 14,
    );
    thing.model.poke?.();
    const at = (thing.model.burstAt ?? new Vector3()).clone();
    thing.model.group.localToWorld(at);
    burst(at, thing.model.burstColor ?? 0x8fd3f5, 32);
    wake();
  }

  const onPointerMove = (event: PointerEvent) => {
    setNdc(event);
    needsPick = event.pointerType !== 'touch';
    if (grabbed?.anchor.rotate) {
      // Turn the object: horizontal drag spins, vertical drag tilts.
      const dx = event.clientX - lastClient.x;
      const dy = event.clientY - lastClient.y;
      lastClient.x = event.clientX;
      lastClient.y = event.clientY;
      grabbed.ang.y += dx * 0.012;
      grabbed.ang.x += dy * 0.008;
      grabbed.angVel.y = dx * 0.5;
      wake();
    } else if (grabbed) {
      pointerToLocal(grabbed, dragTarget);
      wake();
    }
  };
  const onPointerDown = (event: PointerEvent) => {
    if (paused || event.button > 0) return;
    if ((event.target as Element | null)?.closest?.(INTERACTIVE)) return;
    setNdc(event);
    const thing = pick();
    if (!thing) return;
    down = { x: event.clientX, y: event.clientY, thing };
    lastClient.x = event.clientX;
    lastClient.y = event.clientY;
    if (event.pointerType !== 'touch' || thing.anchor.rotate) {
      event.preventDefault(); // no text selection while dragging an object
      grabbed = thing;
      thing.grabbed = true;
      pointerToLocal(thing, dragTarget);
      lastDrag.copy(dragTarget);
      lastDragTime = performance.now();
      root.classList.add('is-3d-grabbing');
    }
  };
  const onPointerUp = (event: PointerEvent) => {
    if (down) {
      const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
      if (moved < (event.pointerType === 'touch' ? 12 : 6)) poke(down.thing);
    }
    if (grabbed) {
      grabbed.grabbed = false;
      if (grabbed.anchor.rotate) grabbed.vel.set(0, 0, 0);
      grabbed.vel.clampLength(0, 12);
      grabbed.angVel.y += grabbed.vel.x * 2;
    }
    grabbed = null;
    down = null;
    root.classList.remove('is-3d-grabbing');
  };
  const onMouseDown = (event: MouseEvent) => {
    if (grabbed) event.preventDefault();
  };
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp, { passive: true });
  window.addEventListener('pointercancel', onPointerUp, { passive: true });
  window.addEventListener('mousedown', onMouseDown);

  // ---------- Scroll ----------
  let lastScroll = window.scrollY;
  const onScroll = () => {
    needsPick = !coarse;
    wake();
  };
  window.addEventListener('scroll', onScroll, { passive: true });

  // ---------- Loop ----------
  let paused = root.classList.contains('motion-paused');
  let frame = 0;
  let running = false;
  let last = performance.now();
  let time = 0;
  const tmp = new Vector3();

  function step(dt: number): void {
    time += dt;
    placeAnchors();

    const scrollDelta = window.scrollY - lastScroll;
    lastScroll = window.scrollY;
    const scrollKick = MathUtils.clamp(scrollDelta, -80, 80);

    if (needsPick && !grabbed) {
      needsPick = false;
      const next = pick();
      if (next !== hovered) {
        hovered = next;
        root.classList.toggle('is-3d-hover', Boolean(hovered));
      }
    }

    // Grabbed object: follow the pointer, remember the throw speed.
    if (grabbed && !grabbed.anchor.rotate) {
      const now = performance.now();
      const elapsed = Math.max((now - lastDragTime) / 1000, 1 / 240);
      grabbed.vel.copy(dragTarget).sub(lastDrag).divideScalar(elapsed).multiplyScalar(0.6);
      lastDrag.copy(dragTarget);
      lastDragTime = now;
      grabbed.pos.lerp(tmp.set(dragTarget.x, dragTarget.y, grabbed.pos.z), 0.45);
    }

    for (const anchor of anchors) {
      if (!anchor.visible) continue;
      const wide = anchor.ax > 1.4;
      for (const thing of anchor.things) {
        const { spec } = thing;
        const [hx, hy] = wide && spec.w ? spec.w : [spec.x, spec.y];
        thing.home.set(hx * anchor.ax, hy * anchor.ay + Math.sin(time * 0.9 + thing.phase) * 0.05, spec.z ?? 0);

        if (!thing.grabbed || anchor.rotate) {
          // Spring back home (bouncy), with a kick from scrolling.
          thing.vel.addScaledVector(tmp.copy(thing.home).sub(thing.pos), 7 * dt);
          thing.vel.y -= scrollKick * 0.0009;
          thing.vel.multiplyScalar(Math.exp(-2.6 * dt));
          thing.pos.addScaledVector(thing.vel, dt);
        }
        thing.holder.position.copy(thing.pos);

        // Rotation: x/z wobble back to their base angle; y spins freely and slows down.
        const isHovered = hovered === thing;
        thing.hover = MathUtils.lerp(thing.hover, isHovered || thing.grabbed ? 1 : 0, 1 - Math.exp(-10 * dt));
        const lean = thing.hover * 0.35;
        const targetX = thing.base.x - ndc.y * lean;
        const targetZ = thing.base.z - ndc.x * lean * 0.6;
        thing.angVel.x += ((targetX - thing.ang.x) * 9 - thing.angVel.x * 2.2) * dt + scrollKick * 0.004;
        thing.angVel.z += ((targetZ - thing.ang.z) * 9 - thing.angVel.z * 2.2) * dt;
        thing.angVel.y *= Math.exp(-1.1 * dt);
        thing.ang.x += thing.angVel.x * dt;
        thing.ang.z += thing.angVel.z * dt;
        thing.ang.y += (thing.idleSpin * (1 + thing.hover * 1.5) + thing.angVel.y) * dt;
        thing.holder.rotation.set(thing.ang.x, thing.ang.y, thing.ang.z);

        thing.bounce = Math.max(0, thing.bounce - dt * 1.6);
        const wobble = Math.sin((1 - thing.bounce) * Math.PI * 5) * thing.bounce * 0.22;
        // Entrance: the object (or each of its pieces) flies in and settles, as if being assembled.
        thing.intro += dt;
        const appear = thing.parts.length > 0 ? clamp01(thing.intro / 0.35) : easeOutBack(clamp01(thing.intro / 0.9));
        thing.holder.scale.setScalar(Math.max(spec.s * (1 + thing.hover * 0.14 + wobble) * appear, 0.0001));
        thing.parts.forEach((part, i) => {
          if (part.settled) return;
          const t = clamp01((thing.intro - i * 0.09) / 0.8);
          part.obj.position.copy(part.pos).addScaledVector(part.from, 1 - easeOutCubic(t));
          part.obj.scale.copy(part.scale).multiplyScalar(Math.max(easeOutBack(t), 0.0001));
          part.settled = t >= 1;
        });

        thing.energy = Math.max(0, thing.energy - dt * 0.45);
        thing.model.update?.(time, dt, thing.energy);
      }
    }

    // Ambient dust: fills the window, drifts up and moves with the scroll (parallax by depth).
    const halfH = (height * unitsPerPx) / 2;
    const halfW = (width * unitsPerPx) / 2;
    const dustPos = dustGeo.getAttribute('position') as BufferAttribute;
    for (let i = 0; i < DUST; i++) {
      const z = dustBase[i * 3 + 2] ?? 0;
      const depth = (CAMERA_Z - z) / CAMERA_Z;
      const span = 2 * halfH * depth + 1;
      const y =
        ((((dustBase[i * 3 + 1] ?? 0) * span + time * 0.12 + window.scrollY * unitsPerPx * 0.35) % span) + span) % span;
      dustPos.setXYZ(i, ((dustBase[i * 3] ?? 0) - 0.5) * 2 * halfW * depth * 1.1, y - span / 2, z);
    }
    dustPos.needsUpdate = true;

    // Bursts: fly out, slow down, fall, fade.
    let alive = false;
    for (let i = 0; i < BURST; i++) {
      const life = burstLife[i] ?? 0;
      if (life <= 0) continue;
      alive = true;
      const next = life - dt * 1.1;
      burstLife[i] = next;
      const drag = Math.exp(-2.5 * dt);
      for (let k = 0; k < 3; k++) {
        const j = i * 3 + k;
        burstVel[j] = (burstVel[j] ?? 0) * drag - (k === 1 ? 2.2 * dt : 0);
        burstPos[j] = (burstPos[j] ?? 0) + (burstVel[j] ?? 0) * dt;
      }
      const fade = Math.max(next, 0);
      burstCol[i * 3] = (burstCol[i * 3] ?? 0) * (0.985 + 0.015 * fade);
      burstCol[i * 3 + 1] = (burstCol[i * 3 + 1] ?? 0) * (0.985 + 0.015 * fade);
      burstCol[i * 3 + 2] = (burstCol[i * 3 + 2] ?? 0) * (0.985 + 0.015 * fade);
      if (next <= 0) burstPos.set([9999, 9999, 9999], i * 3);
    }
    if (alive) {
      (burstGeo.getAttribute('position') as BufferAttribute).needsUpdate = true;
      (burstGeo.getAttribute('color') as BufferAttribute).needsUpdate = true;
    }

    // A little camera parallax with the pointer.
    camera.position.x = MathUtils.lerp(camera.position.x, coarse ? 0 : ndc.x * 0.12, 0.05);
    camera.position.y = MathUtils.lerp(camera.position.y, coarse ? 0 : ndc.y * 0.08, 0.05);
    camera.lookAt(camera.position.x * 0.5, camera.position.y * 0.5, 0);

    renderer.render(scene, camera);
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

  const onVisibility = () => (document.hidden ? sleep() : wake());
  document.addEventListener('visibilitychange', onVisibility);

  // "Pause animations" button (src/scripts/interactions.ts).
  const onMotion = (event: Event) => {
    paused = Boolean((event as CustomEvent<{ paused: boolean }>).detail?.paused);
    if (paused) {
      sleep();
      // Settle everything at home for a calm still picture.
      for (const anchor of anchors) for (const thing of anchor.things) thing.pos.copy(thing.home);
      step(0);
    } else {
      wake();
    }
  };
  window.addEventListener('infspm:motion', onMotion);

  // First frame, then show the layer.
  step(1 / 60);
  root.classList.add('has-3d');
  if (paused) {
    for (const anchor of anchors) for (const thing of anchor.things) thing.pos.copy(thing.home);
    step(0);
  } else {
    wake();
  }

  return () => {
    sleep();
    window.removeEventListener('resize', resize);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    window.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('infspm:motion', onMotion);
    document.removeEventListener('visibilitychange', onVisibility);
    renderer.dispose();
    canvas.remove();
    root.classList.remove('has-3d', 'is-3d-hover', 'is-3d-grabbing');
  };
}
