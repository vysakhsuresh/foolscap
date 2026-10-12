/**
 * HTML: a FlowDocument as one self-contained web page.
 *
 * One file, nothing fetched: pictures are inlined as data: URIs and the
 * stylesheet sits in the head, so the page can be emailed, opened offline or
 * dropped on any web host and look the same. The style is deliberately plain
 * (the browser's own fonts, a readable measure) so the content leads.
 */
import { base64, BASE_CSS, blocksToHtml, guessLanguage, plainText } from './markup';
import type { FlowDocument } from './model';
import { escapeAttr, escapeText } from './xml';

const PAGE_CSS = [
  'body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;line-height:1.55;color:#1f2328;background:#fff;margin:0}',
  'main{max-width:46em;margin:0 auto;padding:2em 1.25em 4em}',
  'a{color:#0b5cad}',
  '@media print{main{max-width:none;padding:0}}',
].join('\n');

/** Writes the document as a single HTML page. */
export function toHtml(doc: FlowDocument): string {
  const body = blocksToHtml(doc.blocks, {
    imageSrc: (picture) => `data:image/${picture.format};base64,${base64(picture.bytes)}`,
  });
  const text = doc.blocks.map((b) => (b.kind === 'paragraph' ? plainText(b.runs) : '')).join(' ');
  const title = doc.title?.trim() || firstHeading(doc) || 'Document';
  return (
    '<!DOCTYPE html>\n' +
    `<html lang="${escapeAttr(guessLanguage(text))}">\n<head>\n<meta charset="utf-8"/>\n` +
    '<meta name="viewport" content="width=device-width, initial-scale=1"/>\n' +
    `<title>${escapeText(title)}</title>\n<style>\n${PAGE_CSS}\n${BASE_CSS}\n</style>\n</head>\n` +
    `<body>\n<main>\n${body}</main>\n</body>\n</html>\n`
  );
}

/** The first heading's text, which is the best title a document without one has. */
export function firstHeading(doc: FlowDocument): string | undefined {
  for (const block of doc.blocks) {
    if (block.kind === 'paragraph' && block.heading) {
      const text = plainText(block.runs).replace(/\s+/g, ' ').trim();
      if (text) return text.slice(0, 200);
    }
  }
  return undefined;
}
