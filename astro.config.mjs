// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import { satteri } from '@astrojs/markdown-satteri';
import { safeMarkdownPlugin } from './src/lib/remark-safe-markdown.ts';

// Public origin used for canonical/hreflang URLs, the sitemap, robots.txt and structured data.
// Set SITE_URL in the build environment (Cloudflare Pages: Settings → Environment variables), e.g. for staging.
// TODO(content): set the real domain once the administration decides it (see docs/CONTENT.md).
const SITE_URL = process.env.SITE_URL?.trim() || 'https://example.invalid';
// On Cloudflare Pages (CF_PAGES=1) a missing SITE_URL would silently publish canonical/hreflang/sitemap URLs
// pointing to the placeholder domain: fail the build instead.
if (process.env.CF_PAGES && !process.env.SITE_URL?.trim()) {
  throw new Error('SITE_URL is not set for this Cloudflare Pages environment (see docs/DEPLOYMENT.md §4).');
}
// HTTPS origin only (http allowed for localhost, e.g. Lighthouse runs), no path, query or trailing slash.
if (!/^(https:\/\/[a-z0-9.-]+|http:\/\/(localhost|127\.0\.0\.1))(:\d+)?$/.test(SITE_URL)) {
  throw new Error(`SITE_URL must be an https origin without a trailing slash, e.g. https://example.dz (got "${SITE_URL}")`);
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
