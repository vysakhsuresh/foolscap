/**
 * Prefixes root-absolute links in the built HTML with the build's base path.
 *
 * Vite rebases the URLs it treats as assets (scripts, stylesheets, icons) but
 * leaves `<a href="/private/">` exactly as written, which is right at the root
 * and a 404 under /foolscap/. Runs after Vite's own rewriting, so an asset URL
 * that already carries the base is left alone.
 *
 * Under a non-root base the site is the GitHub Pages preview, which cannot send
 * headers. There the page-level policy is added as a <meta> tag, so the preview
 * still refuses third-party connections from the page itself. (A meta policy
 * cannot cover workers or frame-ancestors; Cloudflare's header does.)
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { headersFor, parseHeaders } from './vite-cf-headers';

export function rebaseHtml(base: string): Plugin {
  let csp = '';
  return {
    name: 'foolscap:rebase-html',
    apply: 'build',
    configResolved(config) {
      if (base === '/') return;
      try {
        const blocks = parseHeaders(readFileSync(resolve(config.publicDir, '_headers'), 'utf8'));
        csp = (headersFor(blocks, '/')['Content-Security-Policy'] ?? '')
          .split(';')
          .map((d) => d.trim())
          .filter((d) => d && !d.startsWith('frame-ancestors'))
          .join('; ');
      } catch {
        csp = '';
      }
    },
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        if (base === '/') return html;
        const prefix = base.endsWith('/') ? base : `${base}/`;
        const rebased = html.replace(/(\s(?:href|src))="\/(?!\/)([^"]*)"/g, (whole, attr: string, rest: string) =>
          `/${rest}`.startsWith(prefix) ? whole : `${attr}="${prefix}${rest}"`,
        );
        return csp
          ? rebased.replace('<meta charset="utf-8">', `<meta charset="utf-8">\n  <meta http-equiv="Content-Security-Policy" content="${csp}">`)
          : rebased;
      },
    },
  };
}
