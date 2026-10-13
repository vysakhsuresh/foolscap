/**
 * Adjusts the built HTML for where it is served.
 *
 * - Under a non-root base (the github.io/foolscap/ preview) Vite rebases the
 *   URLs it treats as assets but leaves `<a href="/private/">` alone, which
 *   is right at the root and a 404 under /foolscap/; this prefixes them.
 *   The preview is a copy, so it also asks search engines not to index it.
 *
 * - On a host that cannot send headers (GitHub Pages, `metaCsp`), each page
 *   carries its own policy as a <meta> tag instead: the strict one on tool
 *   pages, the ad policy on the home page and guides — whatever
 *   app/public/_headers gives that path. A meta policy cannot carry
 *   frame-ancestors, so that is left out; and a worker's policy can only
 *   come from a header, which is the one thing Cloudflare adds.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { headersFor, parseHeaders, type HeaderBlock } from './vite-cf-headers';

export interface HtmlOptions {
  /** Put each page's Content-Security-Policy and Referrer-Policy in the page itself. */
  readonly metaCsp: boolean;
  /** Ask search engines to stay away (a preview copy). */
  readonly noindex: boolean;
}

/** '/tools/merge/index.html' → '/tools/merge/'; '/index.html' → '/'. */
export function pagePath(htmlPath: string): string {
  return htmlPath.replace(/index\.html$/, '');
}

export function metaFor(blocks: readonly HeaderBlock[], path: string): string[] {
  const headers = headersFor([...blocks], path);
  const csp = (headers['Content-Security-Policy'] ?? '')
    .split(';')
    .map((d) => d.trim())
    .filter((d) => d && !d.startsWith('frame-ancestors'))
    .join('; ');
  const out: string[] = [];
  if (csp) out.push(`<meta http-equiv="Content-Security-Policy" content="${csp}">`);
  const referrer = headers['Referrer-Policy'];
  if (referrer) out.push(`<meta name="referrer" content="${referrer}">`);
  return out;
}

export function rebaseHtml(base: string, options: HtmlOptions): Plugin {
  let blocks: HeaderBlock[] = [];
  return {
    name: 'foolscap:rebase-html',
    apply: 'build',
    configResolved(config) {
      if (!options.metaCsp) return;
      try {
        blocks = parseHeaders(readFileSync(resolve(config.publicDir, '_headers'), 'utf8'));
      } catch {
        blocks = [];
      }
    },
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        let out = html;
        if (base !== '/') {
          const prefix = base.endsWith('/') ? base : `${base}/`;
          out = out.replace(/(\s(?:href|src))="\/(?!\/)([^"]*)"/g, (whole, attr: string, rest: string) =>
            `/${rest}`.startsWith(prefix) ? whole : `${attr}="${prefix}${rest}"`,
          );
        }
        const extra = [...(options.metaCsp ? metaFor(blocks, pagePath(ctx.path)) : []), ...(options.noindex ? ['<meta name="robots" content="noindex">'] : [])];
        return extra.length > 0 ? out.replace('<meta charset="utf-8">', ['<meta charset="utf-8">', ...extra].join('\n  ')) : out;
      },
    },
  };
}
