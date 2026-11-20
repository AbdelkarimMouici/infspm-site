import type { ImageMetadata } from 'astro';

/**
 * The institute's logo: the first file found at src/assets/brand/logo.(png|jpg|jpeg|webp|svg).
 * Replace that file (or, after stage 3 of the redesign, upload a new one from the admin panel) to change it everywhere.
 */
export function getLogo(): ImageMetadata | undefined {
  const files = import.meta.glob<{ default: ImageMetadata }>('/src/assets/brand/logo.{png,jpg,jpeg,webp,svg}', {
    eager: true,
  });
  return Object.values(files)[0]?.default;
}
