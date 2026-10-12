/**
 * Serves app/public/_headers the way Cloudflare Pages does, on `vite preview`.
 *
 * Cloudflare reads _headers at deploy time; Vite ignores it. Without this the
 * Content-Security-Policy on the tool pages would be tested by nobody until
 * production, which is the wrong place to learn that pdf.js wanted a CDN.
 *
 * Supports the subset of the _headers syntax this site uses: a path pattern on
 * its own line (`/tools/*`), followed by indented `Name: value` lines. `*`
 * matches any run of characters. Every matching block applies, and a header
 * named by two of them is sent once with both values joined by ", ", as on
 * Cloudflare (for a Content-Security-Policy that is two policies, both
 * enforced). `! Name` in a block removes that header set by earlier blocks.
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
  /** Header names this block detaches (`! Name`). */
  detach: string[];
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function parseHeaders(text: string): HeaderBlock[] {
  const blocks: Array<{ pattern: string; headers: Record<string, string>; detach: string[] }> = [];
  let current: { pattern: string; headers: Record<string, string>; detach: string[] } | null = null;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      current = { pattern: line.trim(), headers: {}, detach: [] };
      blocks.push(current);
      continue;
    }
    if (!current) continue;
    if (line.trim().startsWith('!')) {
      current.detach.push(line.trim().slice(1).trim());
      continue;
    }
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
  const key = (name: string) => Object.keys(out).find((k) => k.toLowerCase() === name.toLowerCase());
  for (const b of blocks) {
    if (!b.regex.test(path)) continue;
    for (const name of b.detach) {
      const k = key(name);
      if (k !== undefined) delete out[k];
    }
    for (const [name, value] of Object.entries(b.headers)) {
      const k = key(name);
      if (k === undefined) out[name] = value;
      else out[k] = `${out[k]}, ${value}`;
    }
  }
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
