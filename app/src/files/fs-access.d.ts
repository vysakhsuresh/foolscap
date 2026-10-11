/**
 * The File System Access and OPFS members that TypeScript's DOM lib does not
 * declare. This is one of exactly two ambient files in the app (the other is
 * jobs/worker-scope.d.ts); nothing else uses `declare global`, `as any` or
 * `@ts-ignore`.
 *
 * Deliberately absent: `showOpenFilePicker` and
 * `DataTransferItem.getAsFileSystemHandle`. Both hand over a handle that can
 * be written to, and Foolscap never writes to a file the user picked. If
 * they are not declared, they cannot be called by accident.
 */

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: Array<{ description?: string; accept: Record<string, string[]> }>;
  excludeAcceptAllOption?: boolean;
}

interface DirectoryPickerOptions {
  mode?: 'read' | 'readwrite';
  startIn?: string;
}

interface Window {
  /** Only app/src/files/exporter.ts may call this. */
  showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;
  /** Only app/src/files/exporter.ts may call this. */
  showDirectoryPicker?: (options?: DirectoryPickerOptions) => Promise<FileSystemDirectoryHandle>;
}

interface FileSystemSyncAccessHandle {
  read(buffer: ArrayBufferView | ArrayBuffer, options?: { at?: number }): number;
  write(buffer: ArrayBufferView | ArrayBuffer, options?: { at?: number }): number;
  truncate(newSize: number): void;
  getSize(): number;
  flush(): void;
  close(): void;
}

interface FileSystemFileHandle {
  /** Workers only. Only app/src/files/workspace*.ts may call this, on handles under getDirectory(). */
  createSyncAccessHandle(): Promise<FileSystemSyncAccessHandle>;
}

interface FileSystemDirectoryHandle {
  /**
   * Entry names, for listing and sweeping the workspace. TypeScript keeps this
   * in the DOM.AsyncIterable lib, which the tsconfig does not load.
   */
  keys(): AsyncIterableIterator<string>;
}
