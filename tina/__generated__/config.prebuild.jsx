// tina/config.ts
import { defineConfig } from "tinacms";
var config_default = defineConfig({
  // Tina Cloud credentials come from Netlify env vars. When unset, Tina
  // falls back to local read/write — no auth gate, dev-friendly.
  clientId: process.env.NEXT_PUBLIC_TINA_CLIENT_ID ?? null,
  token: process.env.TINA_TOKEN ?? null,
  branch: process.env.NEXT_PUBLIC_TINA_BRANCH,
  // The site is plain HTML served from the repo root, so the Tina admin
  // build lands in /admin and the whole repo is public.
  build: {
    outputFolder: "admin",
    publicFolder: "."
  },
  media: {
    tina: {
      publicFolder: ".",
      mediaRoot: "Images"
    }
  },
  // The Preview button in the Tina admin opens the live branch deploy of the
  // site, so editors see the real page next to the sidebar and know which
  // fields drive which sections. Netlify branch deploy URLs follow
  // <branch>--<site>.netlify.app; set TINA_PREVIEW_SITE below (or in the
  // deploy environment) to this site's Netlify subdomain name.
  ui: {
    previewUrl: (context) => {
      const branch = context.branch || process.env.NEXT_PUBLIC_TINA_BRANCH || "";
      const site = process.env.TINA_PREVIEW_SITE || "";
      const slugified = branch.toLowerCase().replace(/[^a-z0-9-]/g, "-");
      return { url: site ? `https://${slugified}--${site}.netlify.app/expand-the-box/` : "/" };
    }
  },
  schema: {
    collections: [
      {
        name: "expandTheBox",
        label: "Expand the Box",
        path: "content/expand-the-box",
        format: "json",
        ui: {
          // One document only — the admin opens straight into it.
          defaultItem: () => ({}),
          filename: {
            readonly: true
          },
          // "View page" opens the published page from the admin — one click
          // from the field list to the rendered result.
          router: () => "/expand-the-box/"
        },
        fields: [
          {
            name: "blocks",
            label: "Page content",
            type: "object",
            list: true,
            description: "Add, remove, drag to reorder. Each block below becomes a section on the page, in this order.",
            ui: {
              visualSelector: true
            },
            templates: [
              {
                name: "heading",
                label: "Heading",
                fields: [
                  {
                    name: "eyebrow",
                    label: "Small line above heading (optional)",
                    type: "string",
                    required: false
                  },
                  { name: "title", label: "Heading", type: "string" },
                  {
                    name: "level",
                    label: "Size",
                    type: "string",
                    options: [
                      { label: "Large", value: "h2" },
                      { label: "Medium", value: "h3" }
                    ],
                    initial: "h2"
                  }
                ]
              },
              {
                name: "paragraph",
                label: "Paragraph",
                description: "Body text. Supports bold, italic and inline links.",
                fields: [
                  { name: "content", label: "Text", type: "rich-text" }
                ]
              },
              {
                name: "image",
                label: "Image",
                fields: [
                  {
                    name: "src",
                    label: "Image",
                    type: "image",
                    description: "Leave empty to keep the grey IMAGE HERE placeholder."
                  },
                  { name: "alt", label: "Alt text", type: "string" },
                  {
                    name: "caption",
                    label: "Caption (optional)",
                    type: "string",
                    required: false
                  }
                ]
              },
              {
                name: "details",
                label: "Event details",
                description: "Date / time / location rows.",
                fields: [
                  {
                    name: "rows",
                    label: "Details",
                    type: "object",
                    list: true,
                    ui: {
                      itemProps: (item) => ({
                        label: item?.label ?? "Detail"
                      })
                    },
                    fields: [
                      { name: "label", label: "Label", type: "string" },
                      { name: "value", label: "Value", type: "string" }
                    ]
                  }
                ]
              },
              {
                name: "section",
                label: "Section (heading + text)",
                fields: [
                  {
                    name: "eyebrow",
                    label: "Small line above heading (optional)",
                    type: "string",
                    required: false
                  },
                  { name: "heading", label: "Heading", type: "string" },
                  {
                    name: "paragraphs",
                    label: "Text",
                    type: "rich-text"
                  }
                ]
              },
              {
                name: "linkList",
                label: "Link list",
                fields: [
                  {
                    name: "heading",
                    label: "Heading (optional)",
                    type: "string",
                    required: false
                  },
                  {
                    name: "links",
                    label: "Links",
                    type: "object",
                    list: true,
                    ui: {
                      itemProps: (item) => ({ label: item?.label ?? "Link" })
                    },
                    fields: [
                      { name: "label", label: "Label", type: "string" },
                      { name: "url", label: "URL", type: "string" },
                      {
                        name: "external",
                        label: "Opens in a new tab",
                        type: "boolean",
                        initial: false
                      }
                    ]
                  }
                ]
              },
              {
                name: "cta",
                label: "Call to action",
                description: "A prominent button, e.g. Register.",
                fields: [
                  {
                    name: "text",
                    label: "Line above the button (optional)",
                    type: "string",
                    required: false
                  },
                  { name: "label", label: "Button label", type: "string" },
                  { name: "url", label: "Button URL", type: "string" },
                  {
                    name: "external",
                    label: "Opens in a new tab",
                    type: "boolean",
                    initial: true
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  }
});
export {
  config_default as default
};
