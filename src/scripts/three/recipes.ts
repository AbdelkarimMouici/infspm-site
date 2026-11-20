/**
 * Which 3D objects appear in each scene (a scene = an element with data-3d="name" in the page).
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
  // Home page
  hero: [
    { m: 'heart', x: 0, y: 0.08, z: 0.3, s: 0.6 },
    { m: 'ecg', x: 0, y: -0.78, z: 0.2, s: 0.85 },
    { m: 'dna', x: -0.8, y: 0.12, z: -0.5, s: 0.55, rz: 0.25 },
    { m: 'capsule', x: 0.78, y: 0.64, s: 0.24, rz: 0.8 },
    { m: 'capsule', x: -0.62, y: -0.6, s: 0.2, rz: -0.5 },
    { m: 'bloodCell', x: 0.84, y: -0.25, z: 0.2, s: 0.2, rx: 1 },
    { m: 'bloodCell', x: -0.32, y: 0.84, z: -0.2, s: 0.16, rx: 0.6 },
    { m: 'bloodCell', x: 0.42, y: -0.86, z: 0.3, s: 0.14 },
    { m: 'syringe', x: 0.6, y: 0.08, z: -0.7, s: 0.36, rz: -0.9 },
    { m: 'cross', x: -0.82, y: -0.24, z: 0.4, s: 0.14 },
    { m: 'tablet', x: 0.25, y: 0.86, z: 0.2, s: 0.13, rx: 1.1 },
  ],
  quick: [
    { m: 'stethoscope', x: 0, y: 0.05, s: 0.62 },
    { m: 'tablet', x: 0.66, y: 0.62, s: 0.15, rx: 1 },
    { m: 'capsule', x: -0.62, y: -0.6, s: 0.2, rz: 0.6 },
  ],
  lab: [
    { m: 'heart', x: -0.5, y: 0.6, w: [-0.75, 0.12], s: 0.5 },
    { m: 'brain', x: 0.5, y: 0.62, w: [-0.25, 0.2], s: 0.46 },
    { m: 'lungs', x: -0.48, y: -0.05, w: [0.25, 0.05], s: 0.5 },
    { m: 'microscope', x: 0.5, y: -0.05, w: [0.75, 0], s: 0.46 },
    { m: 'dna', x: 0, y: -0.66, w: [0, -0.72], s: 0.42, rz: 1.57 },
    { m: 'bloodCell', x: 0.88, y: 0.92, w: [0.95, 0.82], z: 0.3, s: 0.12, rx: 0.8 },
    { m: 'bloodCell', x: -0.9, y: -0.92, w: [-0.95, -0.8], z: 0.2, s: 0.12 },
    { m: 'capsule', x: 0.05, y: 0.96, w: [0.5, 0.86], s: 0.14, rz: 1 },
    { m: 'tablet', x: -0.85, y: 0.25, w: [-0.5, -0.82], s: 0.1, rx: 1 },
    { m: 'cross', x: 0.85, y: -0.4, w: [0.48, -0.8], z: 0.3, s: 0.1 },
  ],
  'home-news': [
    { m: 'thermometer', x: 0, y: 0, s: 0.6, rz: 0.5 },
    { m: 'molecule', x: 0.6, y: 0.5, s: 0.26 },
    { m: 'bloodCell', x: -0.58, y: -0.55, s: 0.18, rx: 1 },
  ],
  'home-activities': [
    { m: 'brain', x: 0, y: 0, s: 0.58 },
    { m: 'capsule', x: 0.62, y: -0.6, s: 0.2, rz: -0.6 },
    { m: 'dna', x: -0.62, y: 0.38, s: 0.3, rz: 0.4 },
  ],
  footer: [
    { m: 'heart', x: 0, y: 0, s: 0.5 },
    { m: 'bloodCell', x: 0.7, y: 0.5, s: 0.18, rx: 1 },
    { m: 'bloodCell', x: -0.7, y: -0.5, s: 0.16 },
  ],

  // Page headers (name = first path segment after the language)
  about: [
    { m: 'brain', x: 0.2, y: 0.32, s: 0.44 },
    { m: 'heart', x: -0.35, y: -0.25, z: 0.3, s: 0.4 },
    { m: 'dna', x: 0.62, y: -0.42, s: 0.34, rz: 0.4 },
    { m: 'bloodCell', x: -0.62, y: 0.62, s: 0.15, rx: 1 },
  ],
  programs: [
    { m: 'stethoscope', x: 0, y: 0.08, s: 0.58 },
    { m: 'syringe', x: 0.62, y: -0.38, z: 0.2, s: 0.34, rz: -0.7 },
    { m: 'capsule', x: -0.62, y: -0.55, s: 0.2, rz: 0.5 },
    { m: 'tablet', x: -0.58, y: 0.62, s: 0.14, rx: 1 },
  ],
  admissions: [
    { m: 'clipboard', x: 0, y: 0, s: 0.55, rz: 0.12 },
    { m: 'thermometer', x: 0.66, y: 0.3, z: 0.3, s: 0.34, rz: 0.5 },
    { m: 'cross', x: -0.62, y: -0.55, s: 0.16 },
    { m: 'capsule', x: 0.58, y: -0.62, s: 0.18, rz: 1 },
  ],
  activities: [
    { m: 'molecule', x: 0, y: 0.08, s: 0.55 },
    { m: 'bloodCell', x: 0.62, y: -0.5, z: 0.3, s: 0.2, rx: 1 },
    { m: 'capsule', x: -0.62, y: 0.55, s: 0.2, rz: 0.4 },
    { m: 'dna', x: -0.6, y: -0.42, s: 0.3, rz: -0.4 },
  ],
  news: [
    { m: 'lungs', x: 0, y: 0, s: 0.55 },
    { m: 'thermometer', x: 0.66, y: -0.32, z: 0.3, s: 0.3, rz: -0.5 },
    { m: 'tablet', x: -0.6, y: 0.6, s: 0.14, rx: 1 },
    { m: 'bloodCell', x: -0.6, y: -0.6, s: 0.15 },
  ],
  gallery: [
    { m: 'microscope', x: 0, y: 0, s: 0.55 },
    { m: 'molecule', x: 0.62, y: 0.55, s: 0.24 },
    { m: 'bloodCell', x: -0.62, y: -0.5, s: 0.18, rx: 1 },
    { m: 'capsule', x: 0.6, y: -0.58, s: 0.18, rz: -0.8 },
  ],
  contact: [
    { m: 'stethoscope', x: 0, y: 0.05, s: 0.55 },
    { m: 'bandage', x: 0.55, y: -0.6, z: 0.3, s: 0.3, rz: 0.4 },
    { m: 'cross', x: -0.62, y: 0.55, s: 0.15 },
  ],
  privacy: [
    { m: 'cross', x: 0, y: 0.05, s: 0.4 },
    { m: 'bandage', x: 0.4, y: -0.58, z: 0.3, s: 0.3, rz: -0.3 },
    { m: 'tablet', x: -0.58, y: 0.58, s: 0.15, rx: 1 },
  ],
  default: [
    { m: 'dna', x: 0, y: 0, s: 0.5, rz: 0.3 },
    { m: 'capsule', x: 0.6, y: 0.55, s: 0.2, rz: 0.7 },
    { m: 'bloodCell', x: -0.6, y: -0.5, s: 0.18, rx: 1 },
  ],
};
