// Probe what can take the three screenshots on this machine.
// Usage: node tools/probe.mjs
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
try {
  const p = require.resolve('playwright-core');
  console.log(`playwright-core: ${p}`);
} catch {
  console.log('playwright-core: NOT resolvable');
}
try {
  const p = require.resolve('playwright');
  console.log(`playwright: ${p}`);
} catch {
  console.log('playwright: NOT resolvable');
}
const candidates = [
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable', '/opt/google/chrome/chrome',
  process.env.HOME + '/.cache/ms-playwright',
];
for (const c of candidates) console.log(`${c}: ${existsSync(c) ? 'exists' : 'absent'}`);
for (const dir of (process.env.PATH || '').split(':')) {
  for (const name of ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable']) {
    if (existsSync(dir + '/' + name)) console.log(`PATH: ${dir}/${name}`);
  }
}
