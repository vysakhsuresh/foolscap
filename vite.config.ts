import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { cloudflareHeaders } from './scripts/vite-cf-headers';
import { rebaseHtml } from './scripts/vite-rebase-html';

const here = dirname(fileURLToPath(import.meta.url));
const page = (...parts: string[]) => resolve(here, 'app', ...parts);

// The app lives in app/ so the entry pages sit together, and the build output
// goes to dist/, which is what Cloudflare Pages publishes.
// Cloudflare Pages serves the site at the root. The GitHub Pages preview serves
// it under /foolscap/. One build, one environment variable.
const base = process.env['FOOLSCAP_BASE'] || '/';

export default defineConfig({
  base,
  root: 'app',
  publicDir: 'public',
  plugins: [
    // Applies app/public/_headers to `vite preview`, so the Content-Security-Policy
    // that Cloudflare Pages will serve is enforced while the e2e tests run against
    // the built site. A tool page that reaches for a CDN fails here, not in production.
    cloudflareHeaders(),
    // Vite rebases asset URLs for a non-root base but leaves <a href="/…"> alone.
    rebaseHtml(base),
  ],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      // Every page has to be listed: Vite builds index.html and nothing else by
      // default, so a new page silently goes missing from dist/.
      input: {
        home: page('index.html'),
        private: page('private', 'index.html'),
        merge: page('tools', 'merge', 'index.html'),
        split: page('tools', 'split', 'index.html'),
        organise: page('tools', 'organise', 'index.html'),
      },
    },
  },
  worker: { format: 'es' },
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1' },
});
