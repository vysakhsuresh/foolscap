/**
 * pdf.js's worker module for the Node tests, with the same correction the
 * build makes (scripts/pdfjs-patch.ts), so the tests read pages the way the
 * site does. Written once per run to a temporary file and imported from there.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { patchPdfjsWorker } from '../../scripts/pdfjs-patch';

let loaded: Promise<unknown> | undefined;

export function pdfjsWorkerModule(): Promise<unknown> {
  loaded ??= (async () => {
    const require = createRequire(import.meta.url);
    const source = require.resolve('pdfjs-dist/build/pdf.worker.mjs');
    const version = (require('pdfjs-dist/package.json') as { version: string }).version;
    const dir = join(tmpdir(), `foolscap-pdfjs-${version}-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'pdf.worker.mjs');
    // Without its source map beside it, which Vitest would go looking for.
    writeFileSync(file, patchPdfjsWorker(readFileSync(source, 'utf8')).replace(/\n\/\/# sourceMappingURL=\S+\s*$/, '\n'));
    return import(/* @vite-ignore */ pathToFileURL(file).href);
  })();
  return loaded;
}
