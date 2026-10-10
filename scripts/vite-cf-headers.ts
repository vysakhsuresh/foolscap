/**
 * Serves app/public/_headers the way Cloudflare Pages does, on `vite preview`.
 *
 * Cloudflare reads _headers at deploy time; Vite ignores it. Without this the
 * Content-Security-Policy on the tool pages would be tested by nobody until
 * production, which is the wrong place to learn that pdf.js wanted a CDN.
 *
 * Supports the subset of the _headers syntax this site uses: a path pattern on
 * its own line (`/tools/*`), followed by indented `Name: value` lines. `*`
 * matches any run of characters. Later blocks add to earlier ones; a repeated
 * header name replaces the earlier value, as on Cloudflare.
 *
 * Dev (`vite dev`) is deliberately left alone: Vite's HMR injects inline
 * styles that a strict CSP would block. The built site is what ships, so the
 * built site is what the policy is tested on.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

export interface HeaderBlock {
  pattern: string;
  regex: RegExp;
  headers: Record<string, string>;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function parseHeaders(text: string): HeaderBlock[] {
  const blocks: Array<{ pattern: string; headers: Record<string, string> }> = [];
  let current: { pattern: string; headers: Record<string, string> } | null = null;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      current = { pattern: line.trim(), headers: {} };
      blocks.push(current);
      continue;
    }
    if (!current) continue;
    const i = line.indexOf(':');
    if (i < 0) continue;
    current.headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return blocks.map((b) => ({
    ...b,
    regex: new RegExp('^' + b.pattern.split('*').map(escapeRegex).join('.*') + '$'),
  }));
}

export function headersFor(blocks: HeaderBlock[], path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const b of blocks) if (b.regex.test(path)) Object.assign(out, b.headers);
  return out;
}

export function cloudflareHeaders(): Plugin {
  let blocks: HeaderBlock[] = [];
  return {
    name: 'foolscap:cloudflare-headers',
    configResolved(config) {
      const publicDir = config.publicDir || resolve(config.root, 'public');
      try {
        blocks = parseHeaders(readFileSync(resolve(publicDir, '_headers'), 'utf8'));
      } catch {
        blocks = [];
      }
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        // Cloudflare matches the URL as requested; `/tools/merge/` serves
        // `/tools/merge/index.html` but the rule is written against the former.
        const path = (req.url ?? '/').split('?')[0] ?? '/';
        for (const [name, value] of Object.entries(headersFor(blocks, path))) res.setHeader(name, value);
        next();
      });
    },
  };
}
