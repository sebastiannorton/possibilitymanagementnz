/**
 * EVENTS MODULE — Shared event feed for Homepage & Noticeboard
 * ============================================================
 * 
 * Reads from a published Google Sheet (via Netlify proxy), renders cards
 * split into three sections: Recurring → Upcoming → Past.
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
 * 
 * ── EXPECTED COLUMNS ──────────────────────────────────────
 * id, title, start_date, start_time, end_date, end_time, timezone,
 * is_recurring, recurrence_note, location, description, image_url,
 * ticket_url, organiser, active, notes_internal
 */

/* ==========================================================
   CONFIG
   ========================================================== */

const NZ_TIMEZONE = 'Pacific/Auckland';

/* ==========================================================
   CSV PARSING — robust, handles BOM, quotes, embedded newlines
   ========================================================== */

async function fetchCSV(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const text = await resp.text();
  return parseCSV(text);
}

function parseCSV(csv) {
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
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      row.push(field.trim());
      field = '';
    } else if (ch === '\n' && !inQuotes) {
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field.trim() || row.length > 0) {
    row.push(field.trim());
    rows.push(row);
  }

  if (rows.length < 2) return [];

  // First row is headers — trim and lowercase
  const rawHeaders = rows[0].map(h => h.trim().toLowerCase());

  // Parse data rows
  const result = [];
  for (let i = 1; i < rows.length; i++) {
    const fields = rows[i];
    if (fields.length === 0 || (fields.length === 1 && fields[0] === '')) continue;

    const rowObj = {};
    rawHeaders.forEach((key, idx) => {
      rowObj[key] = (fields[idx] || '').trim();
    });

    result.push(rowObj);
  }

  return result;
}

/* ==========================================================
   HELPERS
   ========================================================== */

function isActive(row) {
  const val = (row.active || '').trim().toLowerCase();
  if (val === '') return true;
  return val === 'yes' || val === 'y' || val === 'true' || val === '1';
}

function isRecurring(row) {
  const val = (row.is_recurring || '').trim().toLowerCase();
  return val === 'yes' || val === 'y' || val === 'true' || val === '1';
}

function parseDate(str) {
  if (!str || !str.trim()) return null;
  // Try parsing as YYYY-MM-DD or similar
  const d = new Date(str.trim());
  if (isNaN(d.getTime())) return null;
  return d;
}

function getTodayNZ() {
  const now = new Date();
  // Use a simple date-only comparison (no time component)
  const s = now.toLocaleDateString('en-CA', { timeZone: NZ_TIMEZONE }); // YYYY-MM-DD
  return new Date(s + 'T00:00:00');
}

function normalizeImageUrl(url) {
  if (!url || !url.trim()) return '';
  const u = url.trim();

  // Google Drive share/view/open links
  // e.g. https://drive.google.com/file/d/FILE_ID/view?usp=sharing
  const driveMatch = u.match(/\/file\/d\/([^/?#]+)/);
  if (driveMatch) {
    return `https://lh3.googleusercontent.com/d/${driveMatch[1]}=s800`;
  }

  // Google Drive open?id= links
  const openMatch = u.match(/[?&]id=([^&]+)/);
  if (openMatch && u.includes('drive.google.com')) {
    return `https://lh3.googleusercontent.com/d/${openMatch[1]}=s800`;
  }

  return u;
}

function formatDate(dateStr, timeStr, tzStr) {
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
   CARD CREATION
   ========================================================== */

function createEventCard(event, isPast) {
  const card = document.createElement('div');
  card.className = 'event-card' + (isPast ? ' event-card--past' : '');

  // Image
  const imgWrapper = document.createElement('div');
  imgWrapper.className = 'event-card-image';

  const img = document.createElement('img');
  const imgUrl = normalizeImageUrl(event.image_url);
  if (imgUrl) {
    img.src = imgUrl;
    img.alt = event.title || 'Event image';
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.onerror = function () {
      this.style.display = 'none';
      this.parentElement.classList.add('event-card-image--placeholder');
    };
    img.style.cursor = 'pointer';
    img.addEventListener('click', () => openLightbox(imgUrl));
    imgWrapper.appendChild(img);
  } else {
    img.style.display = 'none';
    imgWrapper.classList.add('event-card-image--placeholder');
    imgWrapper.appendChild(img);
  }

  // Body
  const body = document.createElement('div');
  body.className = 'event-card-body';

  // Badges
  const badges = document.createElement('div');
  badges.className = 'event-card-badges';

  if (isRecurring(event)) {
    const badge = document.createElement('span');
    badge.className = 'event-badge event-badge--recurring';
    badge.textContent = 'Recurring';
    badges.appendChild(badge);
  }

  if (isPast) {
    const badge = document.createElement('span');
    badge.className = 'event-badge event-badge--past';
    badge.textContent = 'Past event';
    badges.appendChild(badge);
  }

  body.appendChild(badges);

  // Title
  const title = document.createElement('h3');
  title.className = 'event-card-title';
  title.textContent = event.title || 'Untitled Event';
  body.appendChild(title);

  // Date / recurrence note
  const dateEl = document.createElement('p');
  dateEl.className = 'event-card-date';
  if (isRecurring(event) && event.recurrence_note && event.recurrence_note.trim()) {
    dateEl.textContent = event.recurrence_note.trim();
  } else {
    dateEl.textContent = formatDate(event.start_date, event.start_time, event.timezone);
  }
  body.appendChild(dateEl);

  // Location
  if (event.location && event.location.trim()) {
    const loc = document.createElement('p');
    loc.className = 'event-card-location';
    loc.textContent = event.location.trim();
    body.appendChild(loc);
  }

  // Description
  if (event.description && event.description.trim()) {
    const desc = document.createElement('p');
    desc.className = 'event-card-description';
    desc.textContent = event.description.trim();
    body.appendChild(desc);
  }

  // Organiser
  if (event.organiser && event.organiser.trim()) {
    const org = document.createElement('p');
    org.className = 'event-card-organiser';
    org.textContent = 'Organised by ' + event.organiser.trim();
    body.appendChild(org);
  }

  // Ticket button
  if (event.ticket_url && event.ticket_url.trim()) {
    const btn = document.createElement('a');
    btn.className = 'btn btn-outline event-card-btn';
    btn.href = event.ticket_url.trim();
    btn.target = '_blank';
    btn.textContent = 'Get Tickets ↗';
    body.appendChild(btn);
  }

  card.appendChild(imgWrapper);
  card.appendChild(body);

  return card;
}

/* ==========================================================
   SECTION RENDERER
   ========================================================== */

function renderSection(container, heading, events, isPast) {
  if (events.length === 0) return;

  const headingEl = document.createElement('h3');
  headingEl.className = 'event-section-heading';
  headingEl.textContent = heading;
  container.appendChild(headingEl);

  events.forEach(ev => {
    const card = createEventCard(ev, isPast);
    container.appendChild(card);
  });
}

/* ==========================================================
   MAIN — buildEventSections
   ========================================================== */

/**
 * Fetch events from a CSV URL and render them into a mount element.
 * @param {string} csvUrl  - Netlify proxy URL (e.g. '/api/pm-events.csv')
 * @param {string} mountId - ID of the container element to render into
 */
async function buildEventSections(csvUrl, mountId) {
  const mount = document.getElementById(mountId);
  if (!mount) {
    console.warn(`[events] Mount element #${mountId} not found`);
    return;
  }

  let rows;
  try {
    rows = await fetchCSV(csvUrl);
  } catch (err) {
    console.warn(`[events] CSV fetch failed for ${csvUrl}:`, err);
    mount.innerHTML = `<div class="empty-state"><p>Events could not be loaded right now. Please check back later.</p></div>`;
    return;
  }

  console.debug(`[events] ${csvUrl}: Total rows parsed: ${rows.length}`);

  // Filter and classify
  const recurring = [];
  const upcoming = [];
  const past = [];
  const dropped = [];
  const today = getTodayNZ();

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

  console.debug(`[events] ${csvUrl}: Recurring: ${recurring.length}, Upcoming: ${upcoming.length}, Past: ${past.length}`);
  if (dropped.length > 0) {
    console.debug(`[events] ${csvUrl}: Dropped:`, dropped.map(d => `${d.name} (${d.reason})`));
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

  // Render
  mount.innerHTML = '';

  renderSection(mount, 'Recurring', recurring, false);
  renderSection(mount, 'Upcoming', upcoming, false);
  renderSection(mount, 'Past', past, true);

  if (recurring.length === 0 && upcoming.length === 0 && past.length === 0) {
    mount.innerHTML = `<div class="empty-state"><p>No events scheduled yet. Check back soon!</p></div>`;
  }
}