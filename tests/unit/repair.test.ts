/**
 * Damaged files that a reader still shows should still work in the tools.
 * Each case here is a kind of damage met in the wild (the pdf.js test corpus
 * has the originals) rebuilt from scratch, so the test needs no download.
 */
import { PDFDocument } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';
import { createSurgeon } from '../../app/src/pdf/surgeon';

describe('repairs on open', () => {
  it('opens a file whose catalog has lost its /Type, and can write it back out', async () => {
    const doc = await PDFDocument.create({ updateMetadata: false });
    doc.addPage([200, 200]);
    doc.addPage([200, 200]);
    const clean = new TextDecoder('latin1').decode(await doc.save({ useObjectStreams: false }));
    expect(clean).toContain('/Type /Catalog');
    // Blank the label out with spaces, so every byte offset stays where it was.
    const broken = Uint8Array.from(clean.replace('/Type /Catalog', ' '.repeat('/Type /Catalog'.length)), (c) => c.charCodeAt(0));
    const pdf = await createSurgeon().open(broken);
    expect(pdf.pageCount).toBe(2);
    pdf.stampText(0, { text: 'DRAFT', anchor: 'center', size: 24 });
    const again = await PDFDocument.load(await pdf.save(), { updateMetadata: false });
    expect(again.getPageCount()).toBe(2);
  });
});
