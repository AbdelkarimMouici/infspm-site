/**
 * Prepares an uploaded photo in the browser before it is sent:
 * - respects the camera orientation, then redraws it on a canvas (this drops EXIF/GPS and all metadata);
 * - resizes to at most 1600 px on the longest side;
 * - encodes as WebP (or JPEG where the browser cannot encode WebP, e.g. Safari). The site build converts
 *   every image to optimised WebP/AVIF anyway.
 */
const MAX_SIDE = 1600;
const MAX_INPUT = 25 * 1024 * 1024;

export interface PreparedImage {
  id: string;
  data: string; // base64
  type: 'image/webp' | 'image/jpeg';
  url: string; // object URL for previews
  width: number;
  height: number;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]+,/, ''));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(blob);
  });
}

function encode(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!/^image\/(jpeg|png|webp|heic|heif|gif|avif)$/i.test(file.type) || file.size > MAX_INPUT) throw new Error('unsupported');
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  let blob = await encode(canvas, 'image/webp', 0.84);
  let type: PreparedImage['type'] = 'image/webp';
  if (!blob || blob.type !== 'image/webp') {
    blob = await encode(canvas, 'image/jpeg', 0.86);
    type = 'image/jpeg';
  }
  if (!blob) throw new Error('encode failed');
  const id = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
  return { id, data: await blobToBase64(blob), type, url: URL.createObjectURL(blob), width, height };
}
