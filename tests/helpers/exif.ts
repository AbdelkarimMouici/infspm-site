/** Finds EXIF/XMP metadata blocks in JPEG, PNG and WebP files (test helper). */

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
      if (marker === 0xe1 && ascii(offset + 4, 28) === 'http://ns.adobe.com/xap/1.0/') return 'JPEG APP1 XMP';
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
      if ((type === 'iTXt' || type === 'tEXt' || type === 'zTXt') && ascii(offset + 8, 17) === 'XML:com.adobe.xmp') return 'PNG XMP chunk';
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
      if (type === 'XMP ') return 'WebP XMP chunk';
      offset += 8 + length + (length % 2);
    }
  }
  return null;
}
