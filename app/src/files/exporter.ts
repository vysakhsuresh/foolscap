/**
 * The only module that hands bytes back to the user. See the Exporter
 * contract in types.ts: a save dialog or a chosen folder where the browser
 * has them, an <a download> otherwise, and never a write over an existing
 * file in a chosen folder.
 */
import { zipSync, type Zippable } from 'fflate';
import type { Exporter, FoolscapFile, SaveOutcome, ShareOutcome, Workspace } from './types';

/** The type a saved or shared file declares, from its name. Outputs are PDFs and, from Extract images, images. */
const TYPES: Record<string, { mime: string; description: string }> = {
  '.pdf': { mime: 'application/pdf', description: 'PDF' },
  '.jpg': { mime: 'image/jpeg', description: 'JPEG image' },
  '.jpeg': { mime: 'image/jpeg', description: 'JPEG image' },
  '.png': { mime: 'image/png', description: 'PNG image' },
  '.jp2': { mime: 'image/jp2', description: 'JPEG 2000 image' },
  '.txt': { mime: 'text/plain', description: 'Text' },
  '.docx': { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', description: 'Word document' },
  '.xlsx': { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', description: 'Excel spreadsheet' },
  '.pptx': { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', description: 'PowerPoint deck' },
  '.epub': { mime: 'application/epub+zip', description: 'EPUB e-book' },
  '.html': { mime: 'text/html', description: 'Web page' },
  '.csv': { mime: 'text/csv', description: 'Spreadsheet text' },
};

export function typeOf(name: string): { ext: string; mime: string; description: string } {
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot).toLowerCase() : '';
  const known = TYPES[ext];
  return known ? { ext, ...known } : { ext, mime: 'application/octet-stream', description: 'File' };
}

const isAbort = (error: unknown): boolean => error instanceof DOMException && error.name === 'AbortError';

/** "x.pdf" with 2 → "x (2).pdf"; a name without an extension gets the suffix at the end. */
export function withSuffix(name: string, n: number): string {
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  return `${stem} (${n})${ext}`;
}

/** The first of name, "name (2)", "name (3)"… that `exists` says is free. */
export async function uniqueName(name: string, exists: (candidate: string) => Promise<boolean>): Promise<string> {
  if (!(await exists(name))) return name;
  for (let n = 2; ; n += 1) {
    const candidate = withSuffix(name, n);
    if (!(await exists(candidate))) return candidate;
  }
}

/** ZIP entry names: no path separators, and duplicates numbered the same way a folder would. */
export function zipEntryNames(names: readonly string[]): string[] {
  const taken = new Set<string>();
  return names.map((raw) => {
    const flat = raw.replace(/[\\/]+/g, '_') || 'file.pdf';
    let entry = flat;
    for (let n = 2; taken.has(entry); n += 1) entry = withSuffix(flat, n);
    taken.add(entry);
    return entry;
  });
}

/**
 * One ZIP holding every entry, stored rather than deflated (level 0): PDFs are
 * already compressed, so deflate would cost time on a phone and save nothing.
 */
export function zipEntries(entries: ReadonlyArray<{ name: string; bytes: Uint8Array }>): Uint8Array<ArrayBuffer> {
  const names = zipEntryNames(entries.map((entry) => entry.name));
  const zippable: Zippable = {};
  entries.forEach((entry, i) => {
    const name = names[i];
    if (name) zippable[name] = [entry.bytes, { level: 0 }];
  });
  return zipSync(zippable, { level: 0 });
}

/** Just enough of a directory handle to write new files into. The real one fits; so does a fake in a test. */
export interface Folder {
  getFileHandle(name: string, options?: { create?: boolean }): Promise<{
    createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
  }>;
}

/**
 * Writes each entry into `folder` as a NEW file. The existence check is a
 * `getFileHandle` without `create`; an entry that resolves is never opened
 * for writing, it only pushes the name along to "(2)", "(3)"…
 */
export async function saveAllToFolder(folder: Folder, entries: ReadonlyArray<{ name: string; blob: Blob }>): Promise<void> {
  const exists = async (candidate: string) => {
    try {
      await folder.getFileHandle(candidate);
      return true;
    } catch {
      return false;
    }
  };
  for (const entry of entries) {
    const name = await uniqueName(entry.name, exists);
    const handle = await folder.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    await writable.write(entry.blob);
    await writable.close();
  }
}

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  a.hidden = true;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

const SAVE_FAILED = "The file couldn't be saved there. Try saving it somewhere else.";

export function createExporter(ws: Workspace): Exporter {
  // Made once per result: asking whether a file can be sent and then sending
  // it read it once, so the share sheet opens while the tap still counts.
  const made = new Map<string, Promise<File>>();
  const asFile = (file: FoolscapFile): Promise<File> => {
    let ready = made.get(file.id);
    if (!ready) {
      ready = ws.read(file).then((blob) => new File([blob], file.name, { type: typeOf(file.name).mime }));
      // A read that failed is tried again next time, not remembered.
      ready.catch(() => made.delete(file.id));
      made.set(file.id, ready);
    }
    return ready;
  };

  const save = async (file: FoolscapFile): Promise<SaveOutcome> => {
    const blob = await ws.read(file);
    const picker = window.showSaveFilePicker;
    if (!picker) {
      download(blob, file.name);
      return { kind: 'downloaded' };
    }
    try {
      const type = typeOf(file.name);
      const handle = await picker({
        suggestedName: file.name,
        // A picker refuses an odd extension ("x.my file"), so only a plain one is offered as a type.
        ...(/^\.[a-z0-9]{1,12}$/.test(type.ext) ? { types: [{ description: type.description, accept: { [type.mime]: [type.ext] } }] } : {}),
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { kind: 'saved' };
    } catch (error) {
      return isAbort(error) ? { kind: 'cancelled' } : { kind: 'failed', reason: SAVE_FAILED };
    }
  };

  const saveAll = async (files: readonly FoolscapFile[], zipName: string): Promise<SaveOutcome> => {
    const blobs = await Promise.all(files.map((file) => ws.read(file)));
    const picker = window.showDirectoryPicker;
    if (picker) {
      try {
        const folder = await picker({ mode: 'readwrite' });
        await saveAllToFolder(
          folder,
          files.map((file, i) => ({ name: file.name, blob: blobs[i] ?? new Blob() })),
        );
        return { kind: 'saved' };
      } catch (error) {
        return isAbort(error) ? { kind: 'cancelled' } : { kind: 'failed', reason: SAVE_FAILED };
      }
    }
    const entries = await Promise.all(
      files.map(async (file, i) => ({ name: file.name, bytes: new Uint8Array(await (blobs[i] ?? new Blob()).arrayBuffer()) })),
    );
    const zip = zipEntries(entries);
    download(new Blob([zip], { type: 'application/zip' }), zipName.endsWith('.zip') ? zipName : `${zipName}.zip`);
    return { kind: 'downloaded' };
  };

  const canShare = async (files: readonly FoolscapFile[]): Promise<boolean> => {
    if (typeof navigator.canShare !== 'function' || typeof navigator.share !== 'function' || files.length === 0) return false;
    try {
      return navigator.canShare({ files: await Promise.all(files.map(asFile)) });
    } catch {
      return false;
    }
  };

  const share = async (files: readonly FoolscapFile[]): Promise<ShareOutcome> => {
    if (!(await canShare(files))) return { kind: 'unsupported' };
    try {
      await navigator.share({ files: await Promise.all(files.map(asFile)) });
      return { kind: 'shared' };
    } catch (error) {
      return isAbort(error) ? { kind: 'cancelled' } : { kind: 'failed', reason: "Sharing didn't work. Save the file instead." };
    }
  };

  return { save, saveAll, canShare, share };
}
