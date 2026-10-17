/**
 * The proof under every result: how many network requests were made while the
 * work ran, counted by the browser itself (the page's own timeline plus the
 * worker's, which the worker reports). Each one can only be to this site —
 * the page's policy allows no other address — and is a piece of Foolscap,
 * never a document: there is no server here to send one to.
 */
import { el } from './dom';

export interface NetworkWatch {
  /** The worker's own count, as each job reports it. */
  add(count: number): void;
  /** Stops counting and says what it saw. */
  stop(): HTMLElement;
}

export function watchNetwork(): NetworkWatch {
  const since = performance.now();
  let fromWorkers = 0;
  return {
    add(count) {
      fromWorkers += count;
    },
    stop() {
      const fromPage = performance.getEntriesByType('resource').filter((e) => e.startTime >= since).length;
      const n = fromPage + fromWorkers;
      const words =
        n === 0
          ? 'Done on this device. Network requests while it worked: 0. Nothing was uploaded.'
          : `Done on this device. While it worked, it fetched ${n === 1 ? 'one piece' : `${n} pieces`} of Foolscap itself from this site. Nothing of yours was sent: there is no server to send it to.`;
      return el('p', { class: 'net-proof', testid: 'network-proof', attrs: { 'data-requests': String(n) } }, [el('span', { class: 'net-proof__mark', attrs: { 'aria-hidden': 'true' }, text: '●' }), el('span', { text: words })]);
    },
  };
}
