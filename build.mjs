// Bundles src/card.js (+ three.js and the GLTF loader) into dist/sweet-home-card.js
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)));
await build({
  entryPoints: ['src/card.js'],
  bundle: true,
  format: 'esm',
  target: 'es2021',
  minify: true,
  legalComments: 'eof',
  outfile: 'dist/sweet-home-card.js',
  define: { __SH_VERSION__: JSON.stringify(version) },
  loader: { '.woff2': 'dataurl', '.svg': 'text' }, // the Inter font is bundled (no request to an outside font server)
  logLevel: 'info',
});
