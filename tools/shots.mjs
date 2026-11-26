// Render the three screenshots of the built dashboard with the headless
// Chromium found under ~/.cache/ms-playwright.
//   1-board.png    the board as it loads
//   2-detail.png   the detail view of the rank-1 protocol (#detail=<slug>)
//   3-filtered.png the watchlist-only filtered view (#watchlist)
// Usage: node tools/shots.mjs <out-dir> [repo-root]
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [outDir, repoRoot = new URL('..', import.meta.url).pathname] = process.argv.slice(2);
if (!outDir) {
  console.log('usage: node tools/shots.mjs <out-dir> [repo-root]');
  process.exit(2);
}

const CHROME = process.env.HOME + '/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome';
if (!existsSync(CHROME)) {
  console.log(`no chrome binary at ${CHROME}`);
  process.exit(1);
}

const board = JSON.parse(readFileSync(join(outDir, 'board.json'), 'utf8'));
const topSlug = board.rows[0].slug;
const page = pathToFileURL(join(outDir, 'dashboard', 'index.html')).href;

const shots = [
  ['1-board.png', page],
  ['2-detail.png', `${page}#detail=${encodeURIComponent(topSlug)}`],
  ['3-filtered.png', `${page}#watchlist`],
];

for (const [name, url] of shots) {
  const dest = join(repoRoot, 'screenshots', name);
  execFileSync(CHROME, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--window-size=1440,800',
    '--virtual-time-budget=5000',
    `--screenshot=${dest}`,
    url,
  ], { stdio: 'pipe', timeout: 60000 });
  const size = statSync(dest).size;
  console.log(`${name}: ${size} bytes${size > 512 * 1024 ? '  OVER 512 KiB' : ''}`);
}
console.log('done');
