// Island registry — shared by the dev server, the Netlify function
// (src/netlify/tina-island.ts) and any other on-demand host. Each island
// fetches its own data through requestWithMetadata so the refreshed region
// carries fresh form payloads back to the admin bridge.
import type { IslandRegistry } from '@tinacms/astro/experimental';
import { requestWithMetadata } from '@tinacms/astro';
import client from '../tina/__generated__/client';
import Blocks from './components/Blocks.astro';

export const islands: IslandRegistry = {
  expandTheBox: {
    fetch: (_request, params) =>
      requestWithMetadata(
        client.queries.expandTheBox({
          relativePath: String(params.get('relativePath') ?? 'index.json'),
        })
      ),
    component: Blocks,
    wrapper: { tag: 'div', className: 'container' },
    propsFromData: (data) => ({ doc: (data as any).data.expandTheBox }),
  },
};
