// Decap CMS entry point, bundled from npm (no CDN, no third-party script at runtime).
// Import order matters: manual-init sets window.CMS_MANUAL_INIT before Decap loads.
import './manual-init';
import CMS from 'decap-cms-app';
import ar from '../content/ui/ar.json';
import { siteSettingsCollection, siteTextsCollection } from './collections';

// Decap merges this partial config with /admin/config.yml (arrays such as `collections` are appended).
CMS.init({
  config: {
    load_config_file: true,
    // The rest of the configuration is loaded from /admin/config.yml.
    backend: {
      name: 'github',
      repo: 'AbdelkarimMouici/infspm-site',
      branch: 'main',
      // OAuth goes through our own Cloudflare Pages Function (functions/api/decap/*), same origin.
      base_url: window.location.origin,
      auth_endpoint: 'api/decap/auth',
    },
    // Settings (logo, contact details) and every interface text of the site, generated from the dictionaries.
    collections: [siteSettingsCollection(), siteTextsCollection(ar)],
  } as unknown as Parameters<typeof CMS.init>[0] extends { config?: infer C } ? C : never,
});
