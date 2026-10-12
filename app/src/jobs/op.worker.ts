/**
 * The op worker. One lives per page, created at load; it runs jobs in turn
 * and keeps nothing between them. The job runner on the page owns its
 * lifecycle: cancel is an abort first and a terminate second.
 */
import type { Workspace } from '../files/types';
import { createWorkerWorkspace } from '../files/workspace-worker';
import { getOp } from '../ops';
import { OpCancelled, type OcrReader, type OpContext } from '../ops/op';
import { createSurgeon } from '../pdf/surgeon';
import type { PdfEngine } from '../pdf/types';
import { WENT_WRONG, failureFor, type FromWorker, type ToWorker } from './protocol';

const scope = self as unknown as WorkerScope;
const post = (message: FromWorker) => scope.postMessage(message);

let workspace: Workspace | null = null;
let current: { readonly jobId: string; readonly controller: AbortController } | null = null;

// Memoised for the worker's life: the pdf.js chunk is imported once, and only when a tool rasterises.
let enginePromise: Promise<PdfEngine> | null = null;
// A start that failed is not remembered: the next run tries again.
const engine = (): Promise<PdfEngine> =>
  (enginePromise ??= import('../pdf/engine-worker')
    .then(async (m) => {
      const created = m.createEngine();
      await created.ready;
      return created;
    })
    .catch((error: unknown) => {
      enginePromise = null;
      throw error;
    }));

let ocrPromise: Promise<OcrReader> | null = null;
const ocr = (): Promise<OcrReader> =>
  (ocrPromise ??= import('../ocr/ocr')
    .then(async (m) => {
      const created = m.createOcr();
      await created.ready;
      return created;
    })
    .catch((error: unknown) => {
      ocrPromise = null;
      throw error;
    }));

async function init(message: Extract<ToWorker, { type: 'init' }>): Promise<void> {
  workspace = createWorkerWorkspace(message.backend, scope.navigator, message.port);
  await workspace.ready;
  // A failure here is the op's to report, in words, when it asks for the engine.
  if (message.engine === true) await engine().catch(() => undefined);
  if (message.ocr === true) await ocr().catch(() => undefined);
  post({ type: 'inited' });
}

async function run(message: Extract<ToWorker, { type: 'run' }>): Promise<void> {
  const { jobId } = message;
  const ws = workspace;
  if (!ws) {
    post({ type: 'failed', jobId, reason: WENT_WRONG });
    return;
  }
  const controller = new AbortController();
  current = { jobId, controller };
  const ctx: OpContext = {
    workspace: {
      ...ws,
      put: async (name, data, kind, origin) => {
        const file = await ws.put(name, data, kind, origin);
        post({ type: 'produced', jobId, file });
        return file;
      },
    },
    engine,
    ocr,
    surgeon: createSurgeon(),
    passwords: new Map(message.passwords),
    signal: controller.signal,
    progress: (progress) => post({ type: 'progress', jobId, progress }),
  };
  try {
    const outcomes = await getOp(message.tool).run(message.inputs, message.params, ctx);
    post({ type: 'done', jobId, outcomes });
  } catch (error) {
    if (error instanceof OpCancelled || controller.signal.aborted) post({ type: 'cancelled', jobId });
    else post({ type: 'failed', jobId, ...failureFor(error) });
  } finally {
    current = null;
  }
}

scope.addEventListener('message', (ev: MessageEvent) => {
  const message = ev.data as ToWorker;
  switch (message.type) {
    case 'init':
      void init(message);
      break;
    case 'run':
      void run(message);
      break;
    case 'cancel':
      if (current?.jobId === message.jobId) current.controller.abort();
      break;
  }
});
