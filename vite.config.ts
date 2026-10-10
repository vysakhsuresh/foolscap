import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { cloudflareHeaders } from './scripts/vite-cf-headers';

const here = dirname(fileURLToPath(import.meta.url));
const page = (...parts: string[]) => resolve(here, 'app', ...parts);

// The app lives in app/ so the entry pages sit together, and the build output
// goes to dist/, which is what Cloudflare Pages publishes.
export default defineConfig({
  root: 'app',
  publicDir: 'public',
  plugins: [
    // Applies app/public/_headers to `vite preview`, so the Content-Security-Policy
    // that Cloudflare Pages will serve is enforced while the e2e tests run against
    // the built site. A tool page that reaches for a CDN fails here, not in production.
    cloudflareHeaders(),
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
