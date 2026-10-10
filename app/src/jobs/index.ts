/** The only public surface of the job runner. */
import type { Workspace } from '../files/types';
import type { JobRunner } from './types';

export * from './types';

export function createJobRunner(_workspace: Workspace): JobRunner {
  throw new Error('JobRunner not implemented yet');
}
