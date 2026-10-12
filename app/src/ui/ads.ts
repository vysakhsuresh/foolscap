/**
 * Google AdSense, on the pages that may carry it: the home page and the
 * guides, which say so with `data-ads="on"` on <body> (scripts/gen-pages.ts
 * writes it from AD_PAGES). Tool pages never import this file, and their
 * policy would refuse the script if one did.
 *
 * The script is added after the page has loaded, so it never holds up what a
 * visitor came for, and only on the real domain, so a preview copy, a local
 * build and the tests never ask Google for anything. Placement is Auto ads,
 * set in the AdSense dashboard.
 */
import { ADSENSE, SITE_ORIGIN } from '../site/config';

/** True on the site's own address, with or without www. */
export function adsAllowedOn(hostname: string): boolean {
  if (SITE_ORIGIN === null) return false;
  const host = new URL(SITE_ORIGIN).hostname;
  return hostname === host || hostname === `www.${host}`;
}

export const ADSENSE_SRC = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE.client}`;

export function loadAds(): void {
  if (document.body.dataset['ads'] !== 'on' || !adsAllowedOn(location.hostname)) return;
  const add = () => {
    if (document.querySelector('script[data-adsense]')) return;
    const script = document.createElement('script');
    script.async = true;
    script.src = ADSENSE_SRC;
    script.crossOrigin = 'anonymous';
    script.dataset['adsense'] = '';
    document.head.append(script);
  };
  if (document.readyState === 'complete') add();
  else window.addEventListener('load', add, { once: true });
}
