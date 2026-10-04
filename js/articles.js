/**
 * POSSIBILITATORS DIRECTORY — Articles Page
 * ==========================================
 *
 * Progressive enhancement for the author grid.
 *
 * The page already contains pre-rendered author cards, written at deploy time
 * by build/generate.mjs. This script fetches the CSV again and compares what it
 * renders with what is already on screen:
 *   - same content  → the pre-rendered DOM is left alone
 *   - changed Sheet → the grid is refreshed, exactly as before
 *   - fetch failed  → the pre-rendered cards remain on screen
 *
 * It then does the one thing HTML cannot: fetch each author's RSS feed and
 * upgrade the "View latest writing" link into their actual latest article.
 *
 * All parsing, filtering and card markup lives in js/shared/data.js, which the
 * build script imports too, so the two paths cannot drift.
 *
 * ── HOW TO UPDATE ─────────────────────────────────────────
 * 1. Edit the Google Sheet: https://docs.google.com/spreadsheets/d/1KNXcr4MWsAP7KWf2e0aJ6G9VPWpI-4py9JilHhVdyz4/edit?usp=sharing
 * 2. The site reads from /api/possibilitators.csv, proxied by Netlify
 *    to the published CSV URL (see netlify.toml).
 * 3. To change the sheet, update the 'to' URL in netlify.toml only.
 *    No code changes needed.
 *
 * ── PHOTO PRIORITY ───────────────────────────────────
 * 1. photo_url column — full URL (e.g. Google Drive / Substack image) OR
 *    bare filename (e.g. "AnneChloe.png" → looks in assets/possibilitators/)
 * 2. Auto-generated initials avatar (fallback)
 *
 * ── EXPECTED COLUMNS ─────────────────────────────────
 * id, name, photo_url, writing_url, platform, rss_url, short_bio, location, active, notes_internal
 */

import {
  fetchCSVText,
  parsePossibilitatorRows,
  renderPossibilitatorCardsHTML,
  filterPossibilitators,
  possibiltatorFallbackHTML,
  contentSignature,
  escapeHTML,
} from './shared/data.js';

/* ==========================================================
   CONFIG — Change these values as needed
   ========================================================== */

const SHEET_CSV_URL = '/api/possibilitators.csv';
const GRID_ID = 'possibilitators-grid';

/* ==========================================================
   MAIN
   ========================================================== */

async function init() {
  const grid = document.getElementById(GRID_ID);
  if (!grid) {
    console.warn(`[articles] Mount element #${GRID_ID} not found`);
    return;
  }

  let rows;
  try {
    rows = parsePossibilitatorRows(await fetchCSVText(SHEET_CSV_URL));
  } catch (err) {
    console.warn('[articles] CSV fetch failed:', err);
    // Keep the pre-rendered cards if the build produced them; only show the
    // error state when there is nothing to show.
    if (!grid.dataset.signature) {
      showEmptyState('Could not load the directory. Check that the Netlify proxy is working.');
    } else {
      console.info('[articles] Keeping pre-rendered directory after a failed refresh.');
    }
    return;
  }

  console.log(`[articles] CSV parsed: ${rows.length} total rows`);

  const { kept, dropped } = filterPossibilitators(rows);
  console.debug(`[articles] Kept ${kept.length}:`, kept.map((p) => p.name));
  if (dropped.length > 0) {
    console.debug('[articles] Dropped:', dropped.map((d) => `${d.name} (${d.reason})`));
  }

  const html = renderPossibilitatorCardsHTML(rows);

  // Identical to the build output → the cards on screen are already correct.
  const signature = contentSignature(html);
  if (grid.dataset.signature === signature) {
    console.debug('[articles] matches pre-rendered content, no refresh needed.');
  } else {
    grid.innerHTML = html;
    grid.dataset.signature = signature;
  }

  enhanceCards(grid);

  if (kept.length === 0) return;
  kept.forEach((person, i) => fetchRSS(person, grid, i));
}

function showEmptyState(message) {
  const grid = document.getElementById(GRID_ID);
  if (!grid) return;
  grid.innerHTML = `
    <div class="empty-state">
      <p>${escapeHTML(message || 'The directory is being seeded. Check back soon for Possibilitators writing on Substack.')}</p>
    </div>
  `;
}

/* ==========================================================
   DOM ENHANCEMENT
   ========================================================== */

/**
 * Add the behaviour that static HTML cannot carry: fall back to initials when
 * a photo fails to load. Safe to run over pre-rendered or freshly built cards.
 *
 * @param {HTMLElement} grid
 */
function enhanceCards(grid) {
  grid.querySelectorAll('.possibilitator-card').forEach((card) => {
    if (card.dataset.enhanced === 'true') return;
    card.dataset.enhanced = 'true';

    const img = card.querySelector('.possibilitator-avatar img');
    const initials = card.querySelector('.avatar-initials');
    if (!img || !initials) return;

    img.addEventListener('error', () => {
      img.style.display = 'none';
      initials.style.display = 'flex';
    });
  });
}


/* ==========================================================
   RSS FETCH — upgrades each card's link to the latest article
   ========================================================== */

/**
 * Fetch an author's latest article and swap it into their card.
 * The pre-rendered fallback link is left in place if anything goes wrong.
 *
 * @param {object} person
 * @param {HTMLElement} grid
 * @param {number} index - position of the card within the grid
 */
async function fetchRSS(person, grid, index) {
  const rssBox = grid.querySelector(`.possibilitator-card:nth-child(${index + 1}) .latest-article`);
  if (!rssBox) return;

  if (!person.rss_url) {
    rssBox.innerHTML = possibiltatorFallbackHTML(person);
    return;
  }

  try {
    const data = await tryFetchRSS(person.rss_url);
    if (!data || !data.title || !data.link) throw new Error('No items');

    const imgHtml = data.image
      ? `<img class="rss-thumb" src="${escapeHTML(data.image)}" alt="" loading="lazy" onerror="this.style.display='none'">`
      : '';

    rssBox.innerHTML = `
      <span class="rss-label">Latest:</span>
      <div class="rss-entry">
        ${imgHtml}
        <a href="${escapeHTML(data.link)}" target="_blank" rel="noopener noreferrer" class="rss-title">${escapeHTML(data.title)}</a>
      </div>
    `;
  } catch (err) {
    // Keep whatever is already rendered (the build-time fallback link).
    console.debug(`[articles] RSS failed for ${person.name}:`, err);
  }
}

async function tryFetchRSS(rssUrl) {
  // Always fetch via Netlify CORS proxy to avoid CORS issues
  const proxiedUrl = '/.netlify/functions/cors-proxy?url=' + encodeURIComponent(rssUrl);
  try {
    return await parseRSS(proxiedUrl);
  } catch (_) {
    return null;
  }
}

async function parseRSS(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const xml = await resp.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');

  const item =
    doc.querySelector('item') ||
    doc.querySelector('entry');
  if (!item) throw new Error('No items in feed');

  const title =
    item.querySelector('title')?.textContent || '';
  const link =
    item.querySelector('link')?.textContent ||
    item.querySelector('link[href]')?.getAttribute('href') ||
    item.querySelector('link')?.getAttribute('href') ||
    '';

  // Extract thumbnail image from various RSS/Atom formats
  let image = '';
  // media:thumbnail or media:content
  const mediaEl =
    item.querySelector('media\\:thumbnail') ||
    item.querySelector('media\\:content') ||
    item.querySelector('thumbnail') ||
    item.querySelector('media\\:content url');
  if (mediaEl) {
    image = mediaEl.getAttribute('url') || mediaEl.getAttribute('src') || '';
  }
  // enclosure (common in RSS 2.0)
  if (!image) {
    const enclosure = item.querySelector('enclosure');
    if (enclosure && enclosure.getAttribute('type') && enclosure.getAttribute('type').startsWith('image/')) {
      image = enclosure.getAttribute('url') || '';
    }
  }
  // Atom <link rel="enclosure"> or rel="image"
  if (!image) {
    const atomLink = item.querySelector('link[rel="enclosure"]') || item.querySelector('link[rel="image"]');
    if (atomLink) {
      image = atomLink.getAttribute('href') || '';
    }
  }

  return { title: title.trim(), link: link.trim(), image: image.trim() };
}

/* ==========================================================
   BOOT
   ========================================================== */

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
