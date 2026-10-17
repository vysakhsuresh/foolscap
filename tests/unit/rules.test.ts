/**
 * The structural rules from CLAUDE.md, enforced by reading the tree: the seam
 * (1), where documents come from and where bytes go (2a, 2b, 2c), no names on
 * the record (8), the two ambient files, the worker globals, the HTML the CSP
 * would block, and the CSP itself. Comments are stripped first so a rule can
 * be explained in a doc comment without tripping it; identifiers are matched
 * as whole words. Every failure names file:line.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { headersFor, parseHeaders } from '../../scripts/vite-cf-headers';
import { LIVE_TOOLS } from '../../app/src/ops/tools';
import { AD_PAGE_CSP, AD_PAGES, TOOL_PAGE_CSP } from '../../app/src/site/config';

const ROOT = resolve(__dirname, '../..');
const APP = join(ROOT, 'app');

function walk(dir: string, keep: (path: string) => boolean, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (entry === 'node_modules' || entry === 'public') continue;
    if (statSync(path).isDirectory()) walk(path, keep, out);
    else if (keep(path)) out.push(path);
  }
  return out;
}

interface Source {
  /** Repo-relative, forward slashes. */
  readonly file: string;
  readonly raw: string;
  /** Comments blanked out, line structure kept, so line numbers still mean something. */
  readonly code: string;
}

function load(path: string): Source {
  const raw = readFileSync(path, 'utf8');
  return { file: relative(ROOT, path).split('\\').join('/'), raw, code: stripComments(raw) };
}

/**
 * Blanks `//` and `/* *\/` comments while leaving strings, template literals
 * and regex literals alone, replacing each comment character with a space
 * (newlines kept). A regex literal is recognised the way a tokenizer would:
 * a `/` where an expression may start.
 */
export function stripComments(src: string): string {
  const out: string[] = [];
  let i = 0;
  let lastSignificant = '';
  const blank = (text: string) => text.replace(/[^\n]/g, ' ');
  const expressionMayStart = () => lastSignificant === '' || /[(,=:[!&|?{};+\-*%<>~^]/.test(lastSignificant) || /\b(return|typeof|case|do|else|in|of|instanceof|new|delete|void|throw|yield|await)$/.test(lastSignificant);

  while (i < src.length) {
    const ch = src[i] ?? '';
    const next = src[i + 1] ?? '';
    if (ch === '/' && next === '/') {
      const end = src.indexOf('\n', i);
      const stop = end === -1 ? src.length : end;
      out.push(blank(src.slice(i, stop)));
      i = stop;
      continue;
    }
    if (ch === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? src.length : end + 2;
      out.push(blank(src.slice(i, stop)));
      i = stop;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      const stop = skipString(src, i);
      out.push(src.slice(i, stop));
      i = stop;
      lastSignificant = ch;
      continue;
    }
    if (ch === '/' && expressionMayStart()) {
      const stop = skipRegex(src, i);
      out.push(src.slice(i, stop));
      i = stop;
      lastSignificant = '/';
      continue;
    }
    out.push(ch);
    if (/\S/.test(ch)) {
      // Track the trailing word so `return /x/` is a regex and `a /x/ b` is not.
      lastSignificant = /\w/.test(ch) ? (/\w$/.test(lastSignificant) ? lastSignificant + ch : ch) : ch;
    }
    i++;
  }
  return out.join('');
}

function skipString(src: string, start: number): number {
  const quote = src[start];
  let i = start + 1;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === quote) return i + 1;
    if (quote === '`' && ch === '$' && src[i + 1] === '{') {
      // A template expression may hold strings of its own; skip it as a balanced block.
      let depth = 1;
      i += 2;
      while (i < src.length && depth > 0) {
        const c = src[i];
        if (c === "'" || c === '"' || c === '`') {
          i = skipString(src, i);
          continue;
        }
        if (c === '{') depth++;
        if (c === '}') depth--;
        i++;
      }
      continue;
    }
    if (quote !== '`' && ch === '\n') return i;
    i++;
  }
  return i;
}

function skipRegex(src: string, start: number): number {
  let i = start + 1;
  let inClass = false;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '\n') return i;
    if (inClass) {
      if (ch === ']') inClass = false;
    } else if (ch === '[') {
      inClass = true;
    } else if (ch === '/') {
      i++;
      while (i < src.length && /[a-z]/i.test(src[i] ?? '')) i++;
      return i;
    }
    i++;
  }
  return i;
}

/** "file:line: text" for every line of `text` matching `pattern`. */
function hits(source: Source, pattern: RegExp, text = source.code): string[] {
  const found: string[] = [];
  text.split('\n').forEach((line, index) => {
    if (pattern.test(line)) found.push(`${source.file}:${index + 1}: ${line.trim()}`);
  });
  return found;
}

const word = (name: string) => new RegExp(`(?<![\\w$])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w$])`);

const TS_FILES = walk(APP, (p) => p.endsWith('.ts')).map(load);
const SRC_FILES = TS_FILES.filter((s) => s.file.startsWith('app/src/'));
const HTML_FILES = walk(APP, (p) => p.endsWith('.html')).map(load);

const inDir = (source: Source, dir: string) => source.file.startsWith(`${dir}/`);
const named = (source: Source, pattern: RegExp) => pattern.test(source.file);

function expectNone(found: string[], why: string): void {
  expect(found, `${why}\n${found.join('\n')}`).toEqual([]);
}

describe('rule 1: the seam', () => {
  it('nothing outside app/src/pdf mentions a PDF library in any form', () => {
    const found = TS_FILES.filter((s) => !inDir(s, 'app/src/pdf')).flatMap((s) => [
      ...hits(s, /pdfjs-dist/),
      ...hits(s, /@cantoo\/pdf-lib/),
    ]);
    expectNone(found, 'Only app/src/pdf may name pdfjs-dist or @cantoo/pdf-lib. Widen PdfEngine or PdfSurgeon instead.');
  });

  it('inside it, engine files never name pdf-lib and surgeon files never name pdf.js', () => {
    const inside = TS_FILES.filter((s) => inDir(s, 'app/src/pdf'));
    const found = [
      ...inside.filter((s) => named(s, /\/engine[^/]*\.ts$/)).flatMap((s) => hits(s, /@cantoo\/pdf-lib/)),
      ...inside.filter((s) => named(s, /\/surgeon[^/]*\.ts$/)).flatMap((s) => hits(s, /pdfjs-dist/)),
    ];
    expectNone(found, 'engine*.ts carries pdf.js only and surgeon*.ts pdf-lib only, so each bundle holds one library.');
  });

  it('app/src/pdf/index.ts exports types only', () => {
    const barrel = TS_FILES.find((s) => s.file === 'app/src/pdf/index.ts');
    expect(barrel, 'app/src/pdf/index.ts is missing').toBeDefined();
    const statements = barrel!.code
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const offending = statements.filter((l) => !/^export (type .* from '\.\/types'|\* from '\.\/types');$/.test(l));
    expectNone(
      offending.map((l) => `${barrel!.file}: ${l}`),
      "The pdf barrel may only re-export './types'. The page imports ./engine and the worker ./surgeon directly.",
    );
  });
});

describe('rule 2a: a document enters only as a File through DocumentStore.import', () => {
  it('nobody reaches for a writable handle', () => {
    const found = TS_FILES.flatMap((s) => [
      ...hits(s, word('showOpenFilePicker')),
      ...hits(s, word('getAsFileSystemHandle')),
      ...hits(s, word('webkitGetAsEntry')),
      ...hits(s, word('launchQueue')),
    ]);
    expectNone(found, 'Each of these hands over a handle that can be written to. Foolscap never writes to a file the user picked.');
  });
});

describe('rule 2b: only the Exporter hands bytes back', () => {
  const EXPORTER = 'app/src/files/exporter.ts';
  const DECLARATIONS = 'app/src/files/fs-access.d.ts';

  it('the pickers are called only in exporter.ts and declared only in fs-access.d.ts', () => {
    const found = TS_FILES.filter((s) => s.file !== EXPORTER && s.file !== DECLARATIONS).flatMap((s) => [
      ...hits(s, word('showSaveFilePicker')),
      ...hits(s, word('showDirectoryPicker')),
    ]);
    expectNone(found, 'Only app/src/files/exporter.ts may call showSaveFilePicker or showDirectoryPicker.');
  });

  it('navigator.share, navigator.canShare, createObjectURL and the download attribute live only in exporter.ts', () => {
    const found = TS_FILES.filter((s) => s.file !== EXPORTER).flatMap((s) => [
      ...hits(s, /(?<![\w$])navigator\s*\.\s*(share|canShare)(?![\w$])/),
      ...hits(s, /navigator\s*\[\s*['"](share|canShare)['"]\s*\]/),
      ...hits(s, word('createObjectURL')),
      ...hits(s, /\.download\s*=[^=]/),
      ...hits(s, /setAttribute\(\s*['"]download['"]/),
      ...hits(s, /['"][^'"]*\bdownload\s*=/),
    ]);
    const html = HTML_FILES.flatMap((s) => hits(s, /<a\b[^>]*\sdownload(\s|=|>)/i, stripHtmlComments(s.raw)));
    expectNone([...found, ...html], 'Only app/src/files/exporter.ts may share, make a blob URL or set a download attribute.');
  });
});

describe('rule 2c: only the Workspace touches OPFS', () => {
  const ALLOWED = /^app\/src\/files\/(workspace[^/]*\.ts|storage\.worker\.ts)$/;
  const DECLARATIONS = 'app/src/files/fs-access.d.ts';

  it('getDirectory and createSyncAccessHandle appear only in workspace*.ts and the storage worker', () => {
    const found = TS_FILES.filter((s) => !ALLOWED.test(s.file) && s.file !== DECLARATIONS).flatMap((s) => [
      ...hits(s, word('getDirectory')),
      ...hits(s, word('createSyncAccessHandle')),
    ]);
    expectNone(found, 'Only app/src/files/workspace*.ts and storage.worker.ts may open OPFS or a sync access handle.');
  });

  it('createWritable appears only there and in exporter.ts', () => {
    const found = TS_FILES.filter((s) => !ALLOWED.test(s.file) && s.file !== 'app/src/files/exporter.ts').flatMap((s) => hits(s, word('createWritable')));
    expectNone(found, 'Only the Workspace and the Exporter may call createWritable, and the Exporter only on a handle the user just chose.');
  });
});

describe('rule 8: no names on the record', () => {
  it('app/src has no console call outside ui/devlog.ts', () => {
    const found = SRC_FILES.filter((s) => s.file !== 'app/src/ui/devlog.ts').flatMap((s) => hits(s, /(?<![\w$.])console\s*\./));
    expectNone(found, 'A file name or page count must never reach the console. Use ui/devlog.ts, which is DEV-only and takes no FoolscapFile.');
  });

  it('ui/devlog.ts, if present, is DEV-guarded and takes no FoolscapFile', () => {
    const devlog = SRC_FILES.find((s) => s.file === 'app/src/ui/devlog.ts');
    if (!devlog) return;
    expect(devlog.code, 'devlog.ts must guard every console call with import.meta.env.DEV').toMatch(/import\.meta\.env\.DEV/);
    expectNone(hits(devlog, word('FoolscapFile')), 'devlog.ts must not take a FoolscapFile: a name could follow.');
  });
});

describe('the ambient rule', () => {
  it('no declare global, as any, @ts-ignore or @ts-expect-error anywhere in app/src', () => {
    const found = SRC_FILES.flatMap((s) => [
      ...hits(s, /declare\s+global/),
      ...hits(s, /(?<![\w$])as\s+any(?![\w$])/),
      // A directive is what TypeScript honours: the tag at the start of a comment line. Prose about the rule is not one.
      ...hits(s, /^\s*(?:\/\/\/?|\/\*+|\*)\s*@ts-(?:ignore|expect-error)(?![\w-])/, s.raw),
    ]);
    expectNone(found, 'Ambient declarations live in fs-access.d.ts and worker-scope.d.ts; everything else types through them.');
  });

  it('exactly two .d.ts files, the named ones', () => {
    const dts = TS_FILES.filter((s) => s.file.endsWith('.d.ts')).map((s) => s.file).sort();
    expect(dts).toEqual(['app/src/files/fs-access.d.ts', 'app/src/jobs/worker-scope.d.ts']);
  });

  it('the worker entries reach the global only through self', () => {
    const workers = SRC_FILES.filter((s) => s.file === 'app/src/jobs/op.worker.ts' || s.file === 'app/src/files/storage.worker.ts');
    expect(workers.map((s) => s.file).sort()).toEqual(['app/src/files/storage.worker.ts', 'app/src/jobs/op.worker.ts']);
    const found = workers.flatMap((s) => [...hits(s, /(?<![\w$.])window\s*\./), ...hits(s, /(?<![\w$.])document\s*\./)]);
    expectNone(found, 'A worker has no window or document. Cast self to WorkerScope once and use that.');
  });
});

function stripHtmlComments(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));
}

describe('the HTML the CSP would block', () => {
  it('has no style attribute, no inline script and no on* handler', () => {
    expect(HTML_FILES.length).toBeGreaterThan(0);
    const found = HTML_FILES.flatMap((s) => {
      const html = stripHtmlComments(s.raw);
      const tags = html.match(/<[a-zA-Z][^>]*>/g) ?? [];
      const bad: string[] = [];
      for (const tag of tags) {
        const line = html.slice(0, html.indexOf(tag)).split('\n').length;
        if (/\sstyle\s*=/i.test(tag)) bad.push(`${s.file}:${line}: inline style: ${tag}`);
        // Structured data for search engines is a data block, not a script: the browser never runs it and the CSP does not apply.
        if (/^<script\b/i.test(tag) && !/\ssrc\s*=/i.test(tag) && !/\stype="application\/ld\+json"/i.test(tag)) bad.push(`${s.file}:${line}: inline script: ${tag}`);
        if (/\son[a-z]+\s*=/i.test(tag)) bad.push(`${s.file}:${line}: inline handler: ${tag}`);
      }
      return bad;
    });
    expectNone(found, "The CSP has no 'unsafe-inline': styles go in classes or el.style.setProperty, scripts in modules.");
  });
});

describe('the headers', () => {
  const blocks = parseHeaders(readFileSync(join(APP, 'public', '_headers'), 'utf8'));
  const STRICT = TOOL_PAGE_CSP;
  const policyAt = (path: string) => headersFor(blocks, path)['Content-Security-Policy'];

  it('never puts a policy on /*: Cloudflare would join it to every other one', () => {
    const everywhere = blocks.find((b) => b.pattern === '/*');
    expect(everywhere?.headers['Content-Security-Policy']).toBeUndefined();
  });

  it("the strict policy keeps connect-src 'self' and allows no inline, no eval and no other origin", () => {
    expect(STRICT).toContain("connect-src 'self'");
    expect(STRICT).not.toContain("'unsafe-inline'");
    // 'wasm-unsafe-eval' is a different keyword and is what pdf.js's decoders need.
    expect(STRICT).not.toContain("'unsafe-eval'");
    expect(STRICT).not.toMatch(/\bhttps?:/);
  });

  it('every tool page, script, worker and asset gets exactly the strict policy', () => {
    const paths = [
      ...LIVE_TOOLS.map((t) => `/tools/${t.id}/`),
      '/assets/op.worker-abc.js',
      '/assets/tool-abc.js',
      '/pdfjs/cmaps/x.bcmap',
      '/tesseract/7/worker.min.js',
      '/fonts/space-grotesk-latin.woff2',
      '/brand/og.png',
      '/private/',
      '/about/',
      '/terms/',
      '/contact/',
      '/sw.js',
      '/theme.js',
    ];
    for (const path of paths) expect(policyAt(path), path).toBe(STRICT);
  });

  it('every page and folder the site ships is covered by a policy', () => {
    // Anything under app/ that becomes a page or a folder of files must get
    // the strict policy, unless it is one of the ad pages. Top-level files
    // like robots.txt carry no script and need none.
    const top = [
      ...readdirSync(APP, { withFileTypes: true }).filter((e) => e.isDirectory() && !['src', 'public'].includes(e.name)).map((e) => `/${e.name}/`),
      ...readdirSync(join(APP, 'public'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => `/${e.name}/`),
      '/assets/',
      '/sw.js',
    ];
    for (const path of top) {
      const isAdPage = AD_PAGES.some((p) => new RegExp(`^${p.replace(/\*/g, '.*')}$`).test(path));
      expect(policyAt(path), path).toBe(isAdPage ? AD_PAGE_CSP : STRICT);
    }
  });

  it('only the ad pages get the ad policy, and it still locks framing, plugins, forms and base', () => {
    expect(policyAt('/')).toBe(AD_PAGE_CSP);
    expect(policyAt('/guides/')).toBe(AD_PAGE_CSP);
    expect(policyAt('/guides/compress-pdf-to-100kb/')).toBe(AD_PAGE_CSP);
    for (const d of ["frame-ancestors 'none'", "base-uri 'none'", "form-action 'none'", "object-src 'none'"]) expect(AD_PAGE_CSP).toContain(d);
  });

  it('every built HTML page that loads ads is an ad page, and no tool page script can', () => {
    const pages = HTML_FILES.filter((s) => /data-ads="on"/.test(s.raw)).map((s) => s.file);
    for (const file of pages) expect(file, `${file} carries ads but is not under AD_PAGES`).toMatch(/^app\/(index\.html|guides\/)/);
    const importers = SRC_FILES.filter((s) => /from '(?:\.\.\/ui\/ads|\.\/ads)'/.test(s.code)).map((s) => s.file).sort();
    expect(importers).toEqual(['app/src/pages/article.ts', 'app/src/pages/home.ts']);
  });
});

describe('the comment stripper the rules rely on', () => {
  it('blanks comments and leaves strings, templates and regex literals alone', () => {
    const src = [
      "const a = 'http://x.test/' + \"//not a comment\"; // gone",
      'const b = `${a ? "y" : `z//${a}`}`; /* gone',
      'still gone */ const c = x / y / 2;',
      'const d = /https?:\\/\\//.test(a); const e = a.replace(/\\/\\*/g, "");',
      'return /[/]x/i;',
    ].join('\n');
    const out = stripComments(src);
    expect(out.split('\n')).toHaveLength(5);
    expect(out).toContain("'http://x.test/'");
    expect(out).toContain('"//not a comment"');
    expect(out).not.toContain('gone');
    expect(out).toContain('`${a ? "y" : `z//${a}`}`');
    expect(out).toContain('const c = x / y / 2;');
    expect(out).toContain('/https?:\\/\\//.test(a)');
    expect(out).toContain('a.replace(/\\/\\*/g, "")');
    expect(out).toContain('return /[/]x/i;');
  });
});
