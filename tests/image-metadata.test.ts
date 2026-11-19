import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findExif } from './helpers/exif';

/**
 * Committed images must not carry EXIF metadata (GPS position, camera serial, date…), because the
 * originals stay in git history even when the site only publishes re-encoded copies (CLAUDE.md).
 * Strip metadata before committing (the Facebook sync does it automatically, step 5).
 */

const IMAGE_EXT = /\.(jpe?g|png|webp|avif|gif|tiff?|heic|heif|bmp|svg)$/i;
const ALLOWED_EXT = /\.(jpe?g|png|webp)$/i;

function listImages(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return listImages(path);
    return IMAGE_EXT.test(name) ? [path] : [];
  });
}

describe('committed images', () => {
  const images = ['src', 'public'].flatMap(listImages);

  it('use only JPEG, PNG or WebP (formats the metadata check understands), or safe SVG icons', () => {
    const svgs = images.filter((path) => /\.svg$/i.test(path));
    expect(images.filter((path) => !ALLOWED_EXT.test(path) && !/\.svg$/i.test(path))).toEqual([]);
    // SVG is code: no scripts, event handlers, external references, foreign content or metadata blocks.
    for (const path of svgs) {
      const svg = readFileSync(path, 'utf8');
      expect(svg, path).not.toMatch(/<script|<foreignObject|<metadata|\son[a-z]+\s*=|(href|src)\s*=\s*["']?\s*(https?:|\/\/|data:|javascript:)/i);
    }
  });

  it('carry no EXIF/XMP/GPS metadata', () => {
    const offenders = images
      .map((path) => ({ path, found: findExif(readFileSync(path)) }))
      .filter((item) => item.found)
      .map((item) => `${item.path}: ${item.found}`);
    expect(offenders).toEqual([]);
  });
});

describe('findExif detector', () => {
  it('detects EXIF in a minimal JPEG and ignores a clean one', () => {
    const exif = Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0, 0, 0xff, 0xda]);
    const clean = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46, 0xff, 0xda]);
    expect(findExif(exif)).toBe('JPEG APP1 Exif');
    expect(findExif(clean)).toBeNull();
  });

  it('detects XMP in JPEG', () => {
    const xmp = new TextEncoder().encode('http://ns.adobe.com/xap/1.0/');
    const bytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, 0x00, xmp.length + 2, ...xmp, 0xff, 0xda]);
    expect(findExif(bytes)).toBe('JPEG APP1 XMP');
  });

  it('detects an EXIF chunk in WebP', () => {
    const riff = new TextEncoder().encode('RIFF\0\0\0\0WEBPEXIF');
    const bytes = new Uint8Array(riff.length + 4);
    bytes.set(riff);
    expect(findExif(bytes)).toBe('WebP EXIF chunk');
  });
});
