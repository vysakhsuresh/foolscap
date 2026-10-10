import { defineConfig } from 'vitest/config';

/**
 * Unit tests run in Node, against the pure parts: page selection, the ops over
 * a real pdf-lib surgeon (pdf-lib works in Node, so merge/split/organise logic
 * is tested without a browser), and the structural rules (the seam, the
 * Exporter) enforced by reading the source tree.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    reporters: ['default'],
  },
});
