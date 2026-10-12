/**
 * Make searchable's settings: which languages the scan is in. Up to three
 * pickers, the main language first; English, then the languages of India,
 * then the rest, each shown with its name in its own script so it can be
 * found without reading English.
 *
 * English is ready when the page is. Any other language is downloaded from
 * this site the first time it is used, and the note under the pickers says
 * so, with the size, before anybody presses the button.
 */
import { OCR_LANGUAGES, PRELOADED_LANGUAGE, allLatin, languageName, ocrLanguage } from '../ocr/languages';
import { MAX_OCR_LANGUAGES, checkOcrParams, type OcrParams } from '../ops/ocr-params';
import { el } from './dom';
import { group, note, select } from './fields';

export interface OcrOptions {
  readonly root: HTMLElement;
  params(): OcrParams;
  problem(): string | null;
}

const NONE = '';

const WHAT_IT_DOES =
  'Reads the words in scanned pages and lays them invisibly over the pictures, so you can search, select and copy them. The pages look exactly the same. Pages that already have text are left alone.';

/** "Malayalam · മലയാളം"; English alone, where the two are the same. */
function titleOf(code: string): string {
  const language = ocrLanguage(code);
  if (language === undefined) return code;
  return language.native === language.name ? language.name : `${language.name} · ${language.native}`;
}

/** "Malayalam", "Malayalam and Hindi", "Malayalam, Hindi and Tamil". */
function listOf(names: readonly string[]): string {
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}` : (names[0] ?? '');
}

export function createOcrOptions(onChange: () => void): OcrOptions {
  const everyLanguage = OCR_LANGUAGES.map((l) => ({ value: l.code, title: titleOf(l.code) }));
  const optional = [{ value: NONE, title: 'None' }, ...everyLanguage];
  const changed = () => {
    explain();
    onChange();
  };
  const pickers = Array.from({ length: MAX_OCR_LANGUAGES }, (_, i) =>
    i === 0
      ? select('ocr-lang-1', 'Language of the scan', everyLanguage, PRELOADED_LANGUAGE, changed)
      : select(`ocr-lang-${i + 1}`, i === 1 ? 'Also in (optional)' : 'And (optional)', optional, NONE, changed),
  );
  const downloads = el('p', { class: 'options__note', testid: 'ocr-downloads', attrs: { 'aria-live': 'polite' } });

  const params = (): OcrParams => {
    const languages: string[] = [];
    for (const picker of pickers) {
      const code = picker.value();
      if (code !== NONE && !languages.includes(code)) languages.push(code);
    }
    return { languages };
  };

  /** What picking these costs, said before the run: the downloads, and where non-Latin words end up. */
  function explain(): void {
    const { languages } = params();
    const fetched = languages.filter((code) => code !== PRELOADED_LANGUAGE);
    const sentences: string[] = [];
    if (fetched.length > 0) {
      const megabytes = fetched.reduce((sum, code) => sum + (ocrLanguage(code)?.megabytes ?? 0), 0);
      const names = listOf(fetched.map(languageName));
      sentences.push(
        `The ${names} reader${fetched.length > 1 ? 's are' : ' is'} downloaded from this site the first time you use ${fetched.length > 1 ? 'them' : 'it'} (about ${megabytes.toFixed(1)} MB). Nothing of yours is sent.`,
      );
    }
    const unshaped = languages.filter((code) => !allLatin([code]));
    if (unshaped.length > 0) {
      sentences.push(
        `Words in ${listOf(unshaped.map(languageName))} come out as a text file beside the PDF: the PDF's searchable layer can hold Latin letters only, for now.`,
      );
    }
    downloads.textContent = sentences.join(' ');
    downloads.hidden = sentences.length === 0;
  }
  explain();

  const row = el('div', { class: 'field-row' }, pickers.map((p) => p.root));
  return {
    root: group([row, downloads, note(WHAT_IT_DOES)]),
    params,
    problem: () => {
      const checked = checkOcrParams(params());
      return checked.ok ? null : checked.reason;
    },
  };
}
