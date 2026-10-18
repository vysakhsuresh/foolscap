/**
 * Open a file's suggestions and recipes' rules: what is offered for what was
 * dropped, and what a recipe may keep in the browser (never a password).
 */
import { describe, expect, it } from 'vitest';
import { needsPassword, problemWith, readRecipes, storable, writeRecipes, type Recipe } from '../../app/src/ui/recipe-model';
import { noSuggestion, officeByName, suggest, wordsSay } from '../../app/src/ui/suggest';

const MB = 1024 * 1024;

describe('what Open a file suggests', () => {
  it('a page of amounts: a spreadsheet first; an Aadhaar or PAN on show: hide it', () => {
    const statement = ['Date', 'Narration', '12,500.00', '1,200.00', '45,000.00', '(300.00)', '9,99,999.00', '18.00', '2,450.75', '₹ 640.00', '1,00,000.00 Cr'];
    expect(wordsSay(statement)).toEqual({ amounts: true });
    expect(wordsSay(['Aadhaar', '1234 5678 9012'])).toEqual({ idNumber: true });
    expect(wordsSay(['PAN:', 'ABCDE1234F'])).toEqual({ idNumber: true });
    expect(wordsSay(['Dear Sir,', 'I write to apply for leave', '12 March 2026'])).toEqual({});
    expect(suggest([{ kind: 'pdf', size: 80_000, pages: 6, amounts: true }])[0]?.tool).toBe('pdf-to-excel');
    expect(suggest([{ kind: 'pdf', size: 80_000, pages: 1, idNumber: true }]).slice(0, 3).map((s) => s.tool)).toContain('remove-areas');
  });

  it('when there is nothing to suggest, it says why, and what to do instead', () => {
    expect(noSuggestion([{ name: 'Bill.pdf', facts: { kind: 'pdf', size: 184, unreadable: true } }])).toMatch(/^This PDF is damaged/);
    expect(noSuggestion([{ name: 'Deck.pptx', facts: { kind: 'other', size: 4000 } }])).toMatch(/Save as PDF/);
    expect(noSuggestion([{ name: 'Old.doc', facts: { kind: 'other', size: 4000 } }])).toMatch(/\.docx and \.xlsx/);
    expect(noSuggestion([{ name: 'song.mp3', facts: { kind: 'other', size: 4000 } }])).toMatch(/^Nothing here is a PDF/);
  });


  it('a locked PDF: unlock it first', () => {
    const s = suggest([{ kind: 'pdf', size: 200_000, locked: true }]);
    expect(s[0]?.tool).toBe('remove-password');
    expect(s[0]?.takes).toEqual([0]);
  });

  it('a scan: make it searchable, then Word, and Edit text reads it first', () => {
    const tools = suggest([{ kind: 'pdf', size: 900_000, pages: 2, scanned: true }]).map((s) => s.tool);
    expect(tools[0]).toBe('ocr');
    expect(tools).toContain('pdf-to-word');
    expect(tools.indexOf('ocr')).toBeLessThan(tools.indexOf('pdf-to-word'));
  });

  it('a big file: make it smaller, saying how big it is', () => {
    const s = suggest([{ kind: 'pdf', size: 18 * MB, pages: 40 }]);
    const compress = s.find((x) => x.tool === 'compress');
    expect(compress?.why).toBe('It is 18 MB: make it smaller');
    expect(s.indexOf(compress!)).toBeLessThan(2);
  });

  it('a form: fill it in; a one-page PDF: sign it', () => {
    expect(suggest([{ kind: 'pdf', size: 100_000, pages: 3, forms: true }])[0]?.tool).toBe('fill-form');
    expect(suggest([{ kind: 'pdf', size: 100_000, pages: 1 }])[0]?.tool).toBe('sign');
  });

  it('several PDFs: join them, and two may be versions to compare', () => {
    const s = suggest([
      { kind: 'pdf', size: 100_000, pages: 2 },
      { kind: 'pdf', size: 100_000, pages: 2 },
    ]);
    expect(s[0]).toMatchObject({ tool: 'merge', why: 'Join these 2 PDFs into one', takes: [0, 1] });
    expect(s.map((x) => x.tool)).toContain('compare');
  });

  it('photos become one PDF; Word and Excel become PDFs; each tool gets only what it takes', () => {
    const s = suggest([
      { kind: 'image', size: 2 * MB },
      { kind: 'office', size: 40_000 },
      { kind: 'image', size: 3 * MB },
    ]);
    expect(s.find((x) => x.tool === 'images-to-pdf')?.takes).toEqual([0, 2]);
    expect(s.find((x) => x.tool === 'office-to-pdf')?.takes).toEqual([1]);
    expect(s.find((x) => x.tool === 'merge')).toBeUndefined();
  });

  it('never offers a tool twice, never more than asked, and nothing for files it cannot use', () => {
    const s = suggest([{ kind: 'pdf', size: 3 * MB, pages: 5, scanned: true, forms: true }], 5);
    expect(s).toHaveLength(5);
    expect(new Set(s.map((x) => x.tool)).size).toBe(5);
    expect(suggest([{ kind: 'other', size: 10 }])).toEqual([]);
    expect(suggest([{ kind: 'pdf', size: 10, unreadable: true }])).toEqual([]);
  });

  it('knows Word and Excel by their ending', () => {
    expect(officeByName('Report.DOCX')).toBe(true);
    expect(officeByName('sheet.xlsx')).toBe(true);
    expect(officeByName('old.doc')).toBe(false);
  });
});

describe('recipes', () => {
  const lock = { tool: 'add-password' as const, params: { mode: 'password', password: 'flat4b', allowPrinting: true, allowCopying: false } };

  it('never writes a password down, and asks for one when the recipe locks files', () => {
    const recipe: Recipe = { id: 'r1', name: 'Lock them', steps: [{ tool: 'compress', params: { level: 'balanced' } }, lock] };
    const kept = writeRecipes([recipe]);
    expect(kept).not.toContain('flat4b');
    expect((storable(lock).params as { password: string }).password).toBe('');
    const back = readRecipes(kept);
    expect(back).toHaveLength(1);
    expect(needsPassword(back[0]!)).toBe(true);
    expect(needsPassword({ ...recipe, steps: [{ tool: 'add-password', params: { mode: 'restrict', password: '' } }] })).toBe(false);
  });

  it('a step that makes Word or Excel ends the recipe, and each tool is a step once', () => {
    expect(problemWith('x', [{ tool: 'pdf-to-word', params: {} }, { tool: 'compress', params: {} }])).toMatch(/last step/);
    expect(problemWith('x', [{ tool: 'compress', params: {} }, { tool: 'pdf-to-word', params: {} }])).toBeNull();
    expect(problemWith('x', [{ tool: 'compress', params: {} }, { tool: 'compress', params: {} }])).toMatch(/once/);
    expect(problemWith('  ', [{ tool: 'compress', params: {} }])).toMatch(/name/);
    expect(problemWith('x', [])).toMatch(/step/);
  });

  it('reads back only what makes sense: unknown tools and broken entries are dropped', () => {
    expect(readRecipes(null)).toEqual([]);
    expect(readRecipes('not json')).toEqual([]);
    expect(readRecipes('{"a":1}')).toEqual([]);
    const raw = JSON.stringify([
      { id: 'a', name: 'Good', steps: [{ tool: 'compress', params: {} }] },
      { id: 'b', name: 'Draws on pages', steps: [{ tool: 'sign', params: {} }] },
      { id: 'c', steps: [{ tool: 'compress' }] },
    ]);
    expect(readRecipes(raw).map((r) => r.name)).toEqual(['Good']);
  });
});
