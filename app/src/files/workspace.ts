/**
 * Choosing and wiring a Workspace.
 *
 * On the page, `createWorkspace()` starts the storage worker and asks it to
 * probe OPFS. A good probe gives an OPFS Workspace that reads here and
 * forwards every write to that worker; anything else gives the memory
 * Workspace. The op worker's own Workspace is `createWorkerWorkspace` in
 * workspace-worker.ts, kept apart so the worker bundle never carries the
 * storage worker's URL.
 */
import { createCaller, type Caller } from './rpc';
import type { Workspace } from './types';
import { createMemoryWorkspace } from './workspace-memory';
import { listOpfs, openDirs, readOpfs } from './workspace-opfs';
import { createWorkspaceClient } from './workspace-protocol';

/** Long enough for a slow phone to fetch and start a tiny same-origin worker; past it, memory. */
const PROBE_TIMEOUT_MS = 10_000;

function probe(worker: Worker, caller: Caller): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), PROBE_TIMEOUT_MS);
    const settle = (ok: boolean) => {
      clearTimeout(timer);
      resolve(ok);
    };
    worker.addEventListener('error', () => settle(false));
    caller.call({ op: 'probe' }).then(
      (ok) => settle(ok === true),
      () => settle(false),
    );
  });
}

function createPageOpfsWorkspace(storage: StorageManager, caller: Caller): Workspace {
  const forwarded = createWorkspaceClient(caller, 'opfs');
  const dirs = openDirs(storage);
  return {
    backend: 'opfs',
    ready: dirs.then(() => undefined),
    put: forwarded.put,
    read: async (file) => readOpfs(await dirs, file.id),
    list: async () => listOpfs(await dirs),
    remove: forwarded.remove,
    clear: forwarded.clear,
    clearExcept: forwarded.clearExcept,
  };
}

export async function createWorkspace(): Promise<Workspace> {
  let worker: Worker | null = null;
  try {
    worker = new Worker(new URL('./storage.worker.ts', import.meta.url), { type: 'module' });
    const caller = createCaller(worker);
    if (await probe(worker, caller)) {
      const ws = createPageOpfsWorkspace(navigator.storage, caller);
      await ws.ready;
      return ws;
    }
  } catch {
    // Fall through: no Worker, no OPFS, or a page-side getDirectory that failed.
  }
  worker?.terminate();
  return createMemoryWorkspace();
}
