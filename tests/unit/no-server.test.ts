/**
 * "Nothing leaves the device" is only a proof while the origin is a folder of
 * files that runs no code. Cloudflare Pages would happily run a Function, a
 * Worker or a proxy redirect if one were committed; this test makes sure none
 * is.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
/** Every directory Cloudflare could read a Function or a config from. */
const PLACES = ['', 'app', 'app/public', 'dist'].map((p) => join(ROOT, p));

const entries = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir) : []);

describe('no server, anywhere', () => {
  it('has no functions/ directory', () => {
    const found = PLACES.filter((dir) => {
      const path = join(dir, 'functions');
      return existsSync(path) && statSync(path).isDirectory();
    });
    expect(found, 'A functions/ directory becomes Cloudflare Pages Functions: server code.').toEqual([]);
  });

  it('has no _worker.js', () => {
    const found = PLACES.map((dir) => join(dir, '_worker.js')).filter((p) => existsSync(p));
    expect(found, 'dist/_worker.js would run as a Cloudflare Worker in front of the site.').toEqual([]);
  });

  it('has no wrangler config', () => {
    const found = PLACES.flatMap((dir) => entries(dir).filter((name) => /^wrangler\./i.test(name)).map((name) => join(dir, name)));
    expect(found, 'wrangler.* configures Workers. This site is files only.').toEqual([]);
  });

  it('has no _redirects line proxying to an absolute URL', () => {
    const found: string[] = [];
    for (const dir of PLACES) {
      const path = join(dir, '_redirects');
      if (!existsSync(path)) continue;
      readFileSync(path, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) return;
          const [, destination = '', status = ''] = trimmed.split(/\s+/);
          if (/^https?:\/\//i.test(destination) && (status === '' || status === '200')) found.push(`${path}:${i + 1}: ${trimmed}`);
        });
    }
    expect(found, 'A 200 redirect to another origin is a proxy: the request would leave this origin.').toEqual([]);
  });
});
