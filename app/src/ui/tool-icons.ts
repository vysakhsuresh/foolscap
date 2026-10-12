/**
 * One drawn glyph per live tool, for its card and its drop zone. Kept in step
 * with the copies in the static HTML (app/index.html), which show before any
 * script runs.
 */
import type { ToolId } from '../ops/tools';

const stroke = 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';

export const TOOL_ICONS: Partial<Record<ToolId, string>> = {
  merge: `<path d="M6 3v4a5 5 0 0 0 5 5h1M18 3v4a5 5 0 0 1-5 5h-1M12 12v9M8.5 17.5 12 21l3.5-3.5" ${stroke}/>`,
  split: `<path d="M12 3v7M12 10c0 4-6 4-6 8v3M12 10c0 4 6 4 6 8v3M3 18l3 3 3-3M15 18l3 3 3-3" ${stroke}/>`,
  organise: `<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14.5 17a3 3 0 1 0 1-2.2M14.5 13.5v3h3" ${stroke}/>`,
};
