// Local gate validator: mirrors the seven scorer rows against a built output
// directory, using the snapshot the entry read. Also checks the dossier is
// byte-identical to a fresh buildDossier run, and the dashboard source size.
// Usage: node tools/validate.mjs <snapshot.json> <out-dir> [repo-root]
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { buildDossier } from '../vendor/makefun-board.ts';

const [snapshotPath, outDir, repoRoot = new URL('..', import.meta.url).pathname] = process.argv.slice(2);
if (!snapshotPath || !outDir) {
  console.log('usage: node tools/validate.mjs <snapshot.json> <out-dir> [repo-root]');
  process.exit(2);
}

const failures = [];
const notes = [];
const fail = (row, msg) => { failures.push(`${row}: ${msg}`); console.log(`FAIL ${row}: ${msg}`); };
const pass = (row, msg) => console.log(`PASS ${row}: ${msg}`);
const note = (msg) => { notes.push(msg); console.log(`note: ${msg}`); };

const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
const protoSlugs = new Set(snapshot.protocols.map((p) => p.slug));
const board = JSON.parse(readFileSync(join(outDir, 'board.json'), 'utf8'));
const rows = board.rows;
const boardBytes = statSync(join(outDir, 'board.json')).size;

// --- board_file ---
if (!Array.isArray(rows)) fail('board_file', 'rows is not an array');
else {
  if (rows.length < 100 || rows.length > 4000) fail('board_file', `${rows.length} rows, need 100-4000`);
  if (boardBytes > 8 * 1024 * 1024) fail('board_file', `board.json is ${boardBytes} bytes, over 8 MiB`);
  const seen = new Set();
  let bad = 0;
  for (const r of rows) {
    if (typeof r.slug !== 'string' || r.slug.length < 1 || r.slug.length > 128 || /\s/.test(r.slug)) { bad++; continue; }
    if (!protoSlugs.has(r.slug)) { fail('board_file', `invented slug ${r.slug}`); bad++; continue; }
    if (seen.has(r.slug)) { fail('board_file', `duplicate slug ${r.slug}`); bad++; continue; }
    seen.add(r.slug);
    if (typeof r.name !== 'string' || r.name.length === 0) { fail('board_file', `${r.slug}: empty name`); bad++; }
    if (!Number.isInteger(r.rank) || r.rank < 1) { fail('board_file', `${r.slug}: bad rank ${r.rank}`); bad++; }
    if (!Number.isInteger(r.implied_value_usd) || r.implied_value_usd < 1 || r.implied_value_usd > 1e14) { fail('board_file', `${r.slug}: bad implied_value_usd`); bad++; }
    if (!Array.isArray(r.farm_steps)) { fail('board_file', `${r.slug}: farm_steps not an array`); bad++; }
  }
  if (bad === 0) pass('board_file', `${rows.length} rows, ${boardBytes} bytes, all slugs in snapshot, unique`);
}

// --- sorted_by_value ---
if (Array.isArray(rows)) {
  const ranks = rows.map((r) => r.rank).sort((a, b) => a - b);
  const ranksOk = ranks.length > 0 && ranks.every((v, i) => v === i + 1);
  if (!ranksOk) fail('sorted_by_value', 'ranks are not exactly 1..N');
  const byRank = [...rows].sort((a, b) => a.rank - b.rank);
  let mono = true;
  for (let i = 1; i < byRank.length; i++) {
    if (byRank[i].implied_value_usd > byRank[i - 1].implied_value_usd) { mono = false; break; }
  }
  if (!mono) fail('sorted_by_value', 'implied_value_usd rises with rank');
  const allEqual = byRank.length > 1 && byRank.every((r) => r.implied_value_usd === byRank[0].implied_value_usd);
  if (allEqual) fail('sorted_by_value', 'all implied values are equal');
  if (ranksOk && mono && !allEqual) pass('sorted_by_value', `ranks 1..${rows.length}, implied non-increasing, rank 1 = $${byRank[0].implied_value_usd.toLocaleString('en-US')}`);
}

// --- coverage ---
if (Array.isArray(rows)) {
  const have = new Set(rows.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !have.has(s));
  if (missing.length > 0) fail('coverage', `missing watchlist slugs: ${missing.join(', ')}`);
  else pass('coverage', `all ${snapshot.watchlist.length} watchlist slugs present; ${rows.length - snapshot.watchlist.length} rows outside the watchlist`);
}

// --- farm_steps ---
if (Array.isArray(rows)) {
  let bad = 0;
  for (const r of rows) {
    if (!Array.isArray(r.farm_steps) || r.farm_steps.length < 3 || r.farm_steps.length > 12) { fail('farm_steps', `${r.slug}: ${Array.isArray(r.farm_steps) ? r.farm_steps.length : 'not-array'} steps`); bad++; continue; }
    for (const s of r.farm_steps) {
      const t = typeof s === 'string' ? s.trim() : '';
      if (t.length < 20 || t.length > 600) { fail('farm_steps', `${r.slug}: step of ${t.length} chars`); bad++; break; }
    }
  }
  if (bad === 0) pass('farm_steps', `every row has ${rows[0].farm_steps.length} steps, each 20-600 chars`);
}

// --- dashboard_files ---
const dashDir = join(outDir, 'dashboard');
const dashFiles = readdirSync(dashDir, { recursive: true, withFileTypes: true })
  .filter((e) => e.isFile())
  .map((e) => join(e.parentPath ?? dashDir, e.name));
const relNames = dashFiles.map((f) => f.slice(dashDir.length + 1));
const totalDashBytes = dashFiles.reduce((n, f) => n + statSync(f).size, 0);
const hasHtml = relNames.includes('index.html');
const hasCss = relNames.some((n) => n.endsWith('.css'));
const hasJs = relNames.some((n) => n.endsWith('.js'));
const nameOk = relNames.every((n) => /^[A-Za-z0-9_][A-Za-z0-9._-]+$/.test(n.split('/').pop()) && !n.split('/').some((part) => part.startsWith('.')));
let netRef = null;
for (const f of dashFiles) {
  const text = readFileSync(f, 'utf8');
  const name = f.slice(dashDir.length + 1);
  if (name.endsWith('.html')) {
    const m = text.match(/(?:href|src|action|poster)\s*=\s*["']https?:\/\/[^"']*["']/i) || text.match(/<style[^>]*>[\s\S]*?https?:\/\//i);
    if (m) { netRef = `${name}: ${m[0].slice(0, 80)}`; break; }
  }
  if (name.endsWith('.css')) {
    const m = text.match(/(?:url\(|@import\s+)[^)]*https?:\/\//i);
    if (m) { netRef = `${name}: ${m[0].slice(0, 80)}`; break; }
  }
  if (name.endsWith('.js')) {
    const m = text.match(/(?:import\s*\(|require\s*\(|from\s+['"])https?:\/\//i);
    if (m) { netRef = `${name}: ${m[0].slice(0, 80)}`; break; }
  }
}
if (!hasHtml || !hasCss || !hasJs) fail('dashboard_files', `index.html=${hasHtml} css=${hasCss} js=${hasJs}`);
else if (dashFiles.length > 400) fail('dashboard_files', `${dashFiles.length} files, over 400`);
else if (totalDashBytes > 4 * 1024 * 1024) fail('dashboard_files', `${totalDashBytes} bytes, over 4 MiB`);
else if (!nameOk) fail('dashboard_files', 'a file name breaks the plain-name rule');
else if (netRef) fail('dashboard_files', `network reference: ${netRef}`);
else pass('dashboard_files', `${dashFiles.length} files, ${totalDashBytes} bytes, index.html + css + js, no network refs`);
note(`dashboard source total: ${totalDashBytes} bytes (dossier text cap is 65536; data.js will be cut by the dossier, which is allowed)`);

// --- screenshots ---
function pngDims(buf) {
  if (buf.length < 24 || buf[0] !== 0x89) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}
function jpegDims(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    const len = buf.readUInt16BE(i + 2);
    i += 2 + len;
  }
  return null;
}
const shotsDir = join(outDir, 'screenshots');
const shots = readdirSync(shotsDir).filter((n) => !n.startsWith('.')).sort();
if (shots.length < 3 || shots.length > 4) fail('screenshots', `${shots.length} images, need 3-4`);
else {
  let ok = true;
  for (const name of shots) {
    const buf = readFileSync(join(shotsDir, name));
    const dims = pngDims(buf) ?? jpegDims(buf);
    const size = buf.length;
    if (!dims) { fail('screenshots', `${name}: not a whole PNG or JPEG`); ok = false; continue; }
    const long = Math.max(dims.w, dims.h);
    const short = Math.min(dims.w, dims.h);
    if (size > 512 * 1024) { fail('screenshots', `${name}: ${size} bytes, over 512 KiB`); ok = false; }
    if (long > 1440 || short < 800) { fail('screenshots', `${name}: ${dims.w}x${dims.h}, long side over 1440 or short side under 800`); ok = false; }
    console.log(`  shot ${name}: ${dims.w}x${dims.h}, ${size} bytes`);
  }
  if (ok) pass('screenshots', `${shots.length} images within size and dimension caps`);
}

// --- dossier_matches ---
const dossierBytes = readFileSync(join(outDir, 'dossier.json'));
const rebuilt = buildDossier(outDir, { text_max_bytes: 65536 });
const same = Buffer.compare(Buffer.from(dossierBytes), Buffer.from(rebuilt)) === 0;
if (!same) fail('dossier_matches', `dossier.json differs from a fresh buildDossier run (${dossierBytes.length} vs ${rebuilt.length} bytes)`);
else if (dossierBytes.length > 1.5 * 1024 * 1024) fail('dossier_matches', `dossier is ${dossierBytes.length} bytes, over 1.5 MiB`);
else pass('dossier_matches', `byte-identical to buildDossier, ${dossierBytes.length} bytes`);
const dossierJson = JSON.parse(dossierBytes.toString('utf8'));
note(`dossier text: ${Buffer.byteLength(dossierJson.text, 'utf8')} bytes (cap 65536)`);

console.log(failures.length === 0 ? '\nALL GATE ROWS PASS' : `\n${failures.length} FAILURE(S)`);
process.exit(failures.length === 0 ? 0 : 1);
