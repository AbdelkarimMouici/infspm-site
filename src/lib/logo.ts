import type { ImageMetadata } from 'astro';
import { site } from '~/config/site';

// Only the brand folder: uploads elsewhere (photos awaiting consent) must never be pulled into the build.
const files = import.meta.glob<{ default: ImageMetadata }>('/src/assets/brand/*.{png,jpg,jpeg,webp,svg}', {
  eager: true,
});

/** The logo chosen in the CMS settings (src/assets/brand/…), or the first brand image as a fallback. */
export function getLogo(): ImageMetadata | undefined {
  const chosen = `/src/${site.logo.replace(/^(\.\.\/)+/, '')}`;
  return files[chosen]?.default ?? Object.values(files)[0]?.default;
}
