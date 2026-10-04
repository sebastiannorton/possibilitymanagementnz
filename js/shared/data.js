/**
 * SHARED CONTENT DATA — the single source of truth
 * ==================================================
 *
 * Every piece of logic that used to live in js/events.js and js/articles.js
 * (CSV parsing, date handling, active/recurring filters, sorting and card
 * markup) now lives here, in ONE place, imported by BOTH consumers:
 *
 *   1. The browser scripts (js/events.js, js/articles.js) — progressive
 *      enhancement that refreshes what is already in the page.
 *   2. The build script (build/generate.mjs) — pre-renders the same markup
 *      into the HTML at deploy time so crawlers see real content.
 *
 * RULES FOR THIS FILE (they are what stop the two paths drifting apart):
 * - ES module syntax only (no globals, no CommonJS).
 * - NO DOM references anywhere. It must import cleanly in Node, so all
 *   rendering happens as HTML strings and the browser scripts inject those
 *   strings with innerHTML.
 * - Keep the functions pure: same input → same output string, so the
 *   build-time HTML and the runtime HTML are byte-identical.
 *
 * ── EXPECTED COLUMNS ───────────────────────────────────────────────────
 * Events (gid=477270608):        Possibilitators (gid=0):
 *   id, title, start_date,          id, name, photo_url, platform,
 *   start_time, end_date,           writing_url, rss_url, short_bio,
 *   end_time, timezone,              location, active, notes_internal
 *   is_recurring, recurrence_note,
 *   location, type, description,
 *   image_url, register_url,
 *   organiser, active, notes_internal
 */

/* ==========================================================
   CONFIG
   ========================================================== */

export const NZ_TIMEZONE = 'Pacific/Auckland';

/** Columns guaranteed to exist on every event row. */
export const EVENT_FIELDS = [
  'id', 'title', 'start_date', 'start_time', 'end_date', 'end_time',
  'timezone', 'is_recurring', 'recurrence_note', 'location', 'type',
  'description', 'image_url', 'ticket_url', 'register_url', 'organiser',
  'active', 'notes_internal'
];

/** Columns guaranteed to exist on every possibilitator row. */
export const POSSIBILITATOR_FIELDS = [
  'id', 'name', 'photo_url', 'substack_url', 'platform', 'rss_url',
  'short_bio', 'location', 'active', 'notes_internal'
];

/**
 * Header aliases for the possibilitators sheet.
 * Google Sheets column headings drift (e.g. "writing_url" vs "Website"),
 * so any of these variants maps onto the canonical key we render from.
 */
export const POSSIBILITATOR_ALIASES = {
  short_bio: ['short_bio', 'shortbio', 'bio', 'short_description', 'shortdescription'],
  photo_url: ['photo_url', 'photourl', 'photo', 'image_url', 'imageurl', 'image', 'picture', 'avatar'],
  substack_url: ['substack_url', 'substackurl', 'substack', 'website', 'link', 'url', 'writing_url', 'writingurl'],
  rss_url: ['rss_url', 'rssurl', 'rss', 'feed', 'feed_url'],
  notes_internal: ['notes_internal', 'notesinternal', 'notes', 'internal_notes']
};


/* ==========================================================
   CSV PARSING — robust, handles BOM, quotes, embedded newlines
   ========================================================== */

/**
 * Parse CSV text into an array of objects keyed by normalised header.
 *
 * Single-pass character-by-character parser that handles:
 * - BOM, \r\n and \n line endings
 * - double-quoted fields containing commas and newlines
 * - escaped quotes ("" inside a quoted field)
 * - empty trailing fields
 *
 * @param {string} csv
 * @param {{aliases?: Record<string,string[]>, fields?: string[]}} [options]
 * @returns {Array<Record<string,string>>}
 */
export function parseCSV(csv, options = {}) {
  const { aliases = {}, fields = [] } = options;

  // Strip UTF-8 BOM if present
  if (csv.charCodeAt(0) === 0xFEFF) {
    csv = csv.slice(1);
  }

  // Normalize line endings
  csv = csv.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Single-pass: parse all rows and fields at once
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    const next = i + 1 < csv.length ? csv[i + 1] : '';

    if (ch === '"') {
      if (inQuotes && next === '"') {
        // Escaped quote inside a quoted field
        field += '"';
        i++;
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      // End of field
      row.push(field.trim());
      field = '';
    } else if (ch === '\n' && !inQuotes) {
      // End of row
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  // Last field / row
  if (field.trim() || row.length > 0) {
    row.push(field.trim());
    rows.push(row);
  }

  if (rows.length < 2) return [];

  // First row is headers — normalise to lowercase snake_case, then apply
  // any aliases so downstream code can rely on one canonical key per field.
  const headerMap = rows[0].map((h) => {
    let key = h.toLowerCase().trim();
    key = key.replace(/[^a-z0-9_ ]/g, '').trim();
    key = key.replace(/\s+/g, '_');

    for (const [canonical, variants] of Object.entries(aliases)) {
      if (variants.includes(key)) return canonical;
    }
    return key;
  });

  // Parse data rows
  const result = [];
  for (let i = 1; i < rows.length; i++) {
    const values = rows[i];
    if (values.length === 0 || (values.length === 1 && values[0] === '')) continue;

    const record = {};
    headerMap.forEach((key, idx) => {
      record[key] = (values[idx] || '').trim();
    });

    // Ensure all expected keys exist so callers never see undefined
    fields.forEach((key) => {
      if (!(key in record)) record[key] = '';
    });

    result.push(record);
  }

  return result;
}

/** Parse the events sheet (no header aliases; documented columns only). */
export function parseEventRows(csv) {
  return parseCSV(csv, { fields: EVENT_FIELDS });
}

/** Parse the possibilitators sheet (fuzzy header aliases). */
export function parsePossibilitatorRows(csv) {
  return parseCSV(csv, { aliases: POSSIBILITATOR_ALIASES, fields: POSSIBILITATOR_FIELDS });
}

/**
 * Fetch a CSV URL and return its raw text.
 * Uses the ambient fetch by default (browser or modern Node) but accepts an
 * injected implementation, which is how the build script controls timeouts.
 *
 * @param {string} url
 * @param {{fetchImpl?: typeof fetch}} [options]
 * @returns {Promise<string>}
 */
export async function fetchCSVText(url, options = {}) {
  const impl = options.fetchImpl || globalThis.fetch;
  if (typeof impl !== 'function') {
    throw new Error('No fetch implementation available in this environment');
  }
  const resp = await impl(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}${resp.statusText ? ' ' + resp.statusText : ''}`);
  return await resp.text();
}

/* ==========================================================
   DATE + ROW FILTERS
   ========================================================== */

/**
 * Today in New Zealand, at midnight local time.
 * The build and the browser must agree on this or events would jump
 * between the Past and Upcoming clusters between deploy and page load.
 *
 * @param {Date} [now]
 * @returns {Date}
 */
export function getTodayNZ(now = new Date()) {
  // toLocaleDateString('en-CA') yields YYYY-MM-DD
  const s = now.toLocaleDateString('en-CA', { timeZone: NZ_TIMEZONE });
  return new Date(s + 'T00:00:00');
}

/** Parse a date cell. Returns null for blank/unparseable values. */
export function parseDate(str) {
  if (!str || !str.trim()) return null;
  const d = new Date(str.trim());
  if (isNaN(d.getTime())) return null;
  return d;
}

/** Blank `active` means "yes" — only explicit negatives hide a row. */
export function isActive(row) {
  const val = (row.active || '').trim().toLowerCase();
  if (val === '') return true;
  return val === 'yes' || val === 'y' || val === 'true' || val === '1';
}

/** is_recurring = yes/y/true/1 → treated as recurring. */
export function isRecurring(row) {
  const val = (row.is_recurring || '').trim().toLowerCase();
  return val === 'yes' || val === 'y' || val === 'true' || val === '1';
}

/** Human-readable date, e.g. "Sat, 15 Aug 2026 · 4:00pm". */
export function formatDate(dateStr, timeStr) {
  const date = parseDate(dateStr);
  if (!date) return '';

  const options = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
  let formatted = date.toLocaleDateString('en-NZ', options);

  if (timeStr && timeStr.trim()) {
    formatted += ' · ' + timeStr.trim();
  }

  return formatted;
}

/* ==========================================================
   VALUE HELPERS
   ========================================================== */

/** Escape text for safe interpolation into HTML text or attributes. */
export function escapeHTML(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** First letters of the first and last word: "Mia Ruby Harrison" → "MH". */
export function getInitials(name) {
  const parts = (name || '').trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Turn an image cell into a usable <img> src.
 * - Google Drive share/view/open links are rewritten to lh3.googleusercontent.com
 * - Imgur links get the smaller "m" thumbnail suffix
 * - A bare filename resolves to /assets/possibilitators/
 * Returns '' when there is nothing usable.
 */
export function normalizeImageUrl(url) {
  if (!url || !url.trim()) return '';
  const u = url.trim();

  if (u.startsWith('http://') || u.startsWith('https://')) {
    // https://drive.google.com/file/d/FILE_ID/view?usp=sharing
    const driveMatch = u.match(/\/file\/d\/([^/?#]+)/);
    if (driveMatch) return `https://lh3.googleusercontent.com/d/${driveMatch[1]}=s800`;

    // https://drive.google.com/open?id=FILE_ID
    const openMatch = u.match(/[?&]id=([^&]+)/);
    if (openMatch && u.includes('drive.google.com')) {
      return `https://lh3.googleusercontent.com/d/${openMatch[1]}=s800`;
    }

    // https://i.imgur.com/ABC.png → https://i.imgur.com/ABCm.png
    const imgurMatch = u.match(/^(https:\/\/i\.imgur\.com\/[a-zA-Z0-9]+)(\.[a-z]+)$/i);
    if (imgurMatch) return imgurMatch[1] + 'm' + imgurMatch[2];

    return u;
  }

  // Otherwise treat as a local filename in assets/possibilitators/
  return '/assets/possibilitators/' + u;
}

/** "substack" → "Substack", "" → "Substack". */
export function getPlatformName(platform) {
  const p = (platform || '').trim();
  if (!p) return 'Substack';
  return p.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

/** The CTA URL on an event card (register_url is the live column name). */
export function getEventLink(event) {
  return (event.ticket_url || event.register_url || '').trim();
}

/**
 * Stable short hash of a rendered HTML string.
 *
 * The build stamps this onto the mount element; the runtime script compares
 * it with the hash of what it is about to render. If they match, the DOM
 * already on screen is correct and is left alone — no flash, no lost scroll
 * animations. If they differ, the runtime refreshes the content.
 */
export function contentSignature(html) {
  const str = String(html == null ? '' : html);
  // FNV-1a, 32-bit
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}


/* ==========================================================
   EVENT CLASSIFICATION + SORTING
   ========================================================== */

/**
 * Split event rows into Recurring → Upcoming → Past.
 * Rows with no title or active=no are dropped (and reported).
 *
 * @param {Array<Record<string,string>>} rows
 * @param {Date} [today]
 * @returns {{recurring: Array, upcoming: Array, past: Array, dropped: Array}}
 */
export function classifyEvents(rows, today = getTodayNZ()) {
  const recurring = [];
  const upcoming = [];
  const past = [];
  const dropped = [];

  for (const r of rows) {
    const title = (r.title || '').trim();

    if (!title) {
      dropped.push({ name: '(empty title)', reason: 'no title' });
      continue;
    }

    if (!isActive(r)) {
      dropped.push({ name: title, reason: 'inactive' });
      continue;
    }

    if (isRecurring(r)) {
      recurring.push(r);
      continue;
    }

    // One-off event — parse date
    const startDate = parseDate(r.start_date);
    if (!startDate) {
      // Missing/invalid date — treat as upcoming, sort last
      upcoming.push(r);
      continue;
    }

    if (startDate < today) {
      past.push(r);
    } else {
      upcoming.push(r);
    }
  }

  // Sort
  recurring.sort((a, b) =>
    (a.title || '').toLowerCase().localeCompare((b.title || '').toLowerCase())
  );

  upcoming.sort((a, b) => {
    const dateA = parseDate(a.start_date);
    const dateB = parseDate(b.start_date);
    // Events with no date sort last
    if (!dateA && !dateB) return 0;
    if (!dateA) return 1;
    if (!dateB) return -1;
    const diff = dateA - dateB;
    if (diff !== 0) return diff;
    // Same date — sort by start_time
    const timeA = (a.start_time || '').trim();
    const timeB = (b.start_time || '').trim();
    return timeA.localeCompare(timeB);
  });

  past.sort((a, b) => {
    const dateA = parseDate(a.start_date);
    const dateB = parseDate(b.start_date);
    if (!dateA && !dateB) return 0;
    if (!dateA) return 1;
    if (!dateB) return -1;
    return dateB - dateA; // descending (most recent first)
  });

  return { recurring, upcoming, past, dropped };
}

/**
 * Keep active possibilitators that have a name, sorted A–Z by name.
 * @returns {{kept: Array, dropped: Array}}
 */
export function filterPossibilitators(rows) {
  const kept = [];
  const dropped = [];

  for (const r of rows) {
    const name = (r.name || '').trim();

    if (!name) {
      dropped.push({ name: '(empty)', reason: 'no name' });
      continue;
    }
    if (!isActive(r)) {
      dropped.push({ name, reason: `active=${(r.active || '').trim().toLowerCase()}` });
      continue;
    }
    kept.push(r);
  }

  kept.sort((a, b) =>
    (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase())
  );

  return { kept, dropped };
}

/* ==========================================================
   HTML RENDERERS — pure strings, used by build AND browser
   ========================================================== */

function renderEventCardHTML(event, isPast) {
  const badges = [];

  if (isRecurring(event)) {
    badges.push('<span class="event-badge event-badge--recurring">Recurring</span>');
  }
  if (isPast) {
    badges.push('<span class="event-badge event-badge--past">Past event</span>');
  }

  const typeStr = (event.type || '').trim();
  if (typeStr) {
    const typeClass = typeStr.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    badges.push(
      `<span class="event-badge event-badge--type event-badge--type-${typeClass}">${escapeHTML(typeStr)}</span>`
    );
  }

  const imgUrl = normalizeImageUrl(event.image_url);
  const imageBlock = imgUrl
    ? `<div class="event-card-image"><img src="${escapeHTML(imgUrl)}" alt="${escapeHTML(event.title || 'Event image')}" loading="lazy" decoding="async" referrerpolicy="no-referrer"></div>`
    : '<div class="event-card-image event-card-image--placeholder"></div>';

  let dateText;
  if (isRecurring(event) && event.recurrence_note && event.recurrence_note.trim()) {
    dateText = event.recurrence_note.trim();
  } else {
    dateText = formatDate(event.start_date, event.start_time);
  }

  const location = (event.location || '').trim();
  const description = (event.description || '').trim();
  const organiser = (event.organiser || '').trim();
  const link = getEventLink(event);

  const parts = [];
  parts.push(`<div class="event-card-badges">${badges.join('')}</div>`);
  parts.push(`<h3 class="event-card-title">${escapeHTML(event.title || 'Untitled Event')}</h3>`);
  parts.push(`<p class="event-card-date">${escapeHTML(dateText)}</p>`);
  if (location) {
    parts.push(`<p class="event-card-location">${escapeHTML(location)}</p>`);
  }
  if (description) {
    parts.push(`<p class="event-card-description">${escapeHTML(description)}</p>`);
  }
  if (organiser) {
    parts.push(`<p class="event-card-organiser">Organised by ${escapeHTML(organiser)}</p>`);
  }
  if (link) {
    parts.push(
      `<a class="btn btn-outline event-card-btn" href="${escapeHTML(link)}" target="_blank" rel="noopener noreferrer">Get Tickets ↗</a>`
    );
  }

  return (
    `<div class="event-card${isPast ? ' event-card--past' : ''}">` +
    imageBlock +
    `<div class="event-card-body">${parts.join('')}</div>` +
    '</div>'
  );
}

function renderEventSectionHTML(heading, events, isPast) {
  if (events.length === 0) return '';
  const cards = events.map((ev) => renderEventCardHTML(ev, isPast)).join('\n');
  return `<h3 class="event-section-heading">${heading}</h3>\n${cards}`;
}

export const EVENTS_EMPTY_HTML =
  '<div class="empty-state"><p>No events scheduled yet. Check back soon!</p></div>';

/**
 * Full markup for the events mount (#pm-events / #village-events).
 *
 * @param {Array<Record<string,string>>} rows  raw rows straight from the CSV
 * @param {{today?: Date}} [options]
 * @returns {string} HTML for the mount element's innerHTML
 */
export function renderEventSectionsHTML(rows, options = {}) {
  const { recurring, upcoming, past } = classifyEvents(rows || [], options.today || getTodayNZ());

  if (recurring.length === 0 && upcoming.length === 0 && past.length === 0) {
    return EVENTS_EMPTY_HTML;
  }

  return [
    renderEventSectionHTML('Recurring', recurring, false),
    renderEventSectionHTML('Upcoming', upcoming, false),
    renderEventSectionHTML('Past', past, true)
  ]
    .filter(Boolean)
    .join('\n');
}

/** The "latest article" fallback link, shared by build time and runtime. */
export function possibiltatorFallbackHTML(person) {
  const fallback = `View latest writing on ${getPlatformName(person.platform)}`;
  const href = (person.substack_url || '').trim() || '#';
  return `<a href="${escapeHTML(href)}" target="_blank" rel="noopener noreferrer">${escapeHTML(fallback)}</a>`;
}

/**
 * Full markup for one possibilitator card.
 * The .latest-article box starts as a real, crawlable link; js/articles.js
 * upgrades it to the actual latest article via RSS after page load.
 */
function renderPossibilitatorCardHTML(person, index) {
  const name = (person.name || '').trim() || 'Unnamed';
  const photoSrc = normalizeImageUrl(person.photo_url);
  const initials = getInitials(name);
  const rssId = (person.id || '').trim() || `name-${index}`;

  const avatar = photoSrc
    ? `<img src="${escapeHTML(photoSrc)}" alt="${escapeHTML(name)}" loading="lazy" decoding="async">` +
      '<div class="avatar-initials" style="display: none;"></div>'
    : `<div class="avatar-initials">${escapeHTML(initials)}</div>`;

  const bio = (person.short_bio || '').trim();
  const location = (person.location || '').trim();
  const platform = getPlatformName(person.platform);
  const href = (person.substack_url || '').trim() || '#';

  const info =
    `<h3>${escapeHTML(name)}</h3>` +
    `<p class="possibilitator-bio">${escapeHTML(bio)}</p>` +
    (location ? `<p class="possibilitator-location">${escapeHTML(location)}</p>` : '') +
    `<a class="btn btn-outline substack-btn" href="${escapeHTML(href)}" target="_blank" rel="noopener noreferrer">Visit ${escapeHTML(platform)} ↗</a>`;

  return (
    `<div class="possibilitator-card" data-id="${escapeHTML(person.id || '')}">` +
    `<div class="possibilitator-avatar">${avatar}</div>` +
    `<div class="possibilitator-info">${info}</div>` +
    `<div class="latest-article" id="rss-${escapeHTML(rssId)}">${possibiltatorFallbackHTML(person)}</div>` +
    '</div>'
  );
}

export const POSSIBILITATORS_EMPTY_HTML =
  '<div class="empty-state"><p>The directory is being seeded. Check back soon for Possibilitators writing on Substack.</p></div>';

/**
 * Full markup for the possibilitators mount (#possibilitators-grid).
 *
 * @param {Array<Record<string,string>>} rows  raw rows straight from the CSV
 * @returns {string} HTML for the mount element's innerHTML
 */
export function renderPossibilitatorCardsHTML(rows) {
  const { kept } = filterPossibilitators(rows || []);
  if (kept.length === 0) return POSSIBILITATORS_EMPTY_HTML;
  return kept.map((person, i) => renderPossibilitatorCardHTML(person, i)).join('\n');
}

