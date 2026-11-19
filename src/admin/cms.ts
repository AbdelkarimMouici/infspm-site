// Decap CMS entry point, bundled from npm (no CDN, no third-party script at runtime).
// Import order matters: manual-init sets window.CMS_MANUAL_INIT before Decap loads.
import './manual-init';
import CMS from 'decap-cms-app';

// Decap merges this partial config with /admin/config.yml (its types expect a full config).
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
  } as unknown as Parameters<typeof CMS.init>[0] extends { config?: infer C } ? C : never,
});
