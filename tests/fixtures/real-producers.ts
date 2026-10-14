/**
 * Small synthetic PDFs that reproduce what real producers write, found by the
 * real-world sweep (tests/unit/realworld-sweep.test.ts) and kept here so CI
 * catches them without LibreOffice, Chromium or a scanner:
 *
 * - Chrome and LibreOffice wrap each Malayalam or Hindi cluster in
 *   `/Span <</ActualText …>> BDC`, and map the cluster's glyphs to pieces
 *   (U+0000, a vowel sign alone) in the font's ToUnicode;
 * - those glyphs carry a vowel sign (a nonspacing mark) and a real width,
 *   each cluster placed by its own text matrix;
 * - DigiLocker certificates, bank statements and LibreOffice exports are often
 *   PDF/A (an XMP packet with pdfaid:part);
 * - ReportLab wraps every JPEG in ASCII85;
 * - ImageMagick puts a phone photo in a PDF with its EXIF "turn me" flag
 *   still inside, drawn as stored;
 * - reports print a wide table sideways on a portrait page;
 * - ReportLab writes A4 as 595.2756 × 841.8898.
 *
 * Tests may name the libraries: the seam rule applies to app/ only.
 */
import { PDFDocument, PDFHexString, PDFName, PDFRawStream, StandardFonts, type PDFRef } from '@cantoo/pdf-lib';
import { strToU8, zipSync } from 'fflate';
import type { Bytes } from './pdfs';
import { photo, withOrientation } from './realistic';

const fresh = (bytes: Uint8Array): Bytes => new Uint8Array(bytes);

/** UTF-16BE with its byte-order mark, as hex: how producers write /ActualText. */
export function utf16Hex(text: string): string {
  let hex = 'FEFF';
  for (let i = 0; i < text.length; i++) hex += text.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase();
  return hex;
}

/** A ToUnicode CMap mapping single-byte codes to strings. */
function toUnicode(map: Record<string, string>): string {
  const lines = Object.entries(map).map(([code, text]) => `<${code.charCodeAt(0).toString(16).padStart(2, '0')}> <${utf16Hex(text).slice(4)}>`);
  return [
    '/CIDInit /ProcSet findresource begin',
    '12 dict begin',
    'begincmap',
    '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
    '/CMapName /Adobe-Identity-UCS def',
    '/CMapType 2 def',
    '1 begincodespacerange',
    '<00> <FF>',
    'endcodespacerange',
    `${lines.length} beginbfchar`,
    ...lines,
    'endbfchar',
    'endcmap',
    'CMapName currentdict /CMap defineresource pop',
    'end',
    'end',
  ].join('\n');
}

/** A page whose content and resources are written by hand, with Helvetica (optionally with its own ToUnicode) as /F1. */
async function handWritten(
  content: string,
  opts: { toUnicode?: Record<string, string>; size?: [number, number]; extra?: (doc: PDFDocument) => Record<string, PDFRef | Record<string, unknown>> } = {},
): Promise<Bytes> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const page = doc.addPage(opts.size ?? [595.28, 841.89]);
  const { context } = doc;
  const font: Record<string, unknown> = { Type: 'Font', Subtype: 'Type1', BaseFont: 'Helvetica', Encoding: 'WinAnsiEncoding' };
  if (opts.toUnicode) font['ToUnicode'] = context.register(context.stream(toUnicode(opts.toUnicode)));
  const resources: Record<string, unknown> = { Font: { F1: context.register(context.obj(font as never)) }, ...(opts.extra?.(doc) ?? {}) };
  page.node.set(PDFName.of('Resources'), context.obj(resources as never));
  page.node.set(PDFName.of('Contents'), context.register(context.stream(content)));
  return fresh(await doc.save({ useObjectStreams: false }));
}

/**
 * Malayalam the way Chrome and LibreOffice write it: the glyphs map to
 * fragments (or to nothing at all) and each cluster's real text is in
 * /ActualText, inline, through a named property list, and inside a form
 * XObject. Read right, the page says `MALAYALAM_LINES`.
 */
export const MALAYALAM_LINES = ['ഗ്രാമ പഞ്ചായത്ത്', 'കേരളം'] as const;

export async function actualTextPdf(): Promise<Bytes> {
  // X, Y and Z are the glyphs of the cluster: Y maps to U+0000 as Chrome writes it, Z to a vowel sign alone.
  const map = { X: 'ഗ', Y: '\u0000', Z: 'ാ', Q: 'പ', R: 'ഞ', S: 'ത', K: 'െ', L: 'ക', M: 'ര' };
  const span = (text: string, glyphs: string) => `/Span <</ActualText <${utf16Hex(text)}>>> BDC (${glyphs}) Tj EMC`;
  const content = [
    'BT /F1 24 Tf 72 700 Td',
    span('ഗ്രാ', 'XYZ'),
    span('മ', 'Q'),
    '( ) Tj',
    '/Span /MC0 BDC (QRS) Tj EMC',
    'ET',
    '/Fm1 Do',
  ].join('\n');
  return handWritten(content, {
    toUnicode: map,
    extra: (doc) => {
      const { context } = doc;
      const fontRef = context.register(context.obj({ Type: 'Font', Subtype: 'Type1', BaseFont: 'Helvetica', Encoding: 'WinAnsiEncoding', ToUnicode: context.register(context.stream(toUnicode(map))) }));
      const form = context.stream(['BT /F1 24 Tf 72 640 Td', `/Span <</ActualText <${utf16Hex('കേരളം')}>>> BDC (KLM) Tj EMC`, 'ET'].join('\n'), {
        Type: 'XObject',
        Subtype: 'Form',
        BBox: [0, 0, 595.28, 841.89],
        Resources: { Font: { F1: fontRef } },
      });
      return {
        Properties: { MC0: context.obj({ ActualText: PDFHexString.of(utf16Hex('പഞ്ചായത്ത്')) }) },
        XObject: { Fm1: context.register(form) },
      };
    },
  });
}

/**
 * A Malayalam word drawn the way LibreOffice draws it: each glyph placed by
 * its own text matrix at its real width, and one glyph ("ഹു", a consonant
 * with its vowel sign) carrying a nonspacing mark. pdf.js used to give that
 * glyph no width and read a space after it.
 */
export const MARKED_WORD = 'ബഹുമാനം';

export async function markWidthPdf(): Promise<Bytes> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const glyphs: Array<[string, string]> = [
    ['E', 'ബ'],
    ['A', 'ഹു'],
    ['B', 'മ'],
    ['C', 'ാ'],
    ['F', 'ന'],
    ['G', 'ം'],
  ];
  let x = 72;
  const parts = ['BT /F1 24 Tf'];
  for (const [code] of glyphs) {
    parts.push(`1 0 0 1 ${x.toFixed(2)} 700 Tm (${code}) Tj`);
    x += helvetica.widthOfTextAtSize(code, 24);
  }
  parts.push('ET');
  return handWritten(parts.join('\n'), { toUnicode: Object.fromEntries(glyphs) });
}

/** A document that says it is PDF/A-2b, as DigiLocker and LibreOffice's archive export do. */
export async function pdfaPdf(): Promise<Bytes> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const page = doc.addPage([595.28, 841.89]);
  page.drawText('Certificate of registration', { x: 72, y: 760, size: 18, font: await doc.embedFont(StandardFonts.Helvetica) });
  const xmp = [
    '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>',
    '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
    '<rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/" pdfaid:part="2" pdfaid:conformance="B"/>',
    '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title><rdf:Alt><rdf:li xml:lang="x-default">Registration</rdf:li></rdf:Alt></dc:title></rdf:Description>',
    '</rdf:RDF></x:xmpmeta>',
    '<?xpacket end="w"?>',
  ].join('\n');
  doc.catalog.set(PDFName.of('Metadata'), doc.context.register(doc.context.stream(xmp, { Type: 'Metadata', Subtype: 'XML' })));
  return fresh(await doc.save());
}

/** ASCII85, as PDF's ASCII85Decode reads it, ending with ~>. */
export function ascii85(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 4) {
    const chunk = [bytes[i] ?? 0, bytes[i + 1] ?? 0, bytes[i + 2] ?? 0, bytes[i + 3] ?? 0];
    const n = Math.min(4, bytes.length - i);
    let value = ((chunk[0]! << 24) | (chunk[1]! << 16) | (chunk[2]! << 8) | chunk[3]!) >>> 0;
    if (value === 0 && n === 4) {
      out += 'z';
      continue;
    }
    const digits: string[] = [];
    for (let k = 0; k < 5; k++) {
      digits.unshift(String.fromCharCode(33 + (value % 85)));
      value = Math.floor(value / 85);
    }
    out += digits.slice(0, n + 1).join('');
  }
  return `${out}~>`;
}

/** A JPEG drawn over the whole page, stored with the given filters (raw bytes as given). */
async function imagePage(stored: Uint8Array | string, filter: string[], width: number, height: number, page: [number, number]): Promise<Bytes> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const p = doc.addPage(page);
  const { context } = doc;
  const image = PDFRawStream.of(
    context.obj({ Type: 'XObject', Subtype: 'Image', Width: width, Height: height, ColorSpace: 'DeviceRGB', BitsPerComponent: 8, Filter: filter.map((f) => PDFName.of(f)) }),
    typeof stored === 'string' ? new TextEncoder().encode(stored) : stored,
  );
  const ref = context.register(image);
  p.node.set(PDFName.of('Resources'), context.obj({ XObject: { Im0: ref } } as never));
  p.node.set(PDFName.of('Contents'), context.register(context.stream(`q ${page[0]} 0 0 ${page[1]} 0 0 cm /Im0 Do Q`)));
  return fresh(await doc.save({ useObjectStreams: false }));
}

/** A photo wrapped in ASCII85, as ReportLab writes every JPEG: a quarter bigger than the JPEG itself. */
export async function ascii85JpegPdf(): Promise<{ bytes: Bytes; jpeg: Bytes }> {
  const jpeg = photo(1200, 1600, { format: 'jpeg', quality: 0.95 });
  return { bytes: await imagePage(ascii85(jpeg), ['ASCII85Decode', 'DCTDecode'], 1200, 1600, [595.28, 793.71]), jpeg };
}

/**
 * A phone photo as ImageMagick puts it in a PDF: stored sideways, its EXIF
 * flag still inside, drawn as stored (4000 × 3000 into a page the same
 * shape). A reader ignores the flag; so must anything that re-encodes it.
 */
export async function exifPhotoPdf(): Promise<Bytes> {
  const jpeg = withOrientation(photo(1600, 1200, { format: 'jpeg', quality: 0.95, top: '#d02020' }), 6);
  return imagePage(jpeg, ['DCTDecode'], 1600, 1200, [1600 * 0.36, 1200 * 0.36]);
}

/** A wide table printed sideways on a portrait page: its words run up the page as it is shown. */
export const SIDEWAYS_ROWS = [
  ['District', 'April', 'May', 'June'],
  ['Kollam', '120', '135', '150'],
  ['Thrissur', '210', '190', '205'],
] as const;

export async function sidewaysTablePdf(): Promise<Bytes> {
  const lines = ['BT /F1 16 Tf 72 790 Td (Annexure II) Tj ET', 'q', '0 1 -1 0 500 120 cm', 'BT /F1 12 Tf'];
  SIDEWAYS_ROWS.forEach((row, r) => row.forEach((cell, c) => lines.push(`1 0 0 1 ${c * 120} ${-r * 24} Tm (${cell}) Tj`)));
  lines.push('ET', 'Q');
  return handWritten(lines.join('\n'));
}

/** A page ReportLab-sized (595.2756 × 841.8898) with words on it, for slides made editable. */
export async function reportlabSizedPdf(): Promise<Bytes> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const page = doc.addPage([595.2756, 841.8898]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('KYC Update Form', { x: 72, y: 760, size: 20, font });
  page.drawText('Customer name and account number', { x: 72, y: 720, size: 11, font });
  return fresh(await doc.save());
}

/**
 * A .docx shaped the way LibreOffice and python-docx write one: headings tied
 * to an outline numbering that shows nothing (numFmt none), a first section
 * in portrait carrying the header, a last section turned landscape that names
 * no header of its own (so Word carries the first one on), and a résumé-style
 * table with a photo in a cell.
 */
export function officeDocx(): Bytes {
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
  const p = (text: string, style?: string) => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
  const drawing = `<w:p><w:r><w:drawing><wp:inline><wp:extent cx="1440000" cy="1080000"/><wp:docPr id="1" name="Photo"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="photo.jpg"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdPhoto"/></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1440000" cy="1080000"/></a:xfrm><a:prstGeom prst="rect"/></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
  const body = [
    p('Arun Das', 'Heading1'),
    p('Civil engineer, six years on site.'),
    p('Experience', 'Heading2'),
    `<w:tbl><w:tblGrid><w:gridCol w:w="2800"/><w:gridCol w:w="6000"/></w:tblGrid><w:tr><w:tc>${drawing}${p('CONTACT')}</w:tc><w:tc>${p('Site Engineer, Malabar Builders')}</w:tc></w:tr></w:tbl>`,
    `<w:p><w:pPr><w:sectPr><w:headerReference w:type="default" r:id="rIdHeader"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:pPr></w:p>`,
    p('Annexure', 'Heading1'),
    p('Projects by year.'),
    `<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr>`,
  ].join('');
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/></Types>',
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    ),
    'word/_rels/document.xml.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdNum" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rIdPhoto" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/photo.jpeg"/></Relationships>',
    ),
    'word/document.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${body}</w:body></w:document>`),
    'word/styles.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:sz w:val="22"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="Heading 1"/><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="Heading 2"/><w:pPr><w:numPr><w:ilvl w:val="1"/><w:numId w:val="1"/></w:numPr><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style></w:styles>`,
    ),
    'word/numbering.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering ${W}><w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:pStyle w:val="Heading1"/><w:numFmt w:val="none"/><w:suff w:val="nothing"/><w:lvlText w:val=""/></w:lvl><w:lvl w:ilvl="1"><w:start w:val="1"/><w:pStyle w:val="Heading2"/><w:numFmt w:val="none"/><w:suff w:val="nothing"/><w:lvlText w:val=""/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num></w:numbering>`,
    ),
    'word/header1.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${W}><w:p><w:r><w:t>Malabar Builders (fictional) – résumé</w:t></w:r></w:p></w:hdr>`),
    'word/media/photo.jpeg': photo(400, 300, { format: 'jpeg', quality: 0.8 }),
  };
  return fresh(zipSync(files));
}

/**
 * Sections as LibreOffice writes a page whose second half is in two columns:
 * the first section's sectPr has no type, the two-column one says
 * "continuous" (it starts on the same page), and the last starts a new page.
 */
export function columnsDocx(): Bytes {
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const p = (text: string, sect = '') => `<w:p>${sect ? `<w:pPr>${sect}</w:pPr>` : ''}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
  const size = '<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/>';
  const body = [
    p('Groundwater study', `<w:sectPr>${size}</w:sectPr>`),
    p('Findings in two columns', `<w:sectPr><w:type w:val="continuous"/>${size}<w:cols w:num="2" w:space="454"/></w:sectPr>`),
    p('Annexure on its own page'),
    `<w:sectPr>${size}</w:sectPr>`,
  ].join('');
  return fresh(
    zipSync({
      '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
      '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
      'word/document.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?><w:document ${W}><w:body>${body}</w:body></w:document>`),
    }),
  );
}
