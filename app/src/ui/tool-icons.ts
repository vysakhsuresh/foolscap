/**
 * One drawn glyph per tool and per family, 24-unit grid, stroked in
 * currentColor so the family colour decides how they look. The page
 * generator (scripts/gen-pages.ts) writes them into the static HTML; the home
 * search uses the same strings.
 */
import type { GroupId, ToolId } from '../ops/tools';

const stroke = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const draw = (d: string) => `<path d="${d}" ${stroke}/>`;

export const TOOL_ICONS: Record<ToolId, string> = {
  merge: draw('M6 3v4a5 5 0 0 0 5 5h1M18 3v4a5 5 0 0 1-5 5h-1M12 12v9M8.5 17.5 12 21l3.5-3.5'),
  split: draw('M12 3v7M12 10c0 4-6 4-6 8v3M12 10c0 4 6 4 6 8v3M3 18l3 3 3-3M15 18l3 3 3-3'),
  organise: draw('M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14.5 17a3 3 0 1 0 1-2.2M14.5 13.5v3h3'),
  'extract-pages': draw('M6 3h8l4 4v14H6zM14 3v4h4M9 14l2 2 4-4'),
  'insert-pages': draw('M6 3h8l4 4v14H6zM14 3v4h4M12 10v7M8.5 13.5h7'),
  crop: draw('M6 2v14a2 2 0 0 0 2 2h14M2 6h14a2 2 0 0 1 2 2v14'),
  'split-by-size': draw('M3 4h9v16H3zM15 10h6v10h-6zM6 9h3M17 14h2'),
  compress: draw('M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7'),
  'images-to-pdf': draw('M3 4h18v16H3zM3 16l5-5 4 4 3-3 6 6M15.5 8.5h.01'),
  'pdf-to-images': draw('M5 3h10l4 4v14H5zM5 17l4-4 3 3 2-2 5 5'),
  'n-up': draw('M4 3h16v18H4zM7 6h4v5H7zM13 6h4v5h-4zM7 13h4v5H7zM13 13h4v5h-4z'),
  'extract-images': draw('M3 5h12v12H3zM3 14l4-4 3 3 2-2 3 3M17 11h5M20 9l2 2-2 2'),
  watermark: draw('M12 3c3 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-7 6-11z'),
  'page-numbers': draw('M9 4 7 20M17 4l-2 16M4 9h16M3 15h16'),
  sign: draw('M4 20h16M15 4l5 5L9 20H4v-5z'),
  'mark-up': draw('M8 14l7-7 3 3-7 7-3-3zM14 8l3-3 3 3-3 3M8 14l-4 6h6l1-3'),
  'add-text': draw('M5 5h14M12 5v14M9 19h6'),
  'fill-form': draw('M4 4h16v16H4zM8 8h8M8 12h8M8 16h4'),
  'header-footer': draw('M5 3h14v18H5zM8 6h8M8 18h8M8 10h8'),
  'add-password': draw('M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4M12 15v2'),
  'remove-password': draw('M6 11h12v10H6zM8 11V7a4 4 0 0 1 7.6-1.8M12 15v2'),
  'remove-areas': draw('M4 5h16M4 10h6M13 9h7v3h-7zM4 15h16M4 19h9'),
  'document-details': draw('M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v6M12 7.5h.01'),
  read: draw('M3 5h6a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H3zM21 5h-6a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h7z'),
  scan: draw('M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M4 12h16'),
  ocr: draw('M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M8.5 15.5l2.5-7 2.5 7M9.5 13h3M16 10v5.5'),
  'extract-text': draw('M5 6h14M5 10h14M5 14h9M5 18h6'),
};

export const GROUP_ICONS: Record<GroupId, string> = {
  pages: draw('M7 3h10l2 2v14H7zM4 7v14h12'),
  convert: draw('M4 8h15l-3-3M20 16H5l3 3'),
  mark: draw('M15 4l5 5L9 20H4v-5z'),
  protect: draw('M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z'),
  read: draw('M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'),
};
