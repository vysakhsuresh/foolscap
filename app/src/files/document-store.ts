/**
 * The only way a document enters. A File from an input or a drop carries no
 * write handle, and `put` copies it into the Workspace (or keeps it by
 * reference on the memory backend), so nothing downstream can reach the
 * original.
 */
import type { DocumentStore, ImportResult, Workspace } from './types';

const SNIFF_BYTES = 1024;
const HEADER = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

/** True if "%PDF-" appears anywhere in `bytes`. Some PDFs carry junk before the header. */
export function looksLikePdf(bytes: Uint8Array): boolean {
  outer: for (let i = 0; i + HEADER.length <= bytes.length; i += 1) {
    for (let j = 0; j < HEADER.length; j += 1) if (bytes[i + j] !== HEADER[j]) continue outer;
    return true;
  }
  return false;
}

export function createDocumentStore(ws: Workspace): DocumentStore {
  const importOne = async (file: File): Promise<ImportResult> => {
    const name = file.name;
    try {
      if (file.size === 0) return { ok: false, name, reason: 'This file is empty.' };
      const head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
      if (!looksLikePdf(head)) return { ok: false, name, reason: "This isn't a PDF." };
      return { ok: true, file: await ws.put(name, file, 'pdf', { kind: 'picked' }) };
    } catch {
      return { ok: false, name, reason: "This file couldn't be read. Try picking it again." };
    }
  };

  return {
    async import(files) {
      const results: ImportResult[] = [];
      for (const file of files) results.push(await importOne(file));
      return results;
    },
  };
}
