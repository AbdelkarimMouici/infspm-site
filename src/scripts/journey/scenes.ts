/**
 * Scenes of the home-page journey through the body: DNA intro, blood vessel, heart, lungs and brain.
 * Everything is generated in code (no downloaded models). Glow comes from the bloom pass in journey.ts:
 * bright colours (unlit materials, emissive parts, additive particles) are what makes things shine.
 */
import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  Euler,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  LatheGeometry,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Points,
  PointsMaterial,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  type Camera,
  type Object3D,
} from 'three';
import { buildModel } from '../three/models';

export const BG = new Color('#02050c');

export interface Quality {
  low: boolean;
}

// ---------- Helpers ----------

/** Small seeded random generator (same scene on every visit). */
export function rng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const f = (t: number) => t * t * (3 - 2 * t);
  const xf = f(x - xi);
  const yf = f(y - yi);
  const zf = f(z - zi);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash(xi + dx, yi + dy, zi + dz);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), xf), l(c(0, 1, 0), c(1, 1, 0), xf), yf),
    l(l(c(0, 0, 1), c(1, 0, 1), xf), l(c(0, 1, 1), c(1, 1, 1), xf), yf),
    zf,
  );
}

let sprite: CanvasTexture | undefined;
/** Soft round particle sprite, drawn once. */
export function dotSprite(): CanvasTexture {
  if (sprite) return sprite;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.8)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  sprite = new CanvasTexture(canvas);
  return sprite;
}

/** Fresnel rim glow: bright edges, transparent centre. */
export function rimMaterial(color: number, power = 2.4, intensity = 1.2): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uColor: { value: new Color(color) },
      uPower: { value: power },
      uIntensity: { value: intensity },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uPower;
      uniform float uIntensity;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), uPower) * uIntensity;
        gl_FragColor = vec4(uColor * f, f);
      }`,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  });
}

/** Adds a glowing rim to every mesh under `root`. */
function addRim(root: Object3D, color: number, scale: number, intensity: number): void {
  const meshes: Mesh[] = [];
  root.traverse((node) => {
    if ((node as Mesh).isMesh) meshes.push(node as Mesh);
  });
  const material = rimMaterial(color, 2.6, intensity);
  for (const mesh of meshes) {
    const rim = new Mesh(mesh.geometry, material);
    rim.scale.setScalar(scale);
    mesh.add(rim);
  }
}

function particles(positions: Float32Array, colors: Float32Array, size: number, opacity = 1): Points {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  return new Points(
    geometry,
    new PointsMaterial({
      size,
      map: dotSprite(),
      vertexColors: true,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: AdditiveBlending,
    }),
  );
}

// ---------- Ambient field of glowing cells along the whole journey ----------
export function buildDust(q: Quality): { points: Points; update: (time: number) => void } {
  const count = q.low ? 1100 : 2400;
  const rand = rng(3);
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const palette = [new Color(0x7fd8ff), new Color(0xff7a9a), new Color(0xffffff), new Color(0xb08cff)];
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (rand() - 0.5) * 90;
    pos[i * 3 + 1] = (rand() - 0.5) * 60;
    pos[i * 3 + 2] = 25 - rand() * 330;
    const c = palette[Math.floor(rand() * palette.length)] ?? new Color(0xffffff);
    const k = 0.35 + rand() * 0.65;
    col[i * 3] = c.r * k;
    col[i * 3 + 1] = c.g * k;
    col[i * 3 + 2] = c.b * k;
  }
  const points = particles(pos, col, 0.22, 0.85);
  return {
    points,
    update(time) {
      points.position.y = Math.sin(time * 0.15) * 0.8;
      points.rotation.z = Math.sin(time * 0.05) * 0.05;
    },
  };
}

// ---------- Intro: giant glowing DNA ----------
export function buildIntro(side: number): {
  group: Group;
  update: (time: number, dt: number) => void;
  poke: () => void;
  hit: Object3D;
} {
  const group = new Group();
  const helix = new Group();
  const STEPS = 64;
  const beads = new InstancedMesh(new SphereGeometry(0.17, 16, 12), new MeshBasicMaterial({ color: 0xffffff }), STEPS * 2);
  const rungs = new InstancedMesh(
    new CylinderGeometry(0.035, 0.035, 1, 8),
    new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }),
    STEPS,
  );
  const a = new Color(0x5fd0ff);
  const b = new Color(0xff6f95);
  const bases = [new Color(0x7a5cff), new Color(0x2fe0b0), new Color(0xffc857), new Color(0xff5c7a)];
  const m = new Matrix4();
  const q = new Quaternion();
  const zTurn = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2);
  const radius = 2.2;
  for (let i = 0; i < STEPS; i++) {
    const y = (i / (STEPS - 1) - 0.5) * 20;
    const angle = i * 0.42;
    beads.setMatrixAt(i * 2, m.makeTranslation(Math.cos(angle) * radius, y, Math.sin(angle) * radius));
    beads.setMatrixAt(i * 2 + 1, m.makeTranslation(-Math.cos(angle) * radius, y, -Math.sin(angle) * radius));
    beads.setColorAt(i * 2, a);
    beads.setColorAt(i * 2 + 1, b);
    q.setFromAxisAngle(new Vector3(0, 1, 0), -angle).multiply(zTurn);
    m.compose(new Vector3(0, y, 0), q, new Vector3(1, radius * 2, 1));
    rungs.setMatrixAt(i, m);
    rungs.setColorAt(i, bases[i % 4] ?? a);
  }
  helix.add(beads, rungs);
  helix.position.set(side * 6.5, 0, -6);
  helix.rotation.z = 0.3 * side;
  group.add(helix);

  // Glowing mouth of the blood vessel, ahead of the camera.
  const ring = new Mesh(
    new TorusGeometry(5.6, 0.07, 12, 160),
    new MeshBasicMaterial({ color: 0xff3a5c, transparent: true, opacity: 0.9, blending: AdditiveBlending }),
  );
  ring.position.z = -10;
  group.add(ring);

  let spin = 0;
  return {
    group,
    hit: helix,
    update(time, dt) {
      spin *= Math.exp(-1.5 * dt);
      helix.rotation.y += dt * (0.4 + spin);
      ring.scale.setScalar(1 + Math.sin(time * 2) * 0.02);
    },
    poke() {
      spin = 7;
    },
  };
}

// ---------- Blood vessel with flowing cells ----------
export function buildVessel(
  points: Vector3[],
  q: Quality,
): { group: Group; update: (time: number, dt: number, boost: number) => void } {
  const group = new Group();
  const curve = new CatmullRomCurve3(points);
  const R = 5.5;
  const uTime = { value: 0 };
  const uBoost = { value: 0 };
  const wall = new ShaderMaterial({
    side: BackSide,
    uniforms: { uTime, uBoost, uFog: { value: BG } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying float vDepth;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uBoost;
      uniform vec3 uFog;
      varying vec2 vUv;
      varying float vDepth;
      void main() {
        float x = vUv.x * 170.0;
        float a = vUv.y * 6.2831853;
        float flow = sin(x - uTime * (3.0 + uBoost * 14.0) + sin(a * 3.0) * 1.2) * 0.5 + 0.5;
        float vein = smoothstep(0.93, 1.0, sin(a * 7.0 + sin(x * 0.35) * 1.8) * 0.5 + 0.5);
        float vein2 = smoothstep(0.96, 1.0, sin(a * 13.0 - x * 0.21 + 1.3) * 0.5 + 0.5);
        vec3 base = mix(vec3(0.14, 0.0, 0.025), vec3(0.62, 0.04, 0.1), flow * 0.6);
        vec3 col = base + vein * vec3(1.0, 0.3, 0.4) * 0.6 + vein2 * vec3(1.0, 0.5, 0.58) * 0.32;
        col += uBoost * vec3(0.25, 0.02, 0.05);
        float fog = 1.0 - exp(-vDepth * 0.05);
        gl_FragColor = vec4(mix(col, uFog, fog), 1.0);
      }`,
  });
  group.add(new Mesh(new TubeGeometry(curve, q.low ? 260 : 480, R, q.low ? 36 : 64, false), wall));

  // Red blood cells (biconcave discs) swirling along the vessel.
  const profile = [
    [0, -0.07],
    [0.22, -0.1],
    [0.42, -0.18],
    [0.56, -0.16],
    [0.64, -0.08],
    [0.66, 0],
    [0.64, 0.08],
    [0.56, 0.16],
    [0.42, 0.18],
    [0.22, 0.1],
    [0, 0.07],
  ].map(([x, y]) => new Vector2(x, y));
  const cellGeo = new LatheGeometry(profile, 28);
  const COUNT = q.low ? 220 : 460;
  const cells = new InstancedMesh(
    cellGeo,
    new MeshStandardMaterial({ color: 0xa8102a, roughness: 0.38, metalness: 0.05, emissive: 0x3a0008, emissiveIntensity: 0.35 }),
    COUNT,
  );
  group.add(cells);
  // A few white blood cells (bumpy spheres).
  const whiteGeo = new IcosahedronGeometry(1, 3);
  {
    const pos = whiteGeo.getAttribute('position') as BufferAttribute;
    const p = new Vector3();
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      p.multiplyScalar(1 + (noise3(p.x * 3, p.y * 3, p.z * 3) - 0.5) * 0.35);
      pos.setXYZ(i, p.x, p.y, p.z);
    }
    whiteGeo.computeVertexNormals();
  }
  const WHITE = 9;
  const whites = new InstancedMesh(
    whiteGeo,
    new MeshStandardMaterial({ color: 0xf2e9ff, roughness: 0.5, emissive: 0x6b4fa8, emissiveIntensity: 0.35 }),
    WHITE,
  );
  group.add(whites);

  const SAMPLES = 400;
  const centre = curve.getSpacedPoints(SAMPLES);
  const frames = curve.computeFrenetFrames(SAMPLES, false);
  const rand = rng(11);
  const length = curve.getLength();
  type Cell = { u: number; ang: number; r: number; speed: number; rot: Vector3; spin: Vector3; scale: number };
  const make = (scaleMin: number, scaleMax: number): Cell => ({
    u: rand(),
    ang: rand() * Math.PI * 2,
    r: Math.sqrt(rand()) * (R - 1.4),
    speed: 7 + rand() * 7,
    rot: new Vector3(rand() * 6, rand() * 6, rand() * 6),
    spin: new Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(2.2),
    scale: scaleMin + rand() * (scaleMax - scaleMin),
  });
  const reds = Array.from({ length: COUNT }, () => make(0.85, 1.25));
  const whiteCells = Array.from({ length: WHITE }, () => make(0.8, 1.1));
  const m = new Matrix4();
  const quat = new Quaternion();
  const euler = new Euler();
  const pos = new Vector3();
  const scale = new Vector3();

  const place = (mesh: InstancedMesh, list: Cell[], dt: number, boost: number) => {
    let i = 0;
    for (const cell of list) {
      cell.u = (cell.u + (cell.speed * (1 + boost * 4) * dt) / length) % 1;
      cell.ang += dt * 0.25;
      cell.rot.addScaledVector(cell.spin, dt * (1 + boost * 3));
      const idx = Math.min(Math.floor(cell.u * SAMPLES), SAMPLES - 1);
      const c = centre[idx];
      const n = frames.normals[idx];
      const b = frames.binormals[idx];
      if (!c || !n || !b) continue;
      pos
        .copy(c)
        .addScaledVector(n, Math.cos(cell.ang) * cell.r)
        .addScaledVector(b, Math.sin(cell.ang) * cell.r);
      quat.setFromEuler(euler.set(cell.rot.x, cell.rot.y, cell.rot.z));
      m.compose(pos, quat, scale.setScalar(cell.scale));
      mesh.setMatrixAt(i++, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };

  return {
    group,
    update(time, dt, boost) {
      uTime.value = time;
      uBoost.value = boost;
      place(cells, reds, dt, boost);
      place(whites, whiteCells, dt * 0.6, boost);
    },
  };
}

// ---------- The heart ----------
export function buildHeart(q: Quality): {
  group: Group;
  hit: Object3D;
  update: (time: number, dt: number) => void;
  boost: () => void;
  bpm: () => number;
} {
  const group = new Group();
  const model = buildModel('heart');
  model.group.scale.setScalar(9);
  addRim(model.group, 0xff4a6a, 1.025, 1.25);
  group.add(model.group);

  // Pulse waves on every beat.
  const rings = Array.from({ length: 4 }, () => {
    const ring = new Mesh(
      new TorusGeometry(1, 0.025, 8, 160),
      new MeshBasicMaterial({ color: 0xff4d6d, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }),
    );
    ring.userData['age'] = 99;
    group.add(ring);
    return ring;
  });

  // Warm particles orbiting the heart.
  const COUNT = q.low ? 500 : 1100;
  const rand = rng(21);
  const pos = new Float32Array(COUNT * 3);
  const col = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    const r = 12 + rand() * 18;
    const t = rand() * Math.PI * 2;
    const y = (rand() - 0.5) * 22;
    pos[i * 3] = Math.cos(t) * r;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = Math.sin(t) * r;
    const warm = rand();
    col[i * 3] = 1;
    col[i * 3 + 1] = 0.25 + warm * 0.4;
    col[i * 3 + 2] = 0.35 + warm * 0.3;
  }
  const halo = particles(pos, col, 0.28, 0.75);
  group.add(halo);

  let bpm = 70;
  let phase = 0;
  let next = 0;
  return {
    group,
    hit: model.group,
    bpm: () => bpm,
    boost() {
      bpm = Math.min(bpm + 24, 190);
    },
    update(time, dt) {
      bpm += (70 - bpm) * dt * 0.12;
      const energy = Math.max(0, (bpm / 60 - 1.1) / 1.8);
      model.update?.(time, dt, energy);
      phase += (dt * bpm) / 60;
      if (phase >= next) {
        next = Math.floor(phase) + 1;
        const ring = rings.find((item) => (item.userData['age'] as number) > 1.3) ?? rings[0];
        if (ring) {
          ring.userData['age'] = 0;
          ring.rotation.set(Math.PI / 2 + (Math.random() - 0.5) * 0.6, Math.random() * Math.PI, 0);
        }
      }
      for (const ring of rings) {
        const age = (ring.userData['age'] as number) + dt;
        ring.userData['age'] = age;
        const k = Math.min(age / 1.3, 1);
        ring.scale.setScalar(6 + k * 22);
        (ring.material as MeshBasicMaterial).opacity = (1 - k) * 0.9;
      }
      halo.rotation.y += dt * (0.05 + (bpm - 70) * 0.002);
      model.group.rotation.y = Math.sin(time * 0.25) * 0.5;
    },
  };
}

// ---------- The lungs: glowing bronchial tree ----------
export function buildLungs(q: Quality): {
  group: Group;
  update: (time: number, dt: number) => void;
  setHold: (hold: boolean) => void;
  fill: () => number;
} {
  const group = new Group();
  const tree = new Group();
  group.add(tree);
  const rand = rng(7);
  const segs: { a: Vector3; b: Vector3; r: number }[] = [];
  const tips: Vector3[] = [];
  const Y = new Vector3(0, 1, 0);
  const X = new Vector3(1, 0, 0);

  const branch = (a: Vector3, dir: Vector3, len: number, r: number, depth: number): void => {
    const b = a.clone().addScaledVector(dir, len);
    segs.push({ a, b, r });
    if (depth === 0) {
      tips.push(b);
      return;
    }
    const axis = new Vector3()
      .crossVectors(dir, Math.abs(dir.y) < 0.9 ? Y : X)
      .normalize()
      .applyAxisAngle(dir, rand() * Math.PI * 2);
    for (const s of [-1, 1]) {
      const d = dir
        .clone()
        .applyAxisAngle(axis, s * (0.42 + rand() * 0.3))
        .normalize();
      d.y -= 0.12;
      d.normalize();
      branch(b, d, len * (0.72 + rand() * 0.12), r * 0.7, depth - 1);
    }
  };
  segs.push({ a: new Vector3(0, 11, 0), b: new Vector3(0, 4.2, 0), r: 0.95 });
  const depth = q.low ? 6 : 7;
  branch(new Vector3(0, 4.2, 0), new Vector3(-0.6, -0.8, 0.05).normalize(), 3.2, 0.66, depth);
  branch(new Vector3(0, 4.2, 0), new Vector3(0.6, -0.8, -0.05).normalize(), 3.2, 0.66, depth);

  const tubes = new InstancedMesh(
    new CylinderGeometry(0.72, 1, 1, 10, 1),
    new MeshStandardMaterial({ color: 0xffb8c8, emissive: 0xff2d6f, emissiveIntensity: 0.55, roughness: 0.38 }),
    segs.length,
  );
  const m = new Matrix4();
  const quat = new Quaternion();
  segs.forEach((seg, i) => {
    const dir = seg.b.clone().sub(seg.a);
    const len = dir.length();
    quat.setFromUnitVectors(Y, dir.normalize());
    m.compose(seg.a.clone().add(seg.b).multiplyScalar(0.5), quat, new Vector3(seg.r, len, seg.r));
    tubes.setMatrixAt(i, m);
  });
  tree.add(tubes);

  // Alveoli: clusters of glowing points at the branch tips.
  const PER = q.low ? 10 : 18;
  const aPos = new Float32Array(tips.length * PER * 3);
  const aCol = new Float32Array(tips.length * PER * 3);
  tips.forEach((tip, i) => {
    for (let k = 0; k < PER; k++) {
      const j = (i * PER + k) * 3;
      const d = new Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize().multiplyScalar(rand() * 0.9);
      aPos[j] = tip.x + d.x;
      aPos[j + 1] = tip.y + d.y;
      aPos[j + 2] = tip.z + d.z;
      aCol[j] = 0.55;
      aCol[j + 1] = 0.85;
      aCol[j + 2] = 1;
    }
  });
  const alveoli = particles(aPos, aCol, 0.3, 0.7);
  tree.add(alveoli);

  // Translucent lung shapes around the tree.
  const shellMat = rimMaterial(0xff6f95, 2.2, 0.75);
  for (const s of [-1, 1]) {
    const shell = new Mesh(new SphereGeometry(1, 48, 32), shellMat);
    shell.scale.set(5.2, 7.4, 4.2);
    shell.position.set(s * 5.4, -2.6, 0);
    tree.add(shell);
  }

  // Oxygen particles: travel from the trachea to the tips when breathing in.
  const O2 = q.low ? 160 : 320;
  const oPos = new Float32Array(O2 * 3);
  const oCol = new Float32Array(O2 * 3);
  const oxygen = particles(oPos, oCol, 0.35, 1);
  tree.add(oxygen);
  const flows = Array.from({ length: O2 }, () => ({
    tip: tips[Math.floor(rand() * tips.length)] ?? new Vector3(),
    delay: rand(),
    s: 0,
  }));
  const mouth = new Vector3(0, 12, 0);
  const mid = new Vector3(0, 4.2, 0);
  const p = new Vector3();

  let fill = 0.2;
  let hold = false;
  return {
    group,
    fill: () => fill,
    setHold(value) {
      hold = value;
    },
    update(time, dt) {
      const target = hold ? 1 : 0.18 + Math.sin(time * 1.1) * 0.1;
      fill += (target - fill) * dt * (hold ? 1.1 : 0.9);
      const k = 1 + fill * 0.17;
      tree.scale.set(k, 1 + fill * 0.08, k);
      (tubes.material as MeshStandardMaterial).emissiveIntensity = 0.4 + fill * 0.3;
      (alveoli.material as PointsMaterial).size = 0.24 + fill * 0.1;
      let i = 0;
      for (const f of flows) {
        const goal = Math.min(Math.max((fill - f.delay * 0.45) / 0.55, 0), 1);
        f.s += (goal - f.s) * dt * 2.5;
        const t = f.s;
        // Quadratic Bézier mouth → bifurcation → tip.
        p.copy(mouth)
          .multiplyScalar((1 - t) * (1 - t))
          .addScaledVector(mid, 2 * (1 - t) * t)
          .addScaledVector(f.tip, t * t);
        oPos[i * 3] = p.x;
        oPos[i * 3 + 1] = p.y;
        oPos[i * 3 + 2] = p.z;
        const on = t > 0.02 ? 1 : 0;
        oCol[i * 3] = (0.4 + (1 - t) * 0.6) * on;
        oCol[i * 3 + 1] = (0.85 + t * 0.15) * on;
        oCol[i * 3 + 2] = on;
        i++;
      }
      (oxygen.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
      (oxygen.geometry.getAttribute('color') as BufferAttribute).needsUpdate = true;
      group.rotation.y = Math.sin(time * 0.2) * 0.35;
    },
  };
}

// ---------- The brain: neuron network firing signals ----------
export function buildBrain(q: Quality): {
  group: Group;
  update: (time: number, dt: number, active: boolean) => void;
  fire: (index?: number, depth?: number) => void;
  fireNearest: (ndc: Vector2, camera: Camera) => boolean;
} {
  const group = new Group();
  const rand = rng(31);
  const N = q.low ? 260 : 440;
  const nodes: Vector3[] = [];
  while (nodes.length < N) {
    const d = new Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1);
    if (d.lengthSq() > 1 || d.lengthSq() < 0.001) continue;
    const r = 0.55 + rand() * 0.45;
    d.normalize().multiplyScalar(r);
    const p = new Vector3(d.x * 7.2, d.y * 5.6, d.z * 8.8);
    if (Math.abs(p.x) < 0.7) p.x += Math.sign(p.x || 1) * 0.7;
    if (p.y < -3.4) p.y = -3.4 + (p.y + 3.4) * 0.35;
    nodes.push(p);
  }
  for (let i = 0; i < 16; i++) nodes.push(new Vector3((rand() - 0.5) * 1.2, -3.6 - i * 0.45, -2.2 - i * 0.12));

  // Connect every node to its 3 nearest neighbours.
  const adj: number[][] = nodes.map(() => []);
  const edges: [number, number][] = [];
  const seen = new Set<string>();
  nodes.forEach((a, i) => {
    const near = nodes
      .map((b, j) => ({ j, d: a.distanceToSquared(b) }))
      .filter((x) => x.j !== i)
      .sort((x, y) => x.d - y.d)
      .slice(0, 3);
    for (const { j } of near) {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([i, j]);
      adj[i]?.push(j);
      adj[j]?.push(i);
    }
  });
  const lPos = new Float32Array(edges.length * 6);
  edges.forEach(([i, j], k) => {
    const a = nodes[i];
    const b = nodes[j];
    if (!a || !b) return;
    lPos.set([a.x, a.y, a.z, b.x, b.y, b.z], k * 6);
  });
  const lineGeo = new BufferGeometry();
  lineGeo.setAttribute('position', new BufferAttribute(lPos, 3));
  group.add(
    new LineSegments(
      lineGeo,
      new LineBasicMaterial({ color: 0x3f8cff, transparent: true, opacity: 0.28, blending: AdditiveBlending, depthWrite: false }),
    ),
  );

  const nPos = new Float32Array(nodes.length * 3);
  nodes.forEach((p, i) => nPos.set([p.x, p.y, p.z], i * 3));
  const nCol = new Float32Array(nodes.length * 3);
  const glow = new Float32Array(nodes.length);
  const nodePoints = particles(nPos, nCol, 0.45, 1);
  group.add(nodePoints);

  // Folded cortex surface drawn with faint points.
  const SURF = q.low ? 1800 : 3600;
  const sPos = new Float32Array(SURF * 3);
  const sCol = new Float32Array(SURF * 3);
  for (let i = 0; i < SURF; i++) {
    const d = new Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize();
    const n = noise3(d.x * 3.2, d.y * 3.2, d.z * 3.2) * 0.65 + noise3(d.x * 7, d.y * 7, d.z * 7) * 0.35;
    const ridge = (1 - Math.abs(n * 2 - 1)) ** 2;
    const r = 1 + ridge * 0.07;
    let x = d.x * 7.7 * r;
    if (Math.abs(x) < 0.5) x += Math.sign(x || 1) * 0.5;
    let y = d.y * 6 * r;
    if (y < -3.6) y = -3.6 + (y + 3.6) * 0.3;
    sPos.set([x, y, d.z * 9.3 * r], i * 3);
    const k = 0.25 + ridge * 0.55;
    sCol.set([0.75 * k, 0.5 * k, 1 * k], i * 3);
  }
  group.add(particles(sPos, sCol, 0.12, 0.8));

  // Travelling signals.
  const P = 520;
  const pPos = new Float32Array(P * 3).fill(9999);
  const pCol = new Float32Array(P * 3);
  const pulsePoints = particles(pPos, pCol, 0.55, 1);
  group.add(pulsePoints);
  const pulses = Array.from({ length: P }, () => ({ from: 0, to: 0, t: 1, depth: 0, live: false }));
  let cursor = 0;
  const spawn = (from: number, to: number, depth: number) => {
    const pulse = pulses[cursor];
    cursor = (cursor + 1) % P;
    if (!pulse) return;
    pulse.from = from;
    pulse.to = to;
    pulse.t = 0;
    pulse.depth = depth;
    pulse.live = true;
  };
  const fire = (index = Math.floor(rand() * nodes.length), depth = 6) => {
    glow[index] = 1;
    for (const nb of adj[index] ?? []) spawn(index, nb, depth - 1);
  };

  let timer = 0;
  const v = new Vector3();
  return {
    group,
    fire,
    fireNearest(ndc, camera) {
      let best = -1;
      let bestD = 0.02;
      nodes.forEach((p, i) => {
        v.copy(p).applyMatrix4(group.matrixWorld).project(camera);
        if (v.z > 1) return;
        const d = (v.x - ndc.x) ** 2 + (v.y - ndc.y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      if (best >= 0) fire(best, 8);
      return best >= 0;
    },
    update(time, dt, active) {
      if (active) {
        timer -= dt;
        if (timer <= 0) {
          timer = 0.35 + Math.random() * 0.4;
          fire(undefined, 3);
        }
      }
      let i = 0;
      for (const pulse of pulses) {
        if (pulse.live) {
          pulse.t += dt / 0.3;
          const a = nodes[pulse.from];
          const b = nodes[pulse.to];
          if (pulse.t >= 1 || !a || !b) {
            pulse.live = false;
            glow[pulse.to] = 1;
            if (pulse.depth > 0) {
              for (const nb of adj[pulse.to] ?? []) {
                if (nb !== pulse.from && Math.random() < 0.72) spawn(pulse.to, nb, pulse.depth - 1);
              }
            }
            pPos.set([9999, 9999, 9999], i * 3);
          } else {
            v.copy(a).lerp(b, pulse.t);
            pPos.set([v.x, v.y, v.z], i * 3);
            pCol.set([0.8, 0.95, 1], i * 3);
          }
        }
        i++;
      }
      (pulsePoints.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
      (pulsePoints.geometry.getAttribute('color') as BufferAttribute).needsUpdate = true;
      const decay = Math.exp(-2.8 * dt);
      for (let n = 0; n < nodes.length; n++) {
        const g = (glow[n] ?? 0) * decay;
        glow[n] = g;
        nCol.set([0.2 + g * 0.8, 0.45 + g * 0.55, 1], n * 3);
      }
      (nodePoints.geometry.getAttribute('color') as BufferAttribute).needsUpdate = true;
      group.rotation.y = Math.sin(time * 0.12) * 0.4;
    },
  };
}
