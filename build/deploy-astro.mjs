#!/usr/bin/env node
/**
 * DEPLOY THE ASTRO BUILD — node build/deploy-astro.mjs
 * =========================================================
 * The node adapter splits Astro's output: prerendered pages and staged
 * static assets live in dist/client/, server code in dist/server/ (unused —
 * the island runs in our own Netlify function). This script moves only the
 * pieces that belong on the live site:
 *
 *   dist/client/expand-the-box/index.html ->  expand-the-box/index.html
 *   dist/client/admin/bridge.js           ->  admin/bridge.js
 *       (the visual-editing bridge the admin iframe loads; /admin/ itself
 *        is built by `tinacms build` directly into ./admin)
 *
 * The island function is bundled separately by build/bundle-island.mjs.
 * Node stdlib only — same rule as the rest of the build.
 */

import { cp, mkdir, rm, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const log = (...args) => console.log('[build:astro]', ...args);

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  // Adapter-dependent layout: with @astrojs/netlify the prerendered page
  // lands in dist/<page>/ directly. Some adapters (e.g. @astrojs/node)
  // split output into dist/client/. Accept both.
  const distPage = (await exists(join(ROOT, 'dist/client/expand-the-box/index.html')))
    ? join(ROOT, 'dist/client/expand-the-box/index.html')
    : join(ROOT, 'dist/expand-the-box/index.html');
  if (!(await exists(distPage))) {
    console.warn('[build:astro] WARNING: no built expand-the-box page found under dist/ — was astro build run? Page left untouched.');
    return;
  }

  // Replace the published page wholesale.
  await rm(join(ROOT, 'expand-the-box'), { recursive: true, force: true });
  await mkdir(join(ROOT, 'expand-the-box'), { recursive: true });
  await cp(distPage, join(ROOT, 'expand-the-box/index.html'));
  log('expand-the-box/index.html updated from the Astro build.');

  // Bridge asset for visual editing (harmless if absent — editing just
  // won't bind, the page still serves).
  const distBridge = (await exists(join(ROOT, 'dist/client/admin/bridge.js')))
    ? join(ROOT, 'dist/client/admin/bridge.js')
    : join(ROOT, 'dist/admin/bridge.js');
  if (await exists(distBridge)) {
    await mkdir(join(ROOT, 'admin'), { recursive: true });
    await cp(distBridge, join(ROOT, 'admin/bridge.js'));
    log('admin/bridge.js staged.');
  } else {
    console.warn('[build:astro] WARNING: dist/admin/bridge.js missing — visual editing bridge not staged.');
  }
}

main()
  .catch((err) => {
    console.warn('[build:astro] WARNING:', err?.message);
  })
  .finally(() => {
    log('done.');
    process.exit(0);
  });
