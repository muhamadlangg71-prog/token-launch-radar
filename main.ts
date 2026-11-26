// Token Launch Radar — entrypoint.
//
// Reads the sealed snapshot, builds the ranked board with lib/model.ts,
// writes the dashboard's data beside the page, copies dashboard/ and
// screenshots/ into the output, and writes the dossier with the kit's
// buildDossier. Standard library only; deterministic: the same snapshot
// always writes the same bytes, so the grader's two runs agree.
//
// Usage (local): MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
// In the grade sandbox the snapshot is /input/snapshot.json and the output
// is /output, which are the defaults when no flags are given.

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-board.ts';
import { buildBoard, type Snapshot } from './lib/model.ts';

const repoRoot = dirname(fileURLToPath(import.meta.url));

function flagValue(name: string): string | null {
  const args = process.argv.slice(2);
  const i = args.indexOf(name);
  if (i >= 0 && i + 1 < args.length) return args[i + 1] as string;
  return null;
}

function main(): void {
  const inputPath = flagValue('--input') ?? process.env.MAKEFUN_INPUT ?? '/input/snapshot.json';
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

  const snapshot = JSON.parse(readFileSync(inputPath, 'utf8')) as Snapshot;
  const { rows, stats } = buildBoard(snapshot);

  mkdirSync(join(outDir, 'dashboard'), { recursive: true });
  mkdirSync(join(outDir, 'screenshots'), { recursive: true });

  // The board: the gate's rows, plus the stats and the model note the page shows.
  const board = {
    as_of: stats.as_of,
    floor_usd: stats.floor_usd,
    generated_by: 'token-launch-radar v3: implied = TVL x category median mcap/TVL x growth x age x chains (see README)',
    stats: {
      total_protocols: stats.total_protocols,
      no_token_protocols: stats.no_token_protocols,
      candidates: stats.candidates,
      watchlist_count: stats.watchlist_count,
      board_rows: stats.board_rows,
      total_implied_usd: stats.total_implied_usd,
      median_multiple: stats.median_multiple,
      categories: stats.categories,
    },
    rows,
  };
  writeFileSync(join(outDir, 'board.json'), JSON.stringify(board, null, 2) + '\n', 'utf8');

  // The page's data, written beside index.html. The page reads window.RADAR
  // and never fetches anything, so it renders with no network.
  const pageData = {
    as_of: stats.as_of,
    floor_usd: stats.floor_usd,
    stats: board.stats,
    model: {
      formula: 'implied = TVL x categoryMultiple x growthFactor x ageFactor x chainFactor',
      categoryMultiple: 'median mcap/TVL of tokenized protocols in the same category (>= 5, else the global median), clamped to [0.02, 2.00]',
      growthFactor: '1 + clamp(change_7d, -20, +20) / 100',
      ageFactor: '0.80 + 0.20 x min(ageDays / 365, 1)',
      chainFactor: '1 + 0.05 x min(chains - 1, 4)',
      clamp: 'implied clamped to [TVL x 0.01, TVL x 3], rounded to whole dollars',
      note: 'Implied value is this entry’s own claim from the snapshot’s figures. It is not a prediction that a token will be issued, or of what one would trade at.',
    },
    rows,
  };
  writeFileSync(join(outDir, 'dashboard', 'data.js'), `window.RADAR = ${JSON.stringify(pageData, null, 1)};\n`, 'utf8');

  // The page itself, then the screenshots the entry ships.
  for (const f of ['index.html', 'app.css', 'app.js']) {
    cpSync(join(repoRoot, 'dashboard', f), join(outDir, 'dashboard', f));
  }
  const shotsDir = join(repoRoot, 'screenshots');
  if (!existsSync(shotsDir)) throw new Error('screenshots/ is missing: the entry needs three screenshots');
  cpSync(shotsDir, join(outDir, 'screenshots'), { recursive: true });

  // The dossier: byte for byte what the scorer rebuilds from the same files.
  const dossier = buildDossier(outDir, { text_max_bytes: 65536 });
  writeFileSync(join(outDir, 'dossier.json'), dossier);

  console.log(`board: ${rows.length} rows, ${stats.watchlist_count} watchlist covered, total implied $${stats.total_implied_usd.toLocaleString('en-US')}`);
  console.log(`dossier: ${dossier.length} bytes`);
}

main();
