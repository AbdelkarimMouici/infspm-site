/**
 * Downloads post images from Facebook's CDN and converts them to WebP without metadata.
 * Images are committed to the repo: the site never hotlinks Facebook URLs (they expire and track).
 */
import sharp from 'sharp';

const ALLOWED_HOST = /(^|\.)(fbcdn\.net|facebook\.com)$/i;
const MAX_BYTES = 15 * 1024 * 1024;
const MAX_EDGE = 1600;

export function isAllowedImageUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && ALLOWED_HOST.test(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

/** Reads a response body with a hard size limit (the Content-Length header can lie or be missing). */
async function readLimited(response: Response, limit: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length') ?? '0');
  if (declared > limit) throw new Error('Image too large');
  if (!response.body) throw new Error('Empty image response');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new Error('Image too large');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/** Re-encodes to WebP, max 1600 px, EXIF/GPS/ICC metadata removed (sharp drops metadata by default). */
export async function toWebp(input: Uint8Array): Promise<Buffer> {
  return sharp(input, { limitInputPixels: 50_000_000 })
    .rotate() // apply EXIF orientation before the metadata is dropped
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
}

export async function downloadImage(url: string, fetchImpl: typeof fetch = fetch): Promise<Buffer> {
  if (!isAllowedImageUrl(url)) throw new Error('Image URL is not on Facebook’s CDN');
  // Redirects are followed manually so each hop is checked against the allow-list.
  let current = url;
  for (let hop = 0; hop < 3; hop++) {
    const response = await fetchImpl(current, { redirect: 'manual', signal: AbortSignal.timeout(20_000) });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Redirect without location');
      current = new URL(location, current).href;
      if (!isAllowedImageUrl(current)) throw new Error('Image redirect left Facebook’s CDN');
      continue;
    }
    if (!response.ok) throw new Error(`Image download failed (HTTP ${response.status})`);
    const type = response.headers.get('content-type') ?? '';
    if (!/^image\/(jpeg|png|webp|gif)\b/i.test(type)) throw new Error('Unexpected image content type');
    return toWebp(await readLimited(response, MAX_BYTES));
  }
  throw new Error('Too many redirects');
}
