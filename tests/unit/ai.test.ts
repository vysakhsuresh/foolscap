import { describe, expect, it } from 'vitest';
import { pieces } from '../../app/src/ui/ai-panel';

describe('summarise and translate', () => {
  it('cuts long text into pieces on sentence ends, losing nothing', () => {
    const text = Array.from({ length: 200 }, (_, i) => `Sentence number ${i} says something.`).join(' ');
    const parts = pieces(text, 500);
    expect(parts.every((p) => p.length <= 500)).toBe(true);
    expect(parts.every((p) => p.endsWith('.'))).toBe(true);
    expect(parts.join(' ')).toBe(text);
  });
});
