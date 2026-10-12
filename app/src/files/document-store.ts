/**
 * The only way a document enters. A File from an input or a drop carries no
 * write handle, and `put` copies it into the Workspace (or keeps it by
 * reference on the memory backend), so nothing downstream can reach the
 * original.
 */
import type { DocumentStore, FileKind, ImportResult, Workspace } from './types';

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

/**
 * True for the image formats a browser can decode: JPEG, PNG, GIF, WebP, BMP,
 * and HEIC/AVIF (whether this browser can actually read those is found out
 * when the tool runs, and said in words if not). By bytes, not by name.
 */
export function looksLikeImage(head: Uint8Array): boolean {
  const ascii = (from: number, to: number) => String.fromCharCode(...head.subarray(from, to));
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return true;
  if (head[0] === 0x89 && ascii(1, 4) === 'PNG') return true;
  if (ascii(0, 4) === 'GIF8' || ascii(0, 2) === 'BM') return true;
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return true;
  return ascii(4, 8) === 'ftyp' && /^(heic|heix|hevc|heim|heis|mif1|msf1|avif|avis)$/.test(ascii(8, 12));
}

/**
 * `accept`: 'pdf' and 'image' refuse anything else; 'any' takes every file,
 * as a PDF when it is one (Attachments: the PDF, then what goes inside it).
 */
export function createDocumentStore(ws: Workspace, accept: 'pdf' | 'image' | 'any' = 'pdf'): DocumentStore {
  const importOne = async (file: File): Promise<ImportResult> => {
    const name = file.name;
    try {
      if (file.size === 0) return { ok: false, name, reason: 'This file is empty.' };
      const head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
      if (accept === 'image') {
        if (!looksLikeImage(head)) return { ok: false, name, reason: "This isn't a photo or picture this tool can read. Use JPEG, PNG, WebP or GIF." };
        return { ok: true, file: await ws.put(name, file, 'image', { kind: 'picked' }) };
      }
      if (accept === 'any') {
        const kind: FileKind = looksLikePdf(head) ? 'pdf' : looksLikeImage(head) ? 'image' : 'other';
        return { ok: true, file: await ws.put(name, file, kind, { kind: 'picked' }) };
      }
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
