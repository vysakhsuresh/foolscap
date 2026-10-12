/**
 * Every tool Foolscap offers, and what the pages need to draw it.
 *
 * Adding a tool is one entry here, one `Op` implementation, and one HTML
 * entry under app/tools/. If it ever costs more than that, the seam is wrong
 * and the fix is to widen `Op` or `PdfSurgeon` rather than to special-case
 * the new tool in the UI.
 *
 * The ids are URLs (`/tools/<id>/`) and the keys the SEO pages are generated
 * from. Never rename one once it has shipped.
 *
 * `group` exists because a flat list of twenty-seven tools stops being a menu
 * and becomes a wall. The groups are by what someone is trying to do, not by
 * which library implements them.
 */

export type ToolId =
  | 'read'
  | 'scan'
  | 'ocr'
  | 'extract-text'
  | 'merge'
  | 'split'
  | 'extract-pages'
  | 'insert-pages'
  | 'organise'
  | 'crop'
  | 'split-by-size'
  | 'images-to-pdf'
  | 'pdf-to-images'
  | 'compress'
  | 'n-up'
  | 'extract-images'
  | 'watermark'
  | 'page-numbers'
  | 'sign'
  | 'mark-up'
  | 'add-text'
  | 'fill-form'
  | 'header-footer'
  | 'add-password'
  | 'remove-password'
  | 'remove-areas'
  | 'document-details';

export type InputKind = 'one-pdf' | 'several-pdfs' | 'images' | 'camera';

export type GroupId = 'read' | 'pages' | 'mark' | 'convert' | 'protect';

export interface ToolMeta {
  readonly id: ToolId;
  readonly title: string;
  readonly summary: string;
  /** What the button says. Always a verb; never the page's own title. */
  readonly action: string;
  readonly input: InputKind;
  readonly group: GroupId;
  /** `live` tools have a page and an Op. `soon` tools are listed, greyed, honest. */
  readonly status: 'live' | 'soon';
  /** A tool that shows a document rather than making a file (Read): it has a page, and no Op. */
  readonly viewer?: true;
}

/**
 * The five families. Each owns one colour (tokens.css), so a page and a card
 * say which family they belong to before you read a word, and the home page
 * reads as five calm groups rather than twenty-seven loud cards.
 * Order here is the order on screen.
 */
export const GROUPS: ReadonlyArray<{ readonly id: GroupId; readonly title: string; readonly blurb: string }> = [
  { id: 'pages', title: 'Pages', blurb: 'Combine, split, reorder and trim.' },
  { id: 'convert', title: 'Convert and print', blurb: 'Between PDFs, photos and paper sizes.' },
  { id: 'mark', title: 'Mark up', blurb: 'Stamp, number, sign and write on pages.' },
  { id: 'protect', title: 'Protect', blurb: 'Lock, unlock, and clean what a file gives away.' },
  { id: 'read', title: 'Read and capture', blurb: 'Open, scan and search documents.' },
];

/** Other words people use for a tool, so the home search finds "join" and "lock". */
export const KEYWORDS: Partial<Record<ToolId, string>> = {
  merge: 'combine join add together append',
  split: 'separate divide break pages apart',
  organise: 'organize reorder rotate delete sort turn',
  'extract-pages': 'remove delete pages select keep take out',
  'insert-pages': 'add pages blank append put in',
  crop: 'trim margins a4 letter resize page size',
  'split-by-size': 'email attachment limit too big smaller parts mb',
  compress: 'reduce shrink smaller size optimise optimize',
  'images-to-pdf': 'jpg jpeg png photo picture camera image convert to pdf',
  'pdf-to-images': 'jpg jpeg png image convert pictures',
  'n-up': 'print 2 up 4 up handout booklet',
  'extract-images': 'photos pictures save images get',
  watermark: 'stamp draft confidential copy',
  'page-numbers': 'number pages bates numbering',
  sign: 'signature esign autograph',
  'mark-up': 'highlight annotate draw pen comment',
  'add-text': 'write type edit text fill',
  'fill-form': 'form fields fill in',
  'header-footer': 'heading top bottom date running header',
  'add-password': 'lock encrypt protect secure aes',
  'remove-password': 'unlock decrypt open remove restrictions',
  'remove-areas': 'redact black out hide censor erase',
  'document-details': 'metadata author title properties privacy clean',
  read: 'open view reader',
  scan: 'camera photo document scanner',
  ocr: 'searchable text recognition scan',
  'extract-text': 'copy text txt words',
};

export const TOOLS: readonly ToolMeta[] = [
  { id: 'merge', title: 'Merge', summary: 'Join several PDFs into one, in the order you choose', action: 'Merge into one file', input: 'several-pdfs', group: 'pages', status: 'live' },
  { id: 'split', title: 'Split', summary: 'Break one PDF into several smaller files', action: 'Split it up', input: 'one-pdf', group: 'pages', status: 'live' },
  { id: 'organise', title: 'Organise pages', summary: 'Reorder, rotate and delete pages', action: 'Save the new order', input: 'one-pdf', group: 'pages', status: 'live' },
  { id: 'extract-pages', title: 'Extract or remove pages', summary: 'Keep only the pages you pick, or take some out', action: 'Make the new file', input: 'one-pdf', group: 'pages', status: 'live' },
  { id: 'insert-pages', title: 'Insert pages', summary: 'Put another PDF, or blank pages, in at a chosen page', action: 'Insert them', input: 'several-pdfs', group: 'pages', status: 'live' },
  { id: 'crop', title: 'Crop pages', summary: 'Trim the margins, or fit every page to A4 or Letter', action: 'Crop it', input: 'several-pdfs', group: 'pages', status: 'live' },
  { id: 'split-by-size', title: 'Split by size', summary: 'Parts that fit a 5, 10 or 25 MB email limit', action: 'Split into parts that fit', input: 'one-pdf', group: 'pages', status: 'live' },

  { id: 'compress', title: 'Compress', summary: 'Make a PDF smaller, and say so when it cannot', action: 'Compress it', input: 'several-pdfs', group: 'convert', status: 'live' },
  { id: 'images-to-pdf', title: 'Images to PDF', summary: 'Turn photos and scans into one PDF', action: 'Make a PDF', input: 'images', group: 'convert', status: 'live' },
  { id: 'pdf-to-images', title: 'PDF to images', summary: 'Save every page as a PNG or JPEG', action: 'Save as images', input: 'one-pdf', group: 'convert', status: 'live' },
  { id: 'n-up', title: 'Pages per sheet', summary: '2-up or 4-up for printing', action: 'Lay it out', input: 'several-pdfs', group: 'convert', status: 'live' },
  { id: 'extract-images', title: 'Extract images', summary: 'Pull out the embedded originals, not re-rendered pages', action: 'Pull the images out', input: 'one-pdf', group: 'convert', status: 'live' },

  { id: 'watermark', title: 'Watermark', summary: 'Stamp DRAFT or a name across every page', action: 'Add the watermark', input: 'several-pdfs', group: 'mark', status: 'live' },
  { id: 'page-numbers', title: 'Page numbers', summary: 'Number the pages, and skip a cover if you like', action: 'Add the numbers', input: 'several-pdfs', group: 'mark', status: 'live' },
  { id: 'sign', title: 'Sign', summary: 'Draw your signature and place it on the page', action: 'Place the signature', input: 'one-pdf', group: 'mark', status: 'live' },
  { id: 'mark-up', title: 'Mark up', summary: 'Highlight a line or draw on a page', action: 'Save the marks', input: 'one-pdf', group: 'mark', status: 'live' },
  { id: 'add-text', title: 'Add text', summary: 'Tap a page and write on it', action: 'Write it on', input: 'one-pdf', group: 'mark', status: 'live' },
  { id: 'fill-form', title: 'Fill in a form', summary: 'Type into a real PDF form and seal the answers', action: 'Fill it in', input: 'one-pdf', group: 'mark', status: 'live' },
  { id: 'header-footer', title: 'Header and footer', summary: 'A line along the top or bottom of every page', action: 'Add them', input: 'several-pdfs', group: 'mark', status: 'live' },

  { id: 'add-password', title: 'Add a password', summary: 'Lock a PDF with AES-256', action: 'Lock it', input: 'several-pdfs', group: 'protect', status: 'live' },
  { id: 'remove-password', title: 'Remove a password', summary: 'Unlock a PDF whose password you know', action: 'Unlock it', input: 'several-pdfs', group: 'protect', status: 'live' },
  { id: 'remove-areas', title: 'Remove areas', summary: 'Genuinely remove what you mark, not a black box over it', action: 'Remove them', input: 'one-pdf', group: 'protect', status: 'live' },
  { id: 'document-details', title: 'Document details', summary: 'Edit or strip the title, author and hidden metadata', action: 'Save the details', input: 'several-pdfs', group: 'protect', status: 'live' },

  { id: 'read', title: 'Read', summary: 'Open a document, then hand it to any tool', action: 'Open it', input: 'one-pdf', group: 'read', status: 'live', viewer: true },
  { id: 'scan', title: 'Scan a document', summary: 'Photograph pages and straighten them', action: 'Make the PDF', input: 'camera', group: 'read', status: 'live' },
  { id: 'ocr', title: 'Make searchable', summary: 'Read the text in a scan so you can search and copy it', action: 'Make it searchable', input: 'several-pdfs', group: 'read', status: 'live' },
  { id: 'extract-text', title: 'Extract text', summary: 'Pull the words out of a PDF as plain text', action: 'Extract the text', input: 'several-pdfs', group: 'read', status: 'live' },
];

export const toolById = (id: ToolId): ToolMeta => {
  const meta = TOOLS.find((t) => t.id === id);
  if (!meta) throw new Error(`Unknown tool: ${id}`);
  return meta;
};

/** Honours the build's base path, so links work at the root and under /foolscap/ alike. */
/**
 * What people type into a search box for each tool, which is rarely our own
 * word for it: "jpg to pdf", not "images to PDF". Page titles and
 * descriptions lead with these, so a search lands on the right page.
 */
export const SEARCH_NAMES: Record<ToolId, string> = {
  merge: 'Merge PDF',
  split: 'Split PDF',
  organise: 'Rearrange, rotate and delete PDF pages',
  'extract-pages': 'Extract or remove PDF pages',
  'insert-pages': 'Insert pages into a PDF',
  crop: 'Crop PDF',
  'split-by-size': 'Split PDF by file size',
  compress: 'Compress PDF',
  'images-to-pdf': 'JPG to PDF',
  'pdf-to-images': 'PDF to JPG and PNG',
  'n-up': 'Print several PDF pages per sheet',
  'extract-images': 'Extract images from PDF',
  watermark: 'Add a watermark to PDF',
  'page-numbers': 'Add page numbers to PDF',
  sign: 'Sign PDF',
  'mark-up': 'Highlight and draw on PDF',
  'add-text': 'Add text to PDF',
  'fill-form': 'Fill PDF form',
  'header-footer': 'Add header and footer to PDF',
  'add-password': 'Password protect PDF',
  'remove-password': 'Remove PDF password',
  'remove-areas': 'Redact PDF',
  'document-details': 'Edit or remove PDF metadata',
  read: 'Online PDF reader',
  scan: 'Scan to PDF',
  ocr: 'OCR PDF: make a scan searchable',
  'extract-text': 'PDF to text',
};

export const toolPath = (id: ToolId): string => `${import.meta.env.BASE_URL}tools/${id}/`;

export const LIVE_TOOLS: readonly ToolMeta[] = TOOLS.filter((t) => t.status === 'live');
