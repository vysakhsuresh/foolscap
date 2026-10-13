/**
 * Word: a FlowDocument written as a .docx, and a .docx read back into one.
 *
 * The writer uses Word's own built-in styles (Heading 1–6, List Paragraph,
 * Table Grid, Hyperlink) rather than formatting every paragraph by hand, so
 * the result behaves like a document somebody typed: the navigation pane
 * shows the headings, a numbered list renumbers itself, and changing a style
 * changes every paragraph that uses it. Each run still carries its own size,
 * so the page looks like the PDF it came from.
 *
 * The reader takes what the model can hold and skips everything else without
 * complaint: tracked deletions, comments, fields' instructions, shapes it
 * does not know. A Word file that came from anywhere should open. Footnotes
 * and endnotes are numbered where they are referred to and gathered under
 * "Notes" at the end; headers and footers go with the pages.
 */
import { familyOf, normaliseColor, WORD_FONT, type Family } from './fonts';
import { PAGE_COUNT, PAGE_NUMBER, type Block, type FlowDocument, type PageFurniture, type Paragraph, type Picture, type Run, type Table, type TableCell } from './model';
import {
  contentTypes,
  CORE_TYPE,
  coreProperties,
  EMU_PER_POINT,
  imageFormat,
  Package,
  REL,
  relationships,
  type Entry,
  type RelSpec,
  zip,
} from './package';
import { attr, child, descendants, elements, escapeAttr, escapeText, textOf, XML_DECLARATION, type XmlElement } from './xml';

/** A4 in points, and Word's usual inch of margin, for a document that does not say. */
export const A4 = { width: 595.28, height: 841.89, margin: 72 } as const;

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const WP_NS = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const PIC_NS = 'http://schemas.openxmlformats.org/drawingml/2006/picture';
const WML = 'application/vnd.openxmlformats-officedocument.wordprocessingml';

const twips = (points: number) => Math.round(points * 20);

// =====================================================================
// Writing
// =====================================================================

/** Writes the document as a .docx. */
export function toDocx(doc: FlowDocument): Uint8Array {
  return new DocxWriter(doc).build();
}

class DocxWriter {
  private readonly rels: RelSpec[] = [
    { id: 'rId1', type: REL.styles, target: 'styles.xml' },
    { id: 'rId2', type: REL.numbering, target: 'numbering.xml' },
    { id: 'rId3', type: REL.settings, target: 'settings.xml' },
  ];
  private readonly media: Entry[] = [];
  private readonly links = new Map<string, string>();
  /** One numbering instance per ordered list, so each starts again from 1. */
  private orderedNums = 0;
  private drawingId = 0;
  private readonly page: { width: number; height: number; margin: number };

  constructor(private readonly doc: FlowDocument) {
    const page = doc.page ?? A4;
    const margin = Math.max(0, Math.min(page.margin, page.width / 3, page.height / 3));
    this.page = { width: Math.max(72, page.width), height: Math.max(72, page.height), margin };
  }

  build(): Uint8Array {
    const body = this.blocks(this.doc.blocks);
    const { width, height, margin } = this.page;
    const sect =
      `<w:sectPr><w:pgSz w:w="${twips(width)}" w:h="${twips(height)}"${width > height ? ' w:orient="landscape"' : ''}/>` +
      `<w:pgMar w:top="${twips(margin)}" w:right="${twips(margin)}" w:bottom="${twips(margin)}" w:left="${twips(margin)}" w:header="${twips(Math.min(36, margin))}" w:footer="${twips(Math.min(36, margin))}" w:gutter="0"/></w:sectPr>`;
    const document =
      `${XML_DECLARATION}<w:document xmlns:w="${W_NS}" xmlns:r="${R_NS}" xmlns:wp="${WP_NS}" xmlns:a="${A_NS}" xmlns:pic="${PIC_NS}">` +
      `<w:body>${body}${sect}</w:body></w:document>`;

    const core = coreProperties(this.doc.title);
    const packageRels: RelSpec[] = [{ id: 'rId1', type: REL.officeDocument, target: 'word/document.xml' }];
    if (core) packageRels.push({ id: 'rId2', type: REL.core, target: 'docProps/core.xml' });
    const overrides: Array<[string, string]> = [
      ['/word/document.xml', `${WML}.document.main+xml`],
      ['/word/styles.xml', `${WML}.styles+xml`],
      ['/word/numbering.xml', `${WML}.numbering+xml`],
      ['/word/settings.xml', `${WML}.settings+xml`],
    ];
    if (core) overrides.push(['/docProps/core.xml', CORE_TYPE]);

    const entries: Entry[] = [
      ['[Content_Types].xml', contentTypes(overrides)],
      ['_rels/.rels', relationships(packageRels)],
      ['word/document.xml', document],
      ['word/_rels/document.xml.rels', relationships(this.rels)],
      ['word/styles.xml', STYLES],
      ['word/numbering.xml', this.numbering()],
      ['word/settings.xml', SETTINGS],
      ...this.media,
    ];
    if (core) entries.push(['docProps/core.xml', core]);
    return zip(entries);
  }

  private get textWidth(): number {
    return Math.max(72, this.page.width - 2 * this.page.margin);
  }

  /**
   * Blocks in order. Two tables in a row would melt into one in Word, and a
   * body may not end on a table, so a hairline paragraph goes between and
   * after; the reader knows to ignore it.
   */
  private blocks(blocks: readonly Block[]): string {
    let out = '';
    let ordered: number | undefined;
    let previous: Block['kind'] | undefined;
    for (const block of blocks) {
      if (block.kind !== 'paragraph' || !block.list) ordered = undefined;
      if (block.kind === 'table' && previous === 'table') out += SPACER;
      switch (block.kind) {
        case 'paragraph': {
          let numId: number | undefined;
          if (block.list) {
            if (block.list.ordered) ordered ??= this.newOrderedList();
            numId = block.list.ordered ? ordered : 1;
          }
          out += this.paragraph(block, numId);
          break;
        }
        case 'table':
          out += this.table(block);
          break;
        case 'image':
          out += `<w:p>${this.picture(block, this.textWidth, this.page.height - 2 * this.page.margin)}</w:p>`;
          break;
        case 'page-break':
          out += '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
          break;
      }
      previous = block.kind;
    }
    if (previous === 'table') out += SPACER;
    return out;
  }

  private newOrderedList(): number {
    this.orderedNums++;
    return this.orderedNums + 1;
  }

  private paragraph(p: Paragraph, numId: number | undefined): string {
    let props = '';
    if (p.heading) props += `<w:pStyle w:val="Heading${p.heading}"/>`;
    else if (p.list) props += '<w:pStyle w:val="ListParagraph"/>';
    if (p.list && numId !== undefined) {
      props += `<w:numPr><w:ilvl w:val="${clamp(Math.round(p.list.level), 0, 8)}"/><w:numId w:val="${numId}"/></w:numPr>`;
    }
    if (p.spaceBefore !== undefined && p.spaceBefore > 0) props += `<w:spacing w:before="${twips(p.spaceBefore)}"/>`;
    if (!p.list && p.indent !== undefined && p.indent > 0) props += `<w:ind w:left="${twips(p.indent)}"/>`;
    if (p.align && p.align !== 'left') props += `<w:jc w:val="${p.align === 'justify' ? 'both' : p.align}"/>`;
    return `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ''}${this.runs(p.runs)}</w:p>`;
  }

  /** Runs, with neighbours that share a link wrapped in one hyperlink. */
  private runs(runs: readonly Run[]): string {
    let out = '';
    let i = 0;
    while (i < runs.length) {
      const run = runs[i];
      if (!run) break;
      if (run.href === undefined || run.href === '') {
        out += runXml(run, false);
        i++;
        continue;
      }
      const href = run.href;
      let inner = '';
      while (i < runs.length && runs[i]?.href === href) {
        const linked = runs[i];
        if (linked) inner += runXml(linked, true);
        i++;
      }
      out += href.startsWith('#')
        ? `<w:hyperlink w:anchor="${escapeAttr(href.slice(1))}" w:history="1">${inner}</w:hyperlink>`
        : `<w:hyperlink r:id="${this.link(href)}" w:history="1">${inner}</w:hyperlink>`;
    }
    return out;
  }

  private link(href: string): string {
    const known = this.links.get(href);
    if (known) return known;
    const id = `rId${this.rels.length + 1}`;
    this.rels.push({ id, type: REL.hyperlink, target: href, external: true });
    this.links.set(href, id);
    return id;
  }

  private table(table: Table): string {
    const columnCount = Math.max(1, ...table.rows.map((row) => row.reduce((n, cell) => n + span(cell), 0)));
    const widths = columnWidths(table.columns, columnCount, this.textWidth);
    const grid = widths.map((w) => `<w:gridCol w:w="${twips(w)}"/>`).join('');
    const total = widths.reduce((a, b) => a + b, 0);
    let rows = '';
    for (const row of table.rows) {
      let cells = '';
      let column = 0;
      for (const cell of row) {
        const s = Math.min(span(cell), columnCount - column);
        if (s <= 0) break;
        const width = widths.slice(column, column + s).reduce((a, b) => a + b, 0);
        cells += this.cell(cell.paragraphs, width, s);
        column += s;
      }
      // A short row is filled out with empty cells so every row meets the grid.
      for (; column < columnCount; column++) cells += this.cell([], widths[column] ?? 0, 1);
      rows += `<w:tr>${cells}</w:tr>`;
    }
    return (
      `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="${twips(total)}" w:type="dxa"/>` +
      `<w:tblLayout w:type="fixed"/><w:tblLook w:val="04A0"/></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${rows}</w:tbl>`
    );
  }

  private cell(paragraphs: readonly Paragraph[], width: number, gridSpan: number): string {
    const props = `<w:tcPr><w:tcW w:w="${twips(width)}" w:type="dxa"/>${gridSpan > 1 ? `<w:gridSpan w:val="${gridSpan}"/>` : ''}</w:tcPr>`;
    let ordered: number | undefined;
    let body = '';
    for (const p of paragraphs) {
      if (!p.list) ordered = undefined;
      else if (p.list.ordered) ordered ??= this.newOrderedList();
      body += this.paragraph(p, p.list ? (p.list.ordered ? ordered : 1) : undefined);
    }
    // Every cell must hold at least one paragraph.
    return `<w:tc>${props}${body || '<w:p/>'}</w:tc>`;
  }

  /** An inline picture, shrunk to fit the text area if it would not. */
  private picture(picture: Picture, maxWidth: number, maxHeight: number): string {
    const n = this.media.length + 1;
    const ext = picture.format === 'png' ? 'png' : 'jpeg';
    const name = `image${n}.${ext}`;
    this.media.push([`word/media/${name}`, picture.bytes]);
    const id = `rId${this.rels.length + 1}`;
    this.rels.push({ id, type: REL.image, target: `media/${name}` });
    const scale = Math.min(1, maxWidth / Math.max(1, picture.width), Math.max(72, maxHeight) / Math.max(1, picture.height));
    const cx = Math.max(1, Math.round(picture.width * scale * EMU_PER_POINT));
    const cy = Math.max(1, Math.round(picture.height * scale * EMU_PER_POINT));
    const docPr = ++this.drawingId;
    return (
      `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/>` +
      `<wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${docPr}" name="Picture ${docPr}"/>` +
      `<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
      `<a:graphic><a:graphicData uri="${PIC_NS}"><pic:pic><pic:nvPicPr><pic:cNvPr id="${docPr}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr>` +
      `<pic:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
      `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
      `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`
    );
  }

  private numbering(): string {
    let bullets = '';
    let numbers = '';
    for (let level = 0; level < 9; level++) {
      const indent = `<w:pPr><w:ind w:left="${720 * (level + 1)}" w:hanging="360"/></w:pPr>`;
      bullets += `<w:lvl w:ilvl="${level}"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="${BULLETS[level % 3]}"/><w:lvlJc w:val="left"/>${indent}</w:lvl>`;
      numbers += `<w:lvl w:ilvl="${level}"><w:start w:val="1"/><w:numFmt w:val="${NUMBER_FORMATS[level % 3]}"/><w:lvlText w:val="%${level + 1}."/><w:lvlJc w:val="left"/>${indent}</w:lvl>`;
    }
    let nums = '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>';
    for (let i = 0; i < this.orderedNums; i++) {
      nums += `<w:num w:numId="${i + 2}"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>`;
    }
    return (
      `${XML_DECLARATION}<w:numbering xmlns:w="${W_NS}">` +
      `<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>${bullets}</w:abstractNum>` +
      `<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${numbers}</w:abstractNum>` +
      `${nums}</w:numbering>`
    );
  }
}

const BULLETS = ['•', '◦', '▪'] as const;
const NUMBER_FORMATS = ['decimal', 'lowerLetter', 'lowerRoman'] as const;

/** A one-point empty paragraph: the least Word needs between two tables. */
const SPACER = '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/><w:rPr><w:sz w:val="2"/></w:rPr></w:pPr></w:p>';

function span(cell: TableCell): number {
  return Math.max(1, Math.round(cell.colSpan ?? 1));
}

function clamp(n: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, n));
}

/** The table's own widths when it has them, scaled down to the text area if wider; equal shares otherwise. */
function columnWidths(columns: readonly number[] | undefined, count: number, textWidth: number): number[] {
  if (columns && columns.length === count && columns.every((w) => w > 0)) {
    const total = columns.reduce((a, b) => a + b, 0);
    const scale = total > textWidth ? textWidth / total : 1;
    return columns.map((w) => Math.max(10, w * scale));
  }
  return Array.from({ length: count }, () => textWidth / count);
}

function runXml(run: Run, linked: boolean): string {
  let props = '';
  if (linked) props += '<w:rStyle w:val="Hyperlink"/>';
  if (run.family) {
    const face = WORD_FONT[run.family];
    props += `<w:rFonts w:ascii="${face}" w:hAnsi="${face}"/>`;
  }
  if (run.bold) props += '<w:b/><w:bCs/>';
  if (run.italic) props += '<w:i/><w:iCs/>';
  const color = normaliseColor(run.color);
  if (color) props += `<w:color w:val="${color.slice(1).toUpperCase()}"/>`;
  if (Number.isFinite(run.size) && run.size > 0) {
    const half = clamp(Math.round(run.size * 2), 2, 3276);
    props += `<w:sz w:val="${half}"/><w:szCs w:val="${half}"/>`;
  }
  if (run.underline) props += '<w:u w:val="single"/>';
  let content = '';
  for (const piece of run.text.split(/(\n|\t)/)) {
    if (piece === '\n') content += '<w:br/>';
    else if (piece === '\t') content += '<w:tab/>';
    else if (piece !== '') content += `<w:t xml:space="preserve">${escapeText(piece)}</w:t>`;
  }
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}${content}</w:r>`;
}

function headingStyle(level: number, halfPoints: number, italic: boolean): string {
  return (
    `<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/><w:basedOn w:val="Normal"/>` +
    `<w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/>` +
    `<w:spacing w:before="${level <= 2 ? 360 : 240}" w:after="120"/><w:outlineLvl w:val="${level - 1}"/></w:pPr>` +
    `<w:rPr><w:b/><w:bCs/>${italic ? '<w:i/><w:iCs/>' : ''}<w:sz w:val="${halfPoints}"/><w:szCs w:val="${halfPoints}"/></w:rPr></w:style>`
  );
}

const BORDERS = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
  .map((side) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="auto"/>`)
  .join('');

const STYLES =
  `${XML_DECLARATION}<w:styles xmlns:w="${W_NS}">` +
  `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:eastAsia="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>` +
  `<w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault>` +
  `<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>` +
  `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>` +
  [40, 32, 28, 24, 22, 22].map((size, i) => headingStyle(i + 1, size, i === 5)).join('') +
  `<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/>` +
  `<w:uiPriority w:val="34"/><w:qFormat/><w:pPr><w:ind w:left="720"/><w:contextualSpacing/></w:pPr></w:style>` +
  `<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/>` +
  `<w:uiPriority w:val="1"/><w:semiHidden/><w:unhideWhenUsed/></w:style>` +
  `<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:basedOn w:val="DefaultParagraphFont"/>` +
  `<w:uiPriority w:val="99"/><w:unhideWhenUsed/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>` +
  `<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/>` +
  `<w:semiHidden/><w:unhideWhenUsed/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/>` +
  `<w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>` +
  `<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:basedOn w:val="TableNormal"/><w:uiPriority w:val="39"/>` +
  `<w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:tblPr><w:tblBorders>${BORDERS}</w:tblBorders></w:tblPr></w:style>` +
  `<w:style w:type="numbering" w:default="1" w:styleId="NoList"><w:name w:val="No List"/><w:uiPriority w:val="99"/>` +
  `<w:semiHidden/><w:unhideWhenUsed/></w:style></w:styles>`;

const SETTINGS =
  `${XML_DECLARATION}<w:settings xmlns:w="${W_NS}"><w:defaultTabStop w:val="720"/>` +
  `<w:characterSpacingControl w:val="doNotCompress"/><w:compat>` +
  `<w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/>` +
  `</w:compat></w:settings>`;

// =====================================================================
// Reading
// =====================================================================

interface RunStyle {
  size?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string | null;
  family?: Family | null;
}

interface StyleDef {
  readonly type: string;
  readonly name: string;
  readonly basedOn?: string;
  readonly pPr?: XmlElement;
  readonly rPr?: XmlElement;
}

interface ParaStyle {
  readonly heading?: Paragraph['heading'];
  readonly numId?: string;
  readonly ilvl?: number;
  readonly align?: Paragraph['align'];
  readonly run: RunStyle;
}

/** Reads a .docx into the model. Throws only when the file is not a Word document at all. */
export function fromDocx(bytes: Uint8Array): FlowDocument {
  const pkg = new Package(bytes);
  const mainPath = pkg.main('/officeDocument') ?? 'word/document.xml';
  const root = pkg.xml(mainPath);
  const body = child(root, 'body');
  if (!root || !body) throw new Error("This file doesn't hold a Word document.");
  const rels = pkg.rels(mainPath);
  const partOf = (suffix: string, fallback: string) => [...rels.values()].find((r) => r.type.endsWith(suffix) && !r.external)?.target ?? fallback;
  const reader = new DocxReader(pkg, rels, pkg.xml(partOf('/styles', 'word/styles.xml')), pkg.xml(partOf('/numbering', 'word/numbering.xml')));

  const blocks: Block[] = [];
  reader.container(body, blocks);
  while (blocks[blocks.length - 1]?.kind === 'page-break') blocks.pop();
  // Footnotes and endnotes, in the order they were referred to, under one heading at the end.
  if (reader.notes.length > 0) {
    const parts = { footnote: partOf('/footnotes', 'word/footnotes.xml'), endnote: partOf('/endnotes', 'word/endnotes.xml') };
    const notes: Block[] = [];
    for (const note of reader.notes) {
      const path = parts[note.kind];
      const root = pkg.xml(path);
      const el = elements(root, note.kind).find((n) => attr(n, 'id') === note.id);
      if (!el) continue;
      const inner: Block[] = [];
      new DocxReader(pkg, pkg.rels(path), pkg.xml(partOf('/styles', 'word/styles.xml')), pkg.xml(partOf('/numbering', 'word/numbering.xml'))).container(el, inner);
      let numbered = false;
      for (const b of inner) {
        if (b.kind !== 'paragraph') continue;
        const runs = b.runs.filter((r) => r.text !== '');
        // Word puts a space after the note's own number; the number here brings its own.
        if (!numbered && runs[0]) runs[0] = { ...runs[0], text: runs[0].text.trimStart() };
        if (runs.length === 0 || runs.every((r) => r.text === '')) continue;
        const size = Math.min(...runs.map((r) => r.size));
        notes.push({ kind: 'paragraph', runs: numbered ? runs : [{ text: `[${note.n}] `, size }, ...runs.map((r) => ({ ...r, size }))] });
        numbered = true;
      }
    }
    if (notes.length > 0) blocks.push({ kind: 'paragraph', heading: 2, spaceBefore: 18, runs: [{ text: 'Notes', size: 13, bold: true }] }, ...notes);
  }

  const sections = descendants(body, 'sectPr');
  const sect = elements(body, 'sectPr').pop() ?? sections[sections.length - 1];
  const page = pageOf(sect);
  const title = textOf(firstDescendant(pkg.xml('docProps/core.xml'), 'title')).trim();
  const furniture = furnitureOf(pkg, rels, sect, pkg.xml(partOf('/styles', 'word/styles.xml')), pkg.xml(partOf('/numbering', 'word/numbering.xml')));
  return { ...(title ? { title } : {}), ...(page ? { page } : {}), blocks, ...(furniture ? { furniture } : {}) };
}

/**
 * The section's headers and footers: the default ones, and the first page's
 * own when the section asks for a different first page (often none at all,
 * under a letterhead). Each part is read with its own relationships, so a
 * logo in a header is found.
 */
function furnitureOf(
  pkg: Package,
  rels: ReturnType<Package['rels']>,
  sect: XmlElement | undefined,
  styles: XmlElement | undefined,
  numbering: XmlElement | undefined,
): FlowDocument['furniture'] {
  const part = (kind: 'header' | 'footer', type: 'default' | 'first'): Block[] | undefined => {
    const ref = elements(sect, `${kind}Reference`).find((r) => (attr(r, 'type') ?? 'default') === type);
    const id = attr(ref, 'id', 'relationships');
    const rel = id !== undefined ? rels.get(id) : undefined;
    if (!rel || rel.external) return undefined;
    const root = pkg.xml(rel.target);
    if (!root) return undefined;
    const blocks: Block[] = [];
    new DocxReader(pkg, pkg.rels(rel.target), styles, numbering).container(root, blocks);
    const kept = blocks.filter((b) => b.kind !== 'page-break');
    return kept.length > 0 ? kept : undefined;
  };
  const furniture = (type: 'default' | 'first'): PageFurniture => {
    const header = part('header', type);
    const footer = part('footer', type);
    return { ...(header ? { header } : {}), ...(footer ? { footer } : {}) };
  };
  const every = furniture('default');
  const firstDiffers = child(sect, 'titlePg') !== undefined && isOn(attr(child(sect, 'titlePg'), 'val') ?? 'true');
  const first = firstDiffers ? furniture('first') : undefined;
  if (!every.header && !every.footer && !first?.header && !first?.footer) return undefined;
  return { every, ...(first ? { first } : {}) };
}

function firstDescendant(el: XmlElement | undefined, local: string): XmlElement | undefined {
  return el ? descendants(el, local)[0] : undefined;
}

function pageOf(sect: XmlElement | undefined): FlowDocument['page'] {
  const size = child(sect, 'pgSz');
  const w = Number(attr(size, 'w'));
  const h = Number(attr(size, 'h'));
  if (!(w > 0 && h > 0)) return undefined;
  const mar = child(sect, 'pgMar');
  const left = Number(attr(mar, 'left') ?? attr(mar, 'start'));
  const margin = Number.isFinite(left) && left >= 0 ? left / 20 : 72;
  return { width: w / 20, height: h / 20, margin };
}

/** A field's state while its runs go by: instruction text first, then the result people see. */
interface Field {
  instr: string;
  showing: boolean;
  /** For a page-number field: whether its stand-in has gone out yet. */
  placed?: boolean;
}

/** The stand-in a field's result becomes when it is a page number or a page count, which only the laid-out page knows. */
function pageField(instr: string): string | undefined {
  if (/^\s*PAGE\b/i.test(instr)) return PAGE_NUMBER;
  if (/^\s*(NUMPAGES|SECTIONPAGES)\b/i.test(instr)) return PAGE_COUNT;
  return undefined;
}

class DocxReader {
  private readonly styles = new Map<string, StyleDef>();
  private readonly resolved = new Map<string, ParaStyle>();
  private readonly charResolved = new Map<string, RunStyle>();
  private readonly defaults: RunStyle;
  private readonly defaultParaStyle: string | undefined;
  /** numId → level → is it a bullet list? */
  private readonly numbering = new Map<string, Map<number, boolean>>();
  private fields: Field[] = [];
  /** Footnotes and endnotes referred to so far, numbered in the order they appear. */
  readonly notes: Array<{ readonly kind: 'footnote' | 'endnote'; readonly id: string; readonly n: number }> = [];

  constructor(
    private readonly pkg: Package,
    private readonly rels: ReturnType<Package['rels']>,
    styles: XmlElement | undefined,
    numbering: XmlElement | undefined,
  ) {
    let defaultPara: string | undefined;
    for (const s of elements(styles, 'style')) {
      const id = attr(s, 'styleId');
      if (id === undefined) continue;
      const type = attr(s, 'type') ?? 'paragraph';
      const basedOn = attr(child(s, 'basedOn'), 'val');
      const pPr = child(s, 'pPr');
      const rPr = child(s, 'rPr');
      this.styles.set(id, {
        type,
        name: attr(child(s, 'name'), 'val') ?? id,
        ...(basedOn !== undefined ? { basedOn } : {}),
        ...(pPr ? { pPr } : {}),
        ...(rPr ? { rPr } : {}),
      });
      if (type === 'paragraph' && isOn(attr(s, 'default'))) defaultPara = id;
    }
    this.defaultParaStyle = defaultPara;
    this.defaults = { size: 10, ...runProps(child(child(child(styles, 'docDefaults'), 'rPrDefault'), 'rPr')) };
    this.readNumbering(numbering);
  }

  private readNumbering(numbering: XmlElement | undefined): void {
    const abstract = new Map<string, Map<number, boolean>>();
    const levels = (el: XmlElement, into: Map<number, boolean>) => {
      for (const lvl of elements(el, 'lvl')) {
        const fmt = attr(child(lvl, 'numFmt'), 'val') ?? 'decimal';
        into.set(Number(attr(lvl, 'ilvl') ?? 0), fmt === 'bullet' || fmt === 'none');
      }
    };
    for (const a of elements(numbering, 'abstractNum')) {
      const map = new Map<number, boolean>();
      levels(a, map);
      abstract.set(attr(a, 'abstractNumId') ?? '', map);
    }
    for (const num of elements(numbering, 'num')) {
      const id = attr(num, 'numId');
      if (id === undefined) continue;
      const map = new Map(abstract.get(attr(child(num, 'abstractNumId'), 'val') ?? '') ?? []);
      for (const override of elements(num, 'lvlOverride')) levels(override, map);
      this.numbering.set(id, map);
    }
  }

  /** A paragraph style with everything it inherits folded in. */
  private paraStyle(id: string | undefined, depth = 0): ParaStyle {
    if (id === undefined) return { run: {} };
    const cached = this.resolved.get(id);
    if (cached) return cached;
    const def = this.styles.get(id);
    if (!def || depth > 20) return { run: {} };
    const parent = def.basedOn !== undefined && def.basedOn !== id ? this.paraStyle(def.basedOn, depth + 1) : { run: {} };
    const numPr = child(def.pPr, 'numPr');
    const numId = attr(child(numPr, 'numId'), 'val') ?? parent.numId;
    const ilvlText = attr(child(numPr, 'ilvl'), 'val');
    const ilvl = ilvlText !== undefined ? Number(ilvlText) : parent.ilvl;
    const align = alignOf(def.pPr) ?? parent.align;
    const heading = headingOf(def.name, id, def.pPr) ?? parent.heading;
    const style: ParaStyle = {
      run: { ...parent.run, ...runProps(def.rPr) },
      ...(heading !== undefined ? { heading } : {}),
      ...(numId !== undefined ? { numId } : {}),
      ...(ilvl !== undefined ? { ilvl } : {}),
      ...(align !== undefined ? { align } : {}),
    };
    this.resolved.set(id, style);
    return style;
  }

  private charStyle(id: string | undefined, depth = 0): RunStyle {
    if (id === undefined) return {};
    const cached = this.charResolved.get(id);
    if (cached) return cached;
    const def = this.styles.get(id);
    if (!def || depth > 20) return {};
    const parent = def.basedOn !== undefined && def.basedOn !== id ? this.charStyle(def.basedOn, depth + 1) : {};
    const style = { ...parent, ...runProps(def.rPr) };
    this.charResolved.set(id, style);
    return style;
  }

  /** The blocks in a body, a cell or a text box. */
  container(el: XmlElement, out: Block[]): void {
    const state = { pendingSpace: 0 };
    for (const node of elements(el)) {
      switch (node.local) {
        case 'p':
          this.paragraph(node, out, state);
          break;
        case 'tbl':
          state.pendingSpace = 0;
          out.push(this.table(node));
          break;
        case 'sdt':
          this.container(child(node, 'sdtContent') ?? node, out);
          break;
        case 'customXml':
        case 'ins':
        case 'moveTo':
        case 'smartTag':
          this.container(node, out);
          break;
        case 'AlternateContent': {
          const choice = child(node, 'Choice') ?? child(node, 'Fallback');
          if (choice) this.container(choice, out);
          break;
        }
        default:
          break;
      }
    }
  }

  private paragraph(p: XmlElement, out: Block[], state: { pendingSpace: number }): void {
    const pPr = child(p, 'pPr');
    const styleId = attr(child(pPr, 'pStyle'), 'val') ?? this.defaultParaStyle;
    const style = this.paraStyle(styleId);
    const base: RunStyle = { ...this.defaults, ...style.run };

    const numPr = child(pPr, 'numPr');
    const numId = attr(child(numPr, 'numId'), 'val') ?? style.numId;
    const ilvl = Number(attr(child(numPr, 'ilvl'), 'val') ?? style.ilvl ?? 0);
    const list = numId !== undefined && numId !== '0' ? { ordered: !(this.numbering.get(numId)?.get(ilvl) ?? true), level: clamp(ilvl, 0, 8) } : undefined;
    const heading = headingOf('', '', pPr) ?? style.heading;
    const align = alignOf(pPr) ?? style.align;
    const before = Number(attr(child(pPr, 'spacing'), 'before'));
    const ind = child(pPr, 'ind');
    const indent = Number(attr(ind, 'left') ?? attr(ind, 'start'));

    const runs: Run[] = [];
    let first = true;
    let emitted = false;
    const flush = () => {
      if (!runs.some((r) => r.text.trim() !== '')) {
        runs.length = 0;
        return;
      }
      let spaceBefore = 0;
      if (first) {
        spaceBefore = (Number.isFinite(before) ? before / 20 : 0) + (state.pendingSpace >= 4 ? state.pendingSpace : 0);
        state.pendingSpace = 0;
      }
      const paragraph: Paragraph = {
        kind: 'paragraph',
        runs: [...runs],
        ...(align && align !== 'left' ? { align } : {}),
        ...(heading !== undefined ? { heading } : {}),
        ...(list ? { list } : {}),
        ...(spaceBefore > 0 ? { spaceBefore: Math.round(spaceBefore * 2) / 2 } : {}),
        ...(!list && indent > 0 ? { indent: Math.round(indent / 10) / 2 } : {}),
      };
      out.push(paragraph);
      runs.length = 0;
      first = false;
      emitted = true;
    };
    const push = (block: Block) => {
      flush();
      out.push(block);
      emitted = true;
    };
    const after: Block[] = [];

    const walk = (parent: XmlElement, href: string | undefined): void => {
      for (const node of elements(parent)) {
        switch (node.local) {
          case 'r':
            this.run(node, base, href, runs, push, after);
            break;
          case 'hyperlink': {
            const id = attr(node, 'id', 'relationships');
            const rel = id !== undefined ? this.rels.get(id) : undefined;
            const anchor = attr(node, 'anchor');
            walk(node, rel?.external ? rel.target : anchor !== undefined ? `#${anchor}` : href);
            break;
          }
          case 'fldSimple': {
            const instr = attr(node, 'instr') ?? '';
            const field: Field = { instr, showing: true };
            this.fields.push(field);
            walk(node, linkOf(instr) ?? href);
            this.fields.pop();
            const stand = pageField(instr);
            if (stand !== undefined && !field.placed) appendRun(runs, makeRun(stand, base, undefined));
            break;
          }
          case 'smartTag':
          case 'customXml':
          case 'ins':
          case 'moveTo':
          case 'dir':
          case 'bdo':
            walk(node, href);
            break;
          case 'sdt':
            walk(child(node, 'sdtContent') ?? node, href);
            break;
          case 'AlternateContent': {
            const choice = child(node, 'Choice') ?? child(node, 'Fallback');
            if (choice) walk(choice, href);
            break;
          }
          default:
            break;
        }
      }
    };
    walk(p, undefined);
    flush();
    out.push(...after);

    if (!emitted && after.length === 0) {
      // An empty paragraph is somebody's way of adding space; it is carried to the next paragraph.
      const mark = runProps(child(pPr, 'rPr'));
      state.pendingSpace += (mark.size ?? base.size ?? 11) * 1.2;
    }
    const sect = child(pPr, 'sectPr');
    if (sect && attr(child(sect, 'type'), 'val') !== 'continuous') out.push({ kind: 'page-break' });
  }

  private run(r: XmlElement, base: RunStyle, href: string | undefined, runs: Run[], push: (b: Block) => void, after: Block[]): void {
    const rPr = child(r, 'rPr');
    const style: RunStyle = { ...base, ...this.charStyle(attr(child(rPr, 'rStyle'), 'val')), ...runProps(rPr) };
    const add = (text: string) => {
      if (text === '' || this.hidingInstruction()) return;
      // A page number's last-known result is replaced by the number itself, once.
      const field = this.fields[this.fields.length - 1];
      const stand = field ? pageField(field.instr) : undefined;
      if (field && stand !== undefined) {
        if (!field.placed) appendRun(runs, makeRun(stand, style, undefined));
        field.placed = true;
        return;
      }
      appendRun(runs, makeRun(text, style, this.fieldLink() ?? href));
    };
    for (const node of elements(r)) {
      switch (node.local) {
        case 't':
          add(textOf(node));
          break;
        case 'tab':
          add('\t');
          break;
        case 'br':
          if (attr(node, 'type') === 'page') {
            if (!this.hidingInstruction()) push({ kind: 'page-break' });
          } else add('\n');
          break;
        case 'cr':
          add('\n');
          break;
        case 'footnoteReference':
        case 'endnoteReference': {
          const id = attr(node, 'id');
          if (id === undefined || this.hidingInstruction()) break;
          const kind = node.local === 'footnoteReference' ? 'footnote' : 'endnote';
          const n = this.notes.length + 1;
          this.notes.push({ kind, id, n });
          appendRun(runs, makeRun(`[${n}]`, { ...style, size: Math.max(6, (style.size ?? 11) * 0.8) }, undefined));
          break;
        }
        case 'noBreakHyphen':
          add('‑');
          break;
        case 'fldChar': {
          const type = attr(node, 'fldCharType');
          if (type === 'begin') this.fields.push({ instr: '', showing: false });
          else if (type === 'separate') {
            const top = this.fields[this.fields.length - 1];
            if (top) top.showing = true;
          } else if (type === 'end') {
            const done = this.fields.pop();
            const stand = done ? pageField(done.instr) : undefined;
            if (done && stand !== undefined && !done.placed && !this.hidingInstruction()) appendRun(runs, makeRun(stand, style, undefined));
          }
          break;
        }
        case 'instrText': {
          const top = this.fields[this.fields.length - 1];
          if (top && !top.showing) top.instr += textOf(node);
          break;
        }
        case 'drawing':
        case 'pict':
        case 'object':
          if (!this.hidingInstruction()) this.drawing(node, push, after);
          break;
        case 'AlternateContent': {
          const choice = child(node, 'Choice') ?? child(node, 'Fallback');
          if (choice) this.run({ ...r, children: choice.children }, base, href, runs, push, after);
          break;
        }
        default:
          break;
      }
    }
  }

  /** True while a field's instruction ("HYPERLINK "…"", "PAGE") is going by: it is never shown. */
  private hidingInstruction(): boolean {
    return this.fields.some((f) => !f.showing);
  }

  private fieldLink(): string | undefined {
    for (let i = this.fields.length - 1; i >= 0; i--) {
      const link = linkOf(this.fields[i]?.instr ?? '');
      if (link !== undefined) return link;
    }
    return undefined;
  }

  /** Pictures in a drawing become Picture blocks; text boxes have their paragraphs read after the paragraph. */
  private drawing(node: XmlElement, push: (b: Block) => void, after: Block[]): void {
    const extent = descendants(node, 'extent')[0];
    const pics = descendants(node, 'pic');
    const blips = pics.length > 0 ? pics : [node];
    for (const pic of blips) {
      const blip = descendants(pic, 'blip')[0] ?? descendants(pic, 'imagedata')[0];
      const id = attr(blip, 'embed', 'relationships') ?? attr(blip, 'id', 'relationships');
      const rel = id !== undefined ? this.rels.get(id) : undefined;
      const bytes = rel && !rel.external ? this.pkg.bytes(rel.target) : undefined;
      const format = bytes ? imageFormat(bytes) : undefined;
      if (!bytes || !format) continue;
      const ext = (pics.length > 1 ? descendants(pic, 'ext')[0] : undefined) ?? extent ?? descendants(pic, 'ext')[0];
      let width = Number(attr(ext, 'cx')) / EMU_PER_POINT;
      let height = Number(attr(ext, 'cy')) / EMU_PER_POINT;
      if (!(width > 0 && height > 0)) {
        const shape = descendants(node, 'shape')[0];
        const css = attr(shape, 'style') ?? '';
        width = cssPoints(css, 'width');
        height = cssPoints(css, 'height');
      }
      if (!(width > 0 && height > 0)) {
        width = 144;
        height = 144;
      }
      push({ kind: 'image', bytes, format, width: round1(width), height: round1(height) });
    }
    for (const box of descendants(node, 'txbxContent')) this.container(box, after);
  }

  private table(tbl: XmlElement): Table {
    const columns = elements(child(tbl, 'tblGrid'), 'gridCol')
      .map((c) => Number(attr(c, 'w')) / 20)
      .filter((w) => w > 0);
    const rows: TableCell[][] = [];
    for (const tr of rowsOf(tbl)) {
      const cells: TableCell[] = [];
      for (const tc of cellsOf(tr)) {
        const tcPr = child(tc, 'tcPr');
        const gridSpan = Number(attr(child(tcPr, 'gridSpan'), 'val') ?? 1);
        const vMerge = child(tcPr, 'vMerge');
        // A cell merged into the one above it is empty here: the model has no row spans.
        const merged = vMerge !== undefined && attr(vMerge, 'val') !== 'restart';
        const blocks: Block[] = [];
        if (!merged) this.container(tc, blocks);
        const paragraphs = blocks.flatMap((b) => paragraphsIn(b));
        cells.push({ paragraphs, ...(gridSpan > 1 ? { colSpan: gridSpan } : {}) });
      }
      rows.push(cells);
    }
    return { kind: 'table', rows, ...(columns.length > 0 ? { columns: columns.map(round1) } : {}) };
  }
}

/** Rows, looking through the content controls and custom XML that can wrap them. */
function rowsOf(el: XmlElement): XmlElement[] {
  return elements(el).flatMap((node) => {
    if (node.local === 'tr') return [node];
    if (node.local === 'sdt') return rowsOf(child(node, 'sdtContent') ?? node);
    if (node.local === 'customXml') return rowsOf(node);
    return [];
  });
}

function cellsOf(el: XmlElement): XmlElement[] {
  return elements(el).flatMap((node) => {
    if (node.local === 'tc') return [node];
    if (node.local === 'sdt') return cellsOf(child(node, 'sdtContent') ?? node);
    if (node.local === 'customXml') return cellsOf(node);
    return [];
  });
}

/** A cell can only hold paragraphs; a table nested in it gives up its paragraphs. */
function paragraphsIn(block: Block): Paragraph[] {
  if (block.kind === 'paragraph') return [block];
  if (block.kind === 'table') return block.rows.flatMap((row) => row.flatMap((cell) => [...cell.paragraphs]));
  return [];
}

function isOn(value: string | undefined): boolean {
  return value !== undefined && value !== '0' && value !== 'false' && value !== 'off';
}

/** A toggle property: present means on unless its value says otherwise. */
function toggle(el: XmlElement | undefined): boolean | undefined {
  if (!el) return undefined;
  const val = attr(el, 'val');
  return val === undefined || isOn(val);
}

function runProps(rPr: XmlElement | undefined): RunStyle {
  if (!rPr) return {};
  const out: RunStyle = {};
  const sz = Number(attr(child(rPr, 'sz'), 'val'));
  if (sz > 0) out.size = sz / 2;
  const bold = toggle(child(rPr, 'b'));
  if (bold !== undefined) out.bold = bold;
  const italic = toggle(child(rPr, 'i'));
  if (italic !== undefined) out.italic = italic;
  const u = child(rPr, 'u');
  if (u) out.underline = (attr(u, 'val') ?? 'single') !== 'none';
  const color = child(rPr, 'color');
  if (color) out.color = normaliseColor(attr(color, 'val')) ?? null;
  const fonts = child(rPr, 'rFonts');
  const face = attr(fonts, 'ascii') ?? attr(fonts, 'hAnsi') ?? attr(fonts, 'cs');
  if (face !== undefined) out.family = familyOf(face) ?? null;
  return out;
}

function makeRun(text: string, style: RunStyle, href: string | undefined): Run {
  return {
    text,
    size: style.size ?? 11,
    ...(style.bold ? { bold: true } : {}),
    ...(style.italic ? { italic: true } : {}),
    ...(style.underline ? { underline: true } : {}),
    ...(style.color ? { color: style.color } : {}),
    ...(style.family ? { family: style.family } : {}),
    ...(href !== undefined && href !== '' ? { href } : {}),
  };
}

/** Word splits text into runs for reasons nobody can see; runs that look the same are joined again. */
function appendRun(runs: Run[], run: Run): void {
  const last = runs[runs.length - 1];
  if (
    last &&
    last.size === run.size &&
    last.bold === run.bold &&
    last.italic === run.italic &&
    last.underline === run.underline &&
    last.color === run.color &&
    last.family === run.family &&
    last.href === run.href
  ) {
    runs[runs.length - 1] = { ...last, text: last.text + run.text };
  } else runs.push(run);
}

function alignOf(pPr: XmlElement | undefined): Paragraph['align'] | undefined {
  const jc = attr(child(pPr, 'jc'), 'val');
  switch (jc) {
    case 'center':
      return 'center';
    case 'right':
    case 'end':
      return 'right';
    case 'both':
    case 'distribute':
    case 'mediumKashida':
    case 'highKashida':
    case 'lowKashida':
    case 'thaiDistribute':
      return 'justify';
    case 'left':
    case 'start':
      return 'left';
    default:
      return undefined;
  }
}

/** A heading level from a style's name or id ("heading 2", "Heading2", "Title") or an outline level. */
function headingOf(name: string, id: string, pPr: XmlElement | undefined): Paragraph['heading'] | undefined {
  const match = /^heading\s*([1-9])$/i.exec(name.trim()) ?? /^heading([1-9])$/i.exec(id);
  if (match) return Math.min(6, Number(match[1])) as Paragraph['heading'];
  if (/^title$/i.test(name.trim())) return 1;
  const outline = attr(child(pPr, 'outlineLvl'), 'val');
  if (outline !== undefined) {
    const level = Number(outline);
    if (level >= 0 && level <= 5) return (level + 1) as Paragraph['heading'];
  }
  return undefined;
}

/** The target of a HYPERLINK field instruction. */
function linkOf(instr: string): string | undefined {
  const m = /^\s*HYPERLINK\s+(?:\\l\s+"([^"]*)"|"([^"]*)"(?:\s+\\l\s+"([^"]*)")?|(\S+))/i.exec(instr);
  if (!m) return undefined;
  if (m[1] !== undefined) return `#${m[1]}`;
  if (m[2] !== undefined) return m[3] !== undefined ? `${m[2]}#${m[3]}` : m[2];
  return m[4];
}

/** A length in a VML style attribute ("width:120pt;height:3in"), in points. */
function cssPoints(css: string, prop: string): number {
  const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([\\d.]+)\\s*(pt|in|px|cm|mm)?`, 'i').exec(css);
  if (!m) return 0;
  const n = Number(m[1]);
  const unit = (m[2] ?? 'px').toLowerCase();
  const scale: Record<string, number> = { pt: 1, in: 72, px: 0.75, cm: 72 / 2.54, mm: 72 / 25.4 };
  return n * (scale[unit] ?? 1);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
