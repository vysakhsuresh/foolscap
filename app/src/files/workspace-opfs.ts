/**
 * The OPFS backend. Everything here is named by id: directory "foolscap"
 * holds files/<id> (the bytes) and meta/<id>.json (name, size, kind, origin,
 * and when it was added, so `list()` keeps insertion order like the memory
 * backend does). No file name on disk ever comes from a document.
 *
 * Writes go through `createSyncAccessHandle()`, which exists only in workers,
 * so `createOpfsWorkspace` is for workers: the storage worker on the page's
 * behalf, and the op worker for its own outputs. The page reads directly —
 * `getFile()` is lazy and allowed anywhere — through `openDirs`, `readOpfs`
 * and `listOpfs`.
 *
 * A put is finalised by its meta file, written LAST. Until then the bytes
 * file is invisible to `list()`, and `sweepOpfs` deletes any bytes file
 * without meta at start-up, so a job cancelled or crashed mid-write never
 * leaves half a document that looks like the user's. (OPFS `move()` would
 * allow a rename-into-place instead, but it is Chromium-only; meta-last works
 * everywhere and needs no second path.)
 */
import { asBlob } from './workspace-protocol';
import type { FileKind, FoolscapFile, Origin, Workspace } from './types';

const ROOT = 'foolscap';
const FILES = 'files';
const META = 'meta';
const PROBE = 'probe';

export interface OpfsDirs {
  readonly root: FileSystemDirectoryHandle;
  readonly files: FileSystemDirectoryHandle;
  readonly meta: FileSystemDirectoryHandle;
}

interface Meta {
  readonly name: string;
  readonly size: number;
  readonly kind: FileKind;
  readonly origin: Origin;
  readonly added: number;
}

const GONE = 'This file is no longer available. Add it again.';

export async function openDirs(storage: StorageManager): Promise<OpfsDirs> {
  const top = await storage.getDirectory();
  const root = await top.getDirectoryHandle(ROOT, { create: true });
  const files = await root.getDirectoryHandle(FILES, { create: true });
  const meta = await root.getDirectoryHandle(META, { create: true });
  return { root, files, meta };
}

/**
 * Workers only. True only if a byte really went through a sync access handle
 * and the probe file came off again; any throw — no OPFS, private browsing,
 * a quota of zero — means the memory backend.
 */
export async function probeOpfs(storage: StorageManager): Promise<boolean> {
  try {
    const { root } = await openDirs(storage);
    const handle = await root.getFileHandle(PROBE, { create: true });
    const access = await handle.createSyncAccessHandle();
    try {
      access.truncate(0);
      access.write(new Uint8Array([0]), { at: 0 });
      access.flush();
    } finally {
      access.close();
    }
    await root.removeEntry(PROBE);
    return true;
  } catch {
    return false;
  }
}

function isNotFound(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotFoundError';
}

async function ignoreMissing(action: Promise<void>): Promise<void> {
  try {
    await action;
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
}

function isMeta(value: unknown): value is Meta {
  if (typeof value !== 'object' || value === null) return false;
  const m = value as Record<string, unknown>;
  return (
    typeof m['name'] === 'string' &&
    typeof m['size'] === 'number' &&
    (m['kind'] === 'pdf' || m['kind'] === 'image') &&
    typeof m['origin'] === 'object' &&
    m['origin'] !== null &&
    typeof m['added'] === 'number'
  );
}

async function readMeta(dirs: OpfsDirs, id: string): Promise<Meta | null> {
  try {
    const handle = await dirs.meta.getFileHandle(`${id}.json`);
    const parsed: unknown = JSON.parse(await (await handle.getFile()).text());
    return isMeta(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function readOpfs(dirs: OpfsDirs, id: string): Promise<Blob> {
  try {
    const handle = await dirs.files.getFileHandle(id);
    return await handle.getFile();
  } catch {
    throw new Error(GONE);
  }
}

export async function listOpfs(dirs: OpfsDirs): Promise<FoolscapFile[]> {
  const found: Array<{ added: number; file: FoolscapFile }> = [];
  for await (const key of dirs.meta.keys()) {
    if (!key.endsWith('.json')) continue;
    const id = key.slice(0, -'.json'.length);
    const meta = await readMeta(dirs, id);
    if (meta) found.push({ added: meta.added, file: { id, name: meta.name, size: meta.size, kind: meta.kind, origin: meta.origin } });
  }
  found.sort((a, b) => a.added - b.added);
  return found.map((entry) => entry.file);
}

/** Meta first, so an interrupted remove leaves an unfinalised file rather than a listed one with no bytes. */
export async function removeOpfs(dirs: OpfsDirs, id: string): Promise<void> {
  await ignoreMissing(dirs.meta.removeEntry(`${id}.json`));
  await ignoreMissing(dirs.files.removeEntry(id));
}

/** Deletes bytes with no meta and meta that does not parse. Run once at start-up, in the storage worker. */
export async function sweepOpfs(dirs: OpfsDirs): Promise<void> {
  const valid = new Set<string>();
  const metaKeys: string[] = [];
  for await (const key of dirs.meta.keys()) metaKeys.push(key);
  for (const key of metaKeys) {
    const id = key.endsWith('.json') ? key.slice(0, -'.json'.length) : null;
    if (id && (await readMeta(dirs, id))) valid.add(id);
    else await ignoreMissing(dirs.meta.removeEntry(key));
  }
  const fileKeys: string[] = [];
  for await (const key of dirs.files.keys()) fileKeys.push(key);
  for (const key of fileKeys) if (!valid.has(key)) await ignoreMissing(dirs.files.removeEntry(key));
}

/** Streams the Blob in, so a large document is never held whole in this thread's memory. */
async function writeBytes(handle: FileSystemFileHandle, data: Blob): Promise<number> {
  const access = await handle.createSyncAccessHandle();
  let at = 0;
  try {
    access.truncate(0);
    const reader = data.stream().getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      access.write(value, { at });
      at += value.byteLength;
    }
    access.flush();
  } finally {
    access.close();
  }
  return at;
}

function putFailure(error: unknown): Error {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return new Error("There isn't enough storage space on this device for this file. Free some space and try again.");
  }
  return new Error("This file couldn't be saved on this device. Try again.");
}

/**
 * Workers only: `put` writes through sync access handles. The storage worker
 * serves one of these to the page; the op worker builds its own.
 */
export function createOpfsWorkspace(storage: StorageManager): Workspace {
  const dirs = openDirs(storage);

  const put = async (name: string, data: Blob | Uint8Array, kind: FileKind, origin: Origin): Promise<FoolscapFile> => {
    const d = await dirs;
    const id = crypto.randomUUID();
    const blob = asBlob(data);
    try {
      const size = await writeBytes(await d.files.getFileHandle(id, { create: true }), blob);
      const meta: Meta = { name, size, kind, origin, added: Date.now() };
      const metaHandle = await d.meta.getFileHandle(`${id}.json`, { create: true });
      await writeBytes(metaHandle, new Blob([JSON.stringify(meta)]));
      return { id, name, size, kind, origin };
    } catch (error) {
      await removeOpfs(d, id).catch(() => undefined);
      throw putFailure(error);
    }
  };

  return {
    backend: 'opfs',
    ready: dirs.then(() => undefined),
    put,
    read: async (file) => readOpfs(await dirs, file.id),
    remove: async (file) => removeOpfs(await dirs, file.id),
    list: async () => listOpfs(await dirs),
    clear: async () => {
      const d = await dirs;
      for (const file of await listOpfs(d)) await removeOpfs(d, file.id);
    },
    clearExcept: async (ids) => {
      const d = await dirs;
      const keep = new Set(ids);
      for (const file of await listOpfs(d)) if (!keep.has(file.id)) await removeOpfs(d, file.id);
    },
  };
}
