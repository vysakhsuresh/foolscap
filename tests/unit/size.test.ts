/**
 * Rule 5, measured over dist/ after `vite build`: no file over Cloudflare's
 * 25 MiB cap, and each tool page's initial scripts — what blocks first paint —
 * small and free of either PDF library. pdf-lib belongs in the op worker chunk
 * and pdf.js in its own chunks, both fetched after first paint.
 *
 * Skips, loudly, when dist/ is missing: the numbers only exist for a build.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const DIST = join(ROOT, 'dist');
const MIB = 1024 * 1024;
export const INITIAL_SCRIPTS_GZIP_LIMIT = 60 * 1024;

/** Strings that only appear once a PDF library has been bundled in. */
const PDFJS_MARKERS = ['pdfjs-dist', 'GlobalWorkerOptions', 'standardFontDataUrl', 'pdf.worker'];
const PDFLIB_MARKERS = ['PDFDocument', 'pdf-lib', 'useObjectStreams'];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

/** The scripts and stylesheets a page loads before it can paint, as dist-relative paths. */
function initialAssets(html: string): string[] {
  const refs: string[] = [];
  for (const tag of html.match(/<(script|link)\b[^>]*>/gi) ?? []) {
    const src = /\ssrc="([^"]+)"/i.exec(tag)?.[1];
    const href = /\shref="([^"]+)"/i.exec(tag)?.[1];
    if (/^<script/i.test(tag) && src) refs.push(src);
    else if (/^<link/i.test(tag) && href && /\srel="(modulepreload|stylesheet)"/i.test(tag)) refs.push(href);
  }
  return refs.filter((ref) => ref.startsWith('/')).map((ref) => ref.slice(1));
}

const built = existsSync(DIST) && existsSync(join(DIST, 'index.html'));
const describeBuilt = built ? describe : describe.skip;

describe('dist/', () => {
  it('exists, or this file is skipped', () => {
    if (!built) {
      console.warn('size.test.ts: dist/ is missing — run `npm run build` first; the size checks were skipped.');
    }
    expect(true).toBe(true);
  });
});

describeBuilt('every built file', () => {
  it('is under 25 MiB', () => {
    const over = walk(DIST)
      .filter((p) => statSync(p).size >= 25 * MIB)
      .map((p) => `${relative(DIST, p)} (${(statSync(p).size / MIB).toFixed(1)} MiB)`);
    expect(over, 'Cloudflare Pages refuses files of 25 MiB or more.').toEqual([]);
  });
});

describeBuilt('each tool page', () => {
  const toolsDir = join(DIST, 'tools');
  const pages = existsSync(toolsDir)
    ? readdirSync(toolsDir)
        .map((id) => ({ id, path: join(toolsDir, id, 'index.html') }))
        .filter((p) => existsSync(p.path))
    : [];

  it('has at least the three stage-1 pages', () => {
    expect(pages.map((p) => p.id)).toEqual(expect.arrayContaining(['merge', 'split', 'organise']));
  });

  for (const page of pages) {
    describe(`/tools/${page.id}/`, () => {
      const html = readFileSync(page.path, 'utf8');
      const assets = initialAssets(html);

      it('loads its scripts and styles from this origin', () => {
        expect(assets.length).toBeGreaterThan(0);
        for (const tag of html.match(/<(script|link)\b[^>]*>/gi) ?? []) {
          expect(tag, 'every script and stylesheet must be a path on this origin').not.toMatch(/(src|href)="https?:/i);
        }
      });

      it(`has initial scripts and styles under ${INITIAL_SCRIPTS_GZIP_LIMIT / 1024} KB gzipped`, () => {
        const sizes = assets.map((asset) => {
          const path = join(DIST, asset);
          expect(existsSync(path), `${asset} is referenced but not in dist/`).toBe(true);
          return { asset, gzip: gzipSync(readFileSync(path)).length };
        });
        const total = sizes.reduce((sum, s) => sum + s.gzip, 0);
        const report = sizes.map((s) => `${s.asset}: ${(s.gzip / 1024).toFixed(1)} KB`).join('\n');
        expect(total, `initial assets total ${(total / 1024).toFixed(1)} KB gzipped:\n${report}`).toBeLessThan(INITIAL_SCRIPTS_GZIP_LIMIT);
      });

      it('carries neither PDF library before first paint', () => {
        const found: string[] = [];
        for (const asset of assets.filter((a) => a.endsWith('.js'))) {
          const text = readFileSync(join(DIST, asset), 'utf8');
          for (const marker of PDFJS_MARKERS) if (text.includes(marker)) found.push(`${asset} contains pdf.js (${marker})`);
          for (const marker of PDFLIB_MARKERS) if (text.includes(marker)) found.push(`${asset} contains pdf-lib (${marker})`);
        }
        expect(found, 'The PDF libraries load after first paint: pdf.js in its own chunks, pdf-lib in the op worker.').toEqual([]);
      });
    });
  }
});
