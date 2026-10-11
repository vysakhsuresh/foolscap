/**
 * The page's hands inside OPFS. Sync access handles exist only in workers, so
 * the page's Workspace sends its writes here; reads stay on the page. The
 * first message is the probe, which also sweeps anything an earlier session
 * left unfinalised. The worker never sees a file name except inside the meta
 * it is asked to write.
 */
import { serve } from './rpc';
import type { Workspace } from './types';
import { createOpfsWorkspace, openDirs, probeOpfs, sweepOpfs } from './workspace-opfs';
import { handleWorkspaceRequest, isWorkspaceRequest } from './workspace-protocol';

const scope = self as unknown as WorkerScope;
const storage = scope.navigator.storage;

let workspace: Workspace | null = null;

serve(scope, async (body) => {
  if (typeof body === 'object' && body !== null && (body as { op?: unknown }).op === 'probe') {
    const ok = await probeOpfs(storage);
    if (!ok) return false;
    try {
      await sweepOpfs(await openDirs(storage));
    } catch {
      // A sweep that fails leaves only invisible files behind; the store is still usable.
    }
    workspace = createOpfsWorkspace(storage);
    await workspace.ready;
    return true;
  }
  if (workspace && isWorkspaceRequest(body)) return handleWorkspaceRequest(workspace, body);
  throw new Error('Something went wrong.');
});
