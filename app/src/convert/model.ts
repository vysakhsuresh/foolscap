/**
 * The one shape every converter speaks. PDF → Word, Excel, PowerPoint, EPUB
 * and HTML build one of these from what pdf.js reads off the pages; Word and
 * Excel → PDF read their file into one and the surgeon lays it out. Writers
 * and readers never meet a PDF library, and the PDF side never meets OOXML.
 *
 * Plain data (it crosses postMessage) and free of the DOM: the converters run
 * in the op worker, where there is no DOMParser.
 *
 * Units are PDF points (1/72 inch) throughout.
 */

/** A run of text in one style. */
export interface Run {
  readonly text: string;
  /** Font size in points. */
  readonly size: number;
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly underline?: boolean;
  /** "#rrggbb"; black when absent. */
  readonly color?: string;
  /** The family the original font belongs to, as near as can be told. */
  readonly family?: 'sans' | 'serif' | 'mono';
  /** A link this run points to. */
  readonly href?: string;
}

export interface Paragraph {
  readonly kind: 'paragraph';
  readonly runs: readonly Run[];
  readonly align?: 'left' | 'center' | 'right' | 'justify';
  /** 1–6 for a heading; absent for body text. */
  readonly heading?: 1 | 2 | 3 | 4 | 5 | 6;
  /** A list item: bullet or number, and how deep (0 = top level). */
  readonly list?: { readonly ordered: boolean; readonly level: number };
  /** Space above, in points. */
  readonly spaceBefore?: number;
  /** Left indent, in points. */
  readonly indent?: number;
}

export interface TableCell {
  readonly paragraphs: readonly Paragraph[];
  readonly colSpan?: number;
}

export interface Table {
  readonly kind: 'table';
  readonly rows: ReadonlyArray<readonly TableCell[]>;
  /** Column widths in points, when known. */
  readonly columns?: readonly number[];
}

export interface Picture {
  readonly kind: 'image';
  /** PNG or JPEG bytes. */
  readonly bytes: Uint8Array;
  readonly format: 'png' | 'jpeg';
  /** Size it is shown at, in points. */
  readonly width: number;
  readonly height: number;
}

export interface PageBreak {
  readonly kind: 'page-break';
}

export type Block = Paragraph | Table | Picture | PageBreak;

/** A flowing document: what Word holds. */
export interface FlowDocument {
  readonly title?: string;
  /** Page size and margins for the whole document, in points. A4 when absent. */
  readonly page?: { readonly width: number; readonly height: number; readonly margin: number };
  readonly blocks: readonly Block[];
}

/** A workbook: sheets of rows of cell text, as Excel holds them. Numbers stay as text that looks like a number. */
export interface Workbook {
  readonly sheets: ReadonlyArray<{ readonly name: string; readonly rows: ReadonlyArray<readonly string[]> }>;
}

/** A deck: one picture per slide, at the slide's size, with the slide's text kept as notes so it can be searched. */
export interface Deck {
  readonly width: number;
  readonly height: number;
  readonly slides: ReadonlyArray<{ readonly picture: Picture; readonly text?: string }>;
}
