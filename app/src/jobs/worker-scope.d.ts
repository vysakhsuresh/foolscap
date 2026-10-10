/**
 * The dedicated-worker global, typed, under a DOM-lib tsconfig.
 *
 * TypeScript cannot load the DOM and WebWorker libs together, and the app is
 * typed against the DOM. Worker entry files cast `self` to this once
 * (`const scope = self as unknown as WorkerScope`) and reach the global only
 * through it, never through `window` or `document`. One of exactly two
 * ambient files in the app; see files/fs-access.d.ts for the other.
 */
interface WorkerScope {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((this: WorkerScope, ev: MessageEvent) => void) | null;
  onmessageerror: ((this: WorkerScope, ev: MessageEvent) => void) | null;
  addEventListener(type: 'message', listener: (ev: MessageEvent) => void): void;
  addEventListener(type: 'error', listener: (ev: ErrorEvent) => void): void;
  close(): void;
  readonly navigator: Navigator;
}
