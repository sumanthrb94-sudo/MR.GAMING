// Bundles the Firebase JS SDK into public/assets/vendor/ so the site loads no third-party CDN.
// Run once after changing scripts/firebase/*-entry.js or the SDK version:
//   npm i --no-save firebase@12.19.0 esbuild@0.24.0 && node scripts/build-firebase.mjs
import { build } from 'esbuild';
for (const name of ['public', 'admin']) {
  await build({
    entryPoints: [`scripts/firebase/${name}-entry.js`],
    outfile: `public/assets/vendor/firebase-${name}.js`,
    bundle: true, format: 'esm', minify: true, target: 'es2020', legalComments: 'none',
    banner: { js: '/* Firebase JS SDK 12.19.0 (Apache-2.0), bundled for MR. GAMING */' }
  });
  console.log(`built public/assets/vendor/firebase-${name}.js`);
}
