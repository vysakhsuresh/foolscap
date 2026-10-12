/**
 * Copies what "Make searchable" fetches at runtime into the public directory,
 * so it is served from our own origin like everything else.
 *
 * tesseract.js reads words out of pictures with three pieces it loads by URL:
 * its worker script, the Tesseract engine compiled to WebAssembly (one build
 * per CPU feature level; a device fetches only the one it can run), and the
 * English model. The usual instructions point at a CDN; the CSP forbids that.
 *
 * Only the LSTM-only engine builds are copied: the legacy engine is bigger
 * and worse, and Foolscap never asks for it. The model is tessdata's
 * "best_int" English, 2.9 MB gzipped.
 *
 * Lands under a folder named for the installed tesseract.js version, so
 * /tesseract/* can be cached as immutable. app/public/tesseract/ is
 * gitignored and rebuilt by predev/prebuild; app/src/ocr/ocr-version.ts is
 * written here.
 *
 *   node scripts/copy-ocr-assets.mjs
 */
import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MODULES = resolve(ROOT, 'node_modules');
const OUT_ROOT = resolve(ROOT, 'app/public/tesseract');
const VERSION_TS = resolve(ROOT, 'app/src/ocr/ocr-version.ts');

const FILES = [
  ['tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['tesseract.js/dist/worker.min.js.LICENSE.txt', 'worker.min.js.LICENSE.txt'],
  ['tesseract.js/LICENSE.md', 'LICENSE-tesseract.js.md'],
  ['tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js', 'core/tesseract-core-relaxedsimd-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'core/tesseract-core-simd-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-lstm.wasm.js', 'core/tesseract-core-lstm.wasm.js'],
  ['tesseract.js-core/LICENSE', 'core/LICENSE'],
  ['@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'lang/eng.traineddata.gz'],
];

async function main() {
  const { version } = JSON.parse(await readFile(resolve(MODULES, 'tesseract.js/package.json'), 'utf8'));
  const out = resolve(OUT_ROOT, version);
  await rm(OUT_ROOT, { recursive: true, force: true });
  let bytes = 0;
  for (const [from, to] of FILES) {
    const target = resolve(out, to);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(resolve(MODULES, from), target);
    bytes += (await stat(target)).size;
  }
  await mkdir(dirname(VERSION_TS), { recursive: true });
  await writeFile(
    VERSION_TS,
    [
      '// Written by scripts/copy-ocr-assets.mjs from the installed tesseract.js. Do not edit.',
      `export const OCR_VERSION = '${version}';`,
      '/** Where the OCR worker, engine and English model are served from. Ends in a slash. */',
      `export const OCR_ASSETS = \`\${import.meta.env.BASE_URL}tesseract/${version}/\`;`,
      '',
    ].join('\n'),
  );
  console.log(`ocr assets: ${FILES.length} files, ${(bytes / 1e6).toFixed(1)} MB → app/public/tesseract/${version}/`);
}

await main();
