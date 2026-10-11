/**
 * Request and reply over anything with `postMessage`: a Worker, a worker's own
 * scope, or one end of a MessageChannel. Every request carries a sequence
 * number so its reply finds the right caller. Messages without the `rpc` tag
 * are left alone, so a port can carry other traffic beside these.
 *
 * Replies carry an error's message only — never its stack or name — because
 * the message is what the user will be shown.
 */

export interface PortLike {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (ev: MessageEvent) => void): void;
  /** MessagePorts deliver nothing until started; Workers have no such method. */
  start?(): void;
}

interface Request {
  readonly rpc: 'request';
  readonly seq: number;
  readonly body: unknown;
}

type Reply =
  | { readonly rpc: 'reply'; readonly seq: number; readonly ok: true; readonly value: unknown }
  | { readonly rpc: 'reply'; readonly seq: number; readonly ok: false; readonly message: string };

function tagged(data: unknown, tag: string): data is { rpc: string; seq: number } {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { rpc?: unknown }).rpc === tag &&
    typeof (data as { seq?: unknown }).seq === 'number'
  );
}

export interface Caller {
  call(body: unknown): Promise<unknown>;
  /** Rejects every request still waiting — used when the far side has died. */
  failAll(message: string): void;
}

export function createCaller(port: PortLike): Caller {
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  let seq = 0;
  port.addEventListener('message', (ev) => {
    const data: unknown = ev.data;
    if (!tagged(data, 'reply')) return;
    const reply = data as Reply;
    const waiting = pending.get(reply.seq);
    if (!waiting) return;
    pending.delete(reply.seq);
    if (reply.ok) waiting.resolve(reply.value);
    else waiting.reject(new Error(reply.message));
  });
  port.start?.();
  return {
    call(body) {
      return new Promise((resolve, reject) => {
        seq += 1;
        pending.set(seq, { resolve, reject });
        const request: Request = { rpc: 'request', seq, body };
        port.postMessage(request);
      });
    },
    failAll(message) {
      for (const waiting of pending.values()) waiting.reject(new Error(message));
      pending.clear();
    },
  };
}

export function serve(port: PortLike, handler: (body: unknown) => Promise<unknown>): void {
  port.addEventListener('message', (ev) => {
    const data: unknown = ev.data;
    if (!tagged(data, 'request')) return;
    const { seq, body } = data as Request;
    handler(body).then(
      (value) => {
        const reply: Reply = { rpc: 'reply', seq, ok: true, value };
        port.postMessage(reply);
      },
      (error: unknown) => {
        const reply: Reply = { rpc: 'reply', seq, ok: false, message: plainMessage(error) };
        port.postMessage(reply);
      },
    );
  });
  port.start?.();
}

/** The message of an error we threw ourselves, or a generic line for anything else. */
export function plainMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong.';
}
