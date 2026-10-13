/**
 * The reading pages: guides, About, Terms, Contact and the not-found page.
 * They are static HTML (scripts/gen-pages.ts); this loads the stylesheets,
 * keeps the site for offline use, wires the family chips on the guides
 * list, and on the guides only, adds the ads.
 */
import { loadAds } from '../ui/ads';
import { mountJumps } from '../ui/jumps';
import { mountShell } from '../ui/shell';

mountShell();
loadAds();
mountJumps();
