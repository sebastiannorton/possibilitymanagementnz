import type { APIRoute } from 'astro';
import { experimental_createIslandRoute } from '@tinacms/astro/experimental';
import { islands } from '../../islands';

// On-demand island refresh endpoint. The bridge POSTs here after every
// save (and once to prime) to get the re-rendered region + form payloads.
// In dev, `astro dev` serves it; in production, build/bundle-island.mjs
// bundles this handler into a Netlify function. Must never be prerendered.
export const prerender = false;

const handler = experimental_createIslandRoute(islands);

export const GET: APIRoute = (ctx) => handler(ctx);
export const POST: APIRoute = (ctx) => handler(ctx);
