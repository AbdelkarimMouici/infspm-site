// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import { satteri } from '@astrojs/markdown-satteri';
import { safeMarkdownPlugin } from './src/lib/remark-safe-markdown.ts';

// TODO(content): replace with the real domain once the administration decides it (see docs/CONTENT.md).
const SITE_URL = 'https://example.invalid';

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
    processor: satteri({ mdastPlugins: [safeMarkdownPlugin] }),
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
