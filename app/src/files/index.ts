/** The only public surface of the file layer. */
import type { DocumentStore, Exporter, Workspace } from './types';

export * from './types';

export function createWorkspace(): Promise<Workspace> {
  throw new Error('Workspace not implemented yet');
}

export function createDocumentStore(_workspace: Workspace): DocumentStore {
  throw new Error('DocumentStore not implemented yet');
}

export function createExporter(_workspace: Workspace): Exporter {
  throw new Error('Exporter not implemented yet');
}
