/**
 * Copies the pieces of pdf.js that are fetched at runtime into the public
 * directory, so they are served from our own origin.
 *
 * pdf.js loads CMaps (for CJK and other non-Latin encodings), the fourteen
 * standard fonts, the JPX and JBIG2 WASM decoders and the ICC colour profiles
 * on demand, by URL. The usual instructions point that URL at a CDN; the CSP
 * forbids that, and a document should not render differently because a third
 * party is down. Without wasm/ a scanned PDF with JPEG 2000 images renders as
 * blank pages.
 *
 * The copy lands under a folder named for the installed pdfjs-dist version,
 * so /pdfjs/* can be cached as immutable without ever serving stale decoders
 * against a newer worker after an upgrade. The engine reads the version from
 * app/src/pdf/pdfjs-version.ts, written here.
 *
 * quickjs-eval.* is left out: it is the runtime for a document's own
 * JavaScript, which Foolscap never runs.
 *
 * app/public/pdfjs/ is gitignored and rebuilt by predev/prebuild.
 *
 *   node scripts/copy-pdfjs-assets.mjs
 */
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'node_modules/pdfjs-dist');
const OUT_ROOT = resolve(ROOT, 'app/public/pdfjs');
const VERSION_TS = resolve(ROOT, 'app/src/pdf/pdfjs-version.ts');

const DIRS = ['cmaps', 'standard_fonts', 'wasm', 'iccs'];
const SKIP = /^quickjs-eval\./;

async function main() {
  const { version } = JSON.parse(await readFile(resolve(SRC, 'package.json'), 'utf8'));
  const out = resolve(OUT_ROOT, version);
  await rm(OUT_ROOT, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  let files = 0;
  let bytes = 0;
  for (const dir of DIRS) {
    const from = resolve(SRC, dir);
    const to = resolve(out, dir);
    await cp(from, to, { recursive: true, filter: (src) => !SKIP.test(src.split('/').pop() ?? '') });
    for (const name of await readdir(to)) {
      const s = await stat(resolve(to, name));
      if (s.isFile()) {
        files++;
        bytes += s.size;
      }
    }
  }
  await writeFile(
    VERSION_TS,
    [
      '// Written by scripts/copy-pdfjs-assets.mjs from the installed pdfjs-dist. Do not edit.',
      `export const PDFJS_VERSION = '${version}';`,
      '/** Where the engine fetches cmaps, standard fonts, wasm decoders and ICC profiles. Every URL ends in a slash. */',
      `export const PDFJS_ASSETS = \`\${import.meta.env.BASE_URL}pdfjs/${version}/\`;`,
      '',
    ].join('\n'),
  );
  console.log(`pdf.js ${version} assets: ${files} files, ${(bytes / 1024 / 1024).toFixed(1)} MB -> app/public/pdfjs/${version}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
