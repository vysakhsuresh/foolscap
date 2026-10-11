/**
 * The one place a console call is allowed, and only in dev. It takes a short
 * label and an error; never a FoolscapFile, never a name. In a production
 * build it is a no-op, so nothing a visitor does reaches the console.
 */
export function devlog(label: string, error?: unknown): void {
  if (!import.meta.env.DEV) return;
  // eslint-disable-next-line no-console
  console.error(label, error);
}
