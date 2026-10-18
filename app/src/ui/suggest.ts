/**
 * Open a file: what to suggest for what was dropped. Pure, so every rule is
 * tested without a browser. The facts come from looking at the files on this
 * device (open.ts): what kind each is, how big, how many pages, and whether
 * it is locked, a scan, or a form.
 */
import type { ToolId } from '../ops/tools';

export interface FileFacts {
  readonly kind: 'pdf' | 'image' | 'office' | 'other';
  readonly size: number;
  readonly pages?: number;
  readonly locked?: boolean;
  /** A picture of paper: its words are pixels. */
  readonly scanned?: boolean;
  /** It has fields to fill in. */
  readonly forms?: boolean;
  /** It could not be read at all. */
  readonly unreadable?: boolean;
  /** Its first page is mostly a table of amounts: a statement, a bill, an invoice, a register. */
  readonly amounts?: boolean;
  /** Its first page shows an Aadhaar or PAN number. */
  readonly idNumber?: boolean;
}

const AMOUNT = /^[₹$]?\s?\(?-?\d{1,3}(?:,\d{2,3})*(?:\.\d{2})\)?(?:\s?(?:Cr|Dr))?$/;
const AADHAAR = /\b\d{4}\s\d{4}\s\d{4}\b/;
const PAN = /\b[A-Z]{5}\d{4}[A-Z]\b/;

/** What a first page's words say about the file: amounts in rows, an ID number on show. */
export function wordsSay(words: readonly string[]): Pick<FileFacts, 'amounts' | 'idNumber'> {
  const amounts = words.filter((w) => AMOUNT.test(w.trim())).length;
  const text = words.join(' ');
  return { ...(amounts >= 8 ? { amounts: true } : {}), ...(AADHAAR.test(text) || PAN.test(text) ? { idNumber: true } : {}) };
}

export interface Suggestion {
  readonly tool: ToolId;
  /** Why, in the visitor's terms: "It is 18 MB: make it smaller". */
  readonly why: string;
  /** Which of the files to hand to the tool, by their place in the list. */
  readonly takes: readonly number[];
}

const MB = 1024 * 1024;
/** Bigger than this, a file is worth offering to make smaller first: most forms and emails ask for less. */
const BIG = 2 * MB;

const mb = (bytes: number) => (bytes >= 10 * MB ? `${Math.round(bytes / MB)} MB` : `${(bytes / MB).toFixed(1)} MB`);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Up to `max` suggestions, the most likely first, each tool once. */
export function suggest(files: readonly FileFacts[], max = 8): Suggestion[] {
  const at = (test: (f: FileFacts) => boolean) => files.flatMap((f, i) => (test(f) ? [i] : []));
  const pdfs = at((f) => f.kind === 'pdf' && f.unreadable !== true);
  const locked = at((f) => f.kind === 'pdf' && f.locked === true);
  const images = at((f) => f.kind === 'image');
  const office = at((f) => f.kind === 'office');
  const out: Array<Suggestion & { readonly score: number }> = [];
  const add = (score: number, tool: ToolId, why: string, takes: readonly number[]) => {
    if (takes.length > 0) out.push({ score, tool, why, takes });
  };

  if (locked.length > 0) add(100, 'remove-password', locked.length === 1 ? 'It asks for a password: unlock it, with the password, for good' : `${plural(locked.length, 'file asks', 'files ask')} for a password: unlock them`, locked);

  if (images.length > 0) {
    add(90, 'images-to-pdf', images.length === 1 ? 'Turn the photo into a PDF' : `Make one PDF of these ${images.length} pictures`, images);
    add(89, 'compress-image', images.length === 1 ? 'For an upload form? Get it under 20 KB, 50 KB or any size' : `For an upload form? Get all ${images.length} under 20 KB, 50 KB or any size`, images);
    add(70, 'scan', images.length === 1 ? 'A photo of paper? Straighten it and clean it up' : 'Photos of paper? Straighten them and clean them up', images);
  }
  if (office.length > 0) add(90, 'office-to-pdf', office.length === 1 ? 'Turn the Word or Excel file into a PDF' : `Turn these ${office.length} Word or Excel files into PDFs`, office);

  if (pdfs.length >= 2) {
    add(88, 'merge', `Join these ${pdfs.length} PDFs into one`, pdfs);
    const total = pdfs.reduce((sum, i) => sum + (files[i]?.size ?? 0), 0);
    add(total > BIG ? 80 : 40, 'compress', `Make all ${pdfs.length} smaller (${mb(total)} together)`, pdfs);
    if (pdfs.length === 2) add(55, 'compare', 'Two versions of one document? See what changed', pdfs);
    add(35, 'add-password', `Lock all ${pdfs.length} with a password`, pdfs);
    add(30, 'pdf-to-word', `Turn all ${pdfs.length} into Word files you can edit`, pdfs);
    add(25, 'page-numbers', `Number the pages of all ${pdfs.length}`, pdfs);
  }

  if (pdfs.length === 1) {
    const i = pdfs[0] ?? 0;
    const f = files[i];
    if (f) {
      const one = [i];
      const pages = f.pages ?? 0;
      if (f.scanned === true) {
        add(85, 'ocr', 'It is a scan: make its words searchable and copyable', one);
        add(65, 'pdf-to-word', 'Turn the scan into a Word file you can edit', one);
        add(50, 'edit-text', 'Change words on the scan: they are read first, on this device', one);
      }
      if (f.forms === true) add(84, 'fill-form', 'It has fields: fill them in and save', one);
      if (f.amounts === true) add(80, 'pdf-to-excel', 'It is full of amounts: get them into a spreadsheet you can add up', one);
      if (f.idNumber === true) add(66, 'remove-areas', 'It shows an ID number (Aadhaar or PAN): hide it for good before you share it', one);
      if (f.size > BIG) add(82, 'compress', `It is ${mb(f.size)}: make it smaller`, one);
      add(pages === 1 ? 75 : 60, 'sign', 'Sign it', one);
      if (f.scanned !== true) add(58, 'edit-text', 'Change words on it', one);
      if (pages >= 2) {
        add(57, 'organise', `Reorder, turn or delete its ${pages} pages`, one);
        add(52, 'split', `Split its ${pages} pages into separate files`, one);
        add(45, 'extract-pages', 'Keep only the pages you need', one);
      }
      if (f.scanned !== true) add(48, 'pdf-to-word', 'Turn it into a Word file you can edit', one);
      add(44, 'mark-up', 'Highlight, underline or add notes', one);
      if (f.size <= BIG) add(40, 'compress', 'Make it smaller', one);
      if (f.locked !== true) add(38, 'add-password', 'Lock it with a password', one);
      add(30, 'remove-areas', 'Hide private details for good (Aadhaar, PAN, account numbers)', one);
      add(20, 'read', 'Just read it', one);
    }
  }

  const seen = new Set<ToolId>();
  return out
    .sort((a, b) => b.score - a.score)
    .filter((s) => (seen.has(s.tool) ? false : (seen.add(s.tool), true)))
    .slice(0, max)
    .map(({ tool, why, takes }) => ({ tool, why, takes }));
}

/** What kind of file a name and its first bytes say it is: Word and Excel by their ending. */
export function officeByName(name: string): boolean {
  return /\.(docx|xlsx)$/i.test(name);
}

/**
 * What to say when nothing can be suggested: the reason, in words, and what
 * to do instead. A damaged PDF is not "not a PDF", and a PowerPoint file has
 * a way forward even though no tool here reads it.
 */
export function noSuggestion(files: ReadonlyArray<{ readonly name: string; readonly facts: FileFacts }>): string {
  if (files.length > 0 && files.every((f) => f.facts.kind === 'pdf' && f.facts.unreadable === true)) {
    return files.length === 1
      ? "This PDF is damaged and couldn't be read. If it came by email or WhatsApp, download it again: it may have been cut short."
      : "These PDFs are damaged and couldn't be read. If they came by email or WhatsApp, download them again: they may have been cut short.";
  }
  if (files.some((f) => /\.(pptx?|key|odp)$/i.test(f.name))) {
    return 'Slides cannot be turned into a PDF here yet. In PowerPoint, Keynote or Google Slides, choose Save as PDF (or Download as PDF), then drop that PDF here.';
  }
  if (files.some((f) => /\.(docx?|xlsx?|odt|ods|rtf)$/i.test(f.name))) {
    return 'Only .docx and .xlsx files can be turned into a PDF here. Save it as .docx or .xlsx (or straight as a PDF) and drop that here.';
  }
  return 'Nothing here is a PDF, a picture or a Word or Excel file. Pick a tool from the list instead.';
}
