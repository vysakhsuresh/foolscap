/**
 * The tool list is the site's single source of truth, so what it promises
 * must exist: a page per live tool, an Op per live tool, the home page linking
 * to each, and the privacy page's quoted policy matching the one really served.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OP_IDS } from '../../app/src/ops';
import { LIVE_TOOLS, TOOLS, toolPath } from '../../app/src/ops/tools';
import * as config from '../../app/src/site/config';
import { parseHeaders } from '../../scripts/vite-cf-headers';

const ROOT = resolve(__dirname, '../..');
const APP = join(ROOT, 'app');

describe('tools.ts', () => {
  it('has unique, URL-safe ids', () => {
    const ids = TOOLS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id, `tool id "${id}" must be lower-case letters, digits and hyphens`).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('gives every tool a title, a summary and an action that is a different sentence from the title', () => {
    for (const tool of TOOLS) {
      expect(tool.title.trim().length, tool.id).toBeGreaterThan(0);
      expect(tool.summary.trim().length, tool.id).toBeGreaterThan(0);
      expect(tool.action.trim().length, tool.id).toBeGreaterThan(0);
      expect(tool.action.toLowerCase(), `${tool.id}: the button must say what it does, not repeat the page title`).not.toBe(tool.title.toLowerCase());
    }
  });

  it('has at least the three stage-1 tools live', () => {
    const live = LIVE_TOOLS.map((t) => t.id);
    expect(live).toEqual(expect.arrayContaining(['merge', 'split', 'organise']));
  });

  it('every live tool has an Op, and every Op belongs to a live tool', () => {
    expect([...OP_IDS].sort()).toEqual(LIVE_TOOLS.map((t) => t.id).sort());
  });

  it('every live tool has an HTML entry whose body names it', () => {
    for (const tool of LIVE_TOOLS) {
      const path = join(APP, 'tools', tool.id, 'index.html');
      expect(existsSync(path), `${tool.id} is live but app/tools/${tool.id}/index.html is missing`).toBe(true);
      const html = readFileSync(path, 'utf8');
      expect(html, `app/tools/${tool.id}/index.html needs <body data-tool="${tool.id}">`).toMatch(
        new RegExp(`<body\\b[^>]*\\sdata-tool="${tool.id}"`),
      );
    }
  });

  it('the home page names and links every live tool in its static HTML', () => {
    const html = readFileSync(join(APP, 'index.html'), 'utf8');
    for (const tool of LIVE_TOOLS) {
      expect(html, `app/index.html must mention "${tool.title}"`).toContain(tool.title);
      expect(html, `app/index.html must link to ${toolPath(tool.id)}`).toContain(`href="${toolPath(tool.id)}"`);
    }
  });
});

describe('site/config.ts', () => {
  it('TOOL_PAGE_CSP is the policy _headers really serves', () => {
    const blocks = parseHeaders(readFileSync(join(APP, 'public', '_headers'), 'utf8'));
    const served = blocks.find((b) => b.pattern === '/*')?.headers['Content-Security-Policy'];
    expect(served, '_headers needs a /* block with a Content-Security-Policy').toBeTruthy();

    const constant = (config as unknown as Record<string, unknown>)['TOOL_PAGE_CSP'];
    expect(
      constant,
      'app/src/site/config.ts must export TOOL_PAGE_CSP: the literal Content-Security-Policy value from app/public/_headers, which the privacy page quotes.',
    ).toBeTypeOf('string');
    expect(constant).toBe(served);
  });

  it('names the site without promising a domain it does not have', () => {
    expect(config.SITE_NAME).toBe('Foolscap');
    if (config.SITE_ORIGIN !== null) expect(config.SITE_ORIGIN).toMatch(/^https:\/\/[^/]+$/);
  });
});
