/**
 * The PDF seam. The app owns these interfaces; the libraries are
 * implementation details behind them.
 *
 * Reading and rasterising is `PdfEngine` (pdf.js). Restructuring and writing
 * is `PdfSurgeon` (pdf-lib). The split follows the libraries' strengths:
 * pdf.js draws pages fast and faithfully but cannot save a document; pdf-lib
 * can rebuild anything but cannot draw a page.
 *
 * NOTHING OUTSIDE `app/src/pdf/` MAY MENTION A PDF LIBRARY. Not `pdfjs-dist`,
 * not `@cantoo/pdf-lib`, not a type from either, not a dynamic import. Inside
 * this package, `engine*.ts` never mentions pdf-lib and `surgeon*.ts` never
 * mentions pdf.js, so the page bundle carries pdf.js only and the worker
 * bundle pdf-lib only. If a caller needs something these interfaces cannot
 * express, widen the interface here; never reach around it. A test greps.
 *
 * Indices are ZERO-BASED everywhere in this package. The one place one-based
 * page numbers are turned into indices is `PageSelection`.
 */

export type Rotation = 0 | 90 | 180 | 270;

export interface PageInfo {
  readonly index: number;
  /** Points, as the PDF declares them, before rotation is applied. */
  readonly width: number;
  readonly height: number;
  /** The page's own /Rotate, normalised. */
  readonly rotation: Rotation;
}

export type PdfErrorCode =
  | 'not-a-pdf'
  | 'encrypted' // needs a password and none was given
  | 'wrong-password'
  | 'corrupt'
  /**
   * The device could not allocate memory for this document: a RangeError or
   * allocation failure anywhere in open, append or save. The message names
   * the size: "This 120 MB file is too big for this device's memory. Try
   * splitting it first."
   */
  | 'too-large'
  | 'cancelled'
  /**
   * The built-in fonts can draw Latin text only. Malayalam, Devanagari,
   * Arabic, Chinese or emoji in a watermark, a header or a page number fail
   * here, with a message that says so, until shaping arrives (stage 4).
   */
  | 'unsupported-text'
  | 'unknown';

/**
 * The one error type the seam throws. `message` is for the user and says what
 * to do: "This file is locked with a password." rather than
 * "PasswordException". It never contains a file name.
 */
export class PdfError extends Error {
  constructor(
    message: string,
    readonly code: PdfErrorCode,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'PdfError';
  }
}

/**
 * Reading and rasterising.
 *
 * Built on the page at load, where pdf.js's own worker does the parsing and
 * the page only paints; `ready` resolves once that worker exists, so a page
 * that reports itself ready can draw thumbnails with the network gone.
 *
 * The recipe, because pdf.js has several ways to do each of these and only
 * one of them keeps the promises: `getDocument` is always given `data` (a Blob
 * is read with `arrayBuffer()` first; `data` accepts no Blob), never `url`,
 * `range` or `docBaseUrl`. Always `cMapUrl`, `standardFontDataUrl`, `wasmUrl`
 * and `iccUrl` pointing at `/pdfjs/<version>/…/` on our own origin (each
 * ending in a slash, or pdf.js throws), and `useWorkerFetch: true`. On the
 * page, `GlobalWorkerOptions.workerSrc` is the URL of `./pdfjs-worker.ts`,
 * a two-line wrapper that installs `./shims.ts` and then imports
 * `pdfjs-dist/build/pdf.worker.min.mjs` — a worker's globals are its own, so
 * the page's shims cannot reach it — and the default factories are fine. Inside the op worker (engine-worker.ts) it also
 * needs `disableFontFace: true`, a canvas factory returning an
 * `OffscreenCanvas`, and `worker: new PDFWorker({ port })`, because pdf.js
 * otherwise reaches for `document` and `window`. Nothing imports
 * `pdfjs-dist/web/*` or `pdfjs-dist/build/pdf.sandbox*`: a document's links
 * are never followed and its scripts never run. Import `pdfjs-dist/build/*`,
 * never `legacy/` — it buys nothing on this version.
 */
export interface PdfEngine {
  /** Resolves when pdf.js and its worker are loaded. Nothing is fetched after this. */
  readonly ready: Promise<void>;
  /**
   * The most device pixels one render may produce. 5,242,880 on phones, as
   * pdf.js's own viewer does; a 4× zoom on a 1080×2400 screen would otherwise
   * ask for 166 MB in one bitmap.
   */
  readonly maxRenderPixels: number;
  /**
   * Takes ownership of `data`: the caller must not read or post it afterwards.
   * pdf.js hands a full-buffer Uint8Array to its worker and leaves the caller's
   * buffer detached. An op that needs both a render and a restructure reads
   * the Workspace twice rather than sharing one array.
   */
  open(data: Blob | Uint8Array, opts?: { password?: string; signal?: AbortSignal }): Promise<PdfView>;
}

export interface PdfView {
  readonly pageCount: number;
  page(index: number): Promise<PageInfo>;
  /**
   * Renders a page `width` device pixels wide, height following the page's
   * aspect after its own rotation. Callers pass device pixels, not CSS
   * pixels, so a thumbnail on a 3× phone is sharp.
   *
   * `width` is clamped so width × height ≤ `maxRenderPixels`; the returned
   * bitmap's width is authoritative. The caller owns the ImageBitmap and
   * must `close()` it when it leaves the viewport — a 600-page grid that
   * never does is evicted on iOS. `signal` cancels the render (PdfError
   * 'cancelled'). The engine calls the page's cleanup after each render so
   * pdf.js does not cache 600 pages of decoded scans.
   */
  render(index: number, opts: { width: number; signal?: AbortSignal }): Promise<ImageBitmap>;
  /**
   * Renders like `render` and returns the picture as PNG or JPEG bytes, for
   * "PDF to images". `quality` is JPEG's, 0 to 1 (default 0.9).
   */
  encode(
    index: number,
    opts: {
      width: number;
      format: 'png' | 'jpeg';
      quality?: number;
      signal?: AbortSignal;
      /** Filled solid black after drawing, for Remove areas: `page` is ignored. */
      cover?: readonly Area[];
    },
  ): Promise<Uint8Array>;
  /**
   * The page's text in reading order as pdf.js finds it, lines ended by
   * newlines. Empty for a scan: there is no text, only a picture of it.
   */
  text(index: number): Promise<string>;
  /**
   * The words on a page with where they sit, as a reader sees the page
   * (rotation applied, origin top-left, y down to the baseline), each with its
   * size and, where the font's name says so, bold or italic. What converting
   * to Word and Excel works from. Text that does not run left to right
   * (rotated or vertical) is left out.
   */
  layout(index: number): Promise<PageLayout>;
  /** The document's own table of contents (bookmarks), with the page each entry opens. Empty when it has none. */
  outline(): Promise<readonly OutlineItem[]>;
  /** The comments a reader lists (notes, highlights, stamps…), in page order. Links and form fields are not comments. */
  comments(): Promise<readonly PdfComment[]>;
  /** Where each picture on a page is drawn, as fractions of the page as seen, top-left origin. Pictures inside drawings are left out. */
  images(index: number): Promise<readonly Area[]>;
  /**
   * The pictures a page draws, each once, decoded the way a reader decodes
   * them and saved as PNG: what Extract images falls back on for pictures
   * stored in forms a file cannot simply be cut from (a palette, CMYK, a
   * one-bit fax or JBIG2 scan). Stencil masks are not pictures and are left out.
   */
  pictures(index: number): Promise<ReadonlyArray<{ readonly width: number; readonly height: number; readonly png: Uint8Array }>>;
  /** The document's fillable fields, in page order. Empty when it has none. */
  fields(): Promise<readonly FormField[]>;
  /** Awaits pdf.js destroy: frees page caches, decoded images and fonts. The UI calls it when a grid unmounts. */
  close(): Promise<void>;
}

/**
 * Restructuring and writing.
 *
 * Implementations never let the library write its own name or dates into a
 * document: `PDFDocument.load` and `PDFDocument.create` are always called
 * with `{ updateMetadata: false }`. /Producer, /Creator, /CreationDate and
 * /ModDate are the input's own, or absent on `create()`; only the
 * `document-details` tool may change them, and only to what the user typed.
 * A test re-opens every op's output and checks.
 */
export interface PdfSurgeon {
  /** An empty document to build into. */
  create(): Promise<PdfDoc>;
  /**
   * Takes ownership of `data`: pdf-lib copies every stream out at parse, so a
   * caller that holds the input keeps a second copy alive. Drop it.
   */
  open(data: Uint8Array, opts?: { password?: string }): Promise<PdfDoc>;
  /**
   * Lays a flowing document (from a Word or Excel file) out on pages as a new
   * PDF. `paint` draws a line the PDF fonts cannot, as a picture; without it
   * such letters become "?".
   */
  layoutFlow(flow: import('../convert/model').FlowDocument, paint: LinePainter | null): Promise<{ bytes: Uint8Array; pages: number }>;
  /**
   * Opens a .pfx/.p12 with its password and signs `pdf` with it, as an
   * incremental update. Throws CertificateError (sign/errors.ts) for the
   * certificate's own problems, in words that can be shown.
   */
  signWithCertificate(pdf: Uint8Array, certificate: Uint8Array, password: string, opts: CertificateSignOptions): Promise<CertificateSignResult>;
}

/** Draws one line of text as a PNG, `scale` pixels per point. Null when it cannot. */
export type LinePainter = (
  text: string,
  style: { readonly size: number; readonly bold: boolean; readonly italic: boolean; readonly family: 'sans' | 'serif' | 'mono'; readonly color: readonly [number, number, number] },
  scale: number,
) => Promise<{ png: Uint8Array; width: number; height: number } | null>;

export interface CertificateSignOptions {
  /** Show the signature at the foot of the last page; otherwise it is invisible. */
  readonly visible: boolean;
  readonly reason?: string;
}

export type CertificateSignResult =
  | { readonly ok: true; readonly bytes: Uint8Array; readonly subject: string; readonly issuer: string }
  /** The certificate ran out before today; nothing was signed. */
  | { readonly ok: false; readonly expired: Date };

/** A rectangle in PDF points, origin bottom-left, as the PDF stores it (before /Rotate). */
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type Anchor =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'center'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

/**
 * Text drawn onto a page, positioned as the reader sees the page: "top-right"
 * is the top right of the page on screen, whatever its /Rotate, and the text
 * reads upright. The surgeon does the rotation arithmetic so no op has to.
 */
export interface TextStamp {
  readonly text: string;
  readonly anchor: Anchor;
  /** Points. */
  readonly size: number;
  readonly bold?: boolean;
  /** 0 to 1. */
  readonly opacity?: number;
  /** Red, green, blue, each 0 to 1. */
  readonly color?: readonly [number, number, number];
  /** Points from the edge of the visible page. */
  readonly margin?: number;
  /** Degrees, counter-clockwise as seen, about the text's own centre. */
  readonly angle?: number;
  /** Repeat across the whole page in a staggered grid, ignoring `anchor`. */
  readonly tiled?: boolean;
}

export type DocInfoField = 'title' | 'author' | 'subject' | 'keywords' | 'creator' | 'producer';
export type DocInfo = Partial<Record<DocInfoField, string>>;

export interface EncryptOptions {
  /** Empty only with `restrictOnly`: then anyone can open the file, and the permissions are what is locked. */
  readonly userPassword: string;
  readonly allowPrinting: boolean;
  readonly allowCopying: boolean;
  /** Allow changing the pages and filling forms; off by default when locking. */
  readonly allowEditing?: boolean;
  readonly restrictOnly?: boolean;
}

/** A run of pages and how their numbers are shown in a reader's page box ("i, ii, iii", "A-1, A-2"). */
export interface PageLabelRange {
  /** Zero-based index of the first page this style applies to; it runs until the next range. */
  readonly start: number;
  readonly style: 'decimal' | 'roman' | 'Roman' | 'alpha' | 'Alpha' | 'none';
  readonly prefix?: string;
  /** The number the first page of the range shows; 1 when absent. */
  readonly first?: number;
}

/** A file carried inside a PDF. */
export interface Attachment {
  readonly name: string;
  readonly bytes: Uint8Array;
  readonly description?: string;
}

/** What "Clean hidden data" takes out. */
export interface CleanOptions {
  /** JavaScript, and actions that run when the file opens or a page shows. */
  readonly scripts: boolean;
  readonly attachments: boolean;
  /** Comments, notes, highlights and other annotations (links and form fields stay). */
  readonly comments: boolean;
  /** Title, author, the software that made it, dates, XMP. */
  readonly metadata: boolean;
}

export interface CleanReport {
  readonly scripts: number;
  readonly attachments: number;
  readonly comments: number;
  readonly metadata: boolean;
}

/** An image embedded in a document, as a file a person can open. */
/** A picture that is in the document but stored in a form that cannot be saved as a file as it is: where, and how big. */
export interface OddImage {
  /** Zero-based index of the first page it appears on. */
  readonly page: number;
  readonly width: number;
  readonly height: number;
}

export interface ExtractedImage {
  /** Zero-based index of the first page it appears on. */
  readonly page: number;
  readonly bytes: Uint8Array;
  readonly ext: 'jpg' | 'png' | 'jp2';
  readonly width: number;
  readonly height: number;
}

/**
 * A rectangle on a page as a reader sees it (after the page's own rotation),
 * in fractions of the page's width and height, measured from the top-left.
 * Fractions rather than points so the editor on the page and the surgeon in
 * the worker never have to agree on a scale.
 */
export interface Area {
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** 0 to 1 each. */
export type Rgb = readonly [number, number, number];

/** Something drawn onto a page by Sign, Add text or Mark up. */
export type Mark =
  /** A PNG (a signature, or text in a script the built-in font cannot draw) filling `area`. */
  | { readonly kind: 'image'; readonly area: Area; readonly png: Uint8Array }
  /** Lines of text whose first line's top is the area's top; `size` is a fraction of the page width. */
  | { readonly kind: 'text'; readonly area: Area; readonly text: string; readonly size: number; readonly color: Rgb; readonly boxed?: boolean; readonly align?: 'left' | 'right' }
  /**
   * A see-through marker over `area`, multiplied so the words under it stay
   * dark; or, with `style`, a line under the words or through them.
   */
  | { readonly kind: 'highlight'; readonly area: Area; readonly color: Rgb; readonly style?: 'marker' | 'underline' | 'strike' }
  /** A pen stroke: x,y pairs in page fractions; `width` a fraction of the page width. */
  | { readonly kind: 'ink'; readonly page: number; readonly points: readonly number[]; readonly width: number; readonly color: Rgb }
  /** A box or an oval drawn round `area`, outline only. `width` a fraction of the page width. */
  | { readonly kind: 'shape'; readonly area: Area; readonly shape: 'rect' | 'ellipse'; readonly color: Rgb; readonly width: number }
  /**
   * A straight line from `from` to `to` (page fractions, top-left origin):
   * plain, with an arrowhead at `to`, or as a measurement with its length on
   * real paper written beside it.
   */
  | {
      readonly kind: 'line';
      readonly page: number;
      readonly from: readonly [number, number];
      readonly to: readonly [number, number];
      readonly color: Rgb;
      readonly width: number;
      readonly end?: 'none' | 'arrow' | 'measure';
    }
  /** A sticky note: a real comment a reader lists and opens, pinned at the area's top-left. Any script. */
  | { readonly kind: 'note'; readonly area: Area; readonly text: string; readonly color: Rgb }
  /** A rubber stamp: the words in capitals inside a rounded frame, filling `area`. */
  | { readonly kind: 'stamp'; readonly area: Area; readonly text: string; readonly color: Rgb }
  /** A link over `area` that opens `url` (http, https, mailto or tel) when tapped in a reader. */
  | { readonly kind: 'link'; readonly area: Area; readonly url: string }
  /** A solid patch of `color` over `area`: what Edit text paints over the old words with, in the page's own colour. */
  | { readonly kind: 'fill'; readonly area: Area; readonly color: Rgb }
  /** A photo or picture filling `area`: JPEG or PNG bytes as they are. */
  | { readonly kind: 'picture'; readonly area: Area; readonly bytes: Uint8Array; readonly format: 'jpeg' | 'png' };

/** A length in PDF points as it measures on paper: "42 mm", "8.5 mm", "21.0 cm". */
export function measureLabel(points: number): string {
  const mm = (points * 25.4) / 72;
  if (mm >= 100) return `${(mm / 10).toFixed(1)} cm`;
  if (mm >= 10) return `${Math.round(mm)} mm`;
  return `${mm.toFixed(1)} mm`;
}

/** The page a mark sits on. */
export function markPage(mark: Mark): number {
  return mark.kind === 'ink' || mark.kind === 'line' ? mark.page : mark.area.page;
}

/** One piece of text on a page, in points from the page's top-left; `y` is the baseline. */
export interface LayoutItem {
  readonly str: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly fontName: string;
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly family?: 'sans' | 'serif' | 'mono';
}

export interface PageLayout {
  readonly width: number;
  readonly height: number;
  readonly items: readonly LayoutItem[];
}

/** A change to a picture already on a page, found by where it is drawn. */
export type ImageEdit =
  | { readonly area: Area; readonly action: 'delete' }
  | { readonly area: Area; readonly action: 'move'; readonly to: Area }
  | { readonly area: Area; readonly action: 'replace'; readonly bytes: Uint8Array; readonly format: 'jpeg' | 'png' };

export interface ArchivalReport {
  readonly scripts: number;
  readonly attachments: number;
  readonly fontsMissing: number;
}

/** A fillable field to add to a page: where, what kind, and what it is called. */
export interface NewField {
  readonly kind: 'text' | 'multiline' | 'check' | 'choice';
  readonly name: string;
  readonly area: Area;
  /** For a choice list: what can be picked. */
  readonly options?: readonly string[];
}

/** One comment in a document, as a reader's comment list shows it. */
export interface PdfComment {
  readonly page: number;
  /** "Note", "Highlight", "Stamp"…: the kind, in words. */
  readonly kind: string;
  readonly text: string;
  readonly author?: string;
}

/** One entry in a document's table of contents. `page` is null when its target cannot be found. */
export interface OutlineItem {
  readonly title: string;
  readonly page: number | null;
  readonly items: readonly OutlineItem[];
}

/** A form field as the page shows it to fill in. */
export type FormField =
  | { readonly kind: 'text'; readonly name: string; readonly value: string; readonly multiline: boolean; readonly page: number; readonly maxLength?: number }
  | { readonly kind: 'check'; readonly name: string; readonly checked: boolean; readonly page: number }
  | { readonly kind: 'choice'; readonly name: string; readonly value: string; readonly options: readonly string[]; readonly page: number };

/** What to put in a form: by field name, text for text and choices, true or false for checkboxes. */
export type FormValues = Readonly<Record<string, string | boolean>>;

/** A photo Compress made: always JPEG, three channels. */
export interface RecompressedImage {
  readonly bytes: Uint8Array;
  readonly width: number;
  readonly height: number;
}

export interface CompressReport {
  /** Photos that could be re-encoded. */
  readonly photos: number;
  /** Of those, how many came out smaller and were swapped in. */
  readonly replaced: number;
  /** Objects nothing pointed at. */
  readonly dropped: number;
  /** Streams that were stored uncompressed. */
  readonly deflated: number;
}

export interface PdfDoc {
  readonly pageCount: number;
  /** Whether the file this was opened from was encrypted (with or without a password to open it). */
  readonly wasEncrypted: boolean;
  /**
   * Pages the file's page tree lists but whose page objects are gone (a file
   * cut short). They are left out of everything; a tool that saves this
   * document says how many, because the person did not ask for fewer pages.
   */
  readonly missingPages: number;
  pages(): readonly PageInfo[];
  /** The visible area of a page: its CropBox, or its MediaBox when it has none. */
  visibleBox(index: number): Box;
  /** Sets the CropBox. What falls outside stops being shown but stays in the file; crop is not redaction. */
  setVisibleBox(index: number, box: Box): void;
  /** Throws PdfError 'unsupported-text' when the built-in fonts cannot draw a character. */
  stampText(index: number, stamp: TextStamp): void;
  /** Appends an empty page. */
  addBlankPage(width: number, height: number): void;
  /**
   * Appends a new page `width` × `height` and draws other pages onto it, each
   * scaled to fit its box (aspect kept, centred) and upright as its reader
   * would see it. This is n-up and "fit to A4".
   */
  composePage(
    width: number,
    height: number,
    placements: ReadonlyArray<{ readonly source: PdfDoc; readonly index: number; readonly box: Box }>,
  ): Promise<void>;
  /**
   * Appends a page holding one image. `page` 'fit' makes the page the image's
   * shape; a size puts the image on that paper, turned to match its
   * orientation, scaled to fit inside `margin`.
   */
  addImagePage(
    image: { readonly bytes: Uint8Array; readonly kind: 'jpeg' | 'png' },
    page: 'fit' | { readonly width: number; readonly height: number },
    margin: number,
  ): Promise<void>;
  /** The images embedded in the document, each once, and how many could not be turned into a file. */
  images(): { readonly images: readonly ExtractedImage[]; readonly skipped: number; readonly odd: readonly OddImage[] };
  /**
   * Makes the document smaller in place: re-encodes photos through
   * `recompress` (null keeps the original), drops objects nothing points at,
   * and deflates streams stored uncompressed. Save afterwards.
   */
  /**
   * Lays invisible text over a page (a scan) where its words are, so the page
   * can be searched, selected and copied while it looks exactly the same.
   * Boxes are fractions of the page as the reader sees it, from the top-left.
   * Words the built-in font cannot spell are left out. Returns how many went in.
   */
  addTextLayer(index: number, words: ReadonlyArray<{ readonly text: string; readonly x: number; readonly y: number; readonly w: number; readonly h: number }>): number;
  /** Paints the page's whole background in a colour, under everything already on it. */
  setBackground(index: number, color: Rgb): void;
  /** Replaces the page labels a reader shows; an empty list removes them. */
  setPageLabels(ranges: readonly PageLabelRange[]): void;
  /** The files carried inside the document, from its attachment list and its file-attachment notes. */
  attachments(): readonly Attachment[];
  /** Carries a file inside the document. */
  attach(file: Attachment): Promise<void>;
  /** The document's bookmarks (outline), with the page each opens. */
  bookmarks(): readonly OutlineItem[];
  /** Replaces the bookmarks; an empty list removes them. Entries with no page are dropped. */
  setBookmarks(items: readonly OutlineItem[]): void;
  /** Takes out what a file carries that nobody sees on the page. */
  clean(opts: CleanOptions): CleanReport;
  /** Draws marks onto their pages, upright as the reader sees each page. */
  drawMarks(marks: readonly Mark[]): Promise<void>;
  /**
   * Replaces a page with a picture of it: contents, resources and annotations
   * all go, and the page becomes one image the size it was shown. This is
   * what makes Remove areas a removal rather than a cover.
   */
  replaceWithImage(index: number, jpeg: Uint8Array): Promise<void>;
  /**
   * Puts values into the form. `seal` flattens every field into the page so
   * the answers can no longer be changed. Throws PdfError 'unsupported-text'
   * for letters the form's font cannot draw.
   */
  /** Returns how many of `values` named a field this form has. */
  fillForm(values: FormValues, seal: boolean): number;
  /** Adds new fillable fields; names already taken get a number. Returns the names given. */
  addFields(fields: readonly NewField[]): string[];
  /**
   * Makes this an archive copy in the PDF/A-2b manner: an sRGB colour
   * profile, XMP metadata that says so and mirrors the details, a file ID,
   * printable annotations, and no scripts or attached files. Reports what it
   * took out and how many fonts are not inside the file (which a strict
   * validator rejects, and which cannot be fixed without the font itself).
   */
  makeArchival(): ArchivalReport;
  /**
   * Takes out, moves or swaps pictures already on page `index`, each found by
   * where it is drawn (`area`, as `PdfView.images` reports it). Returns what
   * was actually done, one entry per edit that found its picture.
   */
  editImages(index: number, edits: readonly ImageEdit[]): Promise<ReadonlyArray<ImageEdit['action']>>;
  /**
   * Takes every piece of text off every page (each BT … ET block, in the
   * pages and in the drawings they use), leaving photos, shapes and shading
   * exactly as they were: the background of an editable slide. Save afterwards.
   */
  removeText(): void;
  compress(
    recompress: (image: ExtractedImage) => Promise<RecompressedImage | null>,
    signal?: AbortSignal,
  ): Promise<CompressReport>;
  info(): DocInfo;
  /** Sets the fields given; an empty string removes that field. */
  setInfo(info: DocInfo): void;
  /** Removes every Info field and the XMP metadata stream. */
  stripMetadata(): void;
  /**
   * Appends copies of `source`'s pages `indices`, in the order given. The same
   * index may appear twice; a page may be copied from a document into itself.
   * This one method is merge, extract, delete and duplicate.
   *
   * It is the right path whenever a page is deleted or duplicated: pdf-lib's
   * writer serialises every object it has parsed, so an in-place delete would
   * leave the removed pages' streams in the output and the file would not
   * shrink. It costs roughly one extra copy of the source in memory; for a
   * pure reorder, prefer `reorder`.
   */
  appendPages(source: PdfDoc, indices: readonly number[]): Promise<void>;
  /**
   * Reorders this document's existing pages in place: `order[i]` is the
   * current index of the page that goes at position i, every index exactly
   * once. No stream is cloned, so it is the cheap path for organise when no
   * page was deleted or duplicated. Implementations move the existing page
   * refs in the page tree; they do not remove and re-insert page objects,
   * which would leave dangling refs.
   */
  reorder(order: readonly number[]): void;
  /** Absolute /Rotate for one page of this document. Replaces, never adds to, the page's own rotation. */
  setRotation(index: number, rotation: Rotation): void;
  setTitle(title: string): void;
  /**
   * Cannot be interrupted once started; the JobRunner's terminate is the real
   * cancel. With `encrypt`, the output is AES-256 encrypted with that password.
   * Without it, the output is never encrypted, whatever the input was.
   */
  save(opts?: { readonly encrypt?: EncryptOptions }): Promise<Uint8Array>;
  /**
   * Drops this document's references so they can be collected. It cannot force
   * memory back; the JobRunner's worker lifecycle does that. Every other method
   * throws afterwards.
   */
  close(): void;
}
