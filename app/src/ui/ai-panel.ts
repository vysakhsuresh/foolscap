/**
 * Summarise and translate, with the AI built into the browser itself
 * (Chrome's Summarizer and Translator, which run on the device). Nothing is
 * sent anywhere: the words are read from the PDF here and handed to a model
 * that lives on this computer. Where the browser has no such model, the
 * panel says so and does nothing else — sending the document to an online AI
 * would be uploading it, which is the one thing this site never does.
 */
import type { PdfView } from '../pdf/types';
import { el } from './dom';
import { note, select } from './fields';

export interface AiPanel {
  readonly root: HTMLElement;
  load(view: PdfView): Promise<void>;
  params(): Record<string, never>;
  problem(): string | null;
  destroy(): Promise<void>;
}

type Availability = 'unavailable' | 'downloadable' | 'downloading' | 'available';

interface Monitor {
  addEventListener(type: 'downloadprogress', listener: (event: { loaded: number }) => void): void;
}

interface SummarizerApi {
  availability(options?: object): Promise<Availability>;
  create(options: { type: string; format: string; length: string; monitor?: (m: Monitor) => void }): Promise<{
    summarize(text: string, options?: { context?: string }): Promise<string>;
    readonly inputQuota?: number;
    destroy(): void;
  }>;
}

interface TranslatorApi {
  availability(options: { sourceLanguage: string; targetLanguage: string }): Promise<Availability>;
  create(options: { sourceLanguage: string; targetLanguage: string; monitor?: (m: Monitor) => void }): Promise<{ translate(text: string): Promise<string>; destroy(): void }>;
}

interface DetectorApi {
  create(): Promise<{ detect(text: string): Promise<Array<{ detectedLanguage: string; confidence: number }>>; destroy(): void }>;
}

/** The browser's own AI, where it has it. Read through globalThis: these are not in the DOM types yet. */
const builtIn = globalThis as unknown as { Summarizer?: SummarizerApi; Translator?: TranslatorApi; LanguageDetector?: DetectorApi };

const LANGUAGES: ReadonlyArray<{ value: string; title: string }> = [
  { value: 'en', title: 'English' },
  { value: 'hi', title: 'Hindi — हिन्दी' },
  { value: 'ml', title: 'Malayalam — മലയാളം' },
  { value: 'ta', title: 'Tamil — தமிழ்' },
  { value: 'te', title: 'Telugu — తెలుగు' },
  { value: 'kn', title: 'Kannada — ಕನ್ನಡ' },
  { value: 'bn', title: 'Bengali — বাংলা' },
  { value: 'mr', title: 'Marathi — मराठी' },
  { value: 'ar', title: 'Arabic — العربية' },
  { value: 'fr', title: 'French' },
  { value: 'de', title: 'German' },
  { value: 'es', title: 'Spanish' },
  { value: 'pt', title: 'Portuguese' },
  { value: 'ja', title: 'Japanese' },
  { value: 'zh', title: 'Chinese' },
];

/** Splits text into pieces of at most `size` characters, on paragraph or sentence ends where it can. */
export function pieces(text: string, size: number): string[] {
  const out: string[] = [];
  let rest = text.trim();
  while (rest.length > size) {
    const window = rest.slice(0, size);
    const cut = Math.max(window.lastIndexOf('\n\n'), window.lastIndexOf('. '), window.lastIndexOf('\n'));
    const at = cut > size * 0.5 ? cut + 1 : size;
    out.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest.length > 0) out.push(rest);
  return out;
}

/** More than this and the on-device model would take far too long; the status says when a document was cut short. */
const MAX_PAGES = 300;

export function createAiPanel(): AiPanel {
  let text = '';
  let pages = 0;
  let total = 0;
  /** "3 pages", or "the first 300 of 412 pages" when the document was longer than what is read. */
  const howMany = () => (total > pages ? `the first ${pages} of ${total} pages` : `${pages} ${pages === 1 ? 'page' : 'pages'}`);
  const status = el('p', { class: 'options__note', testid: 'ai-status', attrs: { role: 'status', 'aria-live': 'polite' } });
  const summarise = el('button', { class: 'button', testid: 'ai-summarise', text: 'Summarise it', attrs: { type: 'button' } });
  const target = select<string>('ai-language', 'Translate into', LANGUAGES, 'en', () => undefined);
  const translate = el('button', { class: 'button button--ghost', testid: 'ai-translate', text: 'Translate it', attrs: { type: 'button' } });
  const output = el('textarea', { class: 'input ai__output', testid: 'ai-output', attrs: { readonly: '', rows: '12', 'aria-label': 'The result' } });
  const copy = el('button', { class: 'button button--ghost button--small', testid: 'ai-copy', text: 'Copy', attrs: { type: 'button' } });
  const resultBox = el('div', { class: 'ai__result' }, [output, copy]);
  resultBox.hidden = true;
  const actions = el('div', { class: 'ai__actions' }, [summarise, el('div', { class: 'field-row ai__translate' }, [target.root, translate])]);
  const honest = note(
    'This uses the AI built into your browser, which runs on this device: your document is not sent anywhere. The first time, the browser itself may download its model. Where a browser has no built-in AI, this tool does nothing rather than send your document to an online one.',
  );
  const root = el('section', { class: 'ai', testid: 'ai-panel', attrs: { 'aria-label': 'Summarise and translate' } }, [actions, status, resultBox, honest]);
  root.hidden = true;

  const say = (words: string) => {
    status.textContent = words;
  };
  const busy = (on: boolean) => {
    summarise.disabled = on;
    translate.disabled = on;
  };
  const progress = (what: string) => (m: Monitor) =>
    m.addEventListener('downloadprogress', (e) => say(`Your browser is getting its ${what} model ready, once: ${Math.round(e.loaded * 100)}%`));

  summarise.addEventListener('click', () => void doSummary());
  translate.addEventListener('click', () => void doTranslate());
  copy.addEventListener('click', () => {
    void navigator.clipboard?.writeText(output.value).then(
      () => say('Copied.'),
      () => {
        output.select();
        say('Select and copy it from the box.');
      },
    );
  });

  async function doSummary(): Promise<void> {
    const api = builtIn.Summarizer;
    if (!api || (await api.availability().catch(() => 'unavailable' as const)) === 'unavailable') {
      say('This browser has no built-in AI to summarise with. Chrome 138 or later on a laptop or desktop has one. Your document stays here either way.');
      return;
    }
    busy(true);
    try {
      say('Reading…');
      const summarizer = await api.create({ type: 'key-points', format: 'plain-text', length: 'medium', monitor: progress('summary') });
      try {
        // Long documents are summarised a part at a time, then the parts together.
        const size = Math.max(2000, Math.min(12000, (summarizer.inputQuota ?? 16000) * 2));
        const parts = pieces(text, size);
        const notes: string[] = [];
        for (const [i, part] of parts.entries()) {
          say(parts.length > 1 ? `Summarising part ${i + 1} of ${parts.length}…` : 'Summarising…');
          notes.push(await summarizer.summarize(part));
        }
        const summary = notes.length > 1 ? await summarizer.summarize(notes.join('\n')) : (notes[0] ?? '');
        show(summary);
        say(`The key points of ${howMany()}, made on this device.`);
      } finally {
        summarizer.destroy();
      }
    } catch {
      say('The browser could not summarise this. Try again, or try a shorter document.');
    } finally {
      busy(false);
    }
  }

  async function doTranslate(): Promise<void> {
    const api = builtIn.Translator;
    const to = target.value();
    if (!api) {
      say('This browser has no built-in translator. Chrome 138 or later on a laptop or desktop has one. Your document stays here either way.');
      return;
    }
    busy(true);
    try {
      let from = 'en';
      const detector = builtIn.LanguageDetector ? await builtIn.LanguageDetector.create().catch(() => null) : null;
      if (detector) {
        const best = (await detector.detect(text.slice(0, 2000)))[0];
        if (best && best.confidence > 0.5) from = best.detectedLanguage;
        detector.destroy();
      }
      if (from === to) {
        say('It is already in that language.');
        return;
      }
      if ((await api.availability({ sourceLanguage: from, targetLanguage: to }).catch(() => 'unavailable' as const)) === 'unavailable') {
        say('Your browser cannot translate between these two languages on this device yet.');
        return;
      }
      const translator = await api.create({ sourceLanguage: from, targetLanguage: to, monitor: progress('translation') });
      try {
        const parts = pieces(text, 1500);
        const done: string[] = [];
        for (const [i, part] of parts.entries()) {
          say(`Translating part ${i + 1} of ${parts.length}…`);
          done.push(await translator.translate(part));
          show(done.join('\n\n'));
        }
        say(`Translated on this device, ${howMany()}.`);
      } finally {
        translator.destroy();
      }
    } catch {
      say('The browser could not translate this. Try again.');
    } finally {
      busy(false);
    }
  }

  function show(words: string): void {
    output.value = words;
    resultBox.hidden = false;
  }

  return {
    root,
    async load(view) {
      root.hidden = false;
      resultBox.hidden = true;
      say('Reading the words…');
      busy(true);
      try {
        total = view.pageCount;
        pages = Math.min(total, MAX_PAGES);
        const all: string[] = [];
        for (let i = 0; i < pages; i++) all.push(await view.text(i));
        text = all.join('\n\n').trim();
      } finally {
        await view.close();
        busy(false);
      }
      say(text.length === 0 ? 'This file has no words in it, only pictures of them. Run Make searchable first.' : '');
      if (text.length === 0) busy(true);
    },
    params: () => ({}),
    problem: () => null,
    async destroy() {
      text = '';
      output.value = '';
      root.hidden = true;
    },
  };
}
