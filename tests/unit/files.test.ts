/**
 * The file layer's pure and Node-runnable parts: the memory Workspace, the
 * Workspace-over-a-port proxy the op worker uses on the memory backend, the
 * DocumentStore's sniffing, and the Exporter's naming and ZIP helpers.
 *
 * OPFS (the storage worker, sync access handles, the probe and the sweep) and
 * the Exporter's pickers, download and share exist only in a browser; the e2e
 * suite covers them.
 */
import { PDFDocument } from '@cantoo/pdf-lib';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { createDocumentStore, looksLikePdf } from '../../app/src/files/document-store';
import { saveAllToFolder, uniqueName, withSuffix, zipEntries, zipEntryNames, type Folder } from '../../app/src/files/exporter';
import { createCaller } from '../../app/src/files/rpc';
import type { FoolscapFile, Workspace } from '../../app/src/files/types';
import { createMemoryWorkspace } from '../../app/src/files/workspace-memory';
import { createWorkspaceClient, serveWorkspace } from '../../app/src/files/workspace-protocol';

const bytesOf = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());
const picked = { kind: 'picked' } as const;

async function tinyPdf(): Promise<Uint8Array<ArrayBuffer>> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.addPage([200, 200]);
  // Copied into a fresh buffer so the Blob constructor accepts it under TS 5.9's stricter typing.
  return new Uint8Array(await doc.save());
}

describe('memory workspace', () => {
  it('wraps a Uint8Array in a Blob and lists, reads, removes it', async () => {
    const ws = createMemoryWorkspace();
    expect(ws.backend).toBe('memory');
    await ws.ready;
    const file = await ws.put('a.pdf', new Uint8Array([1, 2, 3]), 'pdf', picked);
    expect(file).toMatchObject({ name: 'a.pdf', size: 3, kind: 'pdf', origin: picked });
    expect(file.id).toMatch(/^[0-9a-f-]{36}$/);

    const blob = await ws.read(file);
    expect(blob).toBeInstanceOf(Blob);
    expect(await bytesOf(blob)).toEqual(new Uint8Array([1, 2, 3]));
    expect(await ws.list()).toEqual([file]);

    await ws.remove(file);
    expect(await ws.list()).toEqual([]);
    await expect(ws.read(file)).rejects.toThrow('This file is no longer available. Add it again.');
  });

  it('keeps a File by reference', async () => {
    const ws = createMemoryWorkspace();
    const original = new File([new Uint8Array([9, 9])], 'Lease.pdf', { type: 'application/pdf' });
    const file = await ws.put(original.name, original, 'pdf', picked);
    expect(await ws.read(file)).toBe(original);
    expect(file.size).toBe(2);
  });

  it('clear and clearExcept, in insertion order', async () => {
    const ws = createMemoryWorkspace();
    const a = await ws.put('a.pdf', new Uint8Array(1), 'pdf', picked);
    const b = await ws.put('b.pdf', new Uint8Array(2), 'pdf', picked);
    const c = await ws.put('c.pdf', new Uint8Array(3), 'pdf', { kind: 'derived', tool: 'merge', from: [a.id, b.id] });
    expect((await ws.list()).map((f) => f.id)).toEqual([a.id, b.id, c.id]);

    await ws.clearExcept([b.id, c.id]);
    expect((await ws.list()).map((f) => f.id)).toEqual([b.id, c.id]);

    await ws.clear();
    expect(await ws.list()).toEqual([]);
  });
});

describe('workspace over a MessagePort (the op worker on the memory backend)', () => {
  const connect = (store: Workspace) => {
    const channel = new MessageChannel();
    serveWorkspace(store, channel.port1);
    const proxy = createWorkspaceClient(createCaller(channel.port2), 'memory');
    const close = () => {
      channel.port1.close();
      channel.port2.close();
    };
    return { proxy, close };
  };

  it('puts through the page store, which mints the id; reads come back as Blobs', async () => {
    const store = createMemoryWorkspace();
    const { proxy, close } = connect(store);
    try {
      const file = await proxy.put('out.pdf', new Uint8Array([4, 5, 6]), 'pdf', { kind: 'derived', tool: 'split', from: ['x'] });
      expect(file.name).toBe('out.pdf');
      expect(file.size).toBe(3);
      expect(await store.list()).toEqual([file]);
      expect(await proxy.list()).toEqual([file]);

      const blob = await proxy.read(file);
      expect(blob).toBeInstanceOf(Blob);
      expect(await bytesOf(blob)).toEqual(new Uint8Array([4, 5, 6]));

      const other = await store.put('in.pdf', new Uint8Array([7]), 'pdf', picked);
      await proxy.clearExcept([other.id]);
      expect(await store.list()).toEqual([other]);
      await proxy.remove(other);
      expect(await store.list()).toEqual([]);
      await proxy.put('again.pdf', new Blob([new Uint8Array(2)]), 'pdf', picked);
      await proxy.clear();
      expect(await store.list()).toEqual([]);
    } finally {
      close();
    }
  });

  it('carries a failure as its plain message only', async () => {
    const { proxy, close } = connect(createMemoryWorkspace());
    try {
      const ghost: FoolscapFile = { id: 'nope', name: 'g.pdf', size: 1, kind: 'pdf', origin: picked };
      await expect(proxy.read(ghost)).rejects.toThrow('This file is no longer available. Add it again.');
    } finally {
      close();
    }
  });
});

describe('document store', () => {
  it('sniffs the header anywhere in the first kilobyte', async () => {
    expect(looksLikePdf(new TextEncoder().encode('%PDF-1.7\n'))).toBe(true);
    expect(looksLikePdf(new TextEncoder().encode('junk junk %PDF-1.4'))).toBe(true);
    expect(looksLikePdf(new TextEncoder().encode('%PDF'))).toBe(false);
    expect(looksLikePdf(new Uint8Array(0))).toBe(false);
  });

  it('imports real PDFs, including one with junk before the header, and rejects the rest in input order', async () => {
    const ws = createMemoryWorkspace();
    const store = createDocumentStore(ws);
    const pdf = await tinyPdf();
    const junk = new Uint8Array(100).fill(0x20);
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array<number>(64).fill(0)]);

    const results = await store.import([
      new File([pdf], 'Lease.pdf', { type: 'application/pdf' }),
      new File([junk, pdf], 'Scan with junk.pdf'),
      new File([], 'Empty.pdf'),
      new File([png], 'Photo renamed.pdf'),
    ]);

    expect(results.map((r) => r.ok)).toEqual([true, true, false, false]);
    expect(results[0]).toMatchObject({ ok: true, file: { name: 'Lease.pdf', kind: 'pdf', size: pdf.byteLength, origin: picked } });
    expect(results[1]).toMatchObject({ ok: true, file: { name: 'Scan with junk.pdf' } });
    expect(results[2]).toEqual({ ok: false, name: 'Empty.pdf', reason: 'This file is empty.' });
    expect(results[3]).toEqual({ ok: false, name: 'Photo renamed.pdf', reason: "This isn't a PDF." });
    expect((await ws.list()).map((f) => f.name)).toEqual(['Lease.pdf', 'Scan with junk.pdf']);
  });

  it('reports a store that fails instead of throwing, and keeps going', async () => {
    const good = createMemoryWorkspace();
    const flaky: Workspace = {
      ...good,
      put: async (name, data, kind, origin) => {
        if (name === 'Bad.pdf') throw new Error('disk on fire');
        return good.put(name, data, kind, origin);
      },
    };
    const pdf = await tinyPdf();
    const results = await createDocumentStore(flaky).import([new File([pdf], 'Bad.pdf'), new File([pdf], 'Good.pdf')]);
    expect(results[0]).toEqual({ ok: false, name: 'Bad.pdf', reason: "This file couldn't be read. Try picking it again." });
    expect(results[1]).toMatchObject({ ok: true, file: { name: 'Good.pdf' } });
  });
});

describe('exporter naming', () => {
  it('numbers a taken name before the extension', () => {
    expect(withSuffix('x.pdf', 2)).toBe('x (2).pdf');
    expect(withSuffix('report.final.pdf', 3)).toBe('report.final (3).pdf');
    expect(withSuffix('noext', 2)).toBe('noext (2)');
    expect(withSuffix('.hidden', 2)).toBe('.hidden (2)');
  });

  it('finds the first free name', async () => {
    const taken = new Set(['x.pdf', 'x (2).pdf']);
    const exists = async (name: string) => taken.has(name);
    expect(await uniqueName('x.pdf', exists)).toBe('x (3).pdf');
    expect(await uniqueName('y.pdf', exists)).toBe('y.pdf');
  });

  it('dedupes ZIP entry names and flattens paths', () => {
    expect(zipEntryNames(['a.pdf', 'a.pdf', 'b.pdf', 'a.pdf'])).toEqual(['a.pdf', 'a (2).pdf', 'b.pdf', 'a (3).pdf']);
    expect(zipEntryNames(['dir/a.pdf', 'dir\\a.pdf'])).toEqual(['dir_a.pdf', 'dir_a (2).pdf']);
    expect(zipEntryNames([''])).toEqual(['file.pdf']);
  });

  it('stores the entries as they are, under their deduped names', () => {
    const one = new Uint8Array([1, 2, 3]);
    const two = new Uint8Array([4, 5]);
    const zip = zipEntries([
      { name: 'same.pdf', bytes: one },
      { name: 'same.pdf', bytes: two },
    ]);
    const out = unzipSync(zip);
    expect(Object.keys(out).sort()).toEqual(['same (2).pdf', 'same.pdf']);
    expect(out['same.pdf']).toEqual(one);
    expect(out['same (2).pdf']).toEqual(two);
  });
});

describe('exporter writing into a chosen folder', () => {
  interface FakeHandle {
    writes: Blob[];
    createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
  }

  const fakeFolder = (existing: readonly string[]) => {
    const handles = new Map<string, FakeHandle>();
    const make = (): FakeHandle => {
      const handle: FakeHandle = {
        writes: [],
        async createWritable() {
          return {
            write: async (data: Blob) => {
              handle.writes.push(data);
            },
            close: async () => undefined,
          };
        },
      };
      return handle;
    };
    for (const name of existing) handles.set(name, make());
    const created: string[] = [];
    const folder: Folder = {
      async getFileHandle(name, options) {
        const found = handles.get(name);
        if (found) return found;
        if (!options?.create) throw new DOMException('not found', 'NotFoundError');
        const handle = make();
        handles.set(name, handle);
        created.push(name);
        return handle;
      },
    };
    return { folder, handles, created };
  };

  it('never writes into a file that was already there', async () => {
    const { folder, handles, created } = fakeFolder(['Lease.pdf']);
    const preexisting = handles.get('Lease.pdf');
    const blob = new Blob([new Uint8Array([1])]);

    await saveAllToFolder(folder, [
      { name: 'Lease.pdf', blob },
      { name: 'Lease.pdf', blob },
      { name: 'Other.pdf', blob },
    ]);

    expect(preexisting?.writes).toEqual([]);
    expect(created).toEqual(['Lease (2).pdf', 'Lease (3).pdf', 'Other.pdf']);
    for (const name of created) expect(handles.get(name)?.writes).toEqual([blob]);
  });
});
