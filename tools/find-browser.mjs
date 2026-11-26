// Find a usable headless browser on this machine: a Chromium executable under
// ~/.cache/ms-playwright, or a resolvable playwright-core. Prints candidates.
// Usage: node tools/find-browser.mjs
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);
for (const p of [process.cwd(), '/usr/lib/node_modules', '/usr/local/lib/node_modules']) {
  try {
    console.log(`playwright-core via ${p}: ${require.resolve('playwright-core', { paths: [p] })}`);
  } catch { /* not there */ }
}
try {
  const npmRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
  console.log(`npm global root: ${npmRoot}`);
  try {
    console.log(`playwright-core via npm root: ${require.resolve('playwright-core', { paths: [npmRoot] })}`);
  } catch { console.log('playwright-core: not in npm global root'); }
} catch { /* npm unavailable */ }

const base = process.env.HOME + '/.cache/ms-playwright';
function walk(dir, depth) {
  if (depth > 3 || !existsSync(dir)) return;
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { walk(p, depth + 1); continue; }
    if ((e.name === 'chrome' || e.name === 'headless_shell' || e.name === 'chromium') && statSync(p).mode & 0o111) {
      console.log(`browser binary: ${p}`);
    }
  }
}
walk(base, 0);
console.log('done');
