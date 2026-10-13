/**
 * EPUB: a FlowDocument as an EPUB 3 book, for reading apps and e-readers.
 *
 * The text reflows, so the PDF's page breaks mean nothing here and are
 * dropped; the book is cut into chapters at its top-level headings instead,
 * which is where a reader expects a chapter to start and keeps each file
 * small enough for a cheap e-reader to open quickly. The table of contents
 * is built from the headings, nested by level.
 *
 * The zip layout is the one the standard requires: `mimetype` first and
 * stored uncompressed, so a reader can recognise the file from its first
 * bytes.
 */
import { BASE_CSS, blocksToHtml, guessLanguage, plainText, type MarkupCounters } from './markup';
import { firstHeading } from './html';
import type { Block, FlowDocument, Picture } from './model';
import { zip, type Entry } from './package';
import { escapeAttr, escapeText } from './xml';

const EPUB_CSS = ['body{line-height:1.5}', BASE_CSS].join('\n');

interface Chapter {
  readonly file: string;
  readonly blocks: Block[];
}

interface NavItem {
  readonly level: number;
  readonly text: string;
  readonly href: string;
  readonly children: NavItem[];
}

/** Writes the document as an EPUB 3 book. */
export function toEpub(doc: FlowDocument): Uint8Array {
  const title = doc.title?.trim() || firstHeading(doc) || 'Document';
  const allText = doc.blocks.map((b) => (b.kind === 'paragraph' ? plainText(b.runs) : '')).join(' ');
  const lang = guessLanguage(allText);

  // Chapters start at each top-level heading; page breaks are dropped. A book whose only
  // top-level heading is its title (a report: one title, then numbered sections) is cut
  // at the next level down instead, so it does not come out as one long chapter.
  const levels = doc.blocks.flatMap((b) => (b.kind === 'paragraph' && b.heading !== undefined ? [b.heading] : []));
  const top = levels.length > 0 ? Math.min(...levels) : 1;
  const chapterLevel = levels.filter((l) => l === top).length <= 1 && levels.some((l) => l === top + 1) ? top + 1 : top;
  const chapters: Chapter[] = [];
  let current: Chapter | undefined;
  for (const block of doc.blocks) {
    if (block.kind === 'page-break') continue;
    const startsChapter = block.kind === 'paragraph' && block.heading !== undefined && block.heading <= chapterLevel;
    if (!current || (startsChapter && current.blocks.length > 0)) {
      current = { file: `chapter${chapters.length + 1}.xhtml`, blocks: [] };
      chapters.push(current);
    }
    current.blocks.push(block);
  }
  if (chapters.length === 0) chapters.push({ file: 'chapter1.xhtml', blocks: [] });

  const images: Entry[] = [];
  const manifestImages: string[] = [];
  const nav: NavItem[] = [];
  const stack: NavItem[] = [];
  const counters: MarkupCounters = { images: 0, headings: 0 };
  const files: Entry[] = [];

  for (const chapter of chapters) {
    const firstHeadingIndex = counters.headings;
    const body = blocksToHtml(
      chapter.blocks,
      {
        imageSrc: (picture: Picture, index: number) => {
          const name = `image${index + 1}.${picture.format === 'png' ? 'png' : 'jpg'}`;
          images.push([`OEBPS/images/${name}`, picture.bytes]);
          manifestImages.push(`<item id="img${index + 1}" href="images/${name}" media-type="image/${picture.format}"/>`);
          return `images/${name}`;
        },
        headingId: (index: number) => `h${index + 1}`,
      },
      counters,
    );
    // The table of contents: one entry per heading, nested under the nearest shallower one.
    let headingIndex = firstHeadingIndex;
    for (const block of chapter.blocks) {
      if (block.kind !== 'paragraph' || !block.heading) continue;
      const text = plainText(block.runs).replace(/\s+/g, ' ').trim();
      const item: NavItem = { level: block.heading, text: text || '…', href: `${chapter.file}#h${++headingIndex}`, children: [] };
      while (stack.length > 0 && (stack[stack.length - 1]?.level ?? 0) >= item.level) stack.pop();
      (stack[stack.length - 1]?.children ?? nav).push(item);
      stack.push(item);
    }
    const chapterTitle = chapter.blocks.find((b) => b.kind === 'paragraph' && b.heading);
    files.push([`OEBPS/${chapter.file}`, xhtml(chapterTitle?.kind === 'paragraph' ? plainText(chapterTitle.runs).trim() || title : title, lang, body)]);
  }
  if (nav.length === 0) nav.push({ level: 1, text: title, href: chapters[0]?.file ?? 'chapter1.xhtml', children: [] });

  const navDoc =
    `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n` +
    `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${lang}" xml:lang="${lang}">` +
    `<head><meta charset="utf-8"/><title>${escapeText(title)}</title></head>` +
    `<body><nav epub:type="toc" id="toc"><h1>Contents</h1>${navList(nav)}</nav></body></html>\n`;

  const manifest = [
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '<item id="css" href="style.css" media-type="text/css"/>',
    ...chapters.map((c, i) => `<item id="c${i + 1}" href="${c.file}" media-type="application/xhtml+xml"/>`),
    ...manifestImages,
  ].join('');
  const spine = chapters.map((_, i) => `<itemref idref="c${i + 1}"/>`).join('');
  const modified = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const opf =
    `<?xml version="1.0" encoding="UTF-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="${lang}">` +
    `<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">urn:uuid:${contentId(title + allText)}</dc:identifier>` +
    `<dc:title>${escapeText(title)}</dc:title><dc:language>${lang}</dc:language>` +
    `<meta property="dcterms:modified">${modified}</meta></metadata>` +
    `<manifest>${manifest}</manifest><spine>${spine}</spine></package>\n`;

  const container =
    `<?xml version="1.0" encoding="UTF-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">` +
    `<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>\n`;

  return zip(
    [
      ['mimetype', 'application/epub+zip'],
      ['META-INF/container.xml', container],
      ['OEBPS/content.opf', opf],
      ['OEBPS/nav.xhtml', navDoc],
      ['OEBPS/style.css', EPUB_CSS],
      ...files,
      ...images,
    ],
    new Set(['mimetype']),
  );
}

function xhtml(title: string, lang: string, body: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n` +
    `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${lang}" xml:lang="${lang}">\n` +
    `<head><meta charset="utf-8"/><title>${escapeText(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>\n` +
    `<body>\n${body}</body>\n</html>\n`
  );
}

function navList(items: readonly NavItem[]): string {
  const entries = items.map((item) => `<li><a href="${escapeAttr(item.href)}">${escapeText(item.text)}</a>${item.children.length > 0 ? navList(item.children) : ''}</li>`);
  return `<ol>${entries.join('')}</ol>`;
}

/**
 * A stable identifier made from the book's own text, shaped like a UUID: the
 * same document always gets the same id, so a reading app sees a re-export
 * as the same book, and nothing random or personal goes into it.
 */
function contentId(text: string): string {
  const hashes = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b];
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    for (let k = 0; k < 4; k++) hashes[k] = Math.imul((hashes[k] ?? 0) ^ (c + k * 31), 0x01000193 + k * 2);
  }
  const hex = hashes.map((h) => (h >>> 0).toString(16).padStart(8, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
