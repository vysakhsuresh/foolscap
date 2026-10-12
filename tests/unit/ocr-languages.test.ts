/**
 * The languages Make searchable offers, the params that pick them, and how
 * the words read are written back out as text.
 */
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OCR_LANGUAGES, PRELOADED_LANGUAGE, allLatin, languageName, ocrLanguage } from '../../app/src/ocr/languages';
import { documentText, pageText } from '../../app/src/ocr/text';
import { DEFAULT_OCR_PARAMS, MAX_OCR_LANGUAGES, checkOcrParams } from '../../app/src/ops/ocr-params';
import type { OcrWord } from '../../app/src/ops/op';

const MODULES = resolve(import.meta.dirname, '../../node_modules');

function modelPath(code: string): string {
  const best = resolve(MODULES, `@tesseract.js-data/${code}/4.0.0_best_int/${code}.traineddata.gz`);
  return existsSync(best) ? best : resolve(MODULES, `@tesseract.js-data/${code}/4.0.0/${code}.traineddata.gz`);
}

describe('the language list', () => {
  it('starts with English, then the languages of India, then the rest', () => {
    expect(OCR_LANGUAGES[0]?.code).toBe(PRELOADED_LANGUAGE);
    const regions = OCR_LANGUAGES.map((l) => l.region);
    const order = ['first', 'india', 'world'];
    const ranks = regions.map((r) => order.indexOf(r));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(regions.filter((r) => r === 'first')).toHaveLength(1);
  });

  it('has each code once, a name in English and a name in its own script', () => {
    const codes = OCR_LANGUAGES.map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const language of OCR_LANGUAGES) {
      expect(language.code).toMatch(/^[a-z]{3}(_[a-z]+)?$/);
      expect(language.name.length).toBeGreaterThan(0);
      expect(language.native.length).toBeGreaterThan(0);
      // Only a Latin-script language may spell its own name in Latin letters.
      expect(/^[\p{Script=Latin}\s()]+$/u.test(language.native)).toBe(language.script === 'latin');
    }
  });

  it('covers the Indian languages asked for', () => {
    const india = OCR_LANGUAGES.filter((l) => l.region === 'india').map((l) => l.code);
    expect(india).toEqual(expect.arrayContaining(['mal', 'hin', 'tam', 'tel', 'kan', 'ben', 'mar', 'guj', 'pan', 'urd']));
  });

  it('has an installed model for every language, under 20 MiB, and says its size truly', () => {
    for (const language of OCR_LANGUAGES) {
      const path = modelPath(language.code);
      expect(existsSync(path), `${language.code} has no model installed`).toBe(true);
      const { size } = statSync(path);
      expect(size).toBeLessThan(20 * 1024 * 1024);
      expect(Math.abs(size / 1e6 - language.megabytes), `${language.code} is ${(size / 1e6).toFixed(2)} MB`).toBeLessThanOrEqual(0.05);
    }
  });

  it('looks languages up by code, and knows which fit the Latin-only text layer', () => {
    expect(ocrLanguage('mal')?.native).toBe('മലയാളം');
    expect(ocrLanguage('xyz')).toBeUndefined();
    expect(languageName('hin')).toBe('Hindi');
    expect(allLatin(['eng', 'fra', 'deu'])).toBe(true);
    expect(allLatin(['eng', 'mal'])).toBe(false);
    expect(allLatin(['rus'])).toBe(false);
  });
});

describe('checkOcrParams', () => {
  it('means English when no languages are given, as a job posted before the picker would be', () => {
    expect(checkOcrParams({})).toEqual({ ok: true, languages: ['eng'] });
    expect(checkOcrParams(undefined)).toEqual({ ok: true, languages: ['eng'] });
    expect(DEFAULT_OCR_PARAMS.languages).toEqual(['eng']);
  });

  it('keeps the order picked and drops repeats', () => {
    expect(checkOcrParams({ languages: ['mal', 'eng', 'mal'] })).toEqual({ ok: true, languages: ['mal', 'eng'] });
  });

  it('refuses, in words, an empty list, an unknown code and more than three', () => {
    const empty = checkOcrParams({ languages: [] });
    expect(empty.ok).toBe(false);
    const unknown = checkOcrParams({ languages: ['eng', 'klingon'] });
    expect(unknown.ok).toBe(false);
    const many = checkOcrParams({ languages: ['eng', 'mal', 'hin', 'tam'] });
    expect(MAX_OCR_LANGUAGES).toBe(3);
    expect(many).toEqual({ ok: false, reason: expect.stringContaining('up to 3') });
    const odd = checkOcrParams({ languages: 'eng' as unknown as string[] });
    expect(odd.ok).toBe(false);
  });
});

const word = (text: string, x: number, y: number): OcrWord => ({ text, x, y, w: 0.1, h: 0.03 });

describe('the words as text', () => {
  it('puts words on the same line together and starts a new line when the words drop', () => {
    const words = [word('നമസ്കാരം', 0.1, 0.1), word('കേരളം', 0.25, 0.105), word('second', 0.1, 0.2), word('line', 0.25, 0.2)];
    expect(pageText(words)).toBe('നമസ്കാരം കേരളം\nsecond line');
  });

  it('joins Chinese and Japanese characters without spaces', () => {
    expect(pageText([word('简体', 0.1, 0.1), word('中文', 0.2, 0.1), word('OK', 0.3, 0.1)])).toBe('简体中文 OK');
  });

  it('writes the pages in order, under page headings when there are several', () => {
    const pages = new Map([
      [2, [word('three', 0.1, 0.1)]],
      [0, [word('one', 0.1, 0.1)]],
    ]);
    expect(documentText(pages, 3)).toBe('--- Page 1 ---\n\none\n\n--- Page 3 ---\n\nthree\n');
    expect(documentText(new Map([[0, [word('only', 0.1, 0.1)]]]), 1)).toBe('only\n');
  });
});
