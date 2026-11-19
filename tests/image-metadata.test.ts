import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Committed images must not carry EXIF metadata (GPS position, camera serial, date…), because the
 * originals stay in git history even when the site only publishes re-encoded copies (CLAUDE.md).
 * Strip metadata before committing (the Facebook sync does it automatically, step 5).
 */

function listImages(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return listImages(path);
    return /\.(jpe?g|png|webp)$/i.test(name) ? [path] : [];
  });
}

/** Returns a description of the metadata block found, or null. */
export function findExif(bytes: Uint8Array): string | null {
  const ascii = (offset: number, length: number) =>
    String.fromCharCode(...bytes.subarray(offset, offset + length));

  // JPEG: APP1 segment starting with "Exif\0\0".
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 4 < bytes.length && bytes[offset] === 0xff) {
      const marker = bytes[offset + 1] ?? 0;
      const length = ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0);
      if (marker === 0xe1 && ascii(offset + 4, 4) === 'Exif') return 'JPEG APP1 Exif';
      if (marker === 0xda) break; // start of scan: no more metadata segments
      offset += 2 + length;
    }
    return null;
  }
  // PNG: eXIf chunk.
  if (ascii(1, 3) === 'PNG') {
    let offset = 8;
    while (offset + 8 <= bytes.length) {
      const length =
        (((bytes[offset] ?? 0) << 24) >>> 0) + ((bytes[offset + 1] ?? 0) << 16) + ((bytes[offset + 2] ?? 0) << 8) + (bytes[offset + 3] ?? 0);
      const type = ascii(offset + 4, 4);
      if (type === 'eXIf') return 'PNG eXIf chunk';
      if (type === 'IEND') break;
      offset += 12 + length;
    }
    return null;
  }
  // WebP (RIFF): EXIF chunk.
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const type = ascii(offset, 4);
      const length =
        (bytes[offset + 4] ?? 0) + ((bytes[offset + 5] ?? 0) << 8) + ((bytes[offset + 6] ?? 0) << 16) + (((bytes[offset + 7] ?? 0) << 24) >>> 0);
      if (type === 'EXIF') return 'WebP EXIF chunk';
      offset += 8 + length + (length % 2);
    }
  }
  return null;
}

describe('committed images', () => {
  const images = ['src', 'public'].flatMap(listImages);

  it('carry no EXIF/GPS metadata', () => {
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

  it('detects an EXIF chunk in WebP', () => {
    const riff = new TextEncoder().encode('RIFF\0\0\0\0WEBPEXIF');
    const bytes = new Uint8Array(riff.length + 4);
    bytes.set(riff);
    expect(findExif(bytes)).toBe('WebP EXIF chunk');
  });
});
