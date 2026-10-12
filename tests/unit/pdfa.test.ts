import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';
import { createMemoryWorkspace } from '../../app/src/files/workspace-memory';
import { getOp } from '../../app/src/ops';
import type { OpContext, Outcome } from '../../app/src/ops/op';
import { srgbProfile } from '../../app/src/pdf/icc';
import { archivalXmp, createSurgeon, pdfDateToIso } from '../../app/src/pdf/surgeon';
import { pagesPdf, stampsIn } from '../fixtures/pdfs';

describe('the sRGB profile', () => {
  it('is a well-formed ICC v2 display profile with every tag inside it', () => {
    const icc = srgbProfile();
    const view = new DataView(icc.buffer, icc.byteOffset, icc.byteLength);
    expect(view.getUint32(0)).toBe(icc.length);
    expect(new TextDecoder().decode(icc.subarray(36, 40))).toBe('acsp');
    expect(new TextDecoder().decode(icc.subarray(12, 20))).toBe('mntrRGB ');
    const count = view.getUint32(128);
    expect(count).toBe(9);
    for (let i = 0; i < count; i++) {
      const at = view.getUint32(136 + i * 12);
      const size = view.getUint32(140 + i * 12);
      expect(at + size).toBeLessThanOrEqual(icc.length);
      expect(at % 4).toBe(0);
    }
  });
});

describe('archive details', () => {
  it('reads PDF dates as XMP wants them', () => {
    expect(pdfDateToIso("D:20261012143000+05'30'")).toBe('2026-10-12T14:30:00+05:30');
    expect(pdfDateToIso('D:2026')).toBe('2026-01-01T00:00:00');
    expect(pdfDateToIso('yesterday')).toBeNull();
  });

  it('names the standard and mirrors the details, escaped', () => {
    const xmp = archivalXmp({ title: 'Rent <draft> & notes' }, { created: '2026-10-12T14:30:00+05:30' });
    expect(xmp).toContain('<pdfaid:part>2</pdfaid:part>');
    expect(xmp).toContain('<pdfaid:conformance>B</pdfaid:conformance>');
    expect(xmp).toContain('Rent &lt;draft&gt; &amp; notes');
    expect(xmp).toContain('<xmp:CreateDate>2026-10-12T14:30:00+05:30</xmp:CreateDate>');
  });
});

describe('archive copy (PDF/A)', () => {
  it('adds the profile, the metadata and an ID, and says honestly about fonts', async () => {
    const workspace = createMemoryWorkspace();
    const ctx: OpContext = { workspace, engine: () => Promise.reject(new Error('no engine')), surgeon: createSurgeon(), passwords: new Map(), signal: new AbortController().signal, progress: () => undefined };
    const input = await workspace.put('Deed.pdf', await pagesPdf(2, { title: 'Sale deed' }), 'pdf', { kind: 'picked' });
    const outcomes: Outcome[] = await getOp('pdf-a').run([input], {}, ctx);
    const out = outcomes[0];
    expect(out?.kind).toBe('produced');
    if (out?.kind !== 'produced') return;
    expect(out.file.name).toBe('Deed (PDF-A).pdf');
    expect(out.detail).toMatch(/^PDF\/A-2b archive copy: colour profile and archive details added; 1 font the file uses is not inside it/);
    const bytes = new Uint8Array(await (await workspace.read(out.file)).arrayBuffer());
    expect(stampsIn(bytes)).toEqual([]);
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    const intents = doc.catalog.lookup(PDFName.of('OutputIntents'));
    expect(intents).toBeInstanceOf(PDFArray);
    const intent = (intents as PDFArray).lookup(0) as PDFDict;
    expect(intent.lookup(PDFName.of('S'))?.toString()).toBe('/GTS_PDFA1');
    const metadata = doc.catalog.lookup(PDFName.of('Metadata')) as PDFRawStream;
    const xmp = new TextDecoder().decode(metadata.contents);
    expect(xmp).toContain('<pdfaid:part>2</pdfaid:part>');
    expect(xmp).toContain('Sale deed');
    expect(doc.context.trailerInfo.ID).toBeDefined();
  });
});
