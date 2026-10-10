/**
 * Copies the pieces of pdf.js that are fetched at runtime into the public
 * directory, so they are served from our own origin.
 *
 * pdf.js loads CMaps (for CJK and other non-Latin encodings) and the fourteen
 * standard fonts on demand, by URL. The usual instructions point that URL at a
 * CDN; the tool pages' CSP forbids that, and a document should not render
 * differently because a third party is down. app/public/pdfjs/ is gitignored
 * and rebuilt by predev/prebuild, so the copy always matches the installed
 * pdfjs-dist version.
 *
 *   node scripts/copy-pdfjs-assets.mjs
 */
import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'node_modules/pdfjs-dist');
const OUT = resolve(ROOT, 'app/public/pdfjs');

// wasm/ holds the JPX (JPEG 2000) and JBIG2 decoders, iccs/ the colour profiles;
// without them a scanned PDF with JPEG-2000 images renders as blank pages.
const DIRS = ['cmaps', 'standard_fonts', 'wasm', 'iccs'];

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  let files = 0;
  let bytes = 0;
  for (const dir of DIRS) {
    const from = resolve(SRC, dir);
    const to = resolve(OUT, dir);
    await cp(from, to, { recursive: true });
    for (const name of await readdir(to)) {
      const s = await stat(resolve(to, name));
      if (s.isFile()) {
        files++;
        bytes += s.size;
      }
    }
  }
  console.log(`pdf.js assets: ${files} files, ${(bytes / 1024 / 1024).toFixed(1)} MB -> app/public/pdfjs/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
