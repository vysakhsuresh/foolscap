/** The only public surface of the file layer. */
export * from './types';
export { createWorkspace } from './workspace';
export { createWorkerWorkspace } from './workspace-worker';
export { createMemoryWorkspace } from './workspace-memory';
export { serveWorkspace } from './workspace-protocol';
export { createDocumentStore } from './document-store';
export { createExporter } from './exporter';
