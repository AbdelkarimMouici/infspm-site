/**
 * Procedural 3D medical objects and stylised anatomy, built from code (no downloaded model files, no licences).
 * Every model fits roughly inside a sphere of radius 1 centred on the origin and may animate itself.
 */
import {
  BoxGeometry,
  CapsuleGeometry,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  LatheGeometry,
  Line,
  LineBasicMaterial,
  BufferGeometry,
  Float32BufferAttribute,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  type BufferAttribute,
  type Material,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export interface Model {
  group: Group;
  /** Called every frame. `energy` (0–1) rises when the visitor clicks the object, then fades. */
  update?: (time: number, dt: number, energy: number) => void;
  /** Extra reaction when clicked. */
  poke?: () => void;
  /** Local point where a click burst should start (default: the centre). */
  burstAt?: Vector3;
  /** Burst colour. */
  burstColor?: number;
}

export type ModelName =
  | 'heart'
  | 'lungs'
  | 'brain'
  | 'dna'
  | 'capsule'
  | 'tablet'
  | 'syringe'
  | 'stethoscope'
  | 'bloodCell'
  | 'cross'
  | 'thermometer'
  | 'bandage'
  | 'molecule'
  | 'microscope'
  | 'clipboard'
  | 'ecg';

// ---------- Materials ----------
const glossy = (color: number, extra: Partial<MeshPhysicalMaterial> = {}) =>
  new MeshPhysicalMaterial({ color, roughness: 0.3, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.18, ...extra });
const metal = (color = 0xe3e8ee) => new MeshStandardMaterial({ color, metalness: 1, roughness: 0.2 });
const glass = () =>
  new MeshPhysicalMaterial({
    color: 0xeaf6ff,
    roughness: 0.05,
    clearcoat: 1,
    transparent: true,
    opacity: 0.32,
    side: DoubleSide,
    depthWrite: false,
  });
const matte = (color: number) => new MeshStandardMaterial({ color, roughness: 0.65 });

// ---------- Small helpers ----------
function hash(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
const smooth = (t: number) => t * t * (3 - 2 * t);
/** 3D value noise in [0, 1]. */
function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = smooth(x - xi);
  const yf = smooth(y - yi);
  const zf = smooth(z - zi);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash(xi + dx, yi + dy, zi + dz);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), xf), lerp(c(0, 1, 0), c(1, 1, 0), xf), yf),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), xf), lerp(c(0, 1, 1), c(1, 1, 1), xf), yf),
    zf,
  );
}

/** Moves every vertex of a geometry through `fn` and recomputes normals. */
function deform(geometry: BufferGeometry, fn: (p: Vector3) => void): BufferGeometry {
  const pos = geometry.getAttribute('position') as BufferAttribute;
  const p = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    fn(p);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

const curve = (points: [number, number, number][]) => new CatmullRomCurve3(points.map(([x, y, z]) => new Vector3(x, y, z)));
const tube = (points: [number, number, number][], radius: number, material: Material, segments = 48) =>
  new Mesh(new TubeGeometry(curve(points), segments, radius, 12, false), material);

/** Cylinder between two points. */
function rod(a: Vector3, b: Vector3, radius: number, material: Material): Mesh {
  const length = a.distanceTo(b);
  const mesh = new Mesh(new CylinderGeometry(radius, radius, length, 12), material);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return mesh;
}

/** Lub-dub heartbeat curve, 0–1. */
function heartbeat(phase: number): number {
  const p = phase % 1;
  return Math.exp(-((p - 0.05) ** 2) / 0.0018) + 0.6 * Math.exp(-((p - 0.24) ** 2) / 0.0025);
}

// ---------- Anatomy ----------
function heart(): Model {
  const group = new Group();
  const inner = new Group();
  const muscle = glossy(0xc42a3c, { roughness: 0.35, emissive: new Color(0x5a0010), emissiveIntensity: 0.15 });
  const artery = glossy(0xd8394b, { roughness: 0.3 });
  const vein = glossy(0x3f6fd1, { roughness: 0.3 });
  const vessel = glossy(0x8e1626, { roughness: 0.4 });

  const body = new Mesh(
    deform(new SphereGeometry(0.62, 56, 48), (p) => {
      const ny = p.y / 0.62;
      const taper = ny < 0 ? 1 + ny * 0.5 : 1 + ny * 0.08;
      p.x = p.x * taper + (ny < 0 ? -ny * 0.12 : 0);
      p.z *= taper * 0.82;
      p.y *= 1.12;
      const bump = (noise3(p.x * 3, p.y * 3, p.z * 3) - 0.5) * 0.06;
      p.multiplyScalar(1 + bump);
    }),
    muscle,
  );
  inner.add(body);
  // Aorta arch with three branches, pulmonary trunk, vena cava, coronary vessels.
  inner.add(tube([[0.05, 0.4, 0], [0.06, 0.85, 0], [-0.12, 1.08, 0], [-0.4, 1.02, -0.05], [-0.52, 0.7, -0.1]], 0.13, artery));
  for (const [x, top] of [[0.0, 1.32], [-0.17, 1.36], [-0.33, 1.28]] as const) {
    inner.add(tube([[x, 1.0, 0], [x + 0.01, top - 0.12, 0.01], [x + 0.03, top, 0.02]], 0.045, artery, 16));
  }
  inner.add(tube([[0.2, 0.35, 0.28], [0.26, 0.78, 0.26], [0.5, 0.92, 0.12], [0.66, 0.88, 0]], 0.11, vein));
  inner.add(tube([[-0.42, 0.15, -0.25], [-0.46, 0.6, -0.27], [-0.48, 1.05, -0.28]], 0.09, vein, 24));
  inner.add(tube([[0.12, 0.42, 0.52], [0.05, 0.05, 0.6], [-0.08, -0.3, 0.5], [-0.12, -0.58, 0.28]], 0.022, vessel, 32));
  inner.add(tube([[0.3, 0.3, 0.45], [0.42, 0.0, 0.42], [0.36, -0.3, 0.3]], 0.018, vessel, 24));
  inner.position.y = -0.28;
  inner.scale.setScalar(0.78);
  group.add(inner);
  group.rotation.z = -0.25;

  let phase = 0;
  return {
    group,
    burstColor: 0xff6b7d,
    update(_t, dt, energy) {
      phase += dt * (1.1 + energy * 1.8);
      const beat = heartbeat(phase);
      inner.scale.setScalar(0.78 * (1 + beat * 0.07));
      muscle.emissiveIntensity = 0.12 + beat * 0.35 + energy * 0.2;
    },
  };
}

function lungs(): Model {
  const group = new Group();
  const tissue = glossy(0xe98c9c, { roughness: 0.5, clearcoat: 0.4 });
  const cartilage = glossy(0xf3dadd, { roughness: 0.4 });
  const lobes: Mesh[] = [];
  for (const side of [-1, 1]) {
    const lobe = new Mesh(
      deform(new SphereGeometry(0.42, 48, 40), (p) => {
        p.y *= 1.45;
        if (p.x * side < 0) p.x *= 0.45; // flat inner side
        if (p.y < -0.35) p.y = -0.35 + (p.y + 0.35) * 0.35; // flat base
        p.z *= 0.8;
        const n = (noise3(p.x * 4 + side, p.y * 4, p.z * 4) - 0.5) * 0.07;
        p.multiplyScalar(1 + n);
      }),
      tissue,
    );
    lobe.position.set(side * 0.42, -0.12, 0);
    lobes.push(lobe);
    group.add(lobe);
    group.add(tube([[0, 0.38, 0], [side * 0.18, 0.28, 0.02], [side * 0.36, 0.1, 0.05]], 0.055, cartilage, 16));
  }
  group.add(tube([[0, 0.95, 0], [0, 0.6, 0.01], [0, 0.38, 0]], 0.085, cartilage, 16));
  for (let i = 0; i < 5; i++) {
    const ring = new Mesh(new TorusGeometry(0.09, 0.018, 8, 24), cartilage);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.48 + i * 0.1;
    group.add(ring);
  }
  group.position.y = -0.08;
  return {
    group,
    burstColor: 0xffc2cc,
    update(time, _dt, energy) {
      const breath = 1 + Math.sin(time * (1.3 + energy * 2.5)) * (0.045 + energy * 0.04);
      for (const lobe of lobes) lobe.scale.set(breath, 1 + (breath - 1) * 0.6, breath);
    },
  };
}

function brain(): Model {
  const group = new Group();
  const tissue = glossy(0xe58a9b, { roughness: 0.5, clearcoat: 0.35, emissive: new Color(0x7a2a5a), emissiveIntensity: 0.05 });
  for (const side of [-1, 1]) {
    const half = new Mesh(
      deform(new SphereGeometry(0.5, 110, 84), (p) => {
        p.x *= 0.78;
        p.y *= 0.82;
        p.z *= 1.12;
        if (p.x * side < 0) p.x *= 0.35;
        const o = side * 9;
        const n = noise3(p.x * 8 + o, p.y * 8, p.z * 8) * 0.65 + noise3(p.x * 17 + o, p.y * 17, p.z * 17) * 0.35;
        const ridge = (1 - Math.abs(n * 2 - 1)) ** 2; // gyri and sulci
        p.multiplyScalar(0.96 + ridge * 0.14);
      }),
      tissue,
    );
    half.position.x = side * 0.22;
    group.add(half);
  }
  const cerebellum = new Mesh(
    deform(new SphereGeometry(0.26, 40, 32), (p) => {
      p.x *= 1.5;
      p.multiplyScalar(1 + Math.sin(p.y * 70) * 0.025);
    }),
    tissue,
  );
  cerebellum.position.set(0, -0.36, -0.36);
  group.add(cerebellum);
  group.add(tube([[0, -0.2, -0.15], [0, -0.5, -0.2], [0, -0.8, -0.18]], 0.09, tissue, 16));
  group.position.y = 0.12;
  return {
    group,
    burstColor: 0xd6a8ff,
    update(time, _dt, energy) {
      tissue.emissiveIntensity = 0.05 + energy * 0.6 * (0.6 + 0.4 * Math.sin(time * 20));
    },
  };
}

// ---------- Science ----------
function dna(): Model {
  const group = new Group();
  const STEPS = 18;
  const beads = new InstancedMesh(new SphereGeometry(0.075, 14, 12), glossy(0xffffff), STEPS * 2);
  const rungs = new InstancedMesh(new CylinderGeometry(0.025, 0.025, 1, 8), glossy(0xffffff, { roughness: 0.4 }), STEPS);
  const strand = [new Color(0x35a6dd), new Color(0x8fd3f5)];
  const bases = [new Color(0xf25c6a), new Color(0xf5b83d), new Color(0x2bb673), new Color(0x7b6cf6)];
  const m = new Matrix4();
  const q = new Quaternion();
  const zAxis = new Vector3(0, 0, 1);
  for (let i = 0; i < STEPS; i++) {
    const y = (i / (STEPS - 1) - 0.5) * 1.9;
    const angle = i * 0.62;
    const r = 0.36;
    beads.setMatrixAt(i * 2, m.makeTranslation(Math.cos(angle) * r, y, Math.sin(angle) * r));
    beads.setMatrixAt(i * 2 + 1, m.makeTranslation(-Math.cos(angle) * r, y, -Math.sin(angle) * r));
    beads.setColorAt(i * 2, strand[0] as Color);
    beads.setColorAt(i * 2 + 1, strand[1] as Color);
    q.setFromAxisAngle(new Vector3(0, 1, 0), -angle).multiply(new Quaternion().setFromAxisAngle(zAxis, Math.PI / 2));
    m.compose(new Vector3(0, y, 0), q, new Vector3(1, r * 2, 1));
    rungs.setMatrixAt(i, m);
    rungs.setColorAt(i, bases[i % 4] as Color);
  }
  group.add(beads, rungs);
  return {
    group,
    burstColor: 0x8fd3f5,
    update(_t, dt, energy) {
      group.rotation.y += dt * (0.7 + energy * 6);
    },
  };
}

function molecule(): Model {
  const group = new Group();
  const centre = new Mesh(new SphereGeometry(0.26, 32, 24), glossy(0x35a6dd));
  group.add(centre);
  const bond = glossy(0xdfe6ee, { roughness: 0.4 });
  const dirs = [
    new Vector3(1, 1, 1),
    new Vector3(-1, -1, 1),
    new Vector3(-1, 1, -1),
    new Vector3(1, -1, -1),
  ].map((d) => d.normalize());
  const colours = [0xffffff, 0xf25c6a, 0xffffff, 0xf5b83d];
  dirs.forEach((d, i) => {
    const end = d.clone().multiplyScalar(0.68);
    group.add(rod(new Vector3(), end, 0.05, bond));
    const atom = new Mesh(new SphereGeometry(0.17, 24, 18), glossy(colours[i] ?? 0xffffff));
    atom.position.copy(end);
    group.add(atom);
  });
  const outer = (dirs[1] as Vector3).clone().multiplyScalar(0.68);
  const far = outer.clone().add(new Vector3(-0.35, 0.1, 0.3));
  group.add(rod(outer, far, 0.04, bond));
  const small = new Mesh(new SphereGeometry(0.11, 20, 16), glossy(0x2bb673));
  small.position.copy(far);
  group.add(small);
  return {
    group,
    burstColor: 0xbfe6ff,
    update(_t, dt, energy) {
      group.rotation.x += dt * (0.25 + energy * 3);
    },
  };
}

function bloodCell(): Model {
  const group = new Group();
  const profile = [
    [0, 0.07],
    [0.22, 0.1],
    [0.42, 0.18],
    [0.56, 0.16],
    [0.64, 0.08],
    [0.66, 0],
    [0.64, -0.08],
    [0.56, -0.16],
    [0.42, -0.18],
    [0.22, -0.1],
    [0, -0.07],
  ].map(([x, y]) => new Vector2(x, y));
  const cell = new Mesh(new LatheGeometry(profile.reverse(), 40), glossy(0xd7263d, { roughness: 0.35 }));
  cell.scale.setScalar(1.2);
  group.add(cell);
  return { group, burstColor: 0xff5a6e };
}

// ---------- Medicines ----------
const PILL_COLOURS: [number, number][] = [
  [0x35a6dd, 0xf4f7fa],
  [0xe94b5b, 0xf4f7fa],
  [0xf5b83d, 0x1b4a70],
  [0x2bb673, 0xf4f7fa],
];
let pillIndex = 0;

function capsule(): Model {
  const group = new Group();
  const [a, b] = PILL_COLOURS[pillIndex++ % PILL_COLOURS.length] ?? [0x35a6dd, 0xffffff];
  const r = 0.28;
  const l = 0.36;
  const profile: Vector2[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = (i / 12) * (Math.PI / 2);
    profile.push(new Vector2(Math.sin(t) * r, l + Math.cos(t) * r));
  }
  profile.push(new Vector2(r, 0), new Vector2(0, 0));
  // Lathe profiles go bottom → top so the faces point outwards.
  const half = new LatheGeometry(profile.reverse(), 36);
  const top = new Mesh(half, glossy(a));
  const bottom = new Mesh(half, glossy(b));
  bottom.rotation.z = Math.PI;
  group.add(top, bottom);
  group.scale.setScalar(1.05);
  return {
    group,
    burstColor: a,
    update(_t, _dt, energy) {
      // Clicked: the capsule opens and its powder bursts out.
      const gap = Math.sin(Math.min(energy, 1) * Math.PI) * 0.3;
      top.position.y = gap;
      bottom.position.y = -gap;
    },
  };
}

function tablet(): Model {
  const group = new Group();
  const profile = [
    [0, -0.13],
    [0.42, -0.13],
    [0.49, -0.08],
    [0.52, 0],
    [0.49, 0.08],
    [0.42, 0.13],
    [0, 0.13],
  ].map(([x, y]) => new Vector2(x, y));
  const pill = new Mesh(new LatheGeometry(profile, 40), glossy(0xf7f9fb, { roughness: 0.55, clearcoat: 0.3 }));
  const groove = new Mesh(new BoxGeometry(0.84, 0.03, 0.05), matte(0xc9d3dc));
  groove.position.y = 0.125;
  group.add(pill, groove);
  group.scale.setScalar(1.4);
  return { group, burstColor: 0xffffff };
}

// ---------- Instruments ----------
function syringe(): Model {
  const group = new Group();
  const white = glossy(0xf4f7fa, { roughness: 0.35 });
  const barrel = new Mesh(new CylinderGeometry(0.16, 0.16, 1.1, 32, 1, true), glass());
  const liquidMat = glossy(0x35a6dd, { transparent: true, opacity: 0.85, emissive: new Color(0x0b6fa6), emissiveIntensity: 0.3 });
  const liquid = new Mesh(new CylinderGeometry(0.14, 0.14, 1, 28), liquidMat);
  const plunger = new Group();
  plunger.add(new Mesh(new CylinderGeometry(0.04, 0.04, 1.0, 12), white));
  const rubber = new Mesh(new CylinderGeometry(0.145, 0.145, 0.06, 28), matte(0x22313f));
  rubber.position.y = -0.5;
  const thumb = new Mesh(new CylinderGeometry(0.19, 0.19, 0.04, 28), white);
  thumb.position.y = 0.5;
  plunger.add(rubber, thumb);
  const flange = new Mesh(new RoundedBoxGeometry(0.6, 0.05, 0.16, 2, 0.02), white);
  flange.position.y = 0.55;
  const hub = new Mesh(new CylinderGeometry(0.05, 0.12, 0.14, 20), white);
  hub.position.y = -0.62;
  const needle = new Mesh(new CylinderGeometry(0.012, 0.012, 0.6, 8), metal());
  needle.position.y = -0.98;
  for (let i = 0; i < 6; i++) {
    const mark = new Mesh(new BoxGeometry(0.004, 0.006, 0.08), matte(0x1b4a70));
    mark.position.set(0, -0.4 + i * 0.15, 0.162);
    group.add(mark);
  }
  group.add(barrel, liquid, plunger, flange, hub, needle);
  group.scale.setScalar(0.82);
  group.position.y = 0.15;

  const fill = (amount: number) => {
    // amount 0–1: liquid level inside the barrel, plunger follows.
    const height = 0.05 + amount * 0.9;
    liquid.scale.y = height;
    liquid.position.y = -0.53 + height / 2;
    plunger.position.y = -0.53 + height + 0.53;
  };
  fill(0.75);
  return {
    group,
    burstAt: new Vector3(0, -1.3, 0),
    burstColor: 0x8fd3f5,
    update(_t, _dt, energy) {
      fill(0.75 - Math.sin(Math.min(energy, 1) * Math.PI) * 0.5);
    },
  };
}

function stethoscope(): Model {
  const group = new Group();
  const steel = metal();
  const rubber = glossy(0x1b4a70, { roughness: 0.35 });
  group.add(tube([[-0.42, 0.95, 0.05], [-0.38, 0.65, 0], [-0.2, 0.38, 0], [0, 0.24, 0]], 0.026, steel, 32));
  group.add(tube([[0.42, 0.95, 0.05], [0.38, 0.65, 0], [0.2, 0.38, 0], [0, 0.24, 0]], 0.026, steel, 32));
  for (const x of [-0.42, 0.42]) {
    const tip = new Mesh(new SphereGeometry(0.055, 16, 12), matte(0x22313f));
    tip.position.set(x * 1.02, 0.98, 0.07);
    group.add(tip);
  }
  group.add(
    tube(
      [
        [0, 0.24, 0],
        [0.02, -0.1, 0.1],
        [0.36, -0.32, 0.16],
        [0.42, -0.68, 0.02],
        [0.08, -0.86, -0.05],
        [-0.24, -0.76, 0],
      ],
      0.045,
      rubber,
      64,
    ),
  );
  const head = new Group();
  head.add(new Mesh(new CylinderGeometry(0.21, 0.21, 0.08, 36), steel));
  const diaphragm = new Mesh(new CylinderGeometry(0.18, 0.18, 0.02, 36), matte(0x22313f));
  diaphragm.position.y = -0.05;
  head.add(diaphragm);
  const stem = new Mesh(new CylinderGeometry(0.04, 0.04, 0.16, 12), steel);
  stem.rotation.z = Math.PI / 2;
  stem.position.x = 0.24;
  head.add(stem);
  head.rotation.x = Math.PI / 2.4;
  head.position.set(-0.5, -0.76, 0);
  group.add(head);
  return {
    group,
    burstAt: new Vector3(-0.5, -0.76, 0),
    burstColor: 0xe3e8ee,
    update(time, _dt, energy) {
      head.rotation.z = Math.sin(time * (1.5 + energy * 10)) * (0.15 + energy * 0.4);
    },
  };
}

function thermometer(): Model {
  const group = new Group();
  const red = glossy(0xe03547, { emissive: new Color(0x7a0010), emissiveIntensity: 0.3 });
  const shell = new Mesh(new CapsuleGeometry(0.1, 1.3, 8, 24), glass());
  const bulb = new Mesh(new SphereGeometry(0.13, 24, 18), red);
  bulb.position.y = -0.7;
  const column = new Mesh(new CylinderGeometry(0.04, 0.04, 1, 12), red);
  for (let i = 0; i < 8; i++) {
    const mark = new Mesh(new BoxGeometry(0.06, 0.008, 0.01), matte(0x1b4a70));
    mark.position.set(0.05, -0.45 + i * 0.13, 0.1);
    group.add(mark);
  }
  group.add(shell, bulb, column);
  const level = (amount: number) => {
    const h = 0.15 + amount * 1.05;
    column.scale.y = h;
    column.position.y = -0.62 + h / 2;
  };
  return {
    group,
    burstColor: 0xff7a88,
    update(time, _dt, energy) {
      level(0.35 + Math.sin(time * 0.8) * 0.08 + energy * 0.55);
    },
  };
}

function bandage(): Model {
  const group = new Group();
  const strip = new Mesh(
    deform(new RoundedBoxGeometry(1.5, 0.42, 0.05, 4, 0.06), (p) => {
      p.z += p.x * p.x * 0.18;
    }),
    matte(0xefc29b),
  );
  const pad = new Mesh(new RoundedBoxGeometry(0.46, 0.3, 0.06, 3, 0.04), matte(0xfbf1e8));
  pad.position.z = 0.02;
  group.add(strip, pad);
  for (const x of [-0.55, -0.42, 0.42, 0.55]) {
    for (const y of [-0.08, 0.08]) {
      const dot = new Mesh(new CylinderGeometry(0.014, 0.014, 0.01, 8), matte(0xc99a72));
      dot.rotation.x = Math.PI / 2;
      dot.position.set(x, y, 0.03 + x * x * 0.18);
      group.add(dot);
    }
  }
  group.scale.setScalar(1.1);
  return { group, burstColor: 0xfbf1e8 };
}

function cross(): Model {
  const group = new Group();
  const material = glossy(0x35a6dd, { emissive: new Color(0x0b6fa6), emissiveIntensity: 0.35 });
  group.add(new Mesh(new RoundedBoxGeometry(1.2, 0.4, 0.28, 3, 0.08), material));
  group.add(new Mesh(new RoundedBoxGeometry(0.4, 1.2, 0.28, 3, 0.08), material));
  return {
    group,
    burstColor: 0x8fd3f5,
    update(time, _dt, energy) {
      material.emissiveIntensity = 0.3 + Math.sin(time * 2) * 0.1 + energy * 0.8;
    },
  };
}

function microscope(): Model {
  const group = new Group();
  const white = glossy(0xf4f7fa, { roughness: 0.35 });
  const navy = glossy(0x1b4a70, { roughness: 0.35 });
  const steel = metal();
  const base = new Mesh(new RoundedBoxGeometry(0.9, 0.12, 0.6, 3, 0.05), navy);
  base.position.y = -0.8;
  group.add(base);
  group.add(tube([[0.22, -0.74, -0.12], [0.34, -0.3, -0.12], [0.3, 0.2, -0.1], [0.1, 0.5, -0.05]], 0.08, white, 32));
  const stage = new Mesh(new RoundedBoxGeometry(0.62, 0.05, 0.5, 2, 0.02), navy);
  stage.position.set(-0.05, -0.25, 0);
  group.add(stage);
  const slide = new Mesh(new BoxGeometry(0.34, 0.012, 0.12), glass());
  slide.position.set(-0.05, -0.22, 0);
  group.add(slide);
  const body = new Group();
  body.add(new Mesh(new CylinderGeometry(0.1, 0.1, 0.7, 24), white));
  const eyepiece = new Mesh(new CylinderGeometry(0.07, 0.08, 0.22, 20), steel);
  eyepiece.position.y = 0.45;
  body.add(eyepiece);
  const turret = new Mesh(new CylinderGeometry(0.13, 0.13, 0.08, 24), steel);
  turret.position.y = -0.38;
  body.add(turret);
  const objectives: Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const objective = new Mesh(new CylinderGeometry(0.03, 0.045, 0.18, 12), steel);
    const a = (i / 3) * Math.PI * 2;
    objective.position.set(Math.cos(a) * 0.07, -0.48, Math.sin(a) * 0.07);
    objectives.push(objective);
    body.add(objective);
  }
  body.rotation.z = 0.35;
  body.position.set(-0.02, 0.22, 0);
  group.add(body);
  const knob = new Mesh(new CylinderGeometry(0.12, 0.12, 0.08, 24), navy);
  knob.rotation.x = Math.PI / 2;
  knob.position.set(0.34, -0.35, 0.02);
  group.add(knob);
  const light = new Mesh(new SphereGeometry(0.06, 16, 12), glossy(0xfff4c2, { emissive: new Color(0xffe27a), emissiveIntensity: 1 }));
  light.position.set(-0.05, -0.66, 0);
  group.add(light);
  return {
    group,
    burstAt: new Vector3(-0.05, -0.22, 0),
    burstColor: 0xfff4c2,
    update(_t, dt, energy) {
      turret.rotation.y += dt * energy * 8;
      knob.rotation.y += dt * (0.4 + energy * 6);
    },
  };
}

function clipboard(): Model {
  const group = new Group();
  group.add(new Mesh(new RoundedBoxGeometry(0.95, 1.25, 0.05, 3, 0.04), glossy(0x1b4a70, { roughness: 0.4 })));
  const paper = new Mesh(new BoxGeometry(0.8, 1.02, 0.012), matte(0xffffff));
  paper.position.set(0, -0.05, 0.035);
  group.add(paper);
  const clip = new Mesh(new RoundedBoxGeometry(0.42, 0.16, 0.08, 2, 0.03), metal());
  clip.position.set(0, 0.6, 0.05);
  group.add(clip);
  const ink = matte(0xb7c3cf);
  for (let i = 0; i < 5; i++) {
    const line = new Mesh(new BoxGeometry(0.46, 0.025, 0.005), ink);
    line.position.set(0.08, 0.3 - i * 0.17, 0.045);
    group.add(line);
  }
  const ticks: Mesh[] = [];
  const green = glossy(0x2bb673, { emissive: new Color(0x0e5a35), emissiveIntensity: 0.3 });
  for (let i = 0; i < 5; i++) {
    const tick = tube([[-0.3, 0.3 - i * 0.17, 0.05], [-0.26, 0.26 - i * 0.17, 0.05], [-0.18, 0.36 - i * 0.17, 0.05]], 0.014, green, 8);
    tick.visible = i < 3;
    ticks.push(tick);
    group.add(tick);
  }
  return {
    group,
    burstColor: 0x2bb673,
    update(_t, _dt, energy) {
      ticks.forEach((tick, i) => (tick.visible = i < 3 + Math.round(energy * 2)));
    },
  };
}

/** Glowing heart-monitor line (ECG) that scrolls continuously. */
function ecg(): Model {
  const group = new Group();
  const COUNT = 160;
  const positions = new Float32Array(COUNT * 3);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  const material = new LineBasicMaterial({ color: 0x8fd3f5, transparent: true, opacity: 0.9 });
  group.add(new Line(geometry, material));
  const shape = (x: number) => {
    const p = ((x % 1) + 1) % 1;
    if (p > 0.4 && p < 0.44) return (p - 0.4) * 4; // P wave up
    if (p >= 0.44 && p < 0.48) return 0.16 - (p - 0.44) * 4;
    if (p >= 0.5 && p < 0.52) return -(p - 0.5) * 8; // Q
    if (p >= 0.52 && p < 0.55) return -0.16 + (p - 0.52) * 30; // R
    if (p >= 0.55 && p < 0.58) return 0.74 - (p - 0.55) * 32; // S
    if (p >= 0.58 && p < 0.6) return -0.22 + (p - 0.58) * 11;
    if (p > 0.66 && p < 0.78) return Math.sin(((p - 0.66) / 0.12) * Math.PI) * 0.14; // T wave
    return 0;
  };
  let offset = 0;
  return {
    group,
    burstColor: 0x8fd3f5,
    update(_t, dt, energy) {
      offset += dt * (0.55 + energy * 1.2);
      const pos = geometry.getAttribute('position') as BufferAttribute;
      for (let i = 0; i < COUNT; i++) {
        const u = i / (COUNT - 1);
        pos.setXYZ(i, (u - 0.5) * 2.2, shape(u * 1.6 - offset) * 0.6, 0);
      }
      pos.needsUpdate = true;
    },
  };
}

const builders: Record<ModelName, () => Model> = {
  heart,
  lungs,
  brain,
  dna,
  capsule,
  tablet,
  syringe,
  stethoscope,
  bloodCell,
  cross,
  thermometer,
  bandage,
  molecule,
  microscope,
  clipboard,
  ecg,
};

export function buildModel(name: ModelName): Model {
  return builders[name]();
}
