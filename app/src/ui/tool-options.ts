/**
 * Every tool's settings, in one place, built from fields.ts. A tool's
 * settings return its params (plain data, checked again by the op) and, when
 * the run cannot start, the sentence that says why.
 *
 * Organise is the one exception: its "settings" are the page grid.
 */
import type {
  AddPasswordParams,
  CompressParams,
  PdfToImagesParams,
  CropParams,
  DocumentDetailsParams,
  ExtractPagesParams,
  HeaderFooterParams,
  ImagesToPdfParams,
  InsertPagesParams,
  NUpParams,
  PageNumbersParams,
  Paper,
  SplitBySizeParams,
  WatermarkParams,
} from '../ops/op';
import type { ToolId } from '../ops/tools';
import { check, choices, field, group, note, select } from './fields';
import { createSplitOptions } from './split-options';

export interface ToolOptions {
  readonly root: HTMLElement;
  params(): unknown;
  /** Why the run cannot start yet, given how many files are in, or null. */
  problem(fileCount: number): string | null;
}

const PAGES_PLACEHOLDER = '1-3, 7, 12-';

export function createToolOptions(id: ToolId, onChange: () => void): ToolOptions | null {
  switch (id) {
    case 'split': {
      const split = createSplitOptions(onChange);
      return { root: split.root, params: () => split.params(), problem: () => null };
    }

    case 'extract-pages': {
      const pages = field('pages', { label: 'Pages', placeholder: PAGES_PLACEHOLDER, hint: 'Ranges and single pages, separated by commas. "12-" means 12 to the end.' }, onChange);
      const mode = choices<ExtractPagesParams['mode']>(
        'mode',
        'What to do with them',
        [
          { value: 'keep', title: 'Keep these pages', hint: 'A new file with only these pages.' },
          { value: 'remove', title: 'Remove these pages', hint: 'A new file with everything except these pages.' },
        ],
        'keep',
        onChange,
      );
      return {
        root: group([pages.root, mode.root]),
        params: (): ExtractPagesParams => ({ pages: pages.value(), mode: mode.value() }),
        problem: () => (pages.value().trim() ? null : `Type the pages, like ${PAGES_PLACEHOLDER}.`),
      };
    }

    case 'insert-pages': {
      const blankCount = field('blank-count', { label: 'How many blank pages', type: 'number', min: 1, max: 500, value: '1', bare: true }, onChange);
      const what = choices<InsertPagesParams['what']>(
        'what',
        'What to put in',
        [
          { value: 'files', title: 'The other files I add', hint: 'Add the main PDF first, then the ones to put into it, in order.' },
          { value: 'blank', title: 'Blank pages', hint: 'The same size as the page before them.', field: blankCount.root },
        ],
        'files',
        onChange,
      );
      const after = field('after', { label: 'Put them after page', type: 'number', min: 0, value: '1', hint: '0 puts them before the first page.' }, onChange);
      return {
        root: group([what.root, after.root]),
        params: (): InsertPagesParams => ({ what: what.value(), after: after.number(), blankCount: blankCount.number() }),
        problem: (count) => (what.value() === 'files' && count < 2 ? 'Add the PDF to put in as well. The first file is the one that gets the pages.' : null),
      };
    }

    case 'crop': {
      const mm = field('mm', { label: 'Millimetres from every edge', type: 'number', min: 1, max: 100, value: '10', bare: true }, onChange);
      const mode = choices<'trim' | Paper>(
        'crop',
        'How to crop',
        [
          { value: 'trim', title: 'Trim the margins', hint: 'The same amount off every edge of every page.', field: mm.root },
          { value: 'a4', title: 'Fit every page on A4', hint: 'Scaled to fit, turned to match each page.' },
          { value: 'letter', title: 'Fit every page on Letter', hint: 'Scaled to fit, turned to match each page.' },
        ],
        'trim',
        onChange,
      );
      return {
        root: group([
          mode.root,
          note('Cropping hides what falls outside the edge; it does not remove it. Someone could crop the other way and see it again. To take something out for good, use Remove areas when it arrives.'),
        ]),
        params: (): CropParams => (mode.value() === 'trim' ? { mode: 'trim', mm: mm.number() } : { mode: 'paper', paper: mode.value() as Paper }),
        problem: () => null,
      };
    }

    case 'split-by-size': {
      const custom = field('megabytes', { label: 'Megabytes', type: 'number', min: 1, max: 1000, value: '15', bare: true }, onChange);
      const size = choices<'5' | '10' | '25' | 'custom'>(
        'size',
        'Biggest each part can be',
        [
          { value: '5', title: '5 MB', hint: 'Safe for almost any email.' },
          { value: '10', title: '10 MB', hint: 'Many work email systems.' },
          { value: '25', title: '25 MB', hint: 'Gmail and Outlook attachments.' },
          { value: 'custom', title: 'Another size', field: custom.root },
        ],
        '10',
        onChange,
      );
      return {
        root: size.root,
        params: (): SplitBySizeParams => ({ megabytes: size.value() === 'custom' ? custom.number() : Number(size.value()) }),
        problem: () => null,
      };
    }

    case 'images-to-pdf': {
      const paper = choices<ImagesToPdfParams['paper']>(
        'paper',
        'Page size',
        [
          { value: 'fit', title: 'Same as each image' },
          { value: 'a4', title: 'A4' },
          { value: 'letter', title: 'Letter' },
        ],
        'a4',
        onChange,
        'pills',
      );
      const margin = choices<ImagesToPdfParams['margin']>(
        'margin',
        'Margin',
        [
          { value: 'none', title: 'None' },
          { value: 'small', title: 'Small' },
          { value: 'large', title: 'Large' },
        ],
        'small',
        onChange,
        'pills',
      );
      return {
        root: group([paper.root, margin.root, note('Photos taken sideways on a phone come out the right way up. One image per page, in the order listed.')]),
        params: (): ImagesToPdfParams => ({ paper: paper.value(), margin: margin.value() }),
        problem: () => null,
      };
    }

    case 'n-up': {
      const per = choices<'2' | '4'>(
        'per-sheet',
        'Pages on each sheet',
        [
          { value: '2', title: '2 per sheet' },
          { value: '4', title: '4 per sheet' },
        ],
        '2',
        onChange,
        'pills',
      );
      const paper = choices<Paper>('paper', 'Sheet size', [{ value: 'a4', title: 'A4' }, { value: 'letter', title: 'Letter' }], 'a4', onChange, 'pills');
      return {
        root: group([per.root, paper.root]),
        params: (): NUpParams => ({ perSheet: per.value() === '4' ? 4 : 2, paper: paper.value() }),
        problem: () => null,
      };
    }

    case 'watermark': {
      const text = field('text', { label: 'Watermark text', value: 'DRAFT', hint: 'English letters and numbers for now.' }, onChange);
      const strength = choices<WatermarkParams['strength']>(
        'strength',
        'Strength',
        [
          { value: 'light', title: 'Light' },
          { value: 'medium', title: 'Medium' },
          { value: 'strong', title: 'Strong' },
        ],
        'medium',
        onChange,
        'pills',
      );
      const layout = choices<WatermarkParams['layout']>(
        'layout',
        'Layout',
        [
          { value: 'once', title: 'Once, across the middle' },
          { value: 'tiled', title: 'Repeated all over' },
        ],
        'once',
        onChange,
        'pills',
      );
      return {
        root: group([text.root, strength.root, layout.root]),
        params: (): WatermarkParams => ({ text: text.value(), strength: strength.value(), layout: layout.value() }),
        problem: () => (text.value().trim() ? null : 'Type the watermark text.'),
      };
    }

    case 'page-numbers': {
      const position = select<PageNumbersParams['position']>(
        'position',
        'Where',
        [
          { value: 'bottom-center', title: 'Bottom, centre' },
          { value: 'bottom-right', title: 'Bottom, right' },
          { value: 'bottom-left', title: 'Bottom, left' },
          { value: 'top-center', title: 'Top, centre' },
          { value: 'top-right', title: 'Top, right' },
          { value: 'top-left', title: 'Top, left' },
        ],
        'bottom-center',
        onChange,
      );
      const format = select<PageNumbersParams['format']>(
        'format',
        'Style',
        [
          { value: 'n', title: '1' },
          { value: 'n-of-total', title: '1 of 12' },
          { value: 'page-n', title: 'Page 1' },
          { value: 'page-n-of-total', title: 'Page 1 of 12' },
        ],
        'n',
        onChange,
      );
      const start = field('start', { label: 'First number', type: 'number', min: 0, value: '1' }, onChange);
      const skip = check('skip-first', 'Leave the first page unnumbered', false, onChange, '(for a cover)');
      return {
        root: group([el2([position.root, format.root, start.root]), skip.root]),
        params: (): PageNumbersParams => ({ position: position.value(), format: format.value(), start: start.number(), skipFirst: skip.checked() }),
        problem: () => null,
      };
    }

    case 'header-footer': {
      const header = field('header', { label: 'Header', placeholder: 'e.g. CONFIDENTIAL' }, onChange);
      const footer = field('footer', { label: 'Footer', placeholder: 'e.g. {name} – page {page} of {total}' }, onChange);
      const align = choices<HeaderFooterParams['align']>(
        'align',
        'Line up',
        [
          { value: 'left', title: 'Left' },
          { value: 'center', title: 'Centre' },
          { value: 'right', title: 'Right' },
        ],
        'center',
        onChange,
        'pills',
      );
      return {
        root: group([header.root, footer.root, align.root, note('{page}, {total}, {date} and {name} are filled in for you. English letters and numbers for now.')]),
        params: (): HeaderFooterParams => ({ header: header.value(), footer: footer.value(), align: align.value() }),
        problem: () => (header.value().trim() || footer.value().trim() ? null : 'Type a header, a footer, or both.'),
      };
    }

    case 'add-password': {
      const password = field('password', { label: 'Password', type: 'password', autocomplete: 'new-password' }, onChange);
      const confirm = field('confirm', { label: 'Type it again', type: 'password', autocomplete: 'new-password' }, onChange);
      const printing = check('allow-printing', 'Allow printing', true, onChange);
      const copying = check('allow-copying', 'Allow copying text', false, onChange);
      return {
        root: group([
          password.root,
          confirm.root,
          printing.root,
          copying.root,
          note('Locked with AES-256. Write the password down: nobody, us included, can open the file without it. It is never stored or sent anywhere.'),
        ]),
        params: (): AddPasswordParams => ({ password: password.value(), allowPrinting: printing.checked(), allowCopying: copying.checked() }),
        problem: () => {
          if (password.value().length === 0) return 'Type the password to lock it with.';
          if (password.value() !== confirm.value()) return "The two passwords don't match yet.";
          return null;
        },
      };
    }

    case 'remove-password':
      return {
        root: note('Add the locked file. If it asks for its password, type it in and tap Unlock. Files that only block printing or copying open without one.'),
        params: () => ({}),
        problem: () => null,
      };

    case 'document-details': {
      const title = field('title', { label: 'Title', bare: true }, onChange);
      const fields = [
        title,
        field('author', { label: 'Author', bare: true }, onChange),
        field('subject', { label: 'Subject', bare: true }, onChange),
        field('keywords', { label: 'Keywords', bare: true }, onChange),
      ];
      fields.forEach((f, i) => f.input.setAttribute('placeholder', ['Title', 'Author', 'Subject', 'Keywords, separated by commas'][i] ?? ''));
      const editBox = el2(fields.map((f) => f.root));
      const mode = choices<DocumentDetailsParams['mode']>(
        'mode',
        'What to do',
        [
          { value: 'strip', title: 'Remove the hidden details', hint: 'Title, author, the app that made it, dates, and hidden XMP metadata. The pages stay as they are.' },
          { value: 'edit', title: 'Set new details', hint: 'Leave a box empty to remove that detail.', field: editBox },
        ],
        'strip',
        onChange,
      );
      editBox.addEventListener('input', () => {
        const radio = mode.root.querySelector<HTMLInputElement>('[data-testid="opt-mode-edit"]');
        if (radio) radio.checked = true;
      });
      return {
        root: mode.root,
        params: (): DocumentDetailsParams =>
          mode.value() === 'strip'
            ? { mode: 'strip' }
            : { mode: 'edit', title: fields[0]!.value(), author: fields[1]!.value(), subject: fields[2]!.value(), keywords: fields[3]!.value() },
        problem: () => null,
      };
    }

    case 'extract-images':
      return {
        root: note('Every photo and picture in the file, saved exactly as it is stored: no re-compression, no loss.'),
        params: () => ({}),
        problem: () => null,
      };

    case 'compress': {
      const level = choices<CompressParams['level']>(
        'level',
        'How hard to squeeze',
        [
          { value: 'light', title: 'Light', hint: 'Photos stay print-sharp. Smallest change.' },
          { value: 'balanced', title: 'Balanced', hint: 'Sharp on any screen, fine to print. Usually half the size or less.' },
          { value: 'strong', title: 'Strong', hint: 'For email limits. Photos get softer.' },
        ],
        'balanced',
        onChange,
      );
      return {
        root: group([level.root, note('Text and drawings are never touched, so they stay crisp. If a file cannot get smaller, it says so rather than handing back a copy.')]),
        params: (): CompressParams => ({ level: level.value() }),
        problem: () => null,
      };
    }

    case 'pdf-to-images': {
      const format = choices<PdfToImagesParams['format']>(
        'format',
        'Format',
        [
          { value: 'png', title: 'PNG' },
          { value: 'jpeg', title: 'JPEG' },
        ],
        'png',
        onChange,
        'pills',
      );
      const dpi = choices<'72' | '150' | '300'>(
        'dpi',
        'Sharpness',
        [
          { value: '72', title: 'Screen' },
          { value: '150', title: 'Sharing' },
          { value: '300', title: 'Print' },
        ],
        '150',
        onChange,
        'pills',
      );
      const pages = field('pages', { label: 'Pages', placeholder: 'All pages', hint: 'Leave empty for every page, or type 1-3, 7.' }, onChange);
      return {
        root: group([format.root, dpi.root, pages.root]),
        params: (): PdfToImagesParams => ({
          format: format.value(),
          dpi: Number(dpi.value()) as PdfToImagesParams['dpi'],
          pages: pages.value(),
        }),
        problem: () => null,
      };
    }

    case 'extract-text':
      return {
        root: note('The words as plain text, page by page, ready to copy or search. A scan has pictures of words, not words: make it searchable first.'),
        params: () => ({}),
        problem: () => null,
      };

    default:
      return null;
  }
}

/** A row of fields that wraps on a phone. */
function el2(children: ReadonlyArray<HTMLElement>): HTMLElement {
  const row = document.createElement('div');
  row.className = 'field-row';
  row.append(...children);
  return row;
}
