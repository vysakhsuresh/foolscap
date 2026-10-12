/**
 * The words Make searchable read, put back together as plain text: for the
 * languages whose letters the PDF's searchable layer cannot hold yet, this
 * text file is where every word goes. Pure, so it is tested in Node.
 */
import type { OcrWord } from '../ops/op';

/** Chinese and Japanese are written without spaces; Tesseract hands them back a character or two at a time. */
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

/**
 * One page's words as lines of text. The words arrive in Tesseract's reading
 * order; a word starts a new line when its middle is not within the height
 * of the word before it, which holds for left-to-right and right-to-left
 * scripts alike.
 */
export function pageText(words: readonly OcrWord[]): string {
  const lines: string[] = [];
  let line = '';
  let previous: OcrWord | null = null;
  for (const word of words) {
    const middle = word.y + word.h / 2;
    const sameLine = previous !== null && middle >= previous.y && middle <= previous.y + previous.h;
    if (previous !== null && !sameLine) {
      lines.push(line);
      line = word.text;
    } else if (previous === null) {
      line = word.text;
    } else {
      const joined = UNSPACED.test(Array.from(line).pop() ?? '') && UNSPACED.test(Array.from(word.text)[0] ?? '');
      line += joined ? word.text : ` ${word.text}`;
    }
    previous = word;
  }
  if (previous !== null) lines.push(line);
  return lines.join('\n');
}

/** Every page that had words, under a page heading when there is more than one page, the way Extract text writes it. */
export function documentText(pages: ReadonlyMap<number, readonly OcrWord[]>, pageCount: number): string {
  const parts: string[] = [];
  for (const [index, words] of [...pages].sort(([a], [b]) => a - b)) {
    const text = pageText(words);
    parts.push(pageCount > 1 ? `--- Page ${index + 1} ---\n\n${text}` : text);
  }
  return `${parts.join('\n\n')}\n`;
}
