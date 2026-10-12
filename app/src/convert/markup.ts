/**
 * Blocks as (X)HTML, shared by the HTML and EPUB writers.
 *
 * The markup is XHTML-shaped (every element closed, void elements written
 * `<br/>`) because EPUB requires well-formed XML and a browser reads the
 * same markup as ordinary HTML, so one writer serves both. It is semantic
 * on purpose: headings are h1–h6, lists are nested ul/ol, tables are tables,
 * so the result works with a screen reader, a reading app's table of
 * contents, and a search engine, not just on screen.
 */
import { CSS_FONT } from './fonts';
import type { Block, Paragraph, Picture, Run, Table } from './model';
import { escapeAttr, escapeText } from './xml';

export interface MarkupOptions {
  /** Where a picture's src points: a data: URI in HTML, a file in the EPUB. */
  readonly imageSrc: (picture: Picture, index: number) => string;
  /** The id given to the nth heading, for links from a table of contents. */
  readonly headingId?: (index: number) => string;
}

/** Counts carried across calls, so ids and image numbers stay unique when a document is written in parts. */
export interface MarkupCounters {
  images: number;
  headings: number;
}

export function blocksToHtml(blocks: readonly Block[], options: MarkupOptions, counters: MarkupCounters = { images: 0, headings: 0 }): string {
  let out = '';
  const lists: Array<{ ordered: boolean; level: number }> = [];
  const closeLists = (toLevel: number) => {
    while (lists.length > 0 && (lists[lists.length - 1]?.level ?? -1) > toLevel) {
      const top = lists.pop();
      out += `</li></${top?.ordered ? 'ol' : 'ul'}>`;
    }
  };

  for (const block of blocks) {
    if (block.kind === 'paragraph' && block.list && !block.heading) {
      const { ordered } = block.list;
      const level = Math.max(0, Math.round(block.list.level));
      closeLists(level);
      const top = lists[lists.length - 1];
      if (top && top.level === level && top.ordered === ordered) {
        out += `</li><li>${inline(block.runs)}`;
        continue;
      }
      if (top && top.level === level) closeLists(level - 1);
      out += `<${ordered ? 'ol' : 'ul'}><li>${inline(block.runs)}`;
      lists.push({ ordered, level });
      continue;
    }
    closeLists(-1);
    switch (block.kind) {
      case 'paragraph':
        out += paragraph(block, options, counters);
        break;
      case 'table':
        out += table(block);
        break;
      case 'image':
        out += `<figure>${image(block, options.imageSrc(block, counters.images++))}</figure>`;
        break;
      case 'page-break':
        out += '<div class="page-break"></div>';
        break;
    }
    out += '\n';
  }
  closeLists(-1);
  return out;
}

function paragraph(p: Paragraph, options: MarkupOptions, counters: MarkupCounters): string {
  const classes: string[] = [];
  if (p.align && p.align !== 'left') classes.push(p.align);
  const style = !p.heading && p.indent !== undefined && p.indent > 0 ? ` style="margin-left:${round(p.indent)}pt"` : '';
  const cls = classes.length > 0 ? ` class="${classes.join(' ')}"` : '';
  if (p.heading) {
    const id = options.headingId ? ` id="${escapeAttr(options.headingId(counters.headings++))}"` : '';
    return `<h${p.heading}${id}${cls}>${inline(p.runs)}</h${p.heading}>`;
  }
  return `<p${cls}${style}>${inline(p.runs)}</p>`;
}

function table(t: Table): string {
  const total = t.columns?.reduce((a, b) => a + b, 0) ?? 0;
  const cols = t.columns && total > 0 ? `<colgroup>${t.columns.map((w) => `<col style="width:${round((w / total) * 100)}%"/>`).join('')}</colgroup>` : '';
  const rows = t.rows
    .map((row) => {
      const cells = row
        .map((cell) => {
          const span = cell.colSpan !== undefined && cell.colSpan > 1 ? ` colspan="${Math.round(cell.colSpan)}"` : '';
          const body = cell.paragraphs.length === 1 && cell.paragraphs[0] && !cell.paragraphs[0].heading
            ? inline(cell.paragraphs[0].runs)
            : cell.paragraphs.map((p) => `<p>${inline(p.runs)}</p>`).join('');
          return `<td${span}>${body}</td>`;
        })
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('\n');
  return `<table>${cols}<tbody>\n${rows}\n</tbody></table>`;
}

function image(picture: Picture, src: string): string {
  const w = Math.max(1, Math.round((picture.width * 4) / 3));
  const h = Math.max(1, Math.round((picture.height * 4) / 3));
  return `<img src="${escapeAttr(src)}" alt="" width="${w}" height="${h}"/>`;
}

/** Runs as inline markup, with neighbours that share a link wrapped in one <a>. */
export function inline(runs: readonly Run[]): string {
  let out = '';
  let i = 0;
  while (i < runs.length) {
    const run = runs[i];
    if (!run) break;
    const href = safeHref(run.href);
    if (href === undefined) {
      out += styled(run);
      i++;
      continue;
    }
    let inner = '';
    while (i < runs.length && safeHref(runs[i]?.href) === href) {
      const r = runs[i];
      if (r) inner += styled(r);
      i++;
    }
    out += `<a href="${escapeAttr(href)}">${inner}</a>`;
  }
  return out;
}

/** Only links that go somewhere ordinary: no javascript:, no data:. */
function safeHref(href: string | undefined): string | undefined {
  if (href === undefined || href.trim() === '') return undefined;
  const h = href.trim();
  if (h.startsWith('#') || /^(https?:|mailto:|tel:)/i.test(h)) return h;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(h)) return h;
  return undefined;
}

function styled(run: Run): string {
  let html = escapeText(run.text).replace(/\t/g, ' ').replace(/\n/g, '<br/>');
  if (html === '') return '';
  if (run.family === 'mono') html = `<code>${html}</code>`;
  if (run.underline && run.href === undefined) html = `<u>${html}</u>`;
  if (run.italic) html = `<em>${html}</em>`;
  if (run.bold) html = `<strong>${html}</strong>`;
  const styles: string[] = [];
  if (run.color && !nearBlack(run.color)) styles.push(`color:${run.color}`);
  if (run.family === 'serif') styles.push(`font-family:${CSS_FONT.serif.replace(/"/g, "'")}`);
  if (styles.length > 0) html = `<span style="${escapeAttr(styles.join(';'))}">${html}</span>`;
  return html;
}

/** Text that is black or nearly so is left to the stylesheet, so a dark reading mode still works. */
function nearBlack(color: string): boolean {
  const hex = /^#([0-9a-f]{6})$/i.exec(color)?.[1];
  if (hex === undefined) return true;
  return [0, 2, 4].every((i) => Number.parseInt(hex.slice(i, i + 2), 16) < 0x30);
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

/** The text of runs, with no markup. */
export function plainText(runs: readonly Run[]): string {
  return runs.map((r) => r.text).join('');
}

/** The CSS both writers use. Neutral and small: the reader's settings should win. */
export const BASE_CSS = [
  'h1,h2,h3,h4,h5,h6{line-height:1.25;margin:1.2em 0 .4em}',
  'p{margin:0 0 .8em}',
  '.center{text-align:center}',
  '.right{text-align:right}',
  '.justify{text-align:justify}',
  'table{border-collapse:collapse;margin:0 0 1em;width:100%}',
  'td{border:1px solid #888;padding:.3em .5em;vertical-align:top}',
  'td p{margin:0}',
  'figure{margin:1em 0;text-align:center}',
  'img{max-width:100%;height:auto}',
  'code{font-family:' + CSS_FONT.mono.replace(/"/g, "'") + '}',
  '.page-break{break-after:page;page-break-after:always}',
].join('\n');

/** Standard base64, without the binary-string detour btoa needs. */
export function base64(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const parts: string[] = [];
  let chunk = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    const n = (a << 16) | (b << 8) | c;
    chunk +=
      alphabet.charAt((n >> 18) & 63) +
      alphabet.charAt((n >> 12) & 63) +
      (i + 1 < bytes.length ? alphabet.charAt((n >> 6) & 63) : '=') +
      (i + 2 < bytes.length ? alphabet.charAt(n & 63) : '=');
    if (chunk.length >= 8192) {
      parts.push(chunk);
      chunk = '';
    }
  }
  parts.push(chunk);
  return parts.join('');
}

/**
 * The language most of the text is in, by script, for the lang attribute:
 * it decides how a screen reader pronounces the page and which hyphenation
 * a reading app uses. Latin text is assumed to be English.
 */
export function guessLanguage(text: string): string {
  const scripts: ReadonlyArray<readonly [string, RegExp]> = [
    ['ml', /[ഀ-ൿ]/g],
    ['ta', /[஀-௿]/g],
    ['hi', /[ऀ-ॿ]/g],
    ['kn', /[ಀ-೿]/g],
    ['te', /[ఀ-౿]/g],
    ['bn', /[ঀ-৿]/g],
    ['ar', /[؀-ۿ]/g],
    ['zh', /[一-鿿]/g],
  ];
  const sample = text.slice(0, 20000);
  const latin = (sample.match(/[A-Za-z]/g) ?? []).length;
  let best = 'en';
  let most = latin;
  for (const [lang, pattern] of scripts) {
    const count = (sample.match(pattern) ?? []).length;
    if (count > most) {
      best = lang;
      most = count;
    }
  }
  return best;
}
