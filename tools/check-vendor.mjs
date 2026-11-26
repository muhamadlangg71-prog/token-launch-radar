// Check that vendor/makefun-board.ts is byte for byte the kit's library.
// Usage: node tools/check-vendor.mjs [repo-root]
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2] ?? new URL('..', import.meta.url).pathname;
const expected = '9ca51b6e5cd84fe46cb0efa61e2ea99365a1fb0e21f2b75e6007f977f0dc326e';
const bytes = readFileSync(join(root, 'vendor', 'makefun-board.ts'));
const actual = createHash('sha256').update(bytes).digest('hex');
console.log(`vendor bytes: ${bytes.length}`);
console.log(`vendor sha256: ${actual}`);
if (actual === expected) {
  console.log('VENDOR OK: byte-identical to the kit library');
} else {
  console.log(`VENDOR MISMATCH: expected ${expected}`);
  process.exit(1);
}
