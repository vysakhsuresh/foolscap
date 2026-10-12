/**
 * Copies what "Make searchable" fetches at runtime into the public directory,
 * so it is served from our own origin like everything else.
 *
 * tesseract.js reads words out of pictures with three pieces it loads by URL:
 * its worker script, the Tesseract engine compiled to WebAssembly (one build
 * per CPU feature level; a device fetches only the one it can run), and a
 * model per language. The usual instructions point at a CDN; the CSP forbids
 * that.
 *
 * Only the LSTM-only engine builds are copied: the legacy engine is bigger
 * and worse, and Foolscap never asks for it. The models are tessdata's
 * "best_int" (the plain 4.0.0 build where a language has no best_int), one
 * for every language in app/src/ocr/languages.ts. English, 2.9 MB gzipped, is
 * fetched when the tool page opens; the others only when somebody picks one.
 * A model over MODEL_LIMIT stops the copy: Cloudflare serves nothing over
 * 25 MiB, and a phone on mobile data should not be asked for that much.
 *
 * Lands under a folder named for the installed tesseract.js version, so
 * /tesseract/* can be cached as immutable. app/public/tesseract/ is
 * gitignored and rebuilt by predev/prebuild; app/src/ocr/ocr-version.ts is
 * written here.
 *
 *   node scripts/copy-ocr-assets.mjs
 */
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OCR_LANGUAGES } from '../app/src/ocr/languages.ts';

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
];

/** 20 MiB. */
const MODEL_LIMIT = 20 * 1024 * 1024;

/** The model for one language: best_int if the package has it, else the plain build. */
function modelFor(code) {
  const best = `@tesseract.js-data/${code}/4.0.0_best_int/${code}.traineddata.gz`;
  return existsSync(resolve(MODULES, best)) ? best : `@tesseract.js-data/${code}/4.0.0/${code}.traineddata.gz`;
}

const MODELS = OCR_LANGUAGES.map(({ code }) => [modelFor(code), `lang/${code}.traineddata.gz`]);

async function main() {
  const { version } = JSON.parse(await readFile(resolve(MODULES, 'tesseract.js/package.json'), 'utf8'));
  const out = resolve(OUT_ROOT, version);
  await rm(OUT_ROOT, { recursive: true, force: true });
  for (const [from] of MODELS) {
    const { size } = await stat(resolve(MODULES, from));
    if (size > MODEL_LIMIT) throw new Error(`${from} is ${(size / 2 ** 20).toFixed(1)} MiB, over the 20 MiB a model may be.`);
  }
  let bytes = 0;
  for (const [from, to] of [...FILES, ...MODELS]) {
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
      '/** Where the OCR worker, engine and language models are served from. Ends in a slash. */',
      `export const OCR_ASSETS = \`\${import.meta.env.BASE_URL}tesseract/${version}/\`;`,
      '',
    ].join('\n'),
  );
  console.log(`ocr assets: ${FILES.length} files and ${MODELS.length} language models, ${(bytes / 1e6).toFixed(1)} MB → app/public/tesseract/${version}/`);
}

await main();
