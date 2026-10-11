/**
 * The op worker's Workspace. On OPFS it writes its outputs itself through
 * sync access handles; on memory it is a client of the page's store over the
 * MessagePort the job runner handed it at init. The op worker imports this
 * module alone, so the page's storage worker stays out of its bundle.
 */
import { createCaller } from './rpc';
import type { Workspace } from './types';
import { createOpfsWorkspace } from './workspace-opfs';
import { createWorkspaceClient } from './workspace-protocol';

export function createWorkerWorkspace(backend: Workspace['backend'], scopeNavigator: Navigator, port?: MessagePort): Workspace {
  if (backend === 'opfs') return createOpfsWorkspace(scopeNavigator.storage);
  if (!port) throw new Error('Something went wrong.');
  return createWorkspaceClient(createCaller(port), 'memory');
}
