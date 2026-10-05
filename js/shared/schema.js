/**
 * JSON-LD STRUCTURED DATA — one place that turns sheet rows into schema.org
 * ========================================================================
 *
 * Sibling of js/shared/data.js, with the same contract: ES module only, no
 * DOM, pure functions. build/generate.mjs imports this at build time and
 * injects the result between the `build:schema:*` markers in each page.
 *
 * WHY A SEPARATE MODULE
 * ---------------------
 * data.js owns WHAT the page shows (cards, dates, sorting). This file owns
 * WHAT search engines read. They read the same rows through the same helpers,
 * so structured data can never describe an event the page does not show.
 *
 * HOUSE RULES (enforced here, not left to callers)
 * ------------------------------------------------
 * - Properties are OMITTED, never guessed. A property is written only when the
 *   sheet/page actually carries it (`set()` drops empty values).
 * - Everything is serialised with JSON.stringify, so quotes, newlines and
 *   ampersands in Sheet descriptions are escaped correctly by construction.
 * - Exactly one <script> per type per page (see renderJsonLdBlock).
 * - Past events are filtered out here as well as in the card renderer, so a
 *   stale structured-data block can never advertise a finished event.
 */

import { normalizeImageUrl } from './data.js';

/* ==========================================================
   SITE IDENTITY — mirrors the pages' <link rel="canonical"> values
   ========================================================== */

export const SITE_URL = 'https://possibilitymanagement.co.nz';
export const ORGANIZATION_NAME = 'Possibility Management New Zealand';
export const ORGANIZATION_ID = `${SITE_URL}/#organization`;
export const LOGO_PATH = '/assets/logo.png';

/** Absolute logo URL. Structured data must be crawlable without the page. */
export const LOGO_URL = `${SITE_URL}${LOGO_PATH}`;

/**
 * Profiles that already appear in the footer "Follow Us"/"Resources" columns.
 * Nothing is added that is not already linked on the page.
 * No potentialAction/SearchAction: the site has no search feature.
 */
export const ORGANIZATION_SAME_AS = [
  'https://www.facebook.com/possibilitymanagementaotearoa',
  'https://www.youtube.com/@PossibilityManagementTV',
  'https://possibilitymanagementnews.substack.com/',
  'https://possibilitymanagement.org',
];

/* ==========================================================
   SMALL HELPERS
   ========================================================== */

/**
 * Copy only the properties that carry a real value.
 * This is the rule-7 guard: an empty string never reaches the output.
 */
function set(target, key, value) {
  if (value === null || value === undefined) return target;
  const str = typeof value === 'string' ? value.trim() : value;
  if (str === '' || str === false) return target;
  target[key] = str;
  return target;
}

/** Make a page-relative URL absolute; leave absolute URLs untouched. */
function absolute(url) {
  const u = (url || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  return `${SITE_URL}${u.startsWith('/') ? '' : '/'}${u}`;
}

/**
 * Serialise a schema.org node to a <script type="application/ld+json"> block.
 *
 * JSON.stringify does the escaping. The one extra step is replacing `<` with
 * the \u003c escape: it is still strictly valid JSON (JSON.parse decodes it
 * back to `<`) but it cannot terminate the <script> element early, so a title
 * containing "</script>" cannot break out of the tag.
 *
 * The result is parsed back with JSON.parse before being returned — if a node
 * ever contained a circular reference or an unserialisable value the build
 * would fail loudly here rather than emit invalid markup.
 *
 * @param {object|string} node  schema.org node, or a pre-serialised string
 * @returns {string} the complete <script> element
 */
export function renderJsonLdBlock(node) {
  const json = typeof node === 'string' ? node : JSON.stringify(node);
  JSON.parse(json); // fail fast on anything that is not strictly valid JSON
  const safe = json.replace(/</g, '\\u003c');
  return `<script type="application/ld+json">\n${safe}\n</script>`;
}

/** Wrap nodes in a single @graph document. */
function graph(nodes) {
  return { '@context': 'https://schema.org', '@graph': nodes };
}

/* ==========================================================
   NEW ZEALAND TIME — DST-aware, never a hardcoded offset
   ========================================================== */

const NZ_TZ = 'Pacific/Auckland';

/**
 * UTC offset in minutes that New Zealand was observing at a given instant.
 *
 * Derived from Intl rather than hardcoded, because New Zealand flips between
 * NZST (+12, standard) and NZDT (+13, daylight saving) and the offset for a
 * given event depends on WHEN that event is, not on today's offset.
 *
 * Two passes: the wall-clock time is first read as if it were UTC, then the
 * guess is corrected with the offset found at that instant and the offset
 * re-read. This converges for every real event time and is safe across a DST
 * boundary, where a single pass can land on the wrong side of the transition.
 *
 * @param {Date} utcGuess  wall-clock time interpreted as UTC
 * @returns {number} offset in minutes east of UTC (720 or 780 for NZ)
 */
function nzOffsetMinutes(utcGuess) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: NZ_TZ,
    timeZoneName: 'longOffset',
  });

  const offsetAt = (instant) => {
    const part = dtf.formatToParts(instant).find((p) => p.type === 'timeZoneName');
    const match = part && /GMT([+-])(\d{1,2}):(\d{2})/.exec(part.value);
    if (!match) return 0; // plain "GMT" — not reachable in Pacific/Auckland
    const minutes = parseInt(match[2], 10) * 60 + parseInt(match[3], 10);
    return match[1] === '-' ? -minutes : minutes;
  };

  let minutes = offsetAt(utcGuess);
  for (let pass = 0; pass < 2; pass++) {
    const corrected = new Date(utcGuess.getTime() - minutes * 60000);
    const next = offsetAt(corrected);
    if (next === minutes) break;
    minutes = next;
  }
  return minutes;
}

/**
 * Parse a Sheet time cell into 24-hour {hour, minute}.
 * Handles "16:00", "5pm", "5.30pm", "5:30 pm" and "17:30".
 *
 * @returns {{hour: number, minute: number}|null} null when unparseable
 */
function parseTimeCell(value) {
  const str = (value || '').trim().toLowerCase();
  if (!str) return null;

  const meridiem = /([ap])\.?\s*m/.exec(str);
  const digits = str.replace(/\s*[ap]\.?\s*m\.?/g, '').trim();

  let hour;
  let minute = 0;

  if (digits.includes(':')) {
    const parts = digits.split(':');
    hour = parseInt(parts[0], 10);
    minute = parts[1] ? parseInt(parts[1], 10) : 0;
  } else if (digits.includes('.')) {
    const parts = digits.split('.');
    hour = parseInt(parts[0], 10);
    minute = parts[1] ? parseInt(parts[1], 10) : 0;
  } else {
    hour = parseInt(digits, 10);
  }

  if (!Number.isFinite(hour)) return null;
  if (meridiem) {
    if (hour === 12) hour = 0;
    if (meridiem[1] === 'p') hour += 12;
  }
  if (!Number.isFinite(minute)) minute = 0;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

/** {hour, minute} → "19:00:00". */
function timeText(time) {
  return `${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}:00`;
}

/**
 * A Sheet local date + local time as an ISO 8601 timestamp carrying the
 * correct New Zealand offset for THAT date (NZST +12 in winter, NZDT +13 in
 * summer).
 *
 * @param {string} dateStr  "YYYY-MM-DD"
 * @param {string} timeStr  "16:00" / "5pm" / "5.30pm"
 * @returns {string|null} e.g. "2026-08-15T19:00:00+12:00", or null
 */
export function nzISO(dateStr, timeStr) {
  const date = (dateStr || '').trim();
  const dateParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!dateParts) return null;

  const time = parseTimeCell(timeStr);
  if (!time) return null;

  const naive = new Date(
    Date.UTC(
      parseInt(dateParts[1], 10),
      parseInt(dateParts[2], 10) - 1,
      parseInt(dateParts[3], 10),
      time.hour,
      time.minute,
      0
    )
  );

  const offset = nzOffsetMinutes(naive);
  const sign = offset < 0 ? '-' : '+';
  const abs = Math.abs(offset);
  const offsetText =
    `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;

  return `${dateParts[1]}-${dateParts[2]}-${dateParts[3]}T${timeText(time)}${offsetText}`;
}

/* ==========================================================
   RECURRENCE + LOCATION
   ========================================================== */

/** schema.org DayOfWeek, indexed by JS getDay() (0 = Sunday). */
const DAY_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Lowercase day name → schema.org DayOfWeek. */
const DAY_NAMES = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

/**
 * The weekday a recurring event falls on, taken from the free-text
 * `recurrence_note` ("Every Thursday 7pm to 8:30pm") and falling back to the
 * weekday of the row's own `start_date`.
 *
 * Both sources are real sheet data — no weekday is ever invented.
 *
 * @returns {string|null} a schema.org DayOfWeek, or null if undeterminable
 */
function recurringWeekday(event) {
  const note = (event.recurrence_note || '').toLowerCase();
  for (const day of Object.keys(DAY_NAMES)) {
    if (note.includes(day)) {
      return DAY_NAMES[day];
    }
  }

  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec((event.start_date || '').trim());
  if (parts) {
    const date = new Date(
      Date.UTC(parseInt(parts[1], 10), parseInt(parts[2], 10) - 1, parseInt(parts[3], 10))
    );
    return DAY_OF_WEEK[date.getUTCDay()];
  }
  return null;
}

/** Online in the location cell ("Online (Zoom)") → virtual event. */
function isOnline(location) {
  return /\bonline\b|\bzoom\b|\bteams\b|\bvirtual\b/i.test(location || '');
}

/** True when the row is a past one-off, judged against today in New Zealand. */
function isPastOneOff(event) {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec((event.start_date || '').trim());
  if (!parts) return false;
  const start = Date.UTC(parseInt(parts[1], 10), parseInt(parts[2], 10) - 1, parseInt(parts[3], 10));
  const today = Date.parse(new Date().toLocaleDateString('en-CA', { timeZone: NZ_TZ }) + 'T00:00:00Z');
  return start < today;
}

/* ==========================================================
   ORGANIZATION  (index.html)
   ========================================================== */

/**
 * The site as a whole. Deliberately minimal: only values that appear on the
 * page are asserted. No SearchAction — the site has no search feature.
 *
 * @returns {object} a single Organization node
 */
export function buildOrganizationNode() {
  const node = { '@type': 'Organization', '@id': ORGANIZATION_ID };
  set(node, 'name', ORGANIZATION_NAME);
  set(node, 'url', SITE_URL);
  set(node, 'logo', LOGO_URL);
  if (ORGANIZATION_SAME_AS.length) node.sameAs = ORGANIZATION_SAME_AS;
  return node;
}

/** The complete ld+json block for the Organization. */
export function buildOrganizationSchema() {
  return renderJsonLdBlock(graph([buildOrganizationNode()]));
}

/** An @id reference to the Organization, for use as an event organizer. */
function organizationReference() {
  return { '@type': 'Organization', '@id': ORGANIZATION_ID, name: ORGANIZATION_NAME };
}

/* ==========================================================
   EVENT  (index.html)
   ========================================================== */

/**
 * Turn one event row into a schema.org Event.
 *
 * PAST EVENTS ARE NEVER EMITTED — `clusters` is already the Recurring +
 * Upcoming groups from classifyEvents(), and isPastOneOff() re-checks the date
 * here so a stale structured-data block cannot advertise a finished event.
 *
 * Recurring rows get `eventSchedule` (weekday + local start/end time) rather
 * than a lone top-level startDate.
 *
 * @param {object} event  raw sheet row
 * @returns {object|null} an Event node, or null when there is nothing to say
 */
function eventNode(event) {
  const title = (event.title || '').trim();
  if (!title) return null;

  const recurring = /^(yes|y|true|1)$/i.test((event.is_recurring || '').trim());
  const location = (event.location || '').trim();
  const online = isOnline(location);

  if (!recurring && isPastOneOff(event)) return null;

  const startISO = nzISO(event.start_date, event.start_time);
  const endISO = nzISO(event.end_date || event.start_date, event.end_time || event.start_time);

  const node = { '@type': 'Event' };
  set(node, 'name', title);
  set(node, 'description', event.description);
  set(node, 'eventStatus', 'EventScheduled');
  // Same resolution the card uses, so structured data can never advertise an
  // image the page did not show. absolute() because structured data must be
  // crawlable without the page.
  set(node, 'image', absolute(normalizeImageUrl(event.image_url)));

  if (recurring) {
    const schedule = { '@type': 'Schedule' };
    set(schedule, 'startDate', startISO);
    set(schedule, 'endDate', endISO);

    const weekday = recurringWeekday(event);
    if (weekday) {
      schedule.repeatFrequency = 'P1W';
      schedule.byDay = [weekday];
    }

    const startTime = parseTimeCell(event.start_time);
    const endTime = parseTimeCell(event.end_time);
    if (startTime) schedule.startTime = timeText(startTime);
    if (endTime) schedule.endTime = timeText(endTime);

    if (Object.keys(schedule).length > 1) node.eventSchedule = schedule;
  } else {
    set(node, 'startDate', startISO);
    set(node, 'endDate', endISO);
  }

  node.eventAttendanceMode = online
    ? 'https://schema.org/OnlineEventAttendanceMode'
    : 'https://schema.org/OfflineEventAttendanceMode';
  node.organizer = organizationReference();

  if (online) {
    node.location = { '@type': 'VirtualLocation', url: SITE_URL };
  } else {
    const place = { '@type': 'PostalAddress' };
    set(place, 'addressLocality', location);
    set(place, 'addressCountry', 'NZ');
    node.location = place;
  }

  return node;
}

/**
 * Structured data for the events cluster on index.html.
 *
 * @param {Array<Array<object>>} clusters  [recurring, upcoming] from classifyEvents
 * @returns {string|null} the ld+json block, or null when there is no event
 */
export function buildEventSchema(clusters) {
  const rows = [].concat(...(clusters || []));
  const nodes = rows.map(eventNode).filter(Boolean);
  if (nodes.length === 0) return null;
  return renderJsonLdBlock(graph(nodes));
}

/* ==========================================================
   PERSON  (articles.html)
   ========================================================== */

/**
 * One Person per possibilitator card already rendered on the page.
 *
 * jobTitle and worksFor are read straight from the sheet and omitted when the
 * columns are blank — the current sheet carries neither column, so they stay
 * absent rather than being guessed. short_bio is a biography, not a job title,
 * so it is never promoted into one.
 *
 * @param {Array<object>} rows  the same filtered rows the cards render from
 * @returns {string|null} the ld+json block, or null when nobody qualifies
 */
export function buildPersonSchema(rows) {
  const nodes = [];

  for (const person of rows || []) {
    const name = (person.name || '').trim();
    if (!name) continue;

    const url = (person.substack_url || '').trim();
    const node = { '@type': 'Person' };
    set(node, 'name', name);
    set(node, 'url', url ? absolute(url) : '');
    set(node, 'jobTitle', person.job_title);
    set(node, 'worksFor', person.works_for);
    set(node, 'image', absolute(normalizeImageUrl(person.photo_url || '')));

    // Only real, absolute profile URLs. Identities shown as cards on the page.
    const sameAs = [url, person.rss_url]
      .map((u) => absolute((u || '').trim()))
      .filter((u, i, all) => /^https?:\/\//i.test(u) && all.indexOf(u) === i);
    if (sameAs.length) node.sameAs = sameAs;

    nodes.push(node);
  }

  if (nodes.length === 0) return null;
  return renderJsonLdBlock(graph(nodes));
}

/* ==========================================================
   BOOK  (books/index.html)
   ========================================================== */

/**
 * One Book per card on the books page.
 *
 * Only fields actually on the page are emitted. `isbn` is omitted unless the
 * books data carries it — the page has no ISBN today, and inventing one would
 * be both wrong and a rich-results policy violation.
 *
 * @param {Array<object>} books  entries from BOOKS (see build/generate.mjs)
 * @returns {string|null} the ld+json block, or null when there is no book
 */
export function buildBookSchema(books) {
  const nodes = [];

  for (const book of books || []) {
    const name = (book.title || '').trim();
    if (!name) continue;

    const node = { '@type': 'Book' };
    set(node, 'name', name);

    const author = (book.author || '').trim();
    if (author) node.author = { '@type': 'Person', name: author };

    set(node, 'isbn', book.isbn);
    set(node, 'image', absolute(book.image || ''));

    const url = absolute(book.order_url || '');
    const price = (book.price == null ? '' : String(book.price)).trim();
    if (url && price) {
      const offer = { '@type': 'Offer', url, price };
      set(offer, 'priceCurrency', book.price_currency);
      set(offer, 'availability', book.availability);
      node.offers = offer;
    }

    nodes.push(node);
  }

  if (nodes.length === 0) return null;
  return renderJsonLdBlock(graph(nodes));
}