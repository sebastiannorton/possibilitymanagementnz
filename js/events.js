/**
 * EVENTS MODULE — Shared event feed for Homepage & Noticeboard
 * ============================================================
 *
 * Progressive enhancement for the events mount.
 *
 * The page already contains pre-rendered event cards, written at deploy time by
 * build/generate.mjs. This script fetches the CSV again and compares what it
 * renders with what is already on screen:
 *   - same content  → the pre-rendered DOM is left alone (no flash, no lost
 *                     scroll animations)
 *   - changed Sheet → the mount is refreshed, exactly as before
 *   - fetch failed  → the pre-rendered cards remain on screen
 *
 * All parsing, date and filter logic lives in js/shared/data.js, which the
 * build script imports too, so the two paths cannot drift.
 *
 * ── HOW TO UPDATE ─────────────────────────────────────────
 * 1. Edit the Google Sheet "PMNZ Website Events":
 *    - Tab "PM Events"      → shown on the HOMEPAGE
 *    - Tab "Village Events" → shown on the NOTICEBOARD
 * 2. Each tab is published to web as CSV (File > Share > Publish to web,
 *    select the specific tab, CSV format). Each has its own gid.
 * 3. The site reads from /api/pm-events.csv and /api/village-events.csv,
 *    proxied by Netlify to the published CSV URLs (see netlify.toml).
 *    To change a data source, update the 'to' URL in netlify.toml only.
 *    No code changes needed.
 *
 * ── RECURRING EVENTS ──────────────────────────────────────
 * - is_recurring = yes/y/true/1 → treated as recurring
 * - Only ONE row needed per recurring event (do NOT duplicate)
 * - Sorted alphabetically by title (A-Z)
 * - Always render ABOVE the dated timeline (Recurring cluster)
 * - recurrence_note is shown prominently instead of a date
 *
 * ── PAST EVENTS ───────────────────────────────────────────
 * - Automatically determined by start_date < today
 * - No manual step required — just set start_date in the past
 * - Greyed out with reduced opacity and "Past event" badge
 *
 * ── IMAGE URL ─────────────────────────────────────────────
 * - Should be a direct image link (e.g. https://example.com/photo.jpg)
 * - Google Drive share/view/open links are auto-normalised to
 *   https://lh3.googleusercontent.com/d/FILE_ID=s800
 * - If missing or fails to load, a placeholder is shown
 */

import {
  fetchCSVText,
  parseEventRows,
  renderEventSectionsHTML,
  classifyEvents,
  contentSignature,
  escapeHTML,
} from './shared/data.js';

/* ==========================================================
   LIGHTBOX
   ========================================================== */

function openLightbox(url) {
  const overlay = document.createElement('div');
  overlay.className = 'event-lightbox';

  const img = document.createElement('img');
  img.src = url;
  img.alt = '';

  const close = document.createElement('button');
  close.className = 'event-lightbox-close';
  close.innerHTML = '&times;';
  close.setAttribute('aria-label', 'Close');

  overlay.appendChild(img);
  overlay.appendChild(close);

  const remove = () => {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  };

  close.addEventListener('click', remove);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) remove();
  });

  document.addEventListener('keydown', function handler(e) {
    if (e.key === 'Escape') {
      remove();
      document.removeEventListener('keydown', handler);
    }
  });

  document.body.appendChild(overlay);
}


/* ==========================================================
   DOM ENHANCEMENT
   ========================================================== */

/**
 * Wire up the interactive bits that plain HTML cannot express: click-to-zoom on
 * images and a graceful fallback when an image fails to load.
 *
 * Must run after ANY insertion of card markup — both when the pre-rendered
 * cards are kept and when the mount is refreshed.
 *
 * @param {HTMLElement} mount
 */
function enhanceCards(mount) {
  mount.querySelectorAll('.event-card-image img').forEach((img) => {
    if (img.dataset.enhanced === 'true') return;
    img.dataset.enhanced = 'true';

    const src = img.getAttribute('src');

    img.style.cursor = 'pointer';
    img.addEventListener('click', () => openLightbox(src));

    img.addEventListener('error', function () {
      this.style.display = 'none';
      this.parentElement.classList.add('event-card-image--placeholder');
    });
  });
}

/* ==========================================================
   MAIN — buildEventSections
   ========================================================== */

/**
 * Fetch events from a CSV URL and refresh a mount element.
 *
 * Safe to call when the mount already holds pre-rendered cards: they are kept
 * unless the freshly fetched data renders differently.
 *
 * @param {string} csvUrl  - Netlify proxy URL (e.g. '/api/pm-events.csv')
 * @param {string} mountId - ID of the container element to render into
 */
export async function buildEventSections(csvUrl, mountId) {
  const mount = document.getElementById(mountId);
  if (!mount) {
    console.warn(`[events] Mount element #${mountId} not found`);
    return;
  }

  let rows;
  try {
    const csv = await fetchCSVText(csvUrl);
    rows = parseEventRows(csv);
  } catch (err) {
    console.warn(`[events] CSV fetch failed for ${csvUrl}:`, err);
    // Only replace the mount if the build never ran. Otherwise the
    // pre-rendered cards are better than an error message.
    if (!mount.dataset.signature) {
      mount.innerHTML = `<div class="empty-state"><p>Events could not be loaded right now. Please check back later.</p></div>`;
    } else {
      console.info('[events] Keeping pre-rendered events after a failed refresh.');
    }
    return;
  }

  const html = renderEventSectionsHTML(rows);

  // Report what was filtered, using the same classifier the build used.
  const { recurring, upcoming, past, dropped } = classifyEvents(rows);
  console.debug(
    `[events] ${csvUrl}: ${rows.length} rows — recurring: ${recurring.length}, ` +
    `upcoming: ${upcoming.length}, past: ${past.length}`
  );
  if (dropped.length > 0) {
    console.debug(`[events] ${csvUrl}: Dropped:`, dropped.map((d) => `${d.name} (${d.reason})`));
  }

  // Compare against the pre-rendered build output. Identical means the DOM on
  // screen is already correct, so leave it exactly as it is.
  const signature = contentSignature(html);
  if (mount.dataset.signature === signature) {
    console.debug(`[events] ${csvUrl}: matches pre-rendered content, no refresh needed.`);
    enhanceCards(mount);
    return;
  }

  mount.innerHTML = html;
  mount.dataset.signature = signature;
  enhanceCards(mount);
}
