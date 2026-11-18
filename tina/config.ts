import { defineConfig } from 'tinacms';

/**
 * Tina CMS configuration — scoped to the Expand the Box page only.
 *
 * Content lives in JSON under content/expand-the-box/. The published HTML is
 * pre-rendered from that JSON by build/generate.mjs (see
 * build/render-expand-the-box.mjs), so the page keeps the site's design and
 * never depends on JavaScript for SEO.
 *
 * Locally (no TINA_TOKEN set) the sidebar runs unauthenticated against the
 * files in this repo. With TINA_TOKEN / NEXT_PUBLIC_TINA_CLIENT_ID /
 * NEXT_PUBLIC_TINA_BRANCH set (Netlify env vars + Tina Cloud), edits are
 * committed to GitHub as a branch + PR by the editor.
 */
export default defineConfig({
  // Tina Cloud credentials come from Netlify env vars. When unset, Tina
  // falls back to local read/write — no auth gate, dev-friendly.
  clientId: process.env.NEXT_PUBLIC_TINA_CLIENT_ID ?? null,
  token: process.env.TINA_TOKEN ?? null,
  branch: process.env.NEXT_PUBLIC_TINA_BRANCH,

  // The site is plain HTML served from the repo root, so the Tina admin
  // build lands in /admin and the whole repo is public.
  build: {
    outputFolder: 'admin',
    publicFolder: '.',
  },

  media: {
    tina: {
      publicFolder: '.',
      mediaRoot: 'Images',
    },
  },

  schema: {
    collections: [
      {
        name: 'expandTheBox',
        label: 'Expand the Box',
        path: 'content/expand-the-box',
        format: 'json',
        ui: {
          // One document only — the admin opens straight into it.
          defaultItem: () => ({}),
          filename: {
            readonly: true,
          },
        },
        fields: [
          {
            name: 'blocks',
            label: 'Page content',
            type: 'object',
            list: true,
            description:
              'Add, remove, drag to reorder. Each block below becomes a section on the page, in this order.',
            ui: {
              visualSelector: true,
            },
            templates: [
              {
                name: 'heading',
                label: 'Heading',
                fields: [
                  {
                    name: 'eyebrow',
                    label: 'Small line above heading (optional)',
                    type: 'string',
                    required: false,
                  },
                  { name: 'title', label: 'Heading', type: 'string' },
                  {
                    name: 'level',
                    label: 'Size',
                    type: 'string',
                    options: [
                      { label: 'Large', value: 'h2' },
                      { label: 'Medium', value: 'h3' },
                    ],
                    initial: 'h2',
                  },
                ],
              },
              {
                name: 'paragraph',
                label: 'Paragraph',
                description:
                  'Body text. Supports bold, italic and inline links.',
                fields: [
                  { name: 'content', label: 'Text', type: 'rich-text' },
                ],
              },
              {
                name: 'image',
                label: 'Image',
                fields: [
                  {
                    name: 'src',
                    label: 'Image',
                    type: 'image',
                    description:
                      'Leave empty to keep the grey IMAGE HERE placeholder.',
                  },
                  { name: 'alt', label: 'Alt text', type: 'string' },
                  {
                    name: 'caption',
                    label: 'Caption (optional)',
                    type: 'string',
                    required: false,
                  },
                ],
              },
              {
                name: 'details',
                label: 'Event details',
                description: 'Date / time / location rows.',
                fields: [
                  {
                    name: 'rows',
                    label: 'Details',
                    type: 'object',
                    list: true,
                    ui: {
                      itemProps: (item) => ({
                        label: item?.label ?? 'Detail',
                      }),
                    },
                    fields: [
                      { name: 'label', label: 'Label', type: 'string' },
                      { name: 'value', label: 'Value', type: 'string' },
                    ],
                  },
                ],
              },
              {
                name: 'section',
                label: 'Section (heading + text)',
                fields: [
                  {
                    name: 'eyebrow',
                    label: 'Small line above heading (optional)',
                    type: 'string',
                    required: false,
                  },
                  { name: 'heading', label: 'Heading', type: 'string' },
                  {
                    name: 'paragraphs',
                    label: 'Text',
                    type: 'rich-text',
                  },
                ],
              },
              {
                name: 'linkList',
                label: 'Link list',
                fields: [
                  {
                    name: 'heading',
                    label: 'Heading (optional)',
                    type: 'string',
                    required: false,
                  },
                  {
                    name: 'links',
                    label: 'Links',
                    type: 'object',
                    list: true,
                    ui: {
                      itemProps: (item) => ({ label: item?.label ?? 'Link' }),
                    },
                    fields: [
                      { name: 'label', label: 'Label', type: 'string' },
                      { name: 'url', label: 'URL', type: 'string' },
                      {
                        name: 'external',
                        label: 'Opens in a new tab',
                        type: 'boolean',
                        initial: false,
                      },
                    ],
                  },
                ],
              },
              {
                name: 'cta',
                label: 'Call to action',
                description: 'A prominent button, e.g. Register.',
                fields: [
                  {
                    name: 'text',
                    label: 'Line above the button (optional)',
                    type: 'string',
                    required: false,
                  },
                  { name: 'label', label: 'Button label', type: 'string' },
                  { name: 'url', label: 'Button URL', type: 'string' },
                  {
                    name: 'external',
                    label: 'Opens in a new tab',
                    type: 'boolean',
                    initial: true,
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
});
