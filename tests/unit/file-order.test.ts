/**
 * The pure parts of reordering files and of the Done box: where a dragged row
 * lands, how fast the page scrolls under it, how a preview fits its box, what
 * a file's type tile says, and that Send hands the share sheet real File
 * objects read once from the workspace, and nothing else.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createExporter } from '../../app/src/files/exporter';
import type { FoolscapFile, Workspace } from '../../app/src/files/types';
import { createMemoryWorkspace } from '../../app/src/files/workspace-memory';
import { EDGE, dropIndex, edgeScroll, moved } from '../../app/src/ui/drag';
import { fit, typeLabel } from '../../app/src/ui/thumbs';

describe('dropIndex', () => {
  // Three rows 60px tall from the top of the screen: middles at 30, 90, 150.
  const middles = [30, 90, 150];

  it('leaves a row where it is until the pointer passes a neighbour’s middle', () => {
    expect(dropIndex(middles, 0, 40)).toBe(0);
    expect(dropIndex(middles, 0, 89)).toBe(0);
    expect(dropIndex(middles, 1, 60)).toBe(1);
    expect(dropIndex(middles, 1, 120)).toBe(1);
  });

  it('moves it down past every middle above the pointer, and up past every one below', () => {
    expect(dropIndex(middles, 0, 91)).toBe(1);
    expect(dropIndex(middles, 0, 400)).toBe(2);
    expect(dropIndex(middles, 2, 89)).toBe(1);
    expect(dropIndex(middles, 2, -50)).toBe(0);
  });

  it('is stable once the row has moved: the neighbour it passed is now on the far side', () => {
    // Row 0 dragged to y=100 lands at 1; the list then reads [B, A, C] with middles 30, 90, 150.
    expect(dropIndex(middles, 0, 100)).toBe(1);
    expect(dropIndex([30, 90, 150], 1, 100)).toBe(1);
  });
});

describe('moved', () => {
  it('moves one item and keeps the rest in order, without touching the input', () => {
    const items = ['a', 'b', 'c', 'd'] as const;
    expect(moved(items, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moved(items, 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(moved(items, 1, 1)).toEqual(['a', 'b', 'c', 'd']);
    expect(moved(items, 1, 99)).toEqual(['a', 'c', 'd', 'b']);
    expect(moved(items, 9, 0)).toEqual(['a', 'b', 'c', 'd']);
    expect(items).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('edgeScroll', () => {
  it('does nothing away from the edges', () => {
    expect(edgeScroll(400, 800, 16)).toBe(0);
    expect(edgeScroll(EDGE, 800, 16)).toBe(0);
    expect(edgeScroll(800 - EDGE, 800, 16)).toBe(0);
  });

  it('scrolls up near the top and down near the bottom, faster the nearer', () => {
    expect(edgeScroll(60, 800, 16)).toBeLessThan(0);
    expect(edgeScroll(760, 800, 16)).toBeGreaterThan(0);
    expect(Math.abs(edgeScroll(5, 800, 16))).toBeGreaterThan(Math.abs(edgeScroll(60, 800, 16)));
  });

  it('goes by time, not frames, and a long stall does not jump the page', () => {
    expect(edgeScroll(0, 800, 32)).toBeCloseTo(2 * edgeScroll(0, 800, 16), -1);
    expect(edgeScroll(0, 800, 5000)).toBe(edgeScroll(0, 800, 64));
  });
});

describe('fit', () => {
  const box = { width: 40, height: 54 };
  it('keeps a page’s shape inside the box', () => {
    expect(fit(595, 842, box)).toEqual({ width: 38, height: 54 });
    expect(fit(842, 595, box)).toEqual({ width: 40, height: 28 });
    expect(fit(100, 100, box)).toEqual({ width: 40, height: 40 });
  });
  it('fills the box for a size it cannot read', () => {
    expect(fit(0, 0, box)).toEqual(box);
    expect(fit(Number.NaN, 10, box)).toEqual(box);
  });
});

describe('typeLabel', () => {
  it('names the type in capitals, and says FILE when there is nothing sensible to say', () => {
    expect(typeLabel('Lease.pdf')).toBe('PDF');
    expect(typeLabel('Report.final.docx')).toBe('DOCX');
    expect(typeLabel('notes')).toBe('FILE');
    expect(typeLabel('.hidden')).toBe('FILE');
    expect(typeLabel('x.my file')).toBe('FILE');
    expect(typeLabel('archive.tar.gzipped')).toBe('FILE');
  });
});

describe('Send (the exporter’s share)', () => {
  afterEach(() => vi.unstubAllGlobals());

  async function setUp(): Promise<{ ws: Workspace; reads: string[]; files: FoolscapFile[] }> {
    const inner = createMemoryWorkspace();
    const reads: string[] = [];
    const ws: Workspace = { ...inner, read: (file) => (reads.push(file.id), inner.read(file)) };
    const derived = { kind: 'derived', tool: 'split', from: [] } as const;
    const files = [
      await inner.put('Lease part 1.pdf', new Uint8Array([37, 80, 68, 70]), 'pdf', derived),
      await inner.put('Lease page 2.png', new Uint8Array([137, 80, 78, 71]), 'image', derived),
    ];
    return { ws, reads, files };
  }

  it('is not offered where the browser cannot share files', async () => {
    const { ws, files } = await setUp();
    vi.stubGlobal('navigator', {});
    const exporter = createExporter(ws);
    expect(await exporter.canShare(files)).toBe(false);
    expect(await exporter.share(files)).toEqual({ kind: 'unsupported' });
  });

  it('hands the share sheet File objects with the right names and types, each read once', async () => {
    const { ws, reads, files } = await setUp();
    const shared: File[][] = [];
    vi.stubGlobal('navigator', {
      canShare: (data: { files?: File[] }) => (data.files ?? []).every((f) => f instanceof File),
      share: async (data: { files?: File[]; url?: string; text?: string }) => {
        expect(data.url).toBeUndefined();
        expect(data.text).toBeUndefined();
        shared.push(data.files ?? []);
      },
    });
    const exporter = createExporter(ws);
    expect(await exporter.canShare([files[0] as FoolscapFile])).toBe(true);
    expect(await exporter.share([files[0] as FoolscapFile])).toEqual({ kind: 'shared' });
    expect(await exporter.share(files)).toEqual({ kind: 'shared' });
    expect(shared.map((batch) => batch.map((f) => [f.name, f.type, f.size]))).toEqual([
      [['Lease part 1.pdf', 'application/pdf', 4]],
      [
        ['Lease part 1.pdf', 'application/pdf', 4],
        ['Lease page 2.png', 'image/png', 4],
      ],
    ]);
    // Asked, sent, sent again with another: still one read per file.
    expect(reads.sort()).toEqual(files.map((f) => f.id).sort());
  });

  it('says cancelled when the person closes the share sheet', async () => {
    const { ws, files } = await setUp();
    vi.stubGlobal('navigator', {
      canShare: () => true,
      share: () => Promise.reject(new DOMException('closed', 'AbortError')),
    });
    expect(await createExporter(ws).share(files)).toEqual({ kind: 'cancelled' });
  });
});
