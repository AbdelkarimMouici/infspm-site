/**
 * Which 3D objects appear in each scene (a scene = an element with data-3d="name" in the page).
 * One clear centrepiece per scene, with at most a couple of small accents.
 * Coordinates: x and y from -1 to 1 across the element's half-width and half-height; z in front (+) or behind (-).
 * `s` = size relative to the element's smaller half-side. `w` = position used when the element is wide (desktop).
 */
import type { ModelName } from './models';

export interface Spec {
  m: ModelName;
  x: number;
  y: number;
  z?: number;
  s: number;
  /** Starting tilt (radians). */
  rx?: number;
  rz?: number;
  /** [x, y] when the element is much wider than tall. */
  w?: [number, number];
}

export const recipes: Record<string, Spec[]> = {
  // Home page: an anatomical heart that assembles itself, then beats over a live ECG line.
  hero: [
    { m: 'heart', x: 0, y: 0.1, z: 0.2, s: 0.68 },
    { m: 'ecg', x: 0, y: -0.8, z: 0.1, s: 0.9 },
    { m: 'bloodCell', x: 0.78, y: 0.55, z: 0.3, s: 0.15, rx: 1 },
    { m: 'bloodCell', x: -0.75, y: -0.35, z: -0.2, s: 0.12, rx: 0.5 },
    { m: 'capsule', x: -0.62, y: 0.68, s: 0.13, rz: 0.8 },
  ],
  quick: [{ m: 'stethoscope', x: 0, y: 0, s: 0.72 }],
  'home-news': [{ m: 'thermometer', x: 0, y: 0, s: 0.7, rz: 0.5 }],
  'home-activities': [{ m: 'molecule', x: 0, y: 0, s: 0.62 }],
  footer: [{ m: 'heart', x: 0, y: 0, s: 0.62 }],

  // Anatomy explorer (one organ at a time, turned by dragging).
  'explore-heart': [
    { m: 'heart', x: 0, y: 0.05, s: 0.78 },
    { m: 'bloodCell', x: 0.75, y: -0.6, z: 0.3, s: 0.14, rx: 1 },
    { m: 'bloodCell', x: -0.7, y: 0.6, z: -0.3, s: 0.12 },
  ],
  'explore-lungs': [{ m: 'lungs', x: 0, y: 0, s: 0.8 }],
  'explore-brain': [{ m: 'brain', x: 0, y: 0, s: 0.8 }],
  'explore-dna': [{ m: 'dna', x: 0, y: 0, s: 0.85, rz: 0.35 }],

  // Page headers (name = first path segment after the language).
  about: [
    { m: 'brain', x: 0, y: 0.05, s: 0.62 },
    { m: 'bloodCell', x: 0.68, y: -0.62, z: 0.3, s: 0.16, rx: 1 },
  ],
  programs: [
    { m: 'stethoscope', x: 0, y: 0.05, s: 0.66 },
    { m: 'capsule', x: -0.62, y: -0.62, s: 0.18, rz: 0.5 },
  ],
  admissions: [
    { m: 'clipboard', x: 0, y: 0, s: 0.62, rz: 0.12 },
    { m: 'cross', x: 0.66, y: -0.62, z: 0.3, s: 0.15 },
  ],
  activities: [
    { m: 'molecule', x: 0, y: 0.05, s: 0.62 },
    { m: 'capsule', x: 0.62, y: -0.6, s: 0.17, rz: -0.6 },
  ],
  news: [
    { m: 'lungs', x: 0, y: 0, s: 0.64 },
    { m: 'tablet', x: -0.62, y: 0.62, s: 0.13, rx: 1 },
  ],
  gallery: [
    { m: 'microscope', x: 0, y: 0, s: 0.64 },
    { m: 'bloodCell', x: 0.62, y: 0.62, s: 0.15, rx: 1 },
  ],
  contact: [
    { m: 'stethoscope', x: 0, y: 0.05, s: 0.64 },
    { m: 'bandage', x: 0.55, y: -0.62, z: 0.3, s: 0.28, rz: 0.4 },
  ],
  privacy: [
    { m: 'cross', x: 0, y: 0.05, s: 0.46 },
    { m: 'bandage', x: 0.42, y: -0.6, z: 0.3, s: 0.28, rz: -0.3 },
  ],
  default: [
    { m: 'dna', x: 0, y: 0, s: 0.62, rz: 0.3 },
    { m: 'capsule', x: 0.6, y: 0.58, s: 0.17, rz: 0.7 },
  ],
};
