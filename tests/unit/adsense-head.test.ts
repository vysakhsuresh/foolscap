/**
 * The live build puts Google's AdSense tag in the head of the pages that may
 * carry ads, and only those: never a tool page, never a page that takes files.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ADSENSE_TAG, withAdsense } from '../../scripts/vite-adsense';
import { ADSENSE } from '../../app/src/site/config';

const page = (path: string) => readFileSync(new URL(`../../app/${path}`, import.meta.url), 'utf8');

describe('the AdSense tag on the live build', () => {
  it('goes in the head of the home page and a guide, once, with the account Google gave', () => {
    for (const html of [page('index.html'), page('guides/merge-pdf-files/index.html'), page('guides/index.html')]) {
      const out = withAdsense(html);
      const head = out.slice(0, out.indexOf('</head>'));
      expect(head).toContain(ADSENSE_TAG);
      expect(head).toContain(`client=${ADSENSE.client}`);
      expect(withAdsense(out)).toBe(out);
    }
  });

  it('never goes on a tool page, Open a file, privacy, about, terms or contact', () => {
    for (const path of ['tools/merge/index.html', 'tools/compress/index.html', 'open/index.html', 'private/index.html', 'about/index.html', 'terms/index.html', 'contact/index.html']) {
      const html = page(path);
      expect(withAdsense(html), path).toBe(html);
    }
  });

  it('every page still carries the account meta tag Google uses to check the site', () => {
    for (const path of ['index.html', 'tools/merge/index.html', 'guides/merge-pdf-files/index.html', 'private/index.html']) {
      expect(page(path)).toContain(`<meta name="google-adsense-account" content="${ADSENSE.client}">`);
    }
  });
});
