/** Numbers the way a person reads them. */

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  // Never rounded up: a file made under 20 KB never reads "20 KB".
  if (bytes < 1024 * 1024) return `${Math.floor(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb >= 100 ? Math.round(mb) : mb.toFixed(1)} MB`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
