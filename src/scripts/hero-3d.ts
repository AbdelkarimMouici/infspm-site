/**
 * Home hero 3D scene: the institute's logo as a metallic medallion, a glowing DNA double helix and a field of
 * floating particles. Interactive: follows the pointer, can be dragged to spin, reacts to scrolling.
 *
 * Loaded lazily by src/scripts/hero-loader.ts only when it is worth it (no reduced motion, no data saver,
 * capable device). Pauses when off-screen or when the tab is hidden. All assets are same-origin (strict CSP).
 */
import {
  AdditiveBlending,
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  InstancedMesh,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PointLight,
  Points,
  PointsMaterial,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  TextureLoader,
  WebGLRenderer,
} from 'three';

const SKY = new Color('#35a6dd');
const LIGHT_SKY = new Color('#8fd3f5');
const WHITE = new Color('#ffffff');

/** Soft round sprite for particles (drawn once on a canvas: no image request). */
function dotTexture(): CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  return new CanvasTexture(canvas);
}

export function startHero(container: HTMLElement, canvas: HTMLCanvasElement, logoUrl: string): () => void {
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.outputColorSpace = SRGBColorSpace;

  const scene = new Scene();
  const camera = new PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0, 10);

  scene.add(new AmbientLight(0xffffff, 1.1));
  const key = new DirectionalLight(0xffffff, 2.2);
  key.position.set(3, 4, 6);
  scene.add(key);
  const rim = new PointLight(SKY, 30, 20);
  rim.position.set(-4, -2, 3);
  scene.add(rim);

  // --- Logo medallion (cylinder: side = silver metal, faces = the logo) ---
  const medallion = new Group();
  const logoTexture = new TextureLoader().load(logoUrl, () => container.classList.add('is-ready'));
  logoTexture.colorSpace = SRGBColorSpace;
  logoTexture.anisotropy = 4;
  const face = new MeshStandardMaterial({ map: logoTexture, metalness: 0.15, roughness: 0.45, transparent: true });
  const edge = new MeshStandardMaterial({ color: 0xd9dee4, metalness: 1, roughness: 0.25 });
  const coin = new CylinderGeometry(1.75, 1.75, 0.16, 96, 1);
  // Cylinder material order: side, top cap, bottom cap. Rotated so a cap faces the camera.
  const disc = new Mesh(coin, [edge, face, face]);
  disc.rotation.x = Math.PI / 2;
  medallion.add(disc);
  scene.add(medallion);

  // --- DNA double helix (two strands + rungs) ---
  const helix = new Group();
  const STEPS = 46;
  const beadGeo = new SphereGeometry(0.075, 12, 12);
  const beads = new InstancedMesh(beadGeo, new MeshBasicMaterial({ color: 0xffffff }), STEPS * 2);
  const rungGeo = new SphereGeometry(0.03, 6, 6);
  const rungs = new InstancedMesh(rungGeo, new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }), STEPS * 6);
  const m = new Matrix4();
  let r = 0;
  for (let i = 0; i < STEPS; i++) {
    const t = i / (STEPS - 1);
    const y = (t - 0.5) * 7;
    const angle = t * Math.PI * 4;
    const radius = 2.55;
    const a = [Math.cos(angle) * radius, y, Math.sin(angle) * radius] as const;
    const b = [Math.cos(angle + Math.PI) * radius, y, Math.sin(angle + Math.PI) * radius] as const;
    beads.setMatrixAt(i * 2, m.makeTranslation(...a));
    beads.setColorAt(i * 2, SKY);
    beads.setMatrixAt(i * 2 + 1, m.makeTranslation(...b));
    beads.setColorAt(i * 2 + 1, LIGHT_SKY);
    for (let k = 1; k <= 6; k++) {
      const f = k / 7;
      rungs.setMatrixAt(r, m.makeTranslation(a[0] + (b[0] - a[0]) * f, y, a[2] + (b[2] - a[2]) * f));
      rungs.setColorAt(r++, WHITE);
    }
  }
  helix.add(beads, rungs);
  helix.rotation.z = 0.35;
  scene.add(helix);

  // --- Floating particles ---
  const COUNT = 260;
  const positions = new Float32Array(COUNT * 3);
  const speeds = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 14;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 10;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 6 - 1;
    speeds[i] = 0.15 + Math.random() * 0.35;
  }
  const particleGeo = new BufferGeometry();
  particleGeo.setAttribute('position', new BufferAttribute(positions, 3));
  const particles = new Points(
    particleGeo,
    new PointsMaterial({
      size: 0.09,
      map: dotTexture(),
      color: LIGHT_SKY,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    }),
  );
  scene.add(particles);

  // --- Interaction state ---
  const pointer = { x: 0, y: 0 };
  let spin = 0; // extra spin velocity from dragging
  let dragging = false;
  let lastX = 0;
  let scrollTurn = 0;

  const onPointerMove = (event: PointerEvent) => {
    const rect = container.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    if (dragging) {
      spin += (event.clientX - lastX) * 0.004;
      lastX = event.clientX;
    }
  };
  const onPointerDown = (event: PointerEvent) => {
    dragging = true;
    lastX = event.clientX;
    container.setPointerCapture?.(event.pointerId);
  };
  const onPointerUp = () => {
    dragging = false;
  };
  const onScroll = () => {
    // Scrolling tilts the medallion slightly (never edge-on).
    scrollTurn = Math.min(window.scrollY * 0.0006, 0.35);
  };
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  container.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp, { passive: true });
  window.addEventListener('scroll', onScroll, { passive: true });

  // --- Size, visibility, loop ---
  const resize = () => {
    const { clientWidth: w, clientHeight: h } = container;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  let visible = true;
  const visibility = new IntersectionObserver(([entry]) => {
    visible = Boolean(entry?.isIntersecting);
    if (visible) loop();
  });
  visibility.observe(container);

  let frame = 0;
  let last = performance.now();
  let turn = 0;
  let spinAngle = 0;
  const loop = () => {
    cancelAnimationFrame(frame);
    if (!visible || document.hidden) return;
    frame = requestAnimationFrame(loop);
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    // Dragging spins the medallion freely; when released it settles on the nearest full turn, logo facing front.
    spinAngle += spin;
    spin *= 0.92;
    if (!dragging && Math.abs(spin) < 0.002) {
      spinAngle = MathUtils.lerp(spinAngle, Math.round(spinAngle / (Math.PI * 2)) * Math.PI * 2, 0.06);
    }
    turn += dt * 0.6;
    const sway = pointer.x * 0.45 + Math.sin(turn) * 0.22; // stays within about ±0.7 rad: always readable
    medallion.rotation.y = MathUtils.lerp(medallion.rotation.y, spinAngle + sway, 0.1);
    medallion.rotation.x = MathUtils.lerp(medallion.rotation.x, pointer.y * 0.3 + scrollTurn, 0.08);
    medallion.position.y = Math.sin(now / 1100) * 0.12;

    helix.rotation.y += dt * 0.45;
    camera.position.x = MathUtils.lerp(camera.position.x, pointer.x * 0.6, 0.05);
    camera.position.y = MathUtils.lerp(camera.position.y, -pointer.y * 0.4, 0.05);
    camera.lookAt(0, 0, 0);

    const pos = particleGeo.getAttribute('position') as BufferAttribute;
    for (let i = 0; i < COUNT; i++) {
      let y = pos.getY(i) + dt * (speeds[i] ?? 0.2);
      if (y > 5) y = -5;
      pos.setY(i, y);
    }
    pos.needsUpdate = true;

    renderer.render(scene, camera);
  };
  const onVisibility = () => {
    last = performance.now();
    loop();
  };
  document.addEventListener('visibilitychange', onVisibility);
  loop();

  return () => {
    cancelAnimationFrame(frame);
    resizeObserver.disconnect();
    visibility.disconnect();
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('scroll', onScroll);
    document.removeEventListener('visibilitychange', onVisibility);
    renderer.dispose();
  };
}
