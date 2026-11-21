// Bundles src/card.js (+ three.js and the GLTF loader) into dist/sweet-home-card.js, and the card editor into
// dist/sweet-home-editor.js (downloaded by the card only when the card is edited).
import { build, transform } from 'esbuild';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)));

// src/styles.js keeps the stylesheet readable (comments, one rule per line); in the bundle it is minified like the code
const minifyCss = {
  name: 'minify-css',
  setup(b) {
    b.onLoad({ filter: /src[\\/]styles\.js$/ }, async args => {
      const src = readFileSync(args.path, 'utf8');
      const m = src.match(/export const CSS = `([\s\S]*)`;\s*$/);
      if (!m || m[1].includes('${')) throw new Error('styles.js: expected one `export const CSS = `...`;` with no ${}');
      const { code } = await transform(m[1], { loader: 'css', minify: true });
      return { contents: `export const CSS = ${JSON.stringify(code.trim())};\n`, loader: 'js' };
    });
  },
};

const common = {
  bundle: true,
  format: 'esm',
  target: 'es2021',
  minify: true,
  legalComments: 'eof',
  define: { __SH_VERSION__: JSON.stringify(version) },
  loader: { '.woff2': 'dataurl' }, // the Inter font is bundled (no request to an outside font server)
  plugins: [minifyCss],
  logLevel: 'info',
};
// the card: everything a dashboard needs to show it
await build({ ...common, entryPoints: ['src/card.js'], outfile: 'dist/sweet-home-card.js' });
// the card editor: loaded by the card only when it is edited (Home Assistant asks for the editor)
await build({ ...common, entryPoints: ['src/editor.js'], outfile: 'dist/sweet-home-editor.js' });
