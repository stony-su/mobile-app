/* Gather just the web assets into ./www so Capacitor bundles a clean app
   (no node_modules, no android/, no tooling). Run before `cap sync`. */
import { rmSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'www');

// the files & folders that make up the actual web app
const ASSETS = [
  'index.html',
  'manifest.webmanifest',
  'sw.js',
  'css',
  'js',
  'icons',
  'ringtones',
];

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

for (const item of ASSETS) {
  const from = join(root, item);
  if (!existsSync(from)) { console.warn(`! skipping missing ${item}`); continue; }
  cpSync(from, join(out, item), { recursive: true });
}

console.log(`✶ web assets copied to www/ (${ASSETS.length} entries)`);
