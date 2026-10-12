/**
 * The guides and the tool pages' help text are copy, but copy with rules: a
 * search result shows the title and description, so their lengths matter;
 * structured data needs the steps and questions in range; and a link to a
 * tool that is not live, or a guide that does not exist, is a dead end.
 */
import { describe, expect, it } from 'vitest';
import { GUIDES } from '../../app/src/site/guides';
import { TOOL_COPY } from '../../app/src/site/tool-copy';
import { LIVE_TOOLS } from '../../app/src/ops/tools';

const LIVE = new Set<string>(LIVE_TOOLS.map((t) => t.id));
const SLUGS = new Set(GUIDES.map((g) => g.slug));

/** Every string a guide carries, labelled so a failure says where. */
function guideStrings(g: (typeof GUIDES)[number]): Array<[string, string]> {
  return [
    ['title', g.title],
    ['h1', g.h1],
    ['description', g.description],
    ['intro', g.intro],
    ...g.steps.map((s, i): [string, string] => [`step ${i + 1}`, s]),
    ...g.sections.flatMap((s, i): Array<[string, string]> => [[`section ${i + 1} heading`, s.heading], ...s.paragraphs.map((p, j): [string, string] => [`section ${i + 1} paragraph ${j + 1}`, p])]),
    ...g.faq.flatMap((f, i): Array<[string, string]> => [[`faq ${i + 1} q`, f.q], [`faq ${i + 1} a`, f.a]]),
  ];
}

function copyStrings(): Array<[string, string]> {
  return Object.entries(TOOL_COPY).flatMap(([id, c]): Array<[string, string]> =>
    c === undefined ? [] : [[`${id} about`, c.about], ...c.faq.flatMap((f, i): Array<[string, string]> => [[`${id} faq ${i + 1} q`, f.q], [`${id} faq ${i + 1} a`, f.a]])],
  );
}

const LINK = /\[([^\]]*)\]\(([^)]*)\)/g;

/** Every link target that is not /tools/<live id>/ or /guides/<existing slug>/. */
function badLinks(text: string): string[] {
  const bad: string[] = [];
  for (const m of text.matchAll(LINK)) {
    const [, words = '', href = ''] = m;
    const tool = /^\/tools\/([a-z0-9-]+)\/$/.exec(href);
    const guide = /^\/guides\/([a-z0-9-]+)\/$/.exec(href);
    if (words.trim() === '') bad.push(`${href} (no words)`);
    else if (tool) {
      if (!LIVE.has(tool[1] ?? '')) bad.push(href);
    } else if (guide) {
      if (!SLUGS.has(guide[1] ?? '')) bad.push(href);
    } else bad.push(href);
  }
  // A bracket or parenthesis pair that did not form a link is a typo.
  const leftover = text.replace(LINK, '');
  if (/\]\(/.test(leftover)) bad.push('a broken [..](..) link');
  return bad;
}

const linkTargets = (text: string): string[] => [...text.matchAll(LINK)].map((m) => m[2] ?? '');

describe('guides.ts', () => {
  it('has 36 to 40 guides', () => {
    expect(GUIDES.length).toBeGreaterThanOrEqual(36);
    expect(GUIDES.length).toBeLessThanOrEqual(40);
  });

  it('has unique, URL-safe slugs', () => {
    const slugs = GUIDES.map((g) => g.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug, slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('has unique titles of at most 60 characters', () => {
    const titles = GUIDES.map((g) => g.title);
    expect(new Set(titles).size).toBe(titles.length);
    for (const g of GUIDES) expect(g.title.length, `${g.slug}: "${g.title}"`).toBeLessThanOrEqual(60);
  });

  it('has descriptions of 120 to 158 characters', () => {
    for (const g of GUIDES) {
      expect(g.description.length, `${g.slug}: ${g.description.length}`).toBeGreaterThanOrEqual(120);
      expect(g.description.length, `${g.slug}: ${g.description.length}`).toBeLessThanOrEqual(158);
    }
  });

  it('sends people to live tools only, with two to four related ones', () => {
    for (const g of GUIDES) {
      expect(LIVE.has(g.tool), `${g.slug}: tool ${g.tool}`).toBe(true);
      expect(g.related.length, g.slug).toBeGreaterThanOrEqual(2);
      expect(g.related.length, g.slug).toBeLessThanOrEqual(4);
      for (const id of g.related) expect(LIVE.has(id), `${g.slug}: related ${id}`).toBe(true);
      expect(g.related, `${g.slug} lists its own tool as related`).not.toContain(g.tool);
      expect(new Set(g.related).size, `${g.slug}: a related tool twice`).toBe(g.related.length);
    }
  });

  it('keeps steps, sections and questions in range', () => {
    for (const g of GUIDES) {
      expect(g.steps.length, `${g.slug} steps`).toBeGreaterThanOrEqual(3);
      expect(g.steps.length, `${g.slug} steps`).toBeLessThanOrEqual(6);
      expect(g.sections.length, `${g.slug} sections`).toBeGreaterThanOrEqual(2);
      expect(g.sections.length, `${g.slug} sections`).toBeLessThanOrEqual(4);
      expect(g.faq.length, `${g.slug} faq`).toBeGreaterThanOrEqual(3);
      expect(g.faq.length, `${g.slug} faq`).toBeLessThanOrEqual(5);
      for (const s of g.sections) expect(s.paragraphs.length, `${g.slug}: ${s.heading}`).toBeGreaterThan(0);
    }
  });

  it('links only to live tools and existing guides', () => {
    const bad = GUIDES.flatMap((g) => guideStrings(g).flatMap(([where, text]) => badLinks(text).map((b) => `${g.slug} ${where}: ${b}`)));
    expect(bad).toEqual([]);
  });

  it('keeps links out of the title, heading, description and steps', () => {
    const bad = GUIDES.flatMap((g) => [g.title, g.h1, g.description, ...g.steps].filter((t) => linkTargets(t).length > 0).map((t) => `${g.slug}: ${t}`));
    expect(bad).toEqual([]);
  });

  it('links to at least one other tool besides its own', () => {
    for (const g of GUIDES) {
      const targets = guideStrings(g).flatMap(([, text]) => linkTargets(text));
      const others = targets.filter((t) => t.startsWith('/tools/') && t !== `/tools/${g.tool}/`);
      expect(others.length, g.slug).toBeGreaterThan(0);
    }
  });

  it('has no raw angle brackets anywhere', () => {
    const bad = GUIDES.flatMap((g) => guideStrings(g).filter(([, text]) => /[<>]/.test(text)).map(([where]) => `${g.slug} ${where}`));
    expect(bad).toEqual([]);
  });
});

describe('tool-copy.ts', () => {
  it('has an entry for every live tool and nothing else', () => {
    const ids = Object.keys(TOOL_COPY).sort();
    expect(ids).toEqual([...LIVE].sort());
  });

  it('has two to four questions per tool, and an about', () => {
    for (const [id, copy] of Object.entries(TOOL_COPY)) {
      expect(copy, id).toBeDefined();
      expect(copy?.about.trim().length ?? 0, `${id} about`).toBeGreaterThan(0);
      expect(copy?.faq.length ?? 0, `${id} faq`).toBeGreaterThanOrEqual(2);
      expect(copy?.faq.length ?? 0, `${id} faq`).toBeLessThanOrEqual(4);
    }
  });

  it('links only to live tools and existing guides', () => {
    const bad = copyStrings().flatMap(([where, text]) => badLinks(text).map((b) => `${where}: ${b}`));
    expect(bad).toEqual([]);
  });

  it('has no raw angle brackets anywhere', () => {
    const bad = copyStrings()
      .filter(([, text]) => /[<>]/.test(text))
      .map(([where]) => where);
    expect(bad).toEqual([]);
  });
});
