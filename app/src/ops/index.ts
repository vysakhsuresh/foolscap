/** The only public surface of the ops: the shape, the registry, and a lookup. */
import type { Op } from './op';
import type { ToolId } from './tools';

export * from './op';
export * from './tools';

export function getOp(id: ToolId): Op {
  throw new Error(`No op for ${id} yet`);
}
