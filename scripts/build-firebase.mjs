// Bundles the Firebase JS SDK into public/assets/vendor/ so the site loads no third-party CDN.
// Run once after changing scripts/firebase/*-entry.js or the SDK version:
//   npm i --no-save firebase@12.19.0 esbuild@0.24.0 && node scripts/build-firebase.mjs
// Each bundle's file name carries a hash of its contents (firebase-account.1a2b3c4d.js), so vercel.json can let
// browsers keep it for a year; this script deletes the old files and updates every page and script that names them.
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const VENDOR = 'public/assets/vendor', names = {};
for (const name of ['public', 'account']) {
  const out = await build({
    entryPoints: [`scripts/firebase/${name}-entry.js`], write: false,
    bundle: true, format: 'esm', minify: true, target: 'es2020', legalComments: 'none',
    banner: { js: '/* Firebase JS SDK 12.19.0 (Apache-2.0), bundled for MR. GAMING */' }
  });
  const code = out.outputFiles[0].contents, hash = createHash('sha256').update(code).digest('hex').slice(0, 8);
  for (const f of readdirSync(VENDOR)) if (f.startsWith(`firebase-${name}`)) unlinkSync(join(VENDOR, f));
  names[name] = `firebase-${name}.${hash}.js`;
  writeFileSync(join(VENDOR, names[name]), code);
  console.log(`built ${VENDOR}/${names[name]} (${code.length} bytes)`);
}
for (const f of readdirSync(VENDOR)) if (f.startsWith('firebase-admin')) unlinkSync(join(VENDOR, f));   // old owner-page bundle

// Point every reference at the new names
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? (d.name === 'vendor' ? [] : walk(join(dir, d.name))) : [join(dir, d.name)]);
for (const file of walk('public').filter((f) => /\.(html|js)$/.test(f))) {
  const src = readFileSync(file, 'utf8');
  const next = src.replace(/firebase-(public|account|admin)(\.[0-9a-f]{8})?\.js/g, (_, n) => names[n === 'admin' ? 'account' : n]);
  if (next !== src) { writeFileSync(file, next); console.log('updated', file); }
}
