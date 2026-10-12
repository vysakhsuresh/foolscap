/**
 * Writes dist/sw.js after the build: the service worker that makes Foolscap
 * work with no connection at all, and lets it be installed as an app.
 *
 * It precaches every page, script, style, font, icon and the pdf.js pieces
 * (cmaps, standard fonts, decoders) — everything a tool needs except the OCR
 * models, which are large and only wanted by people who read scans: those are
 * kept the first time they are used. The list and the version come from what
 * the build actually wrote, so a new build replaces the old cache whole.
 *
 * Pages are network-first (an update arrives the next time you are online),
 * everything else cache-first (hashed or versioned names never change). Only
 * this site's own GET requests are touched: there is nothing else to touch.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { Plugin } from 'vite';

/** Not precached: the service worker itself, the host's own files, and the OCR models (kept on first use). */
const SKIP = [/^sw\.js$/, /^_headers$/, /^_redirects$/, /^ads\.txt$/, /^robots\.txt$/, /^sitemap\.xml$/, /^tesseract\//, /\.map$/];

function walk(dir: string, root: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, root, out);
    else out.push(relative(root, full).split(sep).join('/'));
  }
}

/** Every file to precache, pages as the address people open ("tools/merge/", not ".../index.html"). */
export function precacheList(outDir: string): string[] {
  const files: string[] = [];
  walk(outDir, outDir, files);
  return files
    .filter((f) => !SKIP.some((re) => re.test(f)))
    .map((f) => (f === 'index.html' ? '' : f.endsWith('/index.html') ? f.slice(0, -'index.html'.length) : f))
    .sort();
}

export function serviceWorker(base: string): Plugin {
  let outDir = '';
  return {
    name: 'foolscap-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir.startsWith('/') ? config.build.outDir : join(config.root, config.build.outDir);
    },
    closeBundle() {
      const list = precacheList(outDir);
      const hash = createHash('sha256');
      for (const path of list) {
        const file = join(outDir, path === '' || path.endsWith('/') ? `${path}index.html` : path);
        hash.update(path).update(readFileSync(file));
      }
      const version = hash.digest('hex').slice(0, 16);
      const source = readFileSync(join(import.meta.dirname, 'sw-template.js'), 'utf8')
        .replace('__VERSION__', version)
        .replace('__BASE__', base)
        .replace('__PRECACHE__', JSON.stringify(list));
      writeFileSync(join(outDir, 'sw.js'), source);
    },
  };
}
