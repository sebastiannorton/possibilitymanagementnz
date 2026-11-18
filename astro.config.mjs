import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify';
import tina from '@tinacms/astro/integration';

// The Expand the Box page is an Astro page; every other page on the site is
// hand-authored static HTML published from the repo root. What lands where:
//
//   - /expand-the-box/ is prerendered (prerender = true on the page) and
//     copied over the root expand-the-box/ directory by build/deploy-astro.mjs.
//   - The Tina island endpoint /tina-island/* is rendered on demand by the
//     adapter's server function, which the adapter writes (self-contained,
//     with traced dependencies) to .netlify/v1/functions/ssr/ at the repo
//     root. Netlify deploys that in addition to the legacy
//     netlify/functions/ directory (which keeps cors-proxy). Only
//     /tina-island/* is routed to the function (netlify.toml); every other
//     URL on the site keeps being served by the static files.
export default defineConfig({
  site: 'https://possibilitymanagement.co.nz',
  output: 'server',
  outDir: 'dist',
  build: {
    // No hashed _astro/ assets to sync: page CSS is inlined.
    assets: 'inline',
  },
  integrations: [tina()],
  adapter: netlify(),
  devToolbar: { enabled: false },
});
