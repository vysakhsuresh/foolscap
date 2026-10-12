/** Things about the site itself, in one place. */

export const SITE_NAME = 'Foolscap';
export const TAGLINE = 'PDF tools that can’t upload your files.';
export const DESCRIPTION =
  'Merge, split and organise PDFs in your browser. Nothing is uploaded, ever. Free, no sign-up, no limits, no watermark.';

/**
 * Set once the domain is bought, e.g. 'https://foolscap.app'. While null, pages
 * carry no canonical URL and no absolute Open Graph URL rather than a wrong
 * one.
 */
export const SITE_ORIGIN: string | null = null;

export const MADE_BY = { name: 'Layerbit', url: 'https://layerbit.co.in' } as const;

/**
 * The exact Content-Security-Policy value served by app/public/_headers,
 * shown on the privacy page so a visitor can compare it with what the
 * browser's Network tab reports. Keep the two identical.
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
