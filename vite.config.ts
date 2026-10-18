import { existsSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { cloudflareHeaders } from './scripts/vite-cf-headers';
import { rebaseHtml } from './scripts/vite-rebase-html';
import { serviceWorker } from './scripts/vite-sw';
import { adsenseHead } from './scripts/vite-adsense';
import { isPdfjsWorker, patchPdfjsWorker } from './scripts/pdfjs-patch';

const here = dirname(fileURLToPath(import.meta.url));

/** pdf.js read Malayalam and Hindi letters with a vowel sign as taking no room (scripts/pdfjs-patch.ts). */
const pdfjsDiacritics = (): Plugin => ({
  name: 'pdfjs-diacritics',
  enforce: 'pre',
  transform: (code, id) => (isPdfjsWorker(id) ? { code: patchPdfjsWorker(code), map: null } : null),
});
const page = (...parts: string[]) => resolve(here, 'app', ...parts);

/** Every index.html below app/ (tools, guides, privacy, about…), outside the source and public folders. */
function pagesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (!entry.isDirectory() || ['src', 'public', 'node_modules'].includes(entry.name)) return [];
    const sub = resolve(dir, entry.name);
    return [...(existsSync(resolve(sub, 'index.html')) ? [resolve(sub, 'index.html')] : []), ...pagesUnder(sub)];
  });
}

// The app lives in app/ so the entry pages sit together, and the build output
// goes to dist/, which is what Cloudflare Pages publishes.
// Cloudflare Pages serves the site at the root. The GitHub Pages preview serves
// it under /foolscap/. One build, one environment variable.
const base = process.env['FOOLSCAP_BASE'] || '/';
// GitHub Pages cannot send headers: there each page carries its policy itself.
const github = process.env['FOOLSCAP_HOST'] === 'github';

export default defineConfig({
  base,
  root: 'app',
  publicDir: 'public',
  plugins: [
    // Applies app/public/_headers to `vite preview`, so the Content-Security-Policy
    // that Cloudflare Pages will serve is enforced while the e2e tests run against
    // the built site. A tool page that reaches for a CDN fails here, not in production.
    cloudflareHeaders(),
    // Rebases <a href="/…"> under a non-root base, and puts each page's policy
    // in the page on a host that cannot send headers (GitHub Pages).
    rebaseHtml(base, { metaCsp: github || base !== '/', noindex: base !== '/' }),
    // Writes dist/sw.js from what the build wrote, so the tools work offline.
    serviceWorker(base),
    pdfjsDiacritics(),
    // On the live build only: Google's AdSense tag in the <head> of the home page and the guides.
    adsenseHead(),
  ],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      // Every page has to be listed: Vite builds index.html and nothing else by
      // default. The pages are found on disk (scripts/gen-pages.ts writes one
      // per live tool and per guide), so a new page cannot go missing from dist/.
      input: {
        home: page('index.html'),
        notFound: page('404.html'),
        ...Object.fromEntries(pagesUnder(page()).map((file) => [file.slice(page().length + 1, -'/index.html'.length).replace(/\//g, '-'), file])),
      },
    },
  },
  // Worker bundles take their own plugins in a build: pdf.js's worker is in one.
  worker: { format: 'es', plugins: () => [pdfjsDiacritics()] },
  // Served as it is, not pre-bundled, so the pdfjs-diacritics correction reaches it in `vite dev` too.
  optimizeDeps: { exclude: ['pdfjs-dist'] },
  server: { host: '127.0.0.1' },
  // allowedHosts: the e2e maps the real domain to the preview server to check
  // that ads load there and only on the pages that may carry them.
  preview: { host: '127.0.0.1', allowedHosts: ['foolscap.co.in', 'www.foolscap.co.in'] },
});
