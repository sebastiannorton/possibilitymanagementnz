#!/usr/bin/env node
/**
 * RENDER EXPAND THE BOX  —  imported by build/generate.mjs
 * =========================================================
 *
 * Pre-renders expand-the-box.html from the Tina CMS content document
 * content/expand-the-box/index.json. Tina edits the JSON; this module turns
 * it into the published HTML using the same design system as every other
 * page (css/styles.css), so the page never depends on JavaScript to show
 * real content to visitors or crawlers.
 *
 * Block types (see .tina/config.ts):
 *   heading   — optional eyebrow line + h2/h3
 *   paragraph — rich text (bold / italic / inline links)
 *   image     — grey "IMAGE HERE" placeholder when src is empty
 *   details   — label/value rows (date, time, location)
 *   section   — heading + rich text body
 *   linkList  — heading + one or more links
 *   cta       — prominent registration button
 *
 * Node stdlib only, like the rest of the build. Never throws to the caller.
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const CONTENT_PATH = 'content/expand-the-box/index.json';
const OUTPUT_PATH = 'expand-the-box/index.html';

/* ==========================================================
   ESCAPING + RICH TEXT
   ========================================================== */

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Serialize a Tina rich-text value (MDAST-shaped: { type: 'root', children }
 * with text/link/strong/em nodes and block types p/ul/li) to HTML.
 * Anything unknown is skipped, never rendered raw.
 */
function richTextToHtml(value) {
  if (value == null) return '';
  if (Array.isArray(value)) {
    return value.map((child) => inlineNode(child, true)).join('\n');
  }
  if (typeof value === 'string') return `<p>${esc(value)}</p>`;

  const node = value?.type === 'root' ? value : { type: 'root', children: [value] };
  return node.children.map((child) => inlineNode(child, true)).join('\n');
}

function inlineNode(node, blockContext = false) {
  if (node == null) return '';
  if (typeof node === 'string') return esc(node);
  if (node.type === 'text') return esc(node.text);
  if (node.type === 'link') {
    return `<a href="${esc(node.url)}"${looksExternal(node.url) ? ' target="_blank" rel="noopener noreferrer"' : ''}>${inline(node.children)}</a>`;
  }
  if (node.type === 'strong') return `<strong>${inline(node.children)}</strong>`;
  if (node.type === 'em') return `<em>${inline(node.children)}</em>`;
  if (node.type === 'p') {
    return `<p>${inline(node.children)}</p>`;
  }
  if (node.type === 'ul') {
    return `<ul>${node.children.map((li) => `<li>${inline(li.children ?? [])}</li>`).join('')}</ul>`;
  }
  // Unknown node types: render children only, lose nothing.
  return Array.isArray(node.children) ? inline(node.children) : '';
}

function inline(children) {
  return (children ?? []).map((child) => inlineNode(child)).join('');
}

function looksExternal(url) {
  return /^https?:\/\//i.test(String(url ?? '')) && !String(url).includes('possibilitymanagement.co.nz');
}

/* ==========================================================
   BLOCK RENDERERS
   ========================================================== */

const renderers = {
  heading(block) {
    const level = block.level === 'h3' ? 'h3' : 'h2';
    return `<div class="section-title${level === 'h3' ? ' section-title--minor' : ''}">${block.eyebrow ? `<p>${esc(block.eyebrow)}</p>` : ''}<${level}>${esc(block.title)}</${level}></div>`;
  },

  paragraph(block) {
    return `<div class="etb-paragraph">${richTextToHtml(block.content)}</div>`;
  },

  image(block) {
    const src = String(block.src ?? '').trim();
    if (!src) {
      return `<div class="etb-figure"><div class="etb-image-placeholder" role="img" aria-label="${esc(block.alt) || 'IMAGE HERE'}">IMAGE HERE</div>${block.caption ? `<p class="etb-caption">${esc(block.caption)}</p>` : ''}</div>`;
    }
    return `<div class="etb-figure"><img src="${esc(src)}" alt="${esc(block.alt)}" loading="lazy" decoding="async">${block.caption ? `<p class="etb-caption">${esc(block.caption)}</p>` : ''}</div>`;
  },

  details(block) {
    const rows = (block.rows ?? [])
      .map((row) => `<div class="etb-detail-row"><span class="etb-detail-label">${esc(row.label)}</span><span class="etb-detail-value">${esc(row.value)}</span></div>`)
      .join('\n');
    return `<div class="etb-details">${rows}</div>`;
  },

  section(block) {
    return `<div class="etb-section"><div class="section-title">${block.eyebrow ? `<p>${esc(block.eyebrow)}</p>` : ''}<h3>${esc(block.heading)}</h3></div>${richTextToHtml(block.paragraphs)}</div>`;
  },

  linkList(block) {
    const links = (block.links ?? [])
      .map((link) => `<a class="btn btn-outline" href="${esc(link.url)}"${link.external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${esc(link.label)}${link.external ? ' <span class="external-icon">&#8599;</span>' : ''}</a>`)
      .join('\n');
    return `<div class="etb-links">${block.heading ? `<h3>${esc(block.heading)}</h3>` : ''}<div class="etb-links-list">${links}</div></div>`;
  },

  cta(block) {
    return `<div class="etb-cta">${block.text ? `<p class="etb-cta-text">${esc(block.text)}</p>` : ''}<a class="btn btn-primary" href="${esc(block.url)}"${block.external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${esc(block.label)}${block.external ? ' <span class="external-icon">&#8599;</span>' : ''}</a></div>`;
  },
};

function renderBlocks(blocks) {
  return (blocks ?? [])
    .map((block) => {
      const render = renderers[block?._template];
      return render ? render(block) : null;
    })
    .filter(Boolean)
    .join('\n\n            ');
}

/* ==========================================================
   PAGE SHELL
   ========================================================== */

const PAGE_STYLES = `
    <style>
        /* Expand the Box — page-specific layout. Uses the site's CSS variables
           so the page stays on the shared design system. */
        .etb-paragraph p { max-width: 48rem; margin-inline: auto; }
        .etb-figure { max-width: 48rem; margin: 2rem auto; text-align: center; }
        .etb-figure img { width: 100%; height: auto; display: block; }
        .etb-image-placeholder {
            width: 100%;
            aspect-ratio: 16 / 9;
            background: var(--accent-black);
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--accent-text);
            opacity: 0.55;
            letter-spacing: 0.2em;
            font-size: 1.1rem;
        }
        .etb-caption { margin-top: 0.5rem; font-size: 0.9rem; opacity: 0.7; }
        .etb-details {
            max-width: 32rem;
            margin: 2rem auto;
            border: 1px solid rgba(255,255,255,0.12);
            border-radius: 8px;
            overflow: hidden;
        }
        .etb-detail-row {
            display: flex;
            justify-content: space-between;
            gap: 1rem;
            padding: 0.85rem 1.25rem;
            border-bottom: 1px solid rgba(255,255,255,0.08);
        }
        .etb-detail-row:last-child { border-bottom: none; }
        .etb-detail-label {
            color: var(--accent-secondary);
            font-weight: 600;
            letter-spacing: 0.08em;
            font-size: 0.85rem;
        }
        .etb-detail-value { text-align: right; }
        .etb-section { max-width: 48rem; margin: 2.5rem auto; }
        .etb-links { max-width: 32rem; margin: 2.5rem auto; text-align: center; }
        .etb-links-list > a { margin: 0.4rem; display: inline-block; }
        .etb-cta { max-width: 32rem; margin: 3rem auto; text-align: center; }
        .etb-cta-text { margin-bottom: 1.25rem; }
    </style>`;

function pageShell(title, description, contentHtml, canonicalPath) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="${esc(description)}">
    <title>${esc(title)}</title>
    <link rel="icon" type="image/png" href="/assets/logo.png">
    <link rel="preconnect" href="https://fonts.googleapis.com" crossorigin>
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,300;0,400;0,600;1,300&amp;display=swap">
    <link rel="stylesheet" href="/css/styles.css">
    <link rel="canonical" href="https://possibilitymanagement.co.nz${esc(canonicalPath)}">
${PAGE_STYLES}
</head>
<body>
    <header>
        <div class="container">
            <nav>
                <div class="logo">
                    <a href="/"><img src="/assets/logo.png" alt="PMnz Logo" style="height: 50px;"></a>
                </div>
                <ul class="nav-links">
                    <li><a href="/">Home</a></li>
                    <li><a href="/noticeboard/">Noticeboard</a></li>
                    <li><a href="https://rageclub.org/" target="_blank">Rage Club<span class="external-icon">&#8599;</span></a></li>
                    <li class="nav-item has-dropdown">
                        <span class="dropdown-toggle">Village</span>
                        <ul class="dropdown-menu">
                            <li><a href="/books/">Purchase Books</a></li>
                            <li><a href="/collaboration.html">Collaboration</a></li>
                            <li><a href="/articles.html">Articles</a></li>
                        </ul>
                    </li>
                    <li><a href="https://possibilitymanagement.mystrikingly.com/" target="_blank">Codex<span class="external-icon">&#8599;</span></a></li>
                </ul>
                <div class="burger">
                    <div class="line1"></div>
                    <div class="line2"></div>
                    <div class="line3"></div>
                </div>
            </nav>
        </div>
    </header>

    <main>
        <section>
            <div class="container">
            ${contentHtml}
            </div>
        </section>
    </main>

    <footer>
        <div class="container">
            <div class="footer-grid">
                <div class="footer-col">
                    <h4>Resources</h4>
                    <a href="https://possibilitymanagement.org" target="_blank">Possibility Management</a>
                    <a href="https://startoverxyz.mystrikingly.com/" target="_blank">Startover xyz</a>
                    <a href="https://trainerpath.mystrikingly.com/" target="_blank" rel="noopener noreferrer">Trainer Path</a>
                </div>
                <div class="footer-col">
                    <h4>Follow Us</h4>
                    <div class="social-links-vertical">
                        <a href="https://www.facebook.com/possibilitymanagementaotearoa" target="_blank">Facebook</a>
                        <a href="https://www.youtube.com/@PossibilityManagementTV" target="_blank">YouTube</a>
                        <a href="https://possibilitymanagementnews.substack.com/" target="_blank">Substack</a>
                    </div>
                </div>
            </div>
            <div class="footer-bottom">
                <p>&copy; 2026 Copyleft CC BY-SA Possibility Management New Zealand. All Rights Reserved.</p>
            </div>
        </div>
    </footer>

    <script src="/js/main.js"></script>
</body>
</html>
`;
}

/* ==========================================================
   MAIN ENTRY
   ========================================================== */

/**
 * Render expand-the-box.html from the Tina content JSON.
 *
 * Never throws: on a missing or malformed content document the placeholder
 * page is kept (or created) so the deploy is never broken.
 *
 * @returns {Promise<'updated'|'unchanged'|'failed'>}
 */
export async function renderExpandTheBoxPage() {
  let doc;
  try {
    doc = JSON.parse(await readFile(join(ROOT, CONTENT_PATH), 'utf8'));
  } catch (err) {
    console.warn(
      `[build:expand-the-box] WARNING: ${CONTENT_PATH} missing or invalid (${err.message}) — page left untouched.`
    );
    return 'failed';
  }

  const html = pageShell(
    'Expand the Box - Possibility Management NZ',
    'Expand the Box — Event details. lorem ipsum dotted path.',
    renderBlocks(doc.blocks),
    '/expand-the-box/'
  );

  const outPath = join(ROOT, OUTPUT_PATH);
  try {
    const existing = await readFile(outPath, 'utf8').catch(() => null);
    if (existing === html) {
      console.log('[build:expand-the-box] expand-the-box.html already up to date.');
      return 'unchanged';
    }
    await writeFilePublic(html);
    console.log('[build:expand-the-box] expand-the-box.html rendered from content JSON.');
    return 'updated';
  } catch (err) {
    console.warn(`[build:expand-the-box] WARNING: could not write ${OUTPUT_PATH} (${err.message}).`);
    return 'failed';
  }
}

async function writeFilePublic(html) {
  const { writeFile, mkdir } = await import('node:fs/promises');
  await mkdir(dirname(join(ROOT, OUTPUT_PATH)), { recursive: true });
  await writeFile(join(ROOT, OUTPUT_PATH), html, 'utf8');
}
