// Token launch radar — make.fun bounty token-radar-01.
//
// One entry, one program: it reads the sealed snapshot of every protocol
// DefiLlama tracks at /input/snapshot.json and writes, to /output (or
// $MAKEFUN_OUTPUT_DIR when you run it yourself):
//
//   board.json     the ranked board, every watchlist protocol in
//   dashboard/     the page, copied from the repository
//   dashboard/zz-data.js   the board's data, written fresh from the snapshot
//   screenshots/   the page as it stands, copied from the repository
//   dossier.json   buildDossier's byte-for-byte dossier of the two above
//
// Every run of this file on the same snapshot writes the same bytes: no clock,
// no randomness, no network. Node 22, the standard library only, nothing to
// install.

import { cpSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDossier } from './vendor/makefun-board.ts';
import { buildBoard, fmtUsd, type Board, type Snapshot } from './lib/model.ts';

// ---------------------------------------------------------------- paths

const args = process.argv.slice(2);
const inputFlag = args.indexOf('--input');
const inputPath = inputFlag !== -1 && args[inputFlag + 1] ? args[inputFlag + 1] : '/input/snapshot.json';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// ---------------------------------------------------------------- the run

const snapshot: Snapshot = JSON.parse(readFileSync(inputPath, 'utf8'));
const board = buildBoard(snapshot);
const boardOk = board.rows.length;

mkdirSync(outputDir, { recursive: true });

// board.json: the ranked board, whole watchlist in, farm steps on every row.
const boardJson = {
  board: {
    as_of: board.as_of,
    source: snapshot.source,
    floor_usd: board.floor_usd,
    watchlist_size: board.watchlist_size,
    rows: board.rows.length,
    method: 'implied_value_usd = tvl x category_multiple x growth x maturity x breadth, every term fitted from the snapshot itself',
  },
  rows: board.rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    rank: r.rank,
    implied_value_usd: r.implied_value_usd,
    farm_steps: r.farm_steps,
    category: r.category,
    chains: r.chains,
    tvl_usd: r.tvl_usd,
    change_7d: r.change_7d,
    age_days: r.age_days,
    watchlist: r.watchlist,
    factors: r.factors,
  })),
};
writeFileSync(join(outputDir, 'board.json'), JSON.stringify(boardJson, null, 1) + '\n');

// dashboard/: the repository's page, its data written fresh from the snapshot.
const repoDir = import.meta.dirname ?? '.';
const dashboardSrc = join(repoDir, 'dashboard');
cpSync(dashboardSrc, join(outputDir, 'dashboard'), { recursive: true });
mkdirSync(join(outputDir, 'dashboard'), { recursive: true });
writeFileSync(join(outputDir, 'dashboard', 'zz-data.js'), dataJs(board));

// screenshots/: the three shots the repository holds.
cpSync(join(repoDir, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });

// dossier.json: byte for byte what buildDossier writes from the two above.
writeFileSync(join(outputDir, 'dossier.json'), buildDossier(outputDir, { text_max_bytes: 65536 }));

process.stdout.write(
  `radar: ${boardOk} ranked protocols, watchlist ${board.watchlist_size}/${board.watchlist_size} covered, top row ${board.rows[0]?.name ?? '-'} at ${fmtUsd(board.rows[0]?.implied_value_usd ?? 0)}\n`,
);

// ---------------------------------------------------------------- data.js

/** The page's data: the whole board compact, the calibration set, the set-asides and the method. */
function dataJs(b: Board): string {
  const compact = b.rows.map((r) => [
    r.rank, r.slug, r.name, r.category ?? '', r.chains, r.tvl_usd,
    r.change_7d === null ? null : Math.round(r.change_7d * 10) / 10, r.age_days,
    r.implied_value_usd, r.watchlist ? 1 : 0,
    r.factors.category_multiple, r.factors.growth_multiplier, r.factors.maturity_multiplier, r.factors.breadth_multiplier,
    r.factors.multiple_source,
  ]);
  const live = b.live.map((l) => [l.slug, l.name, l.category ?? '', l.tvl_usd, l.mcap_usd, l.ratio]);
  const aside = b.set_aside.map((s) => [s.slug, s.name, s.reason]);
  const doc =
    '// Written by main.ts from the sealed snapshot: the ranked board, the calibration\n' +
    '// set, the set-asides and the method, one compact array per row.\n' +
    `window.RADAR_DATA = ${JSON.stringify({
      as_of: b.as_of,
      floor_usd: b.floor_usd,
      watchlist_size: b.watchlist_size,
      rows: compact,
      live,
      aside,
    })};\n`;
  return doc;
}
