/**
 * The memory backend: a Map on the page. Blobs and Files are held by
 * reference — a picked File carries no write path, so keeping it costs
 * nothing and copies nothing. A Uint8Array is wrapped in a Blob and the array
 * dropped, so no ArrayBuffer is ever held or transferred.
 */
import { asBlob } from './workspace-protocol';
import type { FoolscapFile, Workspace } from './types';

export function createMemoryWorkspace(): Workspace {
  const entries = new Map<string, { readonly meta: FoolscapFile; readonly blob: Blob }>();

  const lookup = (file: FoolscapFile) => {
    const entry = entries.get(file.id);
    if (!entry) throw new Error('This file is no longer available. Add it again.');
    return entry;
  };

  return {
    backend: 'memory',
    ready: Promise.resolve(),
    async put(name, data, kind, origin) {
      const blob = asBlob(data);
      const meta: FoolscapFile = { id: crypto.randomUUID(), name, size: blob.size, kind, origin };
      entries.set(meta.id, { meta, blob });
      return meta;
    },
    async read(file) {
      return lookup(file).blob;
    },
    async remove(file) {
      entries.delete(file.id);
    },
    async list() {
      return [...entries.values()].map((entry) => entry.meta);
    },
    async clear() {
      entries.clear();
    },
    async clearExcept(ids) {
      const keep = new Set(ids);
      for (const id of [...entries.keys()]) if (!keep.has(id)) entries.delete(id);
    },
  };
}
