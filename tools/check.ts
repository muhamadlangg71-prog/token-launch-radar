// tools/check.ts — the seven gate rows, checked locally exactly as the
// sealed scorer checks them, plus the two-run determinism rule. Run it with:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot> \
//     && node tools/check.ts <snapshot> out

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildDossier } from '../vendor/makefun-board.ts';

const snapshotPath = process.argv[2] ?? 'devdata/snapshot.json';
const outDir = process.argv[3] ?? 'out';
const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));

let fails = 0;
const row = (name: string, ok: boolean, detail: string): void => {
  console.log(`${ok ? 'pass' : 'FAIL'}  ${name}${ok || detail === '' ? '' : ' — ' + detail}`);
  if (!ok) fails++;
};

// ---------------------------------------------------------------- dashboard_files
const PLAIN = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;
const dash: string[] = [];
const walk = (rel: string): void => {
  for (const e of readdirSync(join(outDir, 'dashboard', rel), { withFileTypes: true })) {
    const p = rel === '' ? e.name : `${rel}/${e.name}`;
    if (e.isDirectory() && !e.name.startsWith('.')) walk(p);
    else if (e.isFile()) dash.push(p);
  }
};
walk('');
let bytes = 0;
for (const p of dash) bytes += statSync(join(outDir, 'dashboard', p)).size;
const hasHtml = dash.some((p) => p.endsWith('/index.html') || p === 'index.html');
const hasCss = dash.some((p) => p.endsWith('.css'));
const hasJs = dash.some((p) => p.endsWith('.js'));
const namesOk = dash.every((p) => PLAIN.test(p.split('/').pop()!));
let netHit = '';
for (const p of dash.filter((p) => /\.(html|css|js)$/.test(p))) {
  const t = readFileSync(join(outDir, 'dashboard', p), 'utf8');
  const m = t.match(/https?:\/\/[^\s"'<>)]+/);
  if (m !== null && netHit === '') netHit = `${p}: ${m[0]}`;
}
row('dashboard_files', hasHtml && hasCss && hasJs && namesOk && dash.length <= 400 && bytes <= 4 * 1024 * 1024 && netHit === '',
  netHit !== '' ? `network address in ${netHit}` : `${dash.length} files, ${bytes} bytes`);

// ---------------------------------------------------------------- board_file
const boardDoc = JSON.parse(readFileSync(join(outDir, 'board.json'), 'utf8'));
const boardRows = Array.isArray(boardDoc) ? boardDoc : boardDoc.rows;
const slugs = new Set(snapshot.protocols.map((p: { slug: string }) => p.slug));
const boardBytes = statSync(join(outDir, 'board.json')).size;
const rowOk = boardRows.every((r: Record<string, unknown>) => {
  const s = r.slug as string;
  const val = r.implied_value_usd as number;
  const steps = r.farm_steps as unknown[];
  return slugs.has(s) && typeof r.name === 'string' && (r.name as string).length > 0 &&
    Number.isInteger(r.rank) && (r.rank as number) > 0 &&
    Number.isInteger(val) && val > 0 && val <= 100_000_000_000_000 && Array.isArray(steps);
});
const allSame = boardRows.length >= 2 && boardRows.every((r: { implied_value_usd: number }) => r.implied_value_usd === boardRows[0].implied_value_usd);
row('board_file', boardRows.length >= 100 && boardRows.length <= 4000 && boardBytes <= 8 * 1024 * 1024 && rowOk && !allSame,
  `${boardRows.length} rows, ${boardBytes} bytes`);

// ---------------------------------------------------------------- sorted_by_value
const ranks = [...boardRows].sort((a: { rank: number }, b: { rank: number }) => a.rank - b.rank).map((r: { rank: number }) => r.rank);
const ranksOk = ranks.every((r, i) => r === i + 1);
const byRank = new Map<number, number>();
for (const r of boardRows) byRank.set(r.rank as number, r.implied_value_usd as number);
const sortedOk = ranks.every((_, i) => i === 0 || byRank.has(i + 1) && byRank.has(i + 2) ? byRank.get(i + 1)! >= byRank.get(i + 2)! : true) && [...Array(ranks.length - 1).keys()].every((i) => byRank.get(i + 1)! >= byRank.get(i + 2)!);
row('sorted_by_value', ranksOk && sortedOk, ranksOk && sortedOk ? '' : 'ranks or order broken');

// ---------------------------------------------------------------- coverage
const boardSet = new Set(boardRows.map((r: { slug: string }) => r.slug));
const missing = snapshot.watchlist.filter((s: string) => !boardSet.has(s));
row('coverage', missing.length === 0, missing.length === 0 ? `${snapshot.watchlist.length}/${snapshot.watchlist.length} in` : `missing: ${missing.join(', ')}`);

// ---------------------------------------------------------------- farm_steps
const badSteps = boardRows.filter((r: { farm_steps: string[] }) => {
  const s = r.farm_steps;
  return s.length < 3 || s.length > 12 || s.some((x) => x.trim().length < 20 || x.trim().length > 600);
});
row('farm_steps', badSteps.length === 0, badSteps.length === 0 ? '' : `${badSteps.length} rows bad`);

// ---------------------------------------------------------------- screenshots
const shots = readdirSync(join(outDir, 'screenshots')).filter((n) => !n.startsWith('.'));
let shotOk = shots.length >= 3 && shots.length <= 4;
const shotDetail: string[] = [];
for (const s of shots) {
  const buf = readFileSync(join(outDir, 'screenshots', s));
  const isPng = buf.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
  const isJpg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  let w = 0, h = 0;
  if (isPng) { w = buf.readUInt32BE(16); h = buf.readUInt32BE(20); }
  else if (isJpg) {
    let i = 2;
    while (i < buf.length && shotDetail.length < 40) {
      if (buf[i] !== 0xff) break;
      const len = buf.readUInt16BE(i + 2);
      if (buf[i + 1] >= 0xc0 && buf[i + 1] <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(buf[i + 1])) {
        h = buf.readUInt16BE(i + 5); w = buf.readUInt16BE(i + 7); break;
      }
      i += 2 + len;
    }
  }
  const long = Math.max(w, h), short = Math.min(w, h);
  if (!(isPng || isJpg) || buf.length > 512 * 1024 || long > 1440 || short < 800) {
    shotOk = false; shotDetail.push(`${s}: ${w}x${h}, ${buf.length} bytes`);
  } else if (!PLAIN.test(s)) { shotOk = false; shotDetail.push(`${s}: name`); }
}
row('screenshots', shotOk, shotOk ? `${shots.length} shots within limits` : shotDetail.join('; '));

// ---------------------------------------------------------------- dossier_matches
const fresh = buildDossier(outDir, { text_max_bytes: 65536 });
const written = readFileSync(join(outDir, 'dossier.json'));
row('dossier_matches', fresh.length === written.length && Buffer.compare(Buffer.from(fresh), written) === 0, `${written.length} bytes, fresh ${fresh.length}`);

// ---------------------------------------------------------------- parity: the page's farm plans are the board's
const appSrc = readFileSync(join(outDir, 'dashboard', 'app.js'), 'utf8');
const dataSrc = readFileSync(join(outDir, 'dashboard', 'zz-data.js'), 'utf8');
const sandboxWindow: Record<string, unknown> = {};
new Function('window', 'document', appSrc)(sandboxWindow, undefined);
const RADAR_APP = sandboxWindow.RADAR_APP as { farmSteps: (r: unknown, asOf: string) => string[]; unpack: (a: unknown[]) => Record<string, unknown> };
const dataMatch = dataSrc.match(/window\.RADAR_DATA = (\{.*\});\s*$/s);
const data = JSON.parse(dataMatch![1]!) as { as_of: string; rows: unknown[][] };
const unpacked = data.rows.map((r) => RADAR_APP.unpack(r));
let parityBad = 0;
const pack = (v: Record<string, unknown>[]) => JSON.stringify(v);
for (const r of unpacked) {
  const onBoard = boardRows.find((b: { slug: string }) => b.slug === r.slug);
  if (onBoard === undefined) continue;
  if (pack(RADAR_APP.farmSteps(r, data.as_of)) !== pack(onBoard.farm_steps)) parityBad++;
}
row('page-parity', parityBad === 0, parityBad === 0 ? `${unpacked.length} rows, farm steps identical in page and board` : `${parityBad} rows differ`);

process.exit(fails === 0 ? 0 : 1);
