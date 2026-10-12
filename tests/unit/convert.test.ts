/**
 * The converters, in Node: Word and Excel round trips, the PowerPoint and
 * EPUB packages, the HTML page, and the layout rules that turn positioned
 * text into paragraphs, lists, columns and tables. Every XML part any writer
 * produces is checked for well-formedness by the strict mode of our own
 * parser, and no output may carry a generator's name.
 */
import { unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { fromDocx, toDocx } from '../../app/src/convert/docx';
import { toEpub } from '../../app/src/convert/epub';
import { toHtml } from '../../app/src/convert/html';
import type { Block, FlowDocument, Paragraph, Picture, Table } from '../../app/src/convert/model';
import { toPptx } from '../../app/src/convert/pptx';
import { toFlow, toWorkbook, type PageText, type TextItem } from '../../app/src/convert/text-layout';
import { asNumber, fromXlsx, sheetNames, toXlsx } from '../../app/src/convert/xlsx';
import { parseXml, XmlError } from '../../app/src/convert/xml';

const PNG = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'));
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 0xff, 0xd9]);
const decoder = new TextDecoder();

/** Every XML-ish part of a zip, parsed strictly; a malformed one fails the test with its name. */
function expectWellFormed(zip: Uint8Array): Record<string, Uint8Array> {
  const files = unzipSync(zip);
  for (const [name, bytes] of Object.entries(files)) {
    if (!/\.(xml|rels|opf|xhtml)$/.test(name)) continue;
    try {
      parseXml(decoder.decode(bytes), { strict: true });
    } catch (error) {
      throw new Error(`${name} is not well-formed: ${(error as Error).message}`);
    }
  }
  return files;
}

/** No stamp: nothing in any part names us or the libraries, and there is no app.xml. */
function expectNoStamp(files: Record<string, Uint8Array>): void {
  expect(Object.keys(files).some((n) => /app\.xml$/i.test(n))).toBe(false);
  for (const [name, bytes] of Object.entries(files)) {
    const text = decoder.decode(bytes);
    for (const word of ['Foolscap', 'Sheaf', 'pdf-lib', '<dc:creator', 'Application>']) {
      expect(text.includes(word), `${name} contains ${word}`).toBe(false);
    }
  }
}

const para = (text: string, extra: Partial<Paragraph> = {}): Paragraph => ({ kind: 'paragraph', runs: [{ text, size: 11 }], ...extra });
const textOf = (b: Block | undefined) => (b?.kind === 'paragraph' ? b.runs.map((r) => r.text).join('') : '');

describe('xml reader', () => {
  it('reads namespaces, entities and CDATA', () => {
    const root = parseXml('<?xml version="1.0"?><a:r xmlns:a="urn:x" b="1 &amp; 2"><a:t>&lt;hi&gt; &#x0D15;</a:t><![CDATA[<raw>]]></a:r>');
    expect(root.local).toBe('r');
    expect(root.uri).toBe('urn:x');
    expect(root.attrs[1]?.value).toBe('1 & 2');
    expect(root.children[0]).toMatchObject({ local: 't', children: ['<hi> ക'] });
    expect(root.children[1]).toBe('<raw>');
  });

  it('recovers in lenient mode and refuses in strict mode', () => {
    const broken = '<a><b>text</a><c attr=bare>&nbsp;</c>';
    expect(() => parseXml(broken)).not.toThrow();
    expect(parseXml(broken).local).toBe('a');
    expect(() => parseXml(broken, { strict: true })).toThrow(XmlError);
    expect(() => parseXml('<a></b>', { strict: true })).toThrow(XmlError);
    expect(() => parseXml('<a x="1" x="2"/>', { strict: true })).toThrow(XmlError);
    expect(() => parseXml('<p:a/>', { strict: true })).toThrow(XmlError);
    expect(parseXml('', {}).local).toBe('');
  });
});

describe('docx', () => {
  const picture: Picture = { kind: 'image', bytes: PNG, format: 'png', width: 120, height: 60 };
  const table: Table = {
    kind: 'table',
    columns: [100, 200, 100],
    rows: [
      [{ paragraphs: [para('Name')] }, { paragraphs: [para('Place')] }, { paragraphs: [para('Year')] }],
      [{ paragraphs: [para('Anjali')] }, { paragraphs: [para('Kochi & Thrissur')], colSpan: 2 }],
      [{ paragraphs: [] }, { paragraphs: [para('Empty first')] }, { paragraphs: [para('2024')] }],
    ],
  };
  const doc: FlowDocument = {
    title: 'Round trip',
    page: { width: 612, height: 792, margin: 54 },
    blocks: [
      { kind: 'paragraph', heading: 1, runs: [{ text: 'Main title', size: 20, bold: true }] },
      {
        kind: 'paragraph',
        align: 'justify',
        spaceBefore: 12,
        runs: [
          { text: 'Plain, ', size: 11 },
          { text: 'bold', size: 11, bold: true },
          { text: ' italic', size: 11, italic: true },
          { text: ' under', size: 11, underline: true },
          { text: ' red serif', size: 14, color: '#c00000', family: 'serif' },
          { text: ' code()', size: 10, family: 'mono' },
          { text: ' മലയാളം <&> "q"', size: 11 },
          { text: 'a link', size: 11, href: 'https://example.com/?a=1&b=2' },
        ],
      },
      { kind: 'paragraph', heading: 2, runs: [{ text: 'Lists', size: 16 }] },
      para('First bullet', { list: { ordered: false, level: 0 } }),
      para('Nested bullet', { list: { ordered: false, level: 1 } }),
      para('Step one', { list: { ordered: true, level: 0 } }),
      para('Step two', { list: { ordered: true, level: 0 } }),
      para('Centred', { align: 'center', indent: 0 }),
      para('Indented', { indent: 36 }),
      table,
      table,
      picture,
      { kind: 'page-break' },
      para('After the break'),
    ],
  };

  it('writes a well-formed package with no stamp', () => {
    const files = expectWellFormed(toDocx(doc));
    expect(Object.keys(files)).toEqual(expect.arrayContaining(['[Content_Types].xml', 'word/document.xml', 'word/styles.xml', 'word/numbering.xml', 'word/media/image1.png']));
    expectNoStamp(files);
    const styles = decoder.decode(files['word/styles.xml']);
    for (let level = 1; level <= 6; level++) expect(styles).toContain(`w:styleId="Heading${level}"`);
  });

  it('reads back what it wrote', () => {
    const back = fromDocx(toDocx(doc));
    expect(back.title).toBe('Round trip');
    expect(back.page).toEqual({ width: 612, height: 792, margin: 54 });
    expect(back.blocks.map((b) => b.kind)).toEqual(doc.blocks.map((b) => b.kind));

    const [h1, body, h2, b1, b2, n1, n2, centred, indented, t1, t2, pic, , after] = back.blocks;
    expect(h1).toMatchObject({ heading: 1 });
    expect(textOf(h1)).toBe('Main title');
    expect(h2).toMatchObject({ heading: 2 });
    expect(body).toMatchObject({ align: 'justify', spaceBefore: 12 });
    expect(textOf(body)).toBe('Plain, bold italic under red serif code() മലയാളം <&> "q"a link');
    const runs = body?.kind === 'paragraph' ? body.runs : [];
    expect(runs.find((r) => r.text === 'bold')).toMatchObject({ bold: true, size: 11 });
    expect(runs.find((r) => r.text === ' italic')).toMatchObject({ italic: true });
    expect(runs.find((r) => r.text === ' under')).toMatchObject({ underline: true });
    expect(runs.find((r) => r.text === ' red serif')).toMatchObject({ color: '#c00000', family: 'serif', size: 14 });
    expect(runs.find((r) => r.text === ' code()')).toMatchObject({ family: 'mono', size: 10 });
    expect(runs.find((r) => r.text === 'a link')).toMatchObject({ href: 'https://example.com/?a=1&b=2' });

    expect(b1).toMatchObject({ list: { ordered: false, level: 0 } });
    expect(b2).toMatchObject({ list: { ordered: false, level: 1 } });
    expect(n1).toMatchObject({ list: { ordered: true, level: 0 } });
    expect(n2).toMatchObject({ list: { ordered: true, level: 0 } });
    expect(centred).toMatchObject({ align: 'center' });
    expect(indented).toMatchObject({ indent: 36 });

    for (const t of [t1, t2]) {
      expect(t?.kind).toBe('table');
      if (t?.kind !== 'table') continue;
      expect(t.columns).toEqual([100, 200, 100]);
      expect(t.rows.map((r) => r.map((c) => c.paragraphs.map((p) => textOf(p)).join('|')))).toEqual([
        ['Name', 'Place', 'Year'],
        ['Anjali', 'Kochi & Thrissur'],
        ['', 'Empty first', '2024'],
      ]);
      expect(t.rows[1]?.[1]?.colSpan).toBe(2);
    }
    expect(pic).toMatchObject({ kind: 'image', format: 'png', width: 120, height: 60 });
    expect(pic?.kind === 'image' ? [...pic.bytes] : []).toEqual([...PNG]);
    expect(textOf(after)).toBe('After the break');
  });

  it('restarts numbering for each ordered list', () => {
    const files = unzipSync(
      toDocx({ blocks: [para('a', { list: { ordered: true, level: 0 } }), para('gap'), para('b', { list: { ordered: true, level: 0 } })] }),
    );
    const document = decoder.decode(files['word/document.xml']);
    expect(document).toContain('<w:numId w:val="2"/>');
    expect(document).toContain('<w:numId w:val="3"/>');
  });

  it('skips what it does not know, and reads fields, content controls and split runs', () => {
    const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const xml =
      `<w:document xmlns:w="${W}" xmlns:x="urn:unknown"><w:body>` +
      '<x:mystery><w:p><w:r><w:t>hidden in unknown</w:t></w:r></w:p></x:mystery>' +
      '<w:p><w:r><w:t xml:space="preserve">Hel</w:t></w:r><w:r><w:t>lo</w:t></w:r><w:del><w:r><w:delText>gone</w:delText></w:r></w:del>' +
      '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> HYPERLINK "https://x.test" </w:instrText></w:r>' +
      '<w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t> site</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>' +
      '<w:sdt><w:sdtContent><w:p><w:pPr><w:outlineLvl w:val="2"/></w:pPr><w:r><w:t>In a control</w:t></w:r></w:p></w:sdtContent></w:sdt>' +
      '</w:body></w:document>';
    const bytes = zipSync({ 'word/document.xml': new TextEncoder().encode(xml) });
    const back = fromDocx(bytes);
    expect(back.blocks).toHaveLength(2);
    const first = back.blocks[0];
    expect(textOf(first)).toBe('Hello site');
    expect(first?.kind === 'paragraph' ? first.runs.map((r) => r.href) : []).toEqual([undefined, 'https://x.test']);
    expect(back.blocks[1]).toMatchObject({ heading: 3 });
    expect(back.page).toBeUndefined();
  });
});

describe('xlsx', () => {
  it('round trips text, numbers, Malayalam and gaps', () => {
    const book = {
      sheets: [
        {
          name: 'Statement: April/May?',
          rows: [
            ['Date', 'Description', 'Amount', 'Code'],
            ['2024-04-01', 'ശമ്പളം (salary)', '50,000.00', '007'],
            ['2024-04-02', '', '1250.5', '1234567812345678'],
            [],
            ['', 'Total', '12,34,567.00', '-3'],
          ],
        },
        { name: 'Statement: April/May?', rows: [['x']] },
        { name: '', rows: [] },
      ],
    };
    const bytes = toXlsx(book);
    const files = expectWellFormed(bytes);
    expectNoStamp(files);
    const sheet = decoder.decode(files['xl/worksheets/sheet1.xml']);
    expect(sheet).toContain('<c r="C2" s="3"><v>50000</v></c>');
    expect(sheet).toContain('<c r="C3"><v>1250.5</v></c>');
    expect(decoder.decode(files['xl/sharedStrings.xml'])).toContain('<t>007</t>');

    const back = fromXlsx(bytes);
    expect(back.sheets.map((s) => s.name)).toEqual(['Statement April May', 'Statement April May (2)', 'Sheet3']);
    expect(back.sheets[0]?.rows).toEqual([
      ['Date', 'Description', 'Amount', 'Code'],
      ['2024-04-01', 'ശമ്പളം (salary)', '50,000.00', '007'],
      ['2024-04-02', '', '1250.5', '1234567812345678'],
      ['', '', '', ''],
      ['', 'Total', '1,234,567.00', '-3'],
    ]);
    expect(back.sheets[2]?.rows).toEqual([]);
  });

  it('keeps only plain numbers as numbers', () => {
    expect(asNumber('42')).toEqual({ value: 42, style: 0 });
    expect(asNumber('1.50')).toEqual({ value: 1.5, style: 1 });
    expect(asNumber('1,234')).toEqual({ value: 1234, style: 2 });
    for (const text of ['007', '1.500', '12345678901234', '₹100', '1,23', '1e5', '+5', '(100)', '']) expect(asNumber(text)).toBeUndefined();
  });

  it('names sheets the way Excel allows', () => {
    const names = sheetNames(['a'.repeat(40), 'a'.repeat(40), 'History', "'quoted'", '[x]']);
    expect(names[0]).toHaveLength(31);
    expect(names[1]).toMatch(/ \(2\)$/);
    expect(names[1]!.length).toBeLessThanOrEqual(31);
    expect(names.slice(2)).toEqual(['History 1', 'quoted', 'x']);
  });

  it('reads formulas, booleans, inline strings and sparse cells', () => {
    const S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
    const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const enc = (s: string) => new TextEncoder().encode(s);
    const bytes = zipSync({
      'xl/workbook.xml': enc(`<workbook xmlns="${S}" xmlns:r="${R}"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>`),
      'xl/_rels/workbook.xml.rels': enc(
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
      ),
      'xl/worksheets/sheet1.xml': enc(
        `<worksheet xmlns="${S}"><sheetData><row r="2"><c r="C2"><f>A1+1</f><v>3.0000000000000004</v></c><c r="E2" t="b"><v>1</v></c></row>` +
          `<row r="4"><c r="B4" t="inlineStr"><is><r><t>Hello </t></r><r><t>world</t></r></is></c></row></sheetData></worksheet>`,
      ),
    });
    expect(fromXlsx(bytes).sheets[0]).toEqual({
      name: 'Data',
      rows: [
        ['', '', '', '', ''],
        ['', '', '3', '', 'TRUE'],
        ['', '', '', '', ''],
        ['', 'Hello world', '', '', ''],
      ],
    });
  });
});

describe('pptx', () => {
  it('has every part PowerPoint needs, one slide and one notes page per picture', () => {
    const slides = [
      { picture: { kind: 'image', bytes: PNG, format: 'png', width: 595, height: 842 } as Picture, text: 'Page one\nസ്വാഗതം & more' },
      { picture: { kind: 'image', bytes: JPEG, format: 'jpeg', width: 842, height: 595 } as Picture, text: 'Page two' },
      { picture: { kind: 'image', bytes: PNG, format: 'png', width: 595, height: 842 } as Picture },
    ];
    const files = expectWellFormed(toPptx({ width: 595, height: 842, slides }));
    expectNoStamp(files);
    const names = Object.keys(files);
    for (const part of [
      '[Content_Types].xml',
      '_rels/.rels',
      'ppt/presentation.xml',
      'ppt/_rels/presentation.xml.rels',
      'ppt/slideMasters/slideMaster1.xml',
      'ppt/slideLayouts/slideLayout1.xml',
      'ppt/theme/theme1.xml',
      'ppt/notesMasters/notesMaster1.xml',
      'ppt/presProps.xml',
    ]) {
      expect(names).toContain(part);
    }
    expect(names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))).toHaveLength(3);
    expect(names.filter((n) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n))).toHaveLength(3);
    const presentation = decoder.decode(files['ppt/presentation.xml']);
    expect(presentation.match(/<p:sldId /g)).toHaveLength(3);
    expect(presentation).toContain(`<p:sldSz cx="${595 * 12700}" cy="${842 * 12700}"/>`);
    const notes = decoder.decode(files['ppt/notesSlides/notesSlide1.xml']);
    expect(notes).toContain('<a:t>Page one</a:t>');
    expect(notes).toContain('<a:t>സ്വാഗതം &amp; more</a:t>');
    // The landscape page is fitted inside the portrait slide, not stretched.
    expect(decoder.decode(files['ppt/slides/slide2.xml'])).toMatch(/<a:off x="0" y="\d+"\/><a:ext cx="7556500" cy="\d+"\/>/);
    const types = decoder.decode(files['[Content_Types].xml']);
    expect(types).toContain('/ppt/slides/slide3.xml');
    expect(types).toContain('/ppt/notesSlides/notesSlide3.xml');
  });
});

describe('epub', () => {
  const doc: FlowDocument = {
    blocks: [
      { kind: 'paragraph', heading: 1, runs: [{ text: 'One', size: 20 }] },
      para('First chapter <text> & stuff'),
      { kind: 'paragraph', heading: 2, runs: [{ text: 'One point one', size: 16 }] },
      para('a', { list: { ordered: false, level: 0 } }),
      para('b', { list: { ordered: false, level: 1 } }),
      para('c', { list: { ordered: true, level: 0 } }),
      { kind: 'page-break' },
      { kind: 'paragraph', heading: 1, runs: [{ text: 'രണ്ട്', size: 20 }] },
      { kind: 'table', rows: [[{ paragraphs: [para('x')] }, { paragraphs: [para('y')], colSpan: 1 }]] },
      { kind: 'image', bytes: PNG, format: 'png', width: 10, height: 10 },
    ],
  };

  it('puts the mimetype first, stored, with no extra field', () => {
    const bytes = toEpub(doc);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint16(8, true)).toBe(0); // stored
    expect(view.getUint16(26, true)).toBe(8); // name length
    expect(view.getUint16(28, true)).toBe(0); // no extra field
    expect(decoder.decode(bytes.subarray(30, 38))).toBe('mimetype');
    expect(decoder.decode(bytes.subarray(38, 58))).toBe('application/epub+zip');
  });

  it('is a well-formed EPUB 3 with chapters, a nested contents list and the picture', () => {
    const files = expectWellFormed(toEpub(doc));
    expectNoStamp(files);
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining(['META-INF/container.xml', 'OEBPS/content.opf', 'OEBPS/nav.xhtml', 'OEBPS/chapter1.xhtml', 'OEBPS/chapter2.xhtml', 'OEBPS/images/image1.png']),
    );
    const opf = decoder.decode(files['OEBPS/content.opf']);
    expect(opf).toContain('<dc:title>One</dc:title>');
    expect(opf).toMatch(/<meta property="dcterms:modified">\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ<\/meta>/);
    expect(opf).toContain('properties="nav"');
    const nav = decoder.decode(files['OEBPS/nav.xhtml']);
    expect(nav).toContain('<li><a href="chapter1.xhtml#h1">One</a><ol><li><a href="chapter1.xhtml#h2">One point one</a></li></ol></li>');
    expect(nav).toContain('chapter2.xhtml#h3');
    const chapter1 = decoder.decode(files['OEBPS/chapter1.xhtml']);
    expect(chapter1).toContain('<ul><li>a<ul><li>b</li></ul></li></ul><ol><li>c</li></ol>');
    expect(chapter1).toContain('First chapter &lt;text&gt; &amp; stuff');
    expect(decoder.decode(files['OEBPS/chapter2.xhtml'])).toContain('<img src="images/image1.png"');
  });
});

describe('html', () => {
  it('is one self-contained page with semantic markup', () => {
    const html = toHtml({
      title: 'Notes',
      blocks: [
        { kind: 'paragraph', heading: 1, runs: [{ text: 'Heading', size: 20 }] },
        { kind: 'paragraph', align: 'center', runs: [{ text: 'bold', size: 11, bold: true }, { text: ' link', size: 11, href: 'https://e.test' }, { text: ' bad', size: 11, href: 'javascript:alert(1)' }] },
        { kind: 'image', bytes: PNG, format: 'png', width: 30, height: 15 },
      ],
    });
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<title>Notes</title>');
    expect(html).toContain('<h1>Heading</h1>');
    expect(html).toContain('<p class="center"><strong>bold</strong><a href="https://e.test"> link</a> bad</p>');
    expect(html).toContain('src="data:image/png;base64,iVBORw0KGgo');
    expect(html).not.toMatch(/<script|<link|https?:\/\/(?!e\.test)/);
    expect(html).not.toContain('Foolscap');
  });
});

// =====================================================================
// Text layout, on synthetic pages
// =====================================================================

const CHAR = 0.5;

/** One line of text as word items, the way pdf.js often reports it. */
function words(text: string, x: number, y: number, size = 11, extra: Partial<TextItem> = {}): TextItem[] {
  const items: TextItem[] = [];
  let at = x;
  for (const word of text.split(' ')) {
    const width = word.length * size * CHAR;
    items.push({ str: word, x: at, y, width, height: size, fontName: 'g_d0_f1', ...extra });
    at += width + size * 0.25;
  }
  return items;
}

function widthOf(text: string, size = 11): number {
  return text.split(' ').reduce((w, word) => w + word.length * size * CHAR, 0) + (text.split(' ').length - 1) * size * 0.25;
}

/** Fills lines of a column with numbered words, greedily, like a typesetter. */
function column(prefix: string, count: number, x: number, width: number, top: number, size = 11, leading = 14): { items: TextItem[]; text: string } {
  const all: string[] = [];
  for (let i = 1; i <= count; i++) all.push(`${prefix}${i}`);
  const items: TextItem[] = [];
  let line: string[] = [];
  let y = top;
  for (const word of all) {
    if (line.length > 0 && widthOf([...line, word].join(' '), size) > width) {
      items.push(...words(line.join(' '), x, y, size));
      y += leading;
      line = [];
    }
    line.push(word);
  }
  if (line.length > 0) items.push(...words(line.join(' '), x, y, size));
  return { items, text: all.join(' ') };
}

const page = (items: TextItem[], images?: PageText['images']): PageText => ({ width: 612, height: 792, items, ...(images ? { images } : {}) });

describe('text layout: toFlow', () => {
  it('reads two columns column by column, under a heading that spans both', () => {
    const left = column('left', 60, 72, 216, 140);
    const right = column('right', 60, 324, 216, 140);
    const title = words('A Two Column Report', 72, 100, 22);
    const flow = toFlow([page([...title, ...right.items, ...left.items])]);
    const paragraphs = flow.blocks.filter((b) => b.kind === 'paragraph');
    expect(paragraphs[0]).toMatchObject({ heading: 1 });
    expect(textOf(paragraphs[0])).toBe('A Two Column Report');
    const body = paragraphs.slice(1).map(textOf).join(' ');
    expect(body).toBe(`${left.text} ${right.text}`);
  });

  it('finds headings by size, and bulleted and numbered lists', () => {
    const items = [
      ...words('Introduction', 72, 90, 18, { bold: true }),
      ...words('This is the opening line of the body text which runs on', 72, 120),
      ...words('to a second line here.', 72, 134),
      ...words('Details', 72, 170, 14),
      ...words('• First point', 72, 200),
      ...words('• Second point that is', 72, 214),
      ...words('longer and wraps', 82, 228),
      ...words('– Nested dash point', 92, 242),
      ...words('1. Numbered one', 72, 270),
      ...words('2. Numbered two', 72, 284),
    ];
    const blocks = toFlow([page(items)]).blocks;
    expect(blocks.map((b) => (b.kind === 'paragraph' ? [textOf(b), b.heading ?? null, b.list ?? null] : b.kind))).toEqual([
      ['Introduction', 1, null],
      ['This is the opening line of the body text which runs on to a second line here.', null, null],
      ['Details', 2, null],
      ['First point', null, { ordered: false, level: 0 }],
      ['Second point that is longer and wraps', null, { ordered: false, level: 0 }],
      ['Nested dash point', null, { ordered: false, level: 1 }],
      ['Numbered one', null, { ordered: true, level: 0 }],
      ['Numbered two', null, { ordered: true, level: 0 }],
    ]);
  });

  it('turns a statement into a table and joins a wrapped description to its row', () => {
    const blocks = toFlow([page(statement(0))]).blocks;
    const table = blocks.find((b): b is Table => b.kind === 'table');
    expect(table).toBeDefined();
    const rows = table!.rows.map((r) => r.map((c) => c.paragraphs.map(textOf).join(' ')));
    expect(rows).toEqual([
      ['Date', 'Description', 'Amount'],
      ['01/04/2024', 'Salary credit', '50,000.00'],
      ['02/04/2024', 'UPI payment to grocery store Kochi branch', '1,250.50'],
      ['05/04/2024', 'ATM withdrawal', '2,000.00'],
    ]);
    expect(table!.columns).toHaveLength(3);
    // The title above the table stays a paragraph.
    expect(textOf(blocks[0])).toBe('Statement of account');
  });

  it('centres a centred line, places pictures in order and breaks between pages', () => {
    const line = 'Thank you for banking with us';
    const x = (612 - widthOf(line)) / 2;
    const body = column('w', 40, 72, 468, 100);
    const flow = toFlow(
      [
        page([...body.items, ...words(line, x, 300)], [{ bytes: PNG, format: 'png', x: 72, y: 200, width: 100, height: 50 }]),
        page(words('Second page', 72, 100)),
      ],
      { title: 'Letter' },
    );
    expect(flow.title).toBe('Letter');
    expect(flow.page).toEqual({ width: 612, height: 792, margin: 72 });
    const kinds = flow.blocks.map((b) => b.kind);
    expect(kinds).toEqual(['paragraph', 'image', 'paragraph', 'page-break', 'paragraph']);
    expect(flow.blocks[2]).toMatchObject({ align: 'center' });
    expect(textOf(flow.blocks[2])).toBe(line);
    expect(flow.blocks[1]).toMatchObject({ width: 100, height: 50 });
  });

  it('survives an empty page and odd items', () => {
    const odd: TextItem[] = [
      { str: '', x: 0, y: 0, width: 0, height: 0, fontName: '' },
      { str: 'x', x: Number.NaN, y: 10, width: 1, height: 10, fontName: '' },
      { str: 'ok', x: 10, y: 20, width: 10, height: 0, fontName: 'Times-BoldItalic' },
    ];
    const flow = toFlow([page([]), page(odd)]);
    expect(flow.blocks.map((b) => b.kind)).toEqual(['page-break', 'paragraph']);
    expect(flow.blocks[1]).toMatchObject({ runs: [{ text: 'ok', bold: true, italic: true, family: 'serif' }] });
  });

  it('writes what it reads into every format', () => {
    const flow = toFlow([page([...words('Heading', 72, 80, 20), ...statement(40)])]);
    expectWellFormed(toDocx(flow));
    expectWellFormed(toEpub(flow));
    expect(fromDocx(toDocx(flow)).blocks.map((b) => b.kind)).toEqual(flow.blocks.map((b) => b.kind));
  });
});

/** A bank statement: title, header, three rows, one description wrapping onto a second line. */
function statement(offset: number, header = true): TextItem[] {
  const amount = (text: string, y: number) => words(text, 540 - widthOf(text, 10), y, 10);
  const row = (date: string, description: string, value: string, y: number) => [...words(date, 72, y, 10), ...words(description, 160, y, 10), ...amount(value, y)];
  return [
    ...words('Statement of account', 72, 100 + offset, 14),
    ...(header ? [...words('Date', 72, 130 + offset, 10), ...words('Description', 160, 130 + offset, 10), ...amount('Amount', 130 + offset)] : []),
    ...row('01/04/2024', 'Salary credit', '50,000.00', 150 + offset),
    ...row('02/04/2024', 'UPI payment to grocery store', '1,250.50', 168 + offset),
    ...words('Kochi branch', 160, 180 + offset, 10),
    ...row('05/04/2024', 'ATM withdrawal', '2,000.00', 198 + offset),
  ];
}

describe('text layout: toWorkbook', () => {
  it('joins a table that runs across pages into one sheet, header once', () => {
    const book = toWorkbook([page(statement(0)), page(statement(0))]);
    expect(book.sheets.map((s) => s.name)).toEqual(['Table']);
    expect(book.sheets[0]?.rows).toHaveLength(7);
    expect(book.sheets[0]?.rows[2]).toEqual(['02/04/2024', 'UPI payment to grocery store Kochi branch', '1,250.50']);
    const back = fromXlsx(toXlsx(book));
    expect(back.sheets[0]?.rows[1]).toEqual(['01/04/2024', 'Salary credit', '50,000.00']);
  });

  it('gives each page its own sheet when the columns differ', () => {
    const other = [...words('Name', 72, 100), ...words('Qty', 300, 100), ...words('Tea', 72, 120), ...words('2', 300, 120), ...words('Rice', 72, 140), ...words('5', 300, 140)];
    const book = toWorkbook([page(statement(0)), page([]), page(other)]);
    expect(book.sheets.map((s) => s.name)).toEqual(['Page 1', 'Page 3']);
    expect(book.sheets[1]?.rows).toEqual([
      ['Name', 'Qty'],
      ['Tea', '2'],
      ['Rice', '5'],
    ]);
  });

  it('puts lines in column A when there is no table', () => {
    const book = toWorkbook([page([...words('Just a line', 72, 100), ...words('And another', 72, 114)])]);
    expect(book.sheets).toEqual([{ name: 'Text', rows: [['Just a line'], ['And another']] }]);
  });
});
