/**
 * Every tool's settings, in one place, built from fields.ts. A tool's
 * settings return its params (plain data, checked again by the op) and, when
 * the run cannot start, the sentence that says why.
 *
 * Organise is the one exception: its "settings" are the page grid.
 */
import type {
  AddPasswordParams,
  AttachmentsParams,
  BackgroundParams,
  DigitalSignParams,
  PageLabelsParams,
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
import { createOcrOptions } from './ocr-options';
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
      const after = field('after', { label: 'After page', type: 'number', min: 0, value: '1', bare: true }, onChange);
      const replace = field('replace', { label: 'Pages to replace', placeholder: '3-4', bare: true }, onChange);
      const where = choices<'after' | 'replace'>(
        'where',
        'Where',
        [
          { value: 'after', title: 'After a page', hint: '0 puts them before the first page.', field: after.root },
          { value: 'replace', title: 'In place of pages', hint: 'Those pages come out; the new ones go where they were.', field: replace.root },
        ],
        'after',
        onChange,
      );
      return {
        root: group([what.root, where.root]),
        params: (): InsertPagesParams => ({
          what: what.value(),
          after: after.number(),
          blankCount: blankCount.number(),
          ...(where.value() === 'replace' ? { replace: replace.value() } : {}),
        }),
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
          { value: 'bates', title: 'Bates: ACME-000001' },
        ],
        'n',
        () => {
          sync();
          onChange();
        },
      );
      const start = field('start', { label: 'First number', type: 'number', min: 0, value: '1' }, onChange);
      const skip = check('skip-first', 'Leave the first page unnumbered', false, onChange, '(for a cover)');
      const prefix = field('prefix', { label: 'Before the number', placeholder: 'ACME-', value: '' }, onChange);
      const digits = field('digits', { label: 'Digits', type: 'number', min: 1, max: 12, value: '6' }, onChange);
      const bates = group([el2([prefix.root, digits.root]), note('Legal numbering: one sequence through every page of every file, in the order you added them.')]);
      const sync = () => {
        const isBates = format.value() === 'bates';
        bates.hidden = !isBates;
        skip.root.hidden = isBates;
      };
      sync();
      return {
        root: group([el2([position.root, format.root, start.root]), skip.root, bates]),
        params: (): PageNumbersParams => ({
          position: position.value(),
          format: format.value(),
          start: start.number(),
          skipFirst: skip.checked(),
          ...(format.value() === 'bates' ? { prefix: prefix.value(), digits: digits.number() } : {}),
        }),
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
      const passwordBox = group([password.root, confirm.root]);
      const mode = choices<NonNullable<AddPasswordParams['mode']>>(
        'lock',
        'How to protect it',
        [
          { value: 'password', title: 'Lock it with a password', hint: 'Nobody can open it without the password.', field: passwordBox },
          { value: 'restrict', title: 'Only restrict printing, copying and editing', hint: 'It opens for anyone; readers that respect the settings block the rest.' },
        ],
        'password',
        () => {
          sync();
          onChange();
        },
      );
      const printing = check('allow-printing', 'Allow printing', true, onChange);
      const copying = check('allow-copying', 'Allow copying text', false, onChange);
      const editing = check('allow-editing', 'Allow changes and comments', false, onChange);
      const lockNote = note('Locked with AES-256. Write the password down: nobody, us included, can open the file without it. It is never stored or sent anywhere.');
      const restrictNote = note('Honest note: these settings are a request, not a lock. Adobe, Chrome and most readers obey them, but a determined person with the right tool can switch them off. For anything secret, use a password.');
      const sync = () => {
        const restrict = mode.value() === 'restrict';
        passwordBox.hidden = restrict;
        lockNote.hidden = restrict;
        restrictNote.hidden = !restrict;
      };
      sync();
      return {
        root: group([mode.root, printing.root, copying.root, editing.root, lockNote, restrictNote]),
        params: (): AddPasswordParams => ({
          mode: mode.value(),
          password: mode.value() === 'restrict' ? '' : password.value(),
          allowPrinting: printing.checked(),
          allowCopying: copying.checked(),
          allowEditing: editing.checked(),
        }),
        problem: () => {
          if (mode.value() === 'restrict') {
            return printing.checked() && copying.checked() && editing.checked() ? 'Everything is allowed, so there is nothing to restrict. Untick something.' : null;
          }
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
      const comments = check('clean-comments', 'Comments and notes too', true, onChange);
      const attached = check('clean-attachments', 'Attached files too', true, onChange);
      const cleanBox = group([comments.root, attached.root]);
      const mode = choices<DocumentDetailsParams['mode']>(
        'mode',
        'What to do',
        [
          {
            value: 'clean',
            title: 'Clean everything hidden',
            hint: 'The details below, plus scripts and actions that run when it opens. Before you send a file outside.',
            field: cleanBox,
          },
          { value: 'strip', title: 'Remove the hidden details', hint: 'Title, author, the app that made it, dates, and hidden XMP metadata. The pages stay as they are.' },
          { value: 'edit', title: 'Set new details', hint: 'Leave a box empty to remove that detail.', field: editBox },
        ],
        'clean',
        onChange,
      );
      cleanBox.addEventListener('change', () => {
        const radio = mode.root.querySelector<HTMLInputElement>('[data-testid="opt-mode-clean"]');
        if (radio) radio.checked = true;
      });
      editBox.addEventListener('input', () => {
        const radio = mode.root.querySelector<HTMLInputElement>('[data-testid="opt-mode-edit"]');
        if (radio) radio.checked = true;
      });
      return {
        root: mode.root,
        params: (): DocumentDetailsParams =>
          mode.value() === 'strip'
            ? { mode: 'strip' }
            : mode.value() === 'clean'
              ? { mode: 'clean', comments: comments.checked(), attachments: attached.checked() }
              : { mode: 'edit', title: fields[0]!.value(), author: fields[1]!.value(), subject: fields[2]!.value(), keywords: fields[3]!.value() },
        problem: () => null,
      };
    }

    case 'background': {
      const custom = field('color', { label: 'Colour', type: 'color', value: '#e8f1ff', bare: true }, onChange);
      const SWATCHES = [
        { value: '#fbf6e9', title: 'Cream' },
        { value: '#f2f2ee', title: 'Soft grey' },
        { value: '#eaf6ee', title: 'Mint' },
        { value: '#e8f1fb', title: 'Sky' },
        { value: '#fbeef0', title: 'Rose' },
      ] as const;
      const colour = choices<string>('colour', 'Colour', [...SWATCHES, { value: 'custom', title: 'Your own', field: custom.root }], '#fbf6e9', () => {
        custom.root.hidden = colour.value() !== 'custom';
        onChange();
      }, 'pills');
      custom.root.hidden = true;
      for (const label of colour.root.querySelectorAll<HTMLLabelElement>('.pill-choice')) {
        const radio = label.querySelector('input');
        const value = radio?.value === 'custom' ? null : radio?.value;
        if (!value) continue;
        const dot = document.createElement('span');
        dot.className = 'swatch';
        dot.setAttribute('aria-hidden', 'true');
        dot.style.setProperty('--swatch', value);
        label.insertBefore(dot, radio?.nextSibling ?? null);
      }
      const pages = field('pages', { label: 'Pages', placeholder: 'All pages', hint: 'Leave empty for every page, or type 1-3, 7.' }, onChange);
      return {
        root: group([colour.root, custom.root, pages.root, note('The colour goes behind everything, so text and drawings stay on top. A scanned page is one solid picture, so the colour will not show through it.')]),
        params: (): BackgroundParams => ({ color: colour.value() === 'custom' ? custom.value() : colour.value(), pages: pages.value() }),
        problem: () => null,
      };
    }

    case 'page-labels': {
      const front = field('front', { label: 'Front pages in i, ii, iii', type: 'number', min: 0, max: 999, value: '0', hint: 'A cover and contents, say. 0 for none.' }, onChange);
      const start = field('start', { label: 'Then number from', type: 'number', min: 1, value: '1' }, onChange);
      const prefix = field('prefix', { label: 'Before each number', placeholder: 'Optional, like A-', value: '' }, onChange);
      const setBox = group([el2([front.root, start.root]), prefix.root]);
      const mode = choices<PageLabelsParams['mode']>(
        'mode',
        'What to do',
        [
          { value: 'set', title: 'Set the labels', hint: 'What a reader shows in its page box, so "page 1" is the first page of the real content.', field: setBox },
          { value: 'remove', title: 'Remove the labels', hint: 'Back to plain 1, 2, 3 from the cover.' },
        ],
        'set',
        onChange,
      );
      return {
        root: group([mode.root, note('Labels change what a reader calls each page, not what is printed on it. To print numbers on the pages, use Page numbers.')]),
        params: (): PageLabelsParams =>
          mode.value() === 'remove' ? { mode: 'remove' } : { mode: 'set', front: front.number(), start: start.number(), prefix: prefix.value() },
        problem: () => (mode.value() === 'set' && !(start.number() >= 1) ? 'The first number must be 1 or more.' : null),
      };
    }

    case 'attachments': {
      const mode = choices<AttachmentsParams['mode']>(
        'mode',
        'What to do',
        [
          { value: 'attach', title: 'Put files inside the PDF', hint: 'Add the PDF first, then any files: a spreadsheet, photos, the source document. They travel with it.' },
          { value: 'extract', title: 'Take out the attached files', hint: 'Every file a PDF carries inside it, saved as it was.' },
        ],
        'attach',
        onChange,
      );
      return {
        root: group([mode.root, note('Attached files are not checked or opened here; they are carried inside as they are. Clean hidden data can take them out again.')]),
        params: (): AttachmentsParams => ({ mode: mode.value() }),
        problem: (count) => (mode.value() === 'attach' && count < 2 ? 'Add the files to attach after the PDF.' : null),
      };
    }

    case 'digital-sign': {
      // The certificate is read here, into memory, and sent with the run; it
      // never goes into the workspace and is never kept.
      let certificate: Uint8Array | null = null;
      let reading = false;
      const picked = document.createElement('span');
      picked.className = 'field__hint';
      picked.dataset['testid'] = 'certificate-picked';
      picked.textContent = 'No certificate chosen yet.';
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.id = 'opt-certificate';
      fileInput.className = 'input';
      fileInput.dataset['testid'] = 'opt-certificate';
      fileInput.accept = '.pfx,.p12,application/x-pkcs12';
      fileInput.addEventListener('change', () => {
        const file = fileInput.files?.[0];
        certificate = null;
        if (!file) {
          picked.textContent = 'No certificate chosen yet.';
          onChange();
          return;
        }
        reading = true;
        onChange();
        void file.arrayBuffer().then(
          (buffer) => {
            certificate = new Uint8Array(buffer);
            reading = false;
            picked.textContent = 'Certificate ready. Type its password below.';
            onChange();
          },
          () => {
            reading = false;
            picked.textContent = "That file couldn't be read. Choose it again.";
            onChange();
          },
        );
      });
      const certField = document.createElement('div');
      certField.className = 'field';
      certField.append(Object.assign(document.createElement('label'), { className: 'field__label', htmlFor: 'opt-certificate', textContent: 'Your certificate (.pfx or .p12)' }), fileInput, picked);
      const password = field('cert-password', { label: 'Its password', type: 'password', autocomplete: 'off' }, onChange);
      const visible = check('visible', 'Show the signature on the last page', true, onChange, 'A box with your name and the date. Off: the signature is still there, in the reader’s signature panel.');
      const reason = field('reason', { label: 'Reason (optional)', placeholder: 'e.g. I approve this document' }, onChange);
      return {
        root: group([
          certField,
          password.root,
          visible.root,
          reason.root,
          note('This is the signature Acrobat checks: it proves who signed and that nothing changed since. Your certificate and password stay on this device and are forgotten when you leave the page. A drawn signature is in Sign.'),
        ]),
        params: (): DigitalSignParams => ({ certificate: certificate ?? new Uint8Array(0), password: password.value(), visible: visible.checked(), reason: reason.value() }),
        problem: () => (reading ? 'Reading the certificate…' : certificate === null ? 'Choose your certificate file (.pfx or .p12).' : null),
      };
    }

    case 'extract-images':
      return {
        root: note('Every photo and picture in the file, saved exactly as it is stored: no re-compression, no loss.'),
        params: () => ({}),
        problem: () => null,
      };

    case 'compress': {
      const target = choices<'100' | '200' | '500' | '1000' | 'custom'>(
        'target',
        'Under',
        [
          { value: '100', title: '100 KB' },
          { value: '200', title: '200 KB' },
          { value: '500', title: '500 KB' },
          { value: '1000', title: '1 MB' },
          { value: 'custom', title: 'Other' },
        ],
        '200',
        onChange,
        'pills',
      );
      const custom = field('target-kb', { label: 'Size in KB', type: 'number', min: 10, max: 100000, value: '300' }, onChange);
      const pictures = check('allow-pictures', 'Let pages become pictures if that is what it takes', false, onChange, 'The words stop being selectable, but the page looks the same.');
      const targetBox = group([target.root, custom.root, pictures.root]);
      const level = choices<CompressParams['level']>(
        'level',
        'How to squeeze',
        [
          { value: 'target', title: 'To a size', hint: 'For upload forms: under 100 KB, 200 KB, 1 MB…', field: targetBox },
          { value: 'light', title: 'Light', hint: 'Photos stay print-sharp. Smallest change.' },
          { value: 'balanced', title: 'Balanced', hint: 'Sharp on any screen, fine to print. Usually half the size or less.' },
          { value: 'strong', title: 'Strong', hint: 'For email limits. Photos get softer.' },
        ],
        'balanced',
        () => {
          sync();
          onChange();
        },
      );
      const sync = () => {
        targetBox.hidden = level.value() !== 'target';
        custom.root.hidden = target.value() !== 'custom';
      };
      target.root.addEventListener('change', sync);
      sync();
      return {
        root: group([level.root, note('Text and drawings are never touched, so they stay crisp. If a file cannot get smaller, it says so rather than handing back a copy.')]),
        params: (): CompressParams =>
          level.value() === 'target'
            ? { level: 'target', targetKb: target.value() === 'custom' ? custom.number() : Number(target.value()), allowPictures: pictures.checked() }
            : { level: level.value() },
        problem: () => (level.value() === 'target' && target.value() === 'custom' && !(custom.number() >= 10) ? 'Type a size of at least 10 KB.' : null),
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

    case 'ocr':
      return createOcrOptions(onChange);

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
