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

/** Where "Something's wrong" goes. A mailto link; there is no backend to post to. Null hides the link. */
export const FEEDBACK_EMAIL: string | null = null;

export const MADE_BY = { name: 'Layerbit', url: 'https://layerbit.co.in' } as const;
