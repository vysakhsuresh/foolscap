/**
 * Files that arrive from outside the page, to the Open a file page:
 *
 * - "Share → Foolscap" on a phone. The manifest's share_target posts the
 *   files to /open/; the service worker takes them, answers with a redirect
 *   to /open/?shared, and hands them over when this page asks. Nothing leaves
 *   the device: the post never reaches the network.
 * - "Open with Foolscap" on a computer. The manifest's file_handlers puts
 *   each file in the launch queue as a handle; it is turned into a File once,
 *   with getFile(), and the handle is dropped. It is never written to.
 *
 * Either way the page gets plain Files and imports them through
 * DocumentStore, like a file dropped on it.
 */
const ASK = 'foolscap:shared?';
const ANSWER = 'foolscap:shared';

export function listenForLaunchedFiles(onFiles: (files: File[]) => void): void {
  if (new URLSearchParams(location.search).has('shared')) {
    void sharedFiles().then((files) => {
      // The address goes back to plain /open/, so a reload does not ask again.
      history.replaceState(null, '', location.pathname);
      if (files.length > 0) onFiles(files);
    });
  }
  const queue = window.launchQueue;
  if (queue) {
    queue.setConsumer((params) => {
      void (async () => {
        const files: File[] = [];
        for (const handle of params.files) {
          if (handle.kind !== 'file') continue;
          try {
            files.push(await (handle as FileSystemFileHandle).getFile());
          } catch {
            // A file that cannot be read is left out; the others still open.
          }
        }
        if (files.length > 0) onFiles(files);
      })();
    });
  }
}

/** The files the service worker is holding from a share, or none. */
async function sharedFiles(): Promise<File[]> {
  if (!('serviceWorker' in navigator)) return [];
  const registration = await Promise.race([navigator.serviceWorker.ready, new Promise<null>((r) => setTimeout(() => r(null), 4000))]);
  const worker = registration?.active ?? navigator.serviceWorker.controller;
  if (!worker) return [];
  return new Promise<File[]>((resolve) => {
    const timer = setTimeout(() => {
      navigator.serviceWorker.removeEventListener('message', onMessage);
      resolve([]);
    }, 4000);
    function onMessage(ev: MessageEvent): void {
      const data = ev.data as { type?: unknown; files?: unknown } | null;
      if (!data || data.type !== ANSWER) return;
      clearTimeout(timer);
      navigator.serviceWorker.removeEventListener('message', onMessage);
      resolve(Array.isArray(data.files) ? data.files.filter((f): f is File => f instanceof File) : []);
    }
    navigator.serviceWorker.addEventListener('message', onMessage);
    worker.postMessage({ type: ASK });
  });
}
