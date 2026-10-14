/**
 * Make searchable's op, in Node, with a stand-in reader and a stand-in page
 * renderer (Node has no canvas; the real engine and Tesseract run in the
 * e2e). What is checked here is what the op does with the words: which
 * languages it asks for, what it says while a model downloads, and where
 * words the PDF's Latin-only layer cannot hold end up.
 */
import { describe, expect, it } from 'vitest';
import type { FoolscapFile } from '../../app/src/files/types';
import { createMemoryWorkspace } from '../../app/src/files/workspace-memory';
import type { OcrLanguageReader } from '../../app/src/ocr/reader';
import { getOp } from '../../app/src/ops';
import type { OcrReader, OcrWord, OpContext, Outcome, Progress } from '../../app/src/ops/op';
import { createSurgeon } from '../../app/src/pdf/surgeon';
import type { PdfEngine, PdfView } from '../../app/src/pdf/types';
import { pagesPdf } from '../fixtures/pdfs';

/** A PNG's first 24 bytes: enough for the op to read the picture's size from its header. */
function fakePng(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

/** Pages with no text of their own, drawn as nothing in particular. */
const scanEngine = {
  ready: Promise.resolve(),
  maxRenderPixels: 5_242_880,
  async open() {
    const view = {
      pageCount: 1,
      page: async () => ({ width: 595, height: 842, rotation: 0 }),
      text: async () => '',
      layout: async () => ({ width: 595, height: 842, items: [], pictureCover: 1, hiddenText: 0 }),
      encode: async () => fakePng(2480, 3508),
      close: async () => undefined,
    };
    return view as unknown as PdfView;
  },
} as unknown as PdfEngine;

interface FakeReader extends OcrLanguageReader {
  readonly asked: Array<readonly string[]>;
}

function fakeReader(words: OcrWord[], opts: { missing?: readonly string[]; fails?: boolean } = {}): FakeReader {
  const loaded = new Set(['eng']);
  const asked: Array<readonly string[]> = [];
  return {
    asked,
    ready: Promise.resolve(),
    async use(languages, fetching) {
      asked.push(languages);
      for (const code of languages) {
        if (loaded.has(code)) continue;
        fetching(code);
        if (opts.fails) throw new Error('offline');
        loaded.add(code);
      }
    },
    read: async () => words,
    close: async () => undefined,
  };
}

function harness(reader: OcrReader) {
  const workspace = createMemoryWorkspace();
  const labels: string[] = [];
  const ctx: OpContext = {
    workspace,
    engine: async () => scanEngine,
    ocr: async () => reader,
    surgeon: createSurgeon(),
    passwords: new Map(),
    signal: new AbortController().signal,
    progress: (p: Progress) => labels.push(p.label),
  };
  return {
    ctx,
    labels,
    add: async () => workspace.put('Ration card.pdf', await pagesPdf(1), 'pdf', { kind: 'picked' }),
    textOf: async (file: FoolscapFile) => (await workspace.read(file)).text(),
  };
}

const produced = (outcomes: Outcome[]) => outcomes.filter((o): o is Extract<Outcome, { kind: 'produced' }> => o.kind === 'produced');

const malayalam: OcrWord[] = [
  { text: 'റേഷൻ', x: 0.1, y: 0.1, w: 0.2, h: 0.03 },
  { text: 'കാർഡ്', x: 0.35, y: 0.1, w: 0.2, h: 0.03 },
];
const english: OcrWord[] = [{ text: 'Kerala', x: 0.1, y: 0.2, w: 0.2, h: 0.03 }];

describe('make searchable in other languages', () => {
  it('reads English as before when no language is given: one searchable PDF, no text file', async () => {
    const reader = fakeReader(english);
    const h = harness(reader);
    const outcomes = await getOp('ocr').run([await h.add()], {}, h.ctx);
    const files = produced(outcomes);
    expect(files).toHaveLength(1);
    expect(files[0]?.file.kind).toBe('pdf');
    expect(files[0]?.detail).toBe('1 word read on 1 page. You can now search, select and copy them');
    expect(reader.asked).toEqual([['eng']]);
  });

  it('says it is getting a new reader while one downloads, the first time only', async () => {
    const reader = fakeReader(english);
    const h = harness(reader);
    await getOp('ocr').run([await h.add()], { languages: ['fra', 'eng'] }, h.ctx);
    expect(h.labels).toContain('Getting the French reader (first time only)…');
    h.labels.length = 0;
    await getOp('ocr').run([await h.add()], { languages: ['fra', 'eng'] }, h.ctx);
    expect(h.labels.some((l) => l.startsWith('Getting'))).toBe(false);
  });

  it('saves Malayalam words as text, and leaves the PDF alone when none of them fit its layer', async () => {
    const h = harness(fakeReader(malayalam));
    const outcomes = await getOp('ocr').run([await h.add()], { languages: ['mal'] }, h.ctx);
    const files = produced(outcomes);
    expect(files).toHaveLength(1);
    const [txt] = files;
    expect(txt?.file.kind).toBe('text');
    expect(txt?.file.name).toBe('Ration card (text).txt');
    expect(txt?.detail).toContain('2 words read on 1 page, saved as text');
    expect(txt?.detail).toContain("can't hold Malayalam letters");
    expect(await h.textOf(txt!.file)).toBe('റേഷൻ കാർഡ്\n');
    expect(h.labels).toContain('Getting the Malayalam reader (first time only)…');
  });

  it('with Malayalam and English, makes the English searchable in the PDF and puts every word in the text file', async () => {
    const h = harness(fakeReader([...malayalam, ...english]));
    const outcomes = await getOp('ocr').run([await h.add()], { languages: ['mal', 'eng'] }, h.ctx);
    const files = produced(outcomes);
    expect(files.map((f) => f.file.kind)).toEqual(['pdf', 'text']);
    expect(files[0]?.detail).toBe('3 words read on 1 page. The PDF can search only the 1 in Latin letters; every word is in the text file');
    expect(await h.textOf(files[1]!.file)).toBe('റേഷൻ കാർഡ്\nKerala\n');
  });

  it('says which reader could not be downloaded, and makes nothing', async () => {
    const h = harness(fakeReader(malayalam, { fails: true }));
    const outcomes = await getOp('ocr').run([await h.add()], { languages: ['mal', 'eng'] }, h.ctx);
    expect(produced(outcomes)).toHaveLength(0);
    expect(outcomes[0]).toMatchObject({ kind: 'failed', reason: expect.stringContaining("The Malayalam reader couldn't be downloaded") });
  });

  it('refuses params it cannot use, in words', async () => {
    const h = harness(fakeReader(english));
    const outcomes = await getOp('ocr').run([await h.add()], { languages: ['eng', 'mal', 'hin', 'tam'] }, h.ctx);
    expect(outcomes[0]).toMatchObject({ kind: 'failed', reason: expect.stringContaining('up to 3') });
  });

  it('names the languages in its title', () => {
    const op = getOp('ocr');
    expect(op.title({ languages: ['eng'] })).toBe('Make searchable');
    expect(op.title({ languages: ['mal', 'eng'] })).toBe('Make searchable (Malayalam and English)');
  });
});
