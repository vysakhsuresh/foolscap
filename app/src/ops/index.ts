/** The only public surface of the ops: the shape, the registry, and a lookup. */
import { mergeOp } from './merge';
import type { Op } from './op';
import { organiseOp } from './organise';
import { splitOp } from './split';
import { toolById, type ToolId } from './tools';

export * from './op';
export * from './tools';

/**
 * Every live tool's Op, by id. A tool is `live` in tools.ts only once it has
 * an entry here; the site test checks the two lists agree.
 */
const OPS: Partial<Record<ToolId, Op>> = {
  merge: mergeOp,
  split: splitOp,
  organise: organiseOp,
};

export function getOp(id: ToolId): Op {
  const op = OPS[id];
  if (op === undefined) throw new Error(`${toolById(id).title} isn't ready yet.`);
  return op;
}

/** The ids that have an Op, for the site test. */
export const OP_IDS: readonly ToolId[] = Object.keys(OPS) as ToolId[];
