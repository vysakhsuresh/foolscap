/** Things about the site itself, in one place. */

export const SITE_NAME = 'Foolscap';
export const TAGLINE = 'PDF tools that can’t upload your files.';
export const DESCRIPTION =
  'Free PDF tools that work in your browser: merge, compress, sign, edit, unlock and convert. Nothing is uploaded, ever. No sign-up, no limits, no watermark.';

/**
 * The site's address. Canonical URLs, Open Graph links, the sitemap and
 * robots.txt are written from it; null would leave them out rather than wrong.
 */
export const SITE_ORIGIN: string | null = 'https://foolscap.co.in';

export const MADE_BY = { name: 'Layerbit', url: 'https://layerbit.co.in' } as const;

/**
 * The exact Content-Security-Policy value app/public/_headers serves on every
 * tool page and on every script, worker, font and asset, shown on the privacy
 * page so a visitor can compare it with what the browser's Network tab
 * reports. Keep the two identical.
 */
export const TOOL_PAGE_CSP =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; object-src 'none'";

/** sessionStorage key for a "Then…" handoff: a JSON array of file ids, never names. */
export const HANDOFF_KEY = 'foolscap:handoff';

/**
 * Get help and Buy me a coffee, the same as on layerbit.co.in. These are plain
 * links: nothing is fetched or sent until someone taps one, and each opens
 * another site or app that carries nothing of theirs.
 */
export const HELP = {
  email: 'ceo@layerbit.co.in',
  whatsapp: 'https://wa.me/916282595823',
  coffee: 'https://www.buymeacoffee.com/layerbit',
} as const;

/**
 * Google AdSense, the same account as layerbit.co.in. Ads run on the home
 * page and the guides only (AD_PAGES), which handle no documents. Tool pages
 * never load ad code: their policy (TOOL_PAGE_CSP) makes a third-party
 * script impossible, which is the point.
 *
 * The script is added by ui/ads.ts after the page has loaded, and only on the
 * real domain, so a preview copy of the site, a local build and the tests
 * never ask Google for anything. Which ads appear, and where, is set in the
 * AdSense dashboard (Auto ads), as is the consent message visitors in Europe
 * see (Privacy & messaging).
 */
export const ADSENSE = {
  client: 'ca-pub-6072772587431629',
} as const;

/** The paths that may carry ads, as _headers patterns. Nothing else ever does. */
export const AD_PAGES = ['/', '/guides/*'] as const;

/**
 * The policy on the ad pages: this site's own files plus what Google's ad and
 * consent scripts need, which is any https address, inline styles and
 * scripts it writes itself. These pages take no files. Framing, plugins,
 * forms and base URLs stay locked, as everywhere.
 */
export const AD_PAGE_CSP =
  "default-src 'self'; script-src 'self' https: 'unsafe-inline' 'unsafe-eval'; style-src 'self' https: 'unsafe-inline'; img-src 'self' https: data: blob:; font-src 'self' https: data:; connect-src 'self' https:; frame-src https:; worker-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; object-src 'none'";

/** A ready-made message for "Tell a friend": a plain wa.me link, nothing fetched until tapped. */
export const SHARE_TEXT = 'Free PDF tools that never upload your files: merge, compress, sign, unlock, convert. Works offline too.';
