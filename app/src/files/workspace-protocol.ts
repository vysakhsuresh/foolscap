/**
 * A Workspace, spoken over a port. Two uses: the page's memory Workspace
 * served to the op worker over a MessagePort (the worker's Workspace is a
 * client of it), and the storage worker's OPFS Workspace served to the page
 * (which forwards its writes there, because OPFS writes happen only in a
 * worker). Blobs cross by structured clone, which shares their backing store;
 * a Uint8Array is wrapped in a Blob on the client before it goes.
 */
import { serve, type Caller, type PortLike } from './rpc';
import type { FileKind, FoolscapFile, Origin, Workspace } from './types';

export type WorkspaceRequest =
  | { readonly op: 'put'; readonly name: string; readonly data: Blob; readonly kind: FileKind; readonly origin: Origin }
  | { readonly op: 'read'; readonly file: FoolscapFile }
  | { readonly op: 'remove'; readonly file: FoolscapFile }
  | { readonly op: 'list' }
  | { readonly op: 'clear' }
  | { readonly op: 'clearExcept'; readonly ids: readonly string[] };

const OPS: ReadonlySet<string> = new Set(['put', 'read', 'remove', 'list', 'clear', 'clearExcept']);

export function isWorkspaceRequest(body: unknown): body is WorkspaceRequest {
  return typeof body === 'object' && body !== null && OPS.has(String((body as { op?: unknown }).op));
}

export function handleWorkspaceRequest(ws: Workspace, request: WorkspaceRequest): Promise<unknown> {
  switch (request.op) {
    case 'put':
      return ws.put(request.name, request.data, request.kind, request.origin);
    case 'read':
      return ws.read(request.file);
    case 'remove':
      return ws.remove(request.file);
    case 'list':
      return ws.list();
    case 'clear':
      return ws.clear();
    case 'clearExcept':
      return ws.clearExcept(request.ids);
  }
}

export function serveWorkspace(ws: Workspace, port: PortLike): void {
  serve(port, (body) => {
    if (!isWorkspaceRequest(body)) return Promise.reject(new Error('Something went wrong.'));
    return handleWorkspaceRequest(ws, body);
  });
}

/**
 * A Uint8Array becomes a Blob with no copy. The assertion only narrows the
 * buffer's type for the Blob constructor: nothing here is ever backed by a
 * SharedArrayBuffer.
 */
export function asBlob(data: Blob | Uint8Array): Blob {
  return data instanceof Blob ? data : new Blob([data as Uint8Array<ArrayBuffer>]);
}

export function createWorkspaceClient(caller: Caller, backend: Workspace['backend']): Workspace {
  const call = <T>(request: WorkspaceRequest) => caller.call(request) as Promise<T>;
  return {
    backend,
    ready: Promise.resolve(),
    put: (name, data, kind, origin) => call<FoolscapFile>({ op: 'put', name, data: asBlob(data), kind, origin }),
    read: (file) => call<Blob>({ op: 'read', file }),
    remove: (file) => call<void>({ op: 'remove', file }),
    list: () => call<FoolscapFile[]>({ op: 'list' }),
    clear: () => call<void>({ op: 'clear' }),
    clearExcept: (ids) => call<void>({ op: 'clearExcept', ids: [...ids] }),
  };
}
