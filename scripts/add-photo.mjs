#!/usr/bin/env node
/**
 * ADD A POSSIBILITATOR PHOTO  —  node scripts/add-photo.mjs <image> "<Full Name>"
 * ============================================================================
 *
 * Turns the photo someone uploaded through the Google Form into the exact file
 * the Articles page should serve, and prints the one line to paste into the
 * `photo_url` column of the Possibilitators Sheet.
 *
 * WHY A SCRIPT AT ALL
 * -------------------
 * `.possibilitator-avatar` is a 120x120 circle, yet form uploads arrive as
 * 3000x3000 phone photos. Serving those raw is what put a 730 KB file behind a
 * 120 px slot. This does the two things a person would otherwise have to redo
 * by hand every single time:
 *
 *   1. Centre-crop to a square. The card uses `object-fit: cover`, which crops
 *      centred in the browser anyway — pre-cropping is pixel-identical on screen
 *      and much smaller on the wire.
 *   2. Scale to 240x240. That is 2x the 120 px slot, so it stays sharp on
 *      Retina without paying for pixels nobody sees.
 *
 * Measured on the existing assets: 30-65x smaller, ~11-20 KB per avatar.
 *
 * WHY THE FILENAME MATTERS
 * -----------------------
 * `normalizeImageUrl()` in js/shared/data.js resolves a bare filename to
 * /assets/possibilitators/. So the Sheet value is just the filename this script
 * prints — no URL, no host, nothing to go stale. That is the whole point:
 * images ship with the deploy instead of hot-linking a third party.
 *
 * USAGE
 * -----
 *   node scripts/add-photo.mjs ~/Downloads/photo.jpg "Anne-Chloé Destremau"
 *   node scripts/add-photo.mjs ~/Downloads/photo.jpg            # name from filename
 *   node scripts/add-photo.mjs ~/Downloads/photo.jpg "Name" --dry-run
 *   node scripts/add-photo.mjs ~/Downloads/photo.jpg "Name" --force
 *
 * OPTIONS
 *   --size <px>       Longest side of the output. Default 240 (2x of 120).
 *   --quality <1-100> JPEG quality. Default 80. Lower it only if asked.
 *   --dir <path>      Output folder. Default assets/possibilitators.
 *   --name <text>     Person's name; same as the second positional argument.
 *   --force           Overwrite an existing file instead of stopping.
 *   --dry-run         Report everything, write nothing.
 *   -h, --help        This help.
 *
 * NO DEPENDENCIES, NO BUILD IMPACT
 * -------------------------------
 * Node standard library plus macOS's built-in `sips` — the same "nothing to
 * install" rule build/generate.mjs follows. This runs on your Mac only, by
 * hand, and is never part of the Netlify build. Images that are already small
 * enough are left at their native size: `sips` will happily upscale a 100 px
 * upload to 240 px and turn a sharp thumbnail into a blurry one, so the script
 * refuses to do that and says so instead.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const DEFAULT_DIR = 'assets/possibilitators';
const DEFAULT_SIZE = 240;
const DEFAULT_QUALITY = 80;

const log = (...args) => console.log('[add-photo]', ...args);
const warn = (...args) => console.warn('[add-photo] WARNING:', ...args);

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/* ==========================================================
   NAME -> FILENAME
   ========================================================== */

/**
 * "Anne-Chloé Destremau" -> "AnneChloeDestremau"
 *
 * Accents are stripped (NFD decomposes them, the combining marks are dropped),
 * apostrophes vanish rather than becoming a gap — "Sónia's" and "Sonia" are the
 * same person. Everything else non-alphanumeric goes too, so a name typed on a
 * phone keyboard still produces a URL-safe filename.
 *
 * @param {string} name
 * @returns {string}
 */
export function slugifyName(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // combining accent marks
    .replace(/['’`]/g, '') // don't -> dont
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

/**
 * A usable name for the person, falling back to the input filename so the
 * script still does the mechanical work when the name was not supplied.
 *
 * @param {string|null} name
 * @param {string} inputPath
 * @returns {string}
 */
function resolveName(name, inputPath) {
  if (name && name.trim()) return name.trim();
  const fromFile = basename(inputPath, extname(inputPath));
  warn(`No name given — using the filename "${fromFile}" as the base name.`);
  warn('That rarely matches the person. Re-run with: --name "Full Name"');
  return fromFile;
}

/* ==========================================================
   IMAGE WORK  (macOS `sips`)
   ========================================================== */

/** True when this machine has the `sips` binary we shell out to. */
export function hasSips() {
  try {
    execFileSync('sips', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} file
 * @returns {{width: number, height: number, format: string}}
 */
export function readImageInfo(file) {
  const out = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', '-g', 'format', file], {
    encoding: 'utf8',
  });
  const num = (key) => {
    const m = out.match(new RegExp(`${key}:\\s*(\\d+)`));
    return m ? Number(m[1]) : 0;
  };
  const fmt = out.match(/format:\s*(\S+)/);
  return { width: num('pixelWidth'), height: num('pixelHeight'), format: fmt ? fmt[1] : 'unknown' };
}

/**
 * The square we should cut out of the source.
 *
 * Centre square, clamped to --size. Clamping is the important part: sips
 * upscales happily, so cropping a 100 px upload to 240 px would invent pixels
 * the submitter never sent. When the source is already smaller than the target
 * we take the native square and warn, rather than quietly making it blurry.
 *
 * @param {{width:number,height:number}} info
 * @param {number} size
 * @returns {{side: number, underTarget: boolean}}
 */
export function planCrop(info, size) {
  const nativeSquare = Math.min(info.width, info.height);
  const side = Math.min(nativeSquare, size);
  return { side, underTarget: side < size };
}

/**
 * Crop to `side` x `side`, scale, and re-encode as JPEG — one sips invocation.
 *
 * @param {{input:string, output:string, side:number, quality:number}} o
 */
export function renderSquare({ input, output, side, quality }) {
  execFileSync(
    'sips',
    [
      '-c', String(side), String(side),
      '-s', 'format', 'jpeg',
      '-s', 'formatOptions', String(quality),
      input, '--out', output,
    ],
    { stdio: 'ignore' }
  );
}

/* ==========================================================
   ARGUMENT PARSING
   ========================================================== */

function parseArgs(argv) {
  const opts = {
    input: null,
    name: null,
    dir: DEFAULT_DIR,
    size: DEFAULT_SIZE,
    quality: DEFAULT_QUALITY,
    force: false,
    dryRun: false,
    help: false,
  };
  const positional = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) {
        warn(`${arg} needs a value.`);
        process.exit(1);
      }
      return v;
    };

    switch (arg) {
      case '-h':
      case '--help':
        opts.help = true;
        break;
      case '--name':
        opts.name = next();
        break;
      case '--dir':
        opts.dir = next();
        break;
      case '--size': {
        const v = Number(next());
        if (!Number.isFinite(v) || v <= 0) {
          warn(`--size must be a positive number, got "${v}".`);
          process.exit(1);
        }
        opts.size = Math.round(v);
        break;
      }
      case '--quality': {
        const v = Number(next());
        if (!Number.isInteger(v) || v < 1 || v > 100) {
          warn(`--quality must be an integer from 1 to 100, got "${v}".`);
          process.exit(1);
        }
        opts.quality = v;
        break;
      }
      case '--force':
        opts.force = true;
        break;
      case '--dry-run':
        opts.dryRun = true;
        break;
      default:
        if (arg.startsWith('-')) {
          warn(`Unknown option "${arg}". Try --help.`);
          process.exit(1);
        }
        positional.push(arg);
    }
  }

  if (positional.length > 2) {
    warn(`Expected at most 2 values (image and name), got ${positional.length}. Try --help.`);
    process.exit(1);
  }

  opts.input = positional[0] || null;
  opts.name = opts.name || positional[1] || null;
  return opts;
}

function printHelp() {
  // The header comment is the documentation; print it rather than duplicating it.
  const text = readFileSync(fileURLToPath(import.meta.url), 'utf8');
  const block = text.match(/\/\*\*[\s\S]*?\*\//);
  if (block) console.log(block[0].replace(/^\/\*\*/, '').replace(/\*\/$/, '').replace(/^ \* ?/gm, ''));
}
/* ==========================================================
   MAIN
   ========================================================== */

function printSheetStep(sheetValue) {
  log('');
  log("Next, in the Possibilitators Sheet, set that row's photo_url to:");
  log('');
  log(`    ${sheetValue}`);
  log('');
  log('Then commit and deploy BEFORE setting active=yes —');
  log('the image ships with the deploy, but the Sheet is read live at page load.');
  log('(js/shared/data.js resolves a bare filename to /assets/possibilitators/)');
}

function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help || !opts.input) {
    printHelp();
    process.exit(opts.help ? 0 : 1);
  }

  const input = resolve(opts.input);
  if (!existsSync(input)) {
    warn(`No such file: ${input}`);
    process.exit(1);
  }
  if (!hasSips()) {
    warn('Could not find `sips`, which this script uses to resize.');
    warn('It ships with macOS — run this on your Mac, not on Netlify.');
    process.exit(1);
  }

  const name = resolveName(opts.name, input);
  const slug = slugifyName(name);
  if (!slug) {
    warn(`Could not build a filename from the name "${name}".`);
    warn('Pass something readable: --name "Anne-Chloé Destremau"');
    process.exit(1);
  }

  const outDir = resolve(ROOT, opts.dir);
  const sheetValue = `${slug}.jpg`;
  const outFile = join(outDir, sheetValue);

  const info = readImageInfo(input);
  if (!info.width || !info.height) {
    warn(`Could not read the dimensions of ${basename(input)} — is it really an image?`);
    process.exit(1);
  }

  const { side, underTarget } = planCrop(info, opts.size);
  const beforeBytes = statSync(input).size;

  log(`source   ${basename(input)}  ${info.width}x${info.height} ${info.format}  ${formatBytes(beforeBytes)}`);
  log(`person   ${name}`);
  log(`output   ${opts.dir}/${sheetValue}  ${side}x${side} JPEG q${opts.quality}`);

  if (underTarget) {
    warn(`Source is only ${Math.min(info.width, info.height)} px on its short side — not upscaling.`);
    warn('That is fine, but a bigger photo would look sharper in the 120 px card.');
  }

  if (existsSync(outFile) && !opts.force) {
    warn(`${sheetValue} already exists in ${opts.dir}. Re-run with --force to replace it.`);
    process.exit(1);
  }

  if (opts.dryRun) {
    log('');
    log('--dry-run: nothing written.');
    printSheetStep(sheetValue);
    return;
  }

  mkdirSync(outDir, { recursive: true });

  // Write to a temp file first so a failed sips run can never leave a truncated
  // file sitting in the folder the site serves from.
  const tmpFile = join(outDir, `.${slug}.tmp.jpg`);
  try {
    renderSquare({ input, output: tmpFile, side, quality: opts.quality });
    writeFileSync(outFile, readFileSync(tmpFile));
  } catch (err) {
    warn(`sips failed: ${err.message}`);
    process.exit(1);
  } finally {
    if (existsSync(tmpFile)) rmSync(tmpFile, { force: true });
  }

  const afterBytes = statSync(outFile).size;
  const factor = afterBytes > 0 ? (beforeBytes / afterBytes).toFixed(0) : '—';

  log('');
  log(`done     ${sheetValue}  ${formatBytes(afterBytes)}  (${factor}x smaller, saved ${formatBytes(beforeBytes - afterBytes)})`);
  printSheetStep(sheetValue);
}

try {
  main();
} catch (err) {
  warn(err && err.message ? err.message : err);
  process.exit(1);
}