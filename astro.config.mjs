// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import { satteri } from '@astrojs/markdown-satteri';
import { safeMarkdownPlugin } from './src/lib/remark-safe-markdown.ts';

// Public origin used for canonical/hreflang URLs, the sitemap, robots.txt and structured data.
// Set SITE_URL in the build environment (Cloudflare Pages: Settings → Environment variables), e.g. for staging.
// TODO(content): set the real domain once the administration decides it (see docs/CONTENT.md).
const SITE_URL = process.env.SITE_URL?.trim() || 'https://example.invalid';
if (!/^https?:\/\/[^/]+$/.test(SITE_URL)) {
  throw new Error(`SITE_URL must be an origin without a trailing slash, e.g. https://example.dz (got "${SITE_URL}")`);
}

export default defineConfig({
  site: SITE_URL,
  output: 'static',
  trailingSlash: 'always',

  i18n: {
    locales: ['ar', 'fr', 'en'],
    defaultLocale: 'ar',
    routing: {
      prefixDefaultLocale: true,
      // "/" is handled by src/pages/index.astro (static meta refresh to "/ar/", no script).
      redirectToDefaultLocale: false,
    },
  },

  markdown: {
    // Strip raw HTML, unsafe links and body images from all Markdown content (see the plugin).
    // Footnotes are off: their generated labels are English only ("Footnotes", "Back to reference").
    processor: satteri({ mdastPlugins: [safeMarkdownPlugin], features: { gfm: { footnotes: false } } }),
  },

  build: {
    // Never inline CSS: keeps a strict Content-Security-Policy possible (step 7).
    inlineStylesheets: 'never',
    format: 'directory',
  },

  vite: {
    plugins: [tailwindcss()],
    build: {
      // Never inline assets as data: URIs (CSP and caching).
      assetsInlineLimit: 0,
    },
  },
});
