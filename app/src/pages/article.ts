/**
 * The reading pages: guides, About, Terms, Contact and the not-found page.
 * They are static HTML (scripts/gen-pages.ts); this loads the stylesheets,
 * keeps the site for offline use, and on the guides only, adds the ads.
 */
import { loadAds } from '../ui/ads';
import { mountShell } from '../ui/shell';

mountShell();
loadAds();
