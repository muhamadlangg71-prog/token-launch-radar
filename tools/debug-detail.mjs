// Debug the detail deep link: dump the DOM and report whether the detail
// section is populated and unhidden, and how tall the document is.
// Usage: node tools/debug-detail.mjs <out-dir>
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [outDir] = process.argv.slice(2);
const CHROME = process.env.HOME + '/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome';
const board = JSON.parse(readFileSync(join(outDir, 'board.json'), 'utf8'));
const topSlug = board.rows[0].slug;
const page = pathToFileURL(join(outDir, 'dashboard', 'index.html')).href;
const url = `${page}#detail=${encodeURIComponent(topSlug)}`;
const dom = execFileSync(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu', '--virtual-time-budget=5000', '--dump-dom', url], { encoding: 'utf8', timeout: 60000, maxBuffer: 64 * 1024 * 1024 });
const detailTag = dom.match(/<section class="detail" id="detail"[^>]*>/);
console.log('top slug:', topSlug);
console.log('detail tag:', detailTag ? detailTag[0] : 'NOT FOUND');
const name = dom.match(/<h2 id="d-name">([^<]*)<\/h2>/);
console.log('d-name:', name ? name[1] : 'NOT FOUND');
const rows = (dom.match(/<tr/g) || []).length;
console.log('table rows in DOM:', rows);
const steps = (dom.match(/<ol class="steps" id="d-steps">([\s\S]*?)<\/ol>/) || [])[1] || '';
console.log('farm steps rendered:', (steps.match(/<li/g) || []).length);
