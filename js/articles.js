/**
 * POSSIBILITATORS DIRECTORY — Articles Page
 * ==========================================
 * 
 * Reads from a published Google Sheet (via Netlify proxy), renders cards,
 * and fetches RSS feeds for latest articles.
 * 
 * ── HOW TO UPDATE ─────────────────────────────────────────
 * 1. Edit the Google Sheet: https://docs.google.com/spreadsheets/d/1KNXcr4MWsAP7KWf2e0aJ6G9VPWpI-4py9JilHhVdyz4/edit?usp=sharing
 * 2. The site reads from /api/possibilitators.csv, proxied by Netlify
 *    to the published CSV URL (see netlify.toml).
 * 3. To change the sheet, update the 'to' URL in netlify.toml only.
 *    No code changes needed.
 * 
 * ── PHOTO PRIORITY ───────────────────────────────────
 * 1. photo_url column (direct URL)
 * 2. assets/possibilitators/{photo_filename} (local file)
 * 3. Auto-generated initials avatar
 * 
 * ── EXPECTED COLUMNS ─────────────────────────────────
 * id, name, photo_url, writing_url, platform, rss_url, short_bio, location, active, notes_internal
 */

/* ==========================================================
   CONFIG — Change these values as needed
   ========================================================== */

const SHEET_CSV_URL = '/api/possibilitators.csv';

function getFallbackText(platform) {
  return `View latest writing on ${getPlatformName(platform)}`;
}

function getPlatformName(platform) {
  const p = (platform || '').trim();
  if (!p) return 'Substack';
  // Capitalise first letter of each word
  return p.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

/* ==========================================================
   MAIN
   ========================================================== */

document.addEventListener('DOMContentLoaded', () => {
  fetchCSV(SHEET_CSV_URL)
    .then((rows) => {
      console.log(`[articles] CSV parsed: ${rows.length} total rows`);

      const kept = [];
      const dropped = [];

      for (const r of rows) {
        const name = (r.name || '').trim();
        const activeVal = (r.active || '').trim().toLowerCase();
        const isActive = activeVal === '' || activeVal === 'yes' || activeVal === 'y' || activeVal === 'true' || activeVal === '1';

        if (!name) {
          dropped.push({ name: '(empty)', reason: 'no name' });
          continue;
        }
        if (!isActive) {
          dropped.push({ name, reason: `active=${activeVal}` });
          continue;
        }
        kept.push(r);
      }

      console.debug(`[CSV] Total rows parsed: ${rows.length}`);
      console.debug(`[CSV] Names kept:`, kept.map(p => p.name));
      console.debug(`[CSV] Names dropped:`, dropped.map(d => `${d.name} (${d.reason})`));

      kept.sort((a, b) =>
        (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase())
      );

      console.log(`[articles] After filtering: ${kept.length} active possibilitators`);
      console.log(`[articles] Names:`, kept.map(p => p.name));

      if (kept.length === 0) {
        showEmptyState(`CSV loaded (${rows.length} rows) but 0 valid possibilitators found. Add a row with active=yes and a name to get started.`);
        return;
      }

      renderCards(kept);
      kept.forEach(fetchRSS);
    })
    .catch((err) => {
      console.warn('[articles] CSV fetch failed:', err);
      showEmptyState('Could not load the directory. Check that the Netlify proxy is working.');
    });
});

/* ==========================================================
   CSV PARSING — robust, handles BOM, quotes, embedded newlines
   ========================================================== */

async function fetchCSV(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const text = await resp.text();

  console.log(`[articles] Raw CSV length: ${text.length} bytes`);
  console.log(`[articles] First 500 chars:\n${text.slice(0, 500)}`);

  return parseCSV(text);
}

/**
 * Parse CSV text into an array of objects.
 * Single-pass character-by-character parser that handles:
 * - BOM, \r\n, \n line endings
 * - double-quoted fields with commas inside
 * - escaped quotes ("")
 * - empty trailing fields
 */
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
        // Escaped quote inside quoted field
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

  // First row is headers
  const rawHeaders = rows[0];
  console.log(`[articles] Raw headers:`, rawHeaders);

  // Normalize headers to lowercase snake_case with fuzzy matching
  const headerMap = rawHeaders.map((h) => {
    let key = h.toLowerCase().trim();
    key = key.replace(/[^a-z0-9_ ]/g, '').trim();
    key = key.replace(/\s+/g, '_');

    const aliases = {
      'short_bio': ['short_bio', 'shortbio', 'bio', 'short_description', 'shortdescription'],
      'photo_url': ['photo_url', 'photourl', 'photo', 'image_url', 'imageurl', 'image', 'picture', 'avatar'],
      'substack_url': ['substack_url', 'substackurl', 'substack', 'website', 'link', 'url', 'writing_url', 'writingurl'],
      'rss_url': ['rss_url', 'rssurl', 'rss', 'feed', 'feed_url'],
      'notes_internal': ['notes_internal', 'notesinternal', 'notes', 'internal_notes'],
    };

    for (const [canonical, variants] of Object.entries(aliases)) {
      if (variants.includes(key)) return canonical;
    }
    return key;
  });

  console.log(`[articles] Normalized headers:`, headerMap);

  // Parse data rows
  const result = [];
  const expected = ['id', 'name', 'photo_url', 'substack_url', 'platform', 'rss_url', 'short_bio', 'location', 'active', 'notes_internal'];

  for (let i = 1; i < rows.length; i++) {
    const fields = rows[i];
    if (fields.length === 0 || (fields.length === 1 && fields[0] === '')) continue;

    const row = {};
    headerMap.forEach((key, idx) => {
      row[key] = (fields[idx] || '').trim();
    });

    // Ensure all expected keys exist
    expected.forEach((k) => {
      if (!(k in row)) row[k] = '';
    });

    result.push(row);
  }

  return result;
}

/* ==========================================================
   RENDER
   ========================================================== */

function renderCards(people) {
  const grid = document.getElementById('possibilitators-grid');
  if (!grid) return;

  grid.innerHTML = '';
  people.forEach((person) => {
    const card = createCard(person);
    grid.appendChild(card);
  });
}

function createCard(person) {
  const card = document.createElement('div');
  card.className = 'possibilitator-card';
  card.dataset.id = person.id || '';

  // Avatar / photo
  const avatar = document.createElement('div');
  avatar.className = 'possibilitator-avatar';

  const img = document.createElement('img');
  const initials = document.createElement('div');
  initials.className = 'avatar-initials';
  initials.textContent = getInitials(person.name || '?');

  const photoSrc = getPhotoSrc(person);
  if (photoSrc) {
    img.src = photoSrc;
    img.alt = person.name || 'Possibilitator';
    img.onerror = () => {
      img.style.display = 'none';
      initials.style.display = 'flex';
    };
    avatar.appendChild(img);
    initials.style.display = 'none';
    avatar.appendChild(initials);
  } else {
    avatar.appendChild(initials);
  }

  // Info
  const info = document.createElement('div');
  info.className = 'possibilitator-info';

  const nameEl = document.createElement('h3');
  nameEl.textContent = person.name || 'Unnamed';

  const bioEl = document.createElement('p');
  bioEl.className = 'possibilitator-bio';
  bioEl.textContent = person.short_bio || '';

  const locationEl = document.createElement('p');
  locationEl.className = 'possibilitator-location';
  if (person.location) {
    locationEl.textContent = person.location;
  }

  const platform = getPlatformName(person.platform);
  const btn = document.createElement('a');
  btn.className = 'btn btn-outline substack-btn';
  btn.href = person.substack_url || '#';
  btn.target = '_blank';
  btn.textContent = `Visit ${platform} ↗`;

  // Latest article (right column)
  const rssBox = document.createElement('div');
  rssBox.className = 'latest-article';
  rssBox.id = 'rss-' + (person.id || Math.random().toString(36).slice(2));
  rssBox.innerHTML = `<span class="rss-loading">Loading latest article…</span>`;

  info.appendChild(nameEl);
  info.appendChild(bioEl);
  if (person.location) info.appendChild(locationEl);
  info.appendChild(btn);

  card.appendChild(avatar);
  card.appendChild(info);
  card.appendChild(rssBox);

  return card;
}

function getPhotoSrc(person) {
  if (person.photo_url) return person.photo_url;
  return null;
}

function getInitials(name) {
  const parts = (name || '').trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function showEmptyState(message) {
  const grid = document.getElementById('possibilitators-grid');
  if (!grid) return;
  grid.innerHTML = `
    <div class="empty-state">
      <p>${message || 'The directory is being seeded. Check back soon for Possibilitators writing on Substack.'}</p>
    </div>
  `;
}

/* ==========================================================
   RSS FETCH
   ========================================================== */

async function fetchRSS(person) {
  const rssId = 'rss-' + (person.id || '');
  const rssBox = document.getElementById(rssId);
  const fallback = getFallbackText(person.platform);
  if (!rssBox || !person.rss_url) {
    if (rssBox) rssBox.innerHTML = `<a href="${person.substack_url || '#'}" target="_blank">${fallback}</a>`;
    return;
  }

  try {
    const data = await tryFetchRSS(person.rss_url);
    if (data && data.title && data.link) {
      const imgHtml = data.image
        ? `<img class="rss-thumb" src="${escapeHTML(data.image)}" alt="" loading="lazy" onerror="this.style.display='none'">`
        : '';
      rssBox.innerHTML = `
        <span class="rss-label">Latest:</span>
        <div class="rss-entry">
          ${imgHtml}
          <a href="${data.link}" target="_blank" class="rss-title">${escapeHTML(data.title)}</a>
        </div>
      `;
    } else {
      throw new Error('No items');
    }
  } catch (e) {
    rssBox.innerHTML = `<a href="${person.substack_url || '#'}" target="_blank">${fallback}</a>`;
  }
}

async function tryFetchRSS(rssUrl) {
  // Always fetch via Netlify CORS proxy to avoid CORS issues
  const proxiedUrl = '/cors-proxy/' + encodeURIComponent(rssUrl);
  try {
    const item = await parseRSS(proxiedUrl);
    if (item) return item;
  } catch (_) {}
  return null;
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

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}