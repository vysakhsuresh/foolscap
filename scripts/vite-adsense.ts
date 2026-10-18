/**
 * Google asks for its AdSense script in the <head> of every page that may
 * show ads. On the live build (FOOLSCAP_ADS=1, set by the publish workflow
 * when it builds for the real domain) the pages that may carry ads — the
 * home page and the guides, which say so with data-ads="on" on <body> —
 * get exactly that tag. Tool pages never do, and their policy would refuse
 * it. Local builds, previews and the tests get none, so they never ask
 * Google for anything; ui/ads.ts sees the tag and does not add a second.
 */
import type { Plugin } from 'vite';
import { ADSENSE } from '../app/src/site/config';

export const ADSENSE_TAG = `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE.client}" crossorigin="anonymous" data-adsense></script>`;

/** The page with Google's tag in its head, if it is a page that may carry ads. */
export function withAdsense(html: string): string {
  if (!/<body[^>]*\sdata-ads="on"/.test(html) || html.includes('data-adsense')) return html;
  return html.replace(/<\/head>/, `  ${ADSENSE_TAG}\n</head>`);
}

export function adsenseHead(on = process.env['FOOLSCAP_ADS'] === '1'): Plugin {
  return {
    name: 'foolscap-adsense-head',
    transformIndexHtml: { order: 'post', handler: (html) => (on ? withAdsense(html) : html) },
  };
}
