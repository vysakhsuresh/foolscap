/**
 * The drop zone is a <label> around a real <input type=file>, so it works
 * before any script runs. The script adds drag-and-drop and the keyboard.
 *
 * Files come only from `input.files` and `dataTransfer.files`: never from
 * `getAsFileSystemHandle` or `webkitGetAsEntry`, which would hand over a
 * handle that can be written to.
 */
export function bindDropZone(zone: HTMLElement, input: HTMLInputElement, onFiles: (files: File[]) => void): void {
  input.addEventListener('change', () => {
    const files = input.files ? [...input.files] : [];
    // Reset so picking the same file again still fires `change`.
    input.value = '';
    if (files.length > 0) onFiles(files);
  });

  zone.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      input.click();
    }
  });

  let depth = 0;
  zone.addEventListener('dragenter', (ev) => {
    ev.preventDefault();
    depth += 1;
    zone.classList.add('is-over');
  });
  zone.addEventListener('dragover', (ev) => {
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy';
  });
  zone.addEventListener('dragleave', () => {
    depth = Math.max(0, depth - 1);
    if (depth === 0) zone.classList.remove('is-over');
  });
  zone.addEventListener('drop', (ev) => {
    ev.preventDefault();
    depth = 0;
    zone.classList.remove('is-over');
    const files = ev.dataTransfer ? [...ev.dataTransfer.files] : [];
    if (files.length > 0) onFiles(files);
  });

  // A drop anywhere else on the page would navigate to the file; swallow it.
  document.addEventListener('dragover', (ev) => ev.preventDefault());
  document.addEventListener('drop', (ev) => ev.preventDefault());
}
