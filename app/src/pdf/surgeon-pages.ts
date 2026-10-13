/**
 * What a page carries with it when it moves to another document, and what a
 * document must carry for the pages that came from it.
 *
 * A page is not only its drawing. A contents page links to the chapters; a
 * form's fields live in the document, not on the page; bookmarks, page
 * labels and the title belong to the document. pdf-lib's copier copies a
 * page and everything it reaches, so a link to page 40 used to bring a
 * second, unseen copy of page 40 along (a one-page extract of a contents
 * page weighed as much as the whole book) and still pointed at that copy
 * rather than at the page 40 in the new file. Here every source page is
 * copied once per document, so links between pages that both came across
 * still work; links to pages that did not are taken out on save, and the
 * copies they dragged in go with them.
 */
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFObjectCopier, PDFPage, PDFRef, PDFString, type PDFObject } from '@cantoo/pdf-lib';
import { normaliseRotation } from './common';
import type { OutlineItem } from './types';

type Context = PDFDocument['context'];

const N = (name: string): PDFName => PDFName.of(name);

function deref(context: Context, value: unknown): unknown {
  return value instanceof PDFRef ? context.lookup(value) : value;
}

const textOf = (value: unknown): string | undefined =>
  value instanceof PDFString || value instanceof PDFHexString ? value.decodeText() : value instanceof PDFName ? value.decodeText() : undefined;

function findInNameTree(context: Context, node: unknown, key: string, depth = 0): unknown {
  const dict = deref(context, node);
  if (!(dict instanceof PDFDict) || depth > 16) return undefined;
  const names = dict.lookup(N('Names'));
  if (names instanceof PDFArray) {
    for (let i = 0; i + 1 < names.size(); i += 2) if (textOf(names.lookup(i)) === key) return names.get(i + 1);
  }
  const kids = dict.lookup(N('Kids'));
  if (kids instanceof PDFArray) {
    for (const kid of kids.asArray()) {
      const found = findInNameTree(context, kid, key, depth + 1);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

/**
 * The explicit destination ([page /XYZ left top zoom], say) behind a /Dest,
 * a GoTo action, or a named destination; null for anything else (a web
 * link, a script, a name the document does not define).
 */
export function explicitDest(doc: PDFDocument, value: unknown): PDFArray | null {
  const { context } = doc;
  let dest = deref(context, value);
  if (dest instanceof PDFDict) {
    const kind = dest.lookup(N('S'));
    if (kind instanceof PDFName && kind !== N('GoTo')) return null;
    dest = deref(context, dest.get(N('D')));
  }
  const name = dest instanceof PDFArray ? undefined : textOf(dest);
  if (name !== undefined) {
    let found: unknown;
    const dests = doc.catalog.lookup(N('Dests'));
    if (dests instanceof PDFDict) found = dests.get(N(name));
    const names = doc.catalog.lookup(N('Names'));
    if (found === undefined && names instanceof PDFDict) found = findInNameTree(context, names.get(N('Dests')), name);
    const resolved = deref(context, found);
    dest = resolved instanceof PDFDict ? deref(context, resolved.get(N('D'))) : resolved;
  }
  return dest instanceof PDFArray ? dest : null;
}

const isPage = (context: Context, value: unknown): boolean => {
  const dict = deref(context, value);
  return dict instanceof PDFDict && dict.lookup(N('Type')) === N('Page');
};

function annotsOf(context: Context, page: PDFDict): PDFArray | null {
  const annots = deref(context, page.get(N('Annots')));
  return annots instanceof PDFArray ? annots : null;
}

/**
 * Appends copies of `from`'s pages `indices` to `target`. `placed` maps a
 * source page (by ref) to its copy in `target`'s page tree, for this pair of
 * documents; `copier` is the one copier for the pair, so a page that a link
 * reached before it was appended is the same copy that goes into the tree.
 * A page asked for twice gets a second, separate copy.
 */
export function appendCopies(target: PDFDocument, from: PDFDocument, copier: PDFObjectCopier, indices: readonly number[], placed: Map<string, PDFRef>): void {
  const pages = from.getPages();
  for (const index of indices) {
    const page = pages[index]!;
    const key = page.ref.toString();
    if (from === target || placed.has(key)) {
      const node = copier.copy(page.node);
      target.addPage(PDFPage.of(node, target.context.register(node), target));
      continue;
    }
    const ref = copier.copy(page.ref);
    const node = target.context.lookup(ref);
    if (!(node instanceof PDFDict)) throw new Error('A page could not be copied.');
    placed.set(key, ref);
    namedLinksToExplicit(from, page.node, target, node, copier);
    target.addPage(PDFPage.of(node as Parameters<typeof PDFPage.of>[0], ref, target));
  }
}

/**
 * A link that goes to a named place ("section.2", as LaTeX writes them)
 * means nothing in a document that does not carry the names; the copy goes
 * straight to the page instead.
 */
function namedLinksToExplicit(from: PDFDocument, source: PDFDict, target: PDFDocument, copy: PDFDict, copier: PDFObjectCopier): void {
  const sourceAnnots = annotsOf(from.context, source);
  const copyAnnots = annotsOf(target.context, copy);
  if (sourceAnnots === null || copyAnnots === null || sourceAnnots.size() !== copyAnnots.size()) return;
  for (let i = 0; i < sourceAnnots.size(); i++) {
    const original = deref(from.context, sourceAnnots.get(i));
    const copied = deref(target.context, copyAnnots.get(i));
    if (!(original instanceof PDFDict) || !(copied instanceof PDFDict)) continue;
    const raw = deref(from.context, original.get(N('Dest')) ?? original.get(N('A')));
    const direct = raw instanceof PDFArray || (raw instanceof PDFDict && deref(from.context, raw.get(N('D'))) instanceof PDFArray);
    if (direct || raw === undefined) continue;
    const explicit = explicitDest(from, raw);
    if (explicit === null) continue;
    copied.delete(N('A'));
    copied.set(N('Dest'), copier.copy(explicit));
  }
}

/** The parts of a form that belong to the document: its default font and resources. Copied once, from the first form appended. */
export function formDefaults(from: PDFDocument, copier: PDFObjectCopier): PDFDict | null {
  const acroForm = from.catalog.lookup(N('AcroForm'));
  if (!(acroForm instanceof PDFDict)) return null;
  const out = from.context.obj({});
  for (const key of ['DA', 'DR', 'Q', 'NeedAppearances']) {
    const value = acroForm.get(N(key));
    if (value !== undefined) out.set(N(key), value);
  }
  return copier.copy(out);
}

/**
 * Before a document whose pages were copied in is saved: links to pages that
 * did not come across are taken out, form fields lose the widgets that
 * stayed behind, and the fields left are listed in the document's form so
 * they can still be filled. Sweeping what is now unreachable is the caller's.
 */
export function finishCopies(doc: PDFDocument, defaults: PDFDict | null): void {
  const { context } = doc;
  const pages = doc.getPages();
  const inTree = new Set(pages.map((p) => p.ref.toString()));
  const dangling = (value: unknown): boolean => {
    const explicit = explicitDest(doc, value);
    const target = explicit?.get(0);
    return target instanceof PDFRef && !inTree.has(target.toString()) && isPage(context, target);
  };
  const widgets = new Set<string>();
  const widgetDicts: Array<{ readonly ref: PDFRef | null; readonly dict: PDFDict }> = [];
  for (const page of pages) {
    const annots = annotsOf(context, page.node);
    if (annots === null) continue;
    for (let i = annots.size() - 1; i >= 0; i--) {
      const entry = annots.get(i);
      const annot = deref(context, entry);
      if (!(annot instanceof PDFDict)) continue;
      const action = annot.get(N('Dest')) ?? annot.get(N('A'));
      if (action !== undefined && dangling(action)) {
        annots.remove(i);
        continue;
      }
      if (annot.lookup(N('Subtype')) === N('Widget')) {
        if (entry instanceof PDFRef) widgets.add(entry.toString());
        widgetDicts.push({ ref: entry instanceof PDFRef ? entry : null, dict: annot });
      }
    }
  }
  if (widgetDicts.length === 0) return;

  // Every field a widget here belongs to, from the top.
  const roots: PDFRef[] = [];
  const seen = new Set<string>();
  for (const widget of widgetDicts) {
    let node: PDFDict = widget.dict;
    let ref: PDFRef | null = null;
    for (let guard = 0; guard < 32; guard++) {
      const parent = node.get(N('Parent'));
      const dict = deref(context, parent);
      if (!(parent instanceof PDFRef) || !(dict instanceof PDFDict)) break;
      ref = parent;
      node = dict;
    }
    // A widget with no parent is a field of its own, when it has a name.
    if (ref === null) ref = widget.dict.get(N('T')) !== undefined ? widget.ref : null;
    if (ref === null) continue;
    if (!seen.has(ref.toString())) {
      seen.add(ref.toString());
      roots.push(ref);
    }
  }
  const prune = (field: PDFDict, depth: number): void => {
    const kids = deref(context, field.get(N('Kids')));
    if (!(kids instanceof PDFArray) || depth > 32) return;
    for (let i = kids.size() - 1; i >= 0; i--) {
      const ref = kids.get(i);
      const kid = deref(context, ref);
      if (!(kid instanceof PDFDict)) continue;
      if (kid.lookup(N('Subtype')) === N('Widget')) {
        if (!(ref instanceof PDFRef) || !widgets.has(ref.toString())) kids.remove(i);
        continue;
      }
      prune(kid, depth + 1);
      const left = deref(context, kid.get(N('Kids')));
      if (left instanceof PDFArray && left.size() === 0) kids.remove(i);
    }
  };
  for (const root of roots) {
    const dict = context.lookup(root);
    if (dict instanceof PDFDict) prune(dict, 0);
  }
  let acroForm = doc.catalog.lookup(N('AcroForm'));
  if (!(acroForm instanceof PDFDict)) {
    acroForm = defaults ?? context.obj({});
    doc.catalog.set(N('AcroForm'), context.register(acroForm as PDFDict));
  }
  const form = acroForm as PDFDict;
  const fields = deref(context, form.get(N('Fields')));
  const list = fields instanceof PDFArray ? fields : context.obj([]);
  const listed = new Set(list.asArray().map((f) => f.toString()));
  for (const root of roots) if (!listed.has(root.toString())) list.push(root);
  form.set(N('Fields'), list);
}

// ---- Bookmarks ----

interface SourceItem {
  readonly dict: PDFDict;
  readonly items: SourceItem[];
}

function readOutlineDicts(doc: PDFDocument): SourceItem[] {
  const { context } = doc;
  let budget = 5000;
  const seen = new Set<string>();
  const walk = (first: unknown, depth: number): SourceItem[] => {
    const out: SourceItem[] = [];
    let ref = first;
    while (ref instanceof PDFRef && budget-- > 0 && !seen.has(ref.toString())) {
      seen.add(ref.toString());
      const dict = context.lookup(ref);
      if (!(dict instanceof PDFDict)) break;
      out.push({ dict, items: depth < 16 ? walk(dict.get(N('First')), depth + 1) : [] });
      ref = dict.get(N('Next'));
    }
    return out;
  };
  const outlines = doc.catalog.lookup(N('Outlines'));
  return outlines instanceof PDFDict ? walk(outlines.get(N('First')), 0) : [];
}

/** A bookmark to write: its title, where it goes (a destination or an action), its look, and whether it starts open. */
interface NewItem {
  readonly title: PDFObject;
  readonly go: { readonly key: 'Dest' | 'A'; readonly value: PDFObject };
  readonly color?: PDFObject;
  readonly flags?: PDFObject;
  readonly closed: boolean;
  readonly items: readonly NewItem[];
}

/** Actions a bookmark may keep when it does not go to a page: a web address, or a viewer command such as "next page". */
function keptAction(context: Context, value: unknown): PDFDict | null {
  const action = deref(context, value);
  if (!(action instanceof PDFDict)) return null;
  const kind = action.lookup(N('S'));
  return kind === N('URI') || kind === N('Named') ? action : null;
}

const closedOf = (dict: PDFDict): boolean => {
  const count = dict.lookup(N('Count'));
  return count instanceof PDFNumber && count.asNumber() < 0;
};

/**
 * Adds `from`'s bookmarks after the ones `target` already has, keeping each
 * whose page came across (`placed`) exactly as it was: where on the page it
 * opens, its colour and style, whether it is open. A bookmark whose page did
 * not come across goes, and its own bookmarks move up into its place.
 */
export function carryOutline(target: PDFDocument, from: PDFDocument, placed: ReadonlyMap<string, PDFRef>, copier: PDFObjectCopier): number {
  const sourcePages = from.getPages();
  const convert = (list: readonly SourceItem[]): NewItem[] =>
    list.flatMap((item): NewItem[] => {
      const items = convert(item.items);
      const raw = item.dict.get(N('Dest')) ?? item.dict.get(N('A'));
      const explicit = explicitDest(from, raw);
      let go: NewItem['go'] | null = null;
      if (explicit !== null) {
        const first = explicit.get(0);
        const pageRef = first instanceof PDFRef ? first : first instanceof PDFNumber ? sourcePages[first.asNumber()]?.ref : undefined;
        const mapped = pageRef === undefined ? undefined : placed.get(pageRef.toString());
        if (mapped !== undefined) {
          const rest = explicit.asArray().slice(1).map((v) => (v instanceof PDFRef ? v : v.clone()));
          go = { key: 'Dest', value: target.context.obj([mapped, ...rest]) };
        }
      } else {
        const action = keptAction(from.context, raw);
        if (action !== null) go = { key: 'A', value: copier.copy(action) };
      }
      if (go === null) return items;
      const title = item.dict.lookup(N('Title'));
      const color = item.dict.get(N('C'));
      const flags = item.dict.get(N('F'));
      return [
        {
          title: title instanceof PDFString || title instanceof PDFHexString ? title.clone() : PDFHexString.fromText('Untitled'),
          go,
          ...(color instanceof PDFArray ? { color: color.clone() } : {}),
          ...(flags instanceof PDFNumber ? { flags: flags.clone() } : {}),
          closed: closedOf(item.dict),
          items,
        },
      ];
    });
  const items = convert(readOutlineDicts(from));
  appendOutline(target, items);
  return items.length;
}

/** Writes `items` after whatever bookmarks `doc` already has. */
function appendOutline(doc: PDFDocument, items: readonly NewItem[]): void {
  if (items.length === 0) return;
  const { context } = doc;
  let rootRef = doc.catalog.get(N('Outlines'));
  let root = deref(context, rootRef);
  if (!(rootRef instanceof PDFRef) || !(root instanceof PDFDict)) {
    root = context.obj({ Type: 'Outlines' });
    rootRef = context.register(root as PDFDict);
    doc.catalog.set(N('Outlines'), rootRef);
  }
  const rootDict = root as PDFDict;
  const level = (list: readonly NewItem[], parent: PDFRef, parentDict: PDFDict): number => {
    const refs = list.map(() => context.nextRef());
    let visible = 0;
    const lastRef = parentDict.get(N('Last'));
    const last = deref(context, lastRef);
    list.forEach((item, i) => {
      const dict = context.obj({});
      dict.set(N('Title'), item.title);
      dict.set(N('Parent'), parent);
      dict.set(N(item.go.key), item.go.value);
      if (item.color !== undefined) dict.set(N('C'), item.color);
      if (item.flags !== undefined) dict.set(N('F'), item.flags);
      if (i > 0) dict.set(N('Prev'), refs[i - 1]!);
      else if (lastRef instanceof PDFRef && last instanceof PDFDict) {
        dict.set(N('Prev'), lastRef);
        last.set(N('Next'), refs[0]!);
      }
      if (i < list.length - 1) dict.set(N('Next'), refs[i + 1]!);
      context.assign(refs[i]!, dict);
      visible++;
      if (item.items.length > 0) {
        const inner = level(item.items, refs[i]!, dict);
        dict.set(N('Count'), PDFNumber.of(item.closed ? -inner : inner));
        if (!item.closed) visible += inner;
      }
    });
    if (!(parentDict.get(N('First')) instanceof PDFRef)) parentDict.set(N('First'), refs[0]!);
    parentDict.set(N('Last'), refs[refs.length - 1]!);
    return visible;
  };
  const before = rootDict.lookup(N('Count'));
  const added = level(items, rootRef as PDFRef, rootDict);
  rootDict.set(N('Count'), PDFNumber.of(Math.max(0, before instanceof PDFNumber ? before.asNumber() : 0) + added));
}

/**
 * The bookmarks editor's list, written over the document's own. An entry the
 * editor read from this document (`was`) and whose page did not change keeps
 * its own destination or action (so one that opened half way down page 12,
 * or a web page, still does), its colour and style, and whether it was open.
 * A new entry, or one moved to another page, opens its page whole.
 */
export function rewriteOutline(doc: PDFDocument, items: readonly OutlineItem[]): void {
  const { context } = doc;
  const pages = doc.getPages();
  const pageIndex = new Map(pages.map((p, i) => [p.ref.toString(), i]));
  const originals: Array<{ dict: PDFDict; title: string; page: number | null }> = [];
  const flat = (list: readonly SourceItem[]): void => {
    for (const item of list) {
      const explicit = explicitDest(doc, item.dict.get(N('Dest')) ?? item.dict.get(N('A')));
      const first = explicit?.get(0);
      const page = first instanceof PDFRef ? (pageIndex.get(first.toString()) ?? null) : first instanceof PDFNumber ? first.asNumber() : null;
      const title = (textOf(item.dict.lookup(N('Title'))) ?? '').replace(/\s+/g, ' ').trim() || 'Untitled';
      originals.push({ dict: item.dict, title, page });
      flat(item.items);
    }
  };
  flat(readOutlineDicts(doc));
  const used = new Set<number>();
  const original = (was: OutlineItem['was']): PDFDict | null => {
    if (was === undefined) return null;
    const at = originals[was.index];
    if (at !== undefined && !used.has(was.index) && at.title === was.title && at.page === was.page) {
      used.add(was.index);
      return at.dict;
    }
    const k = originals.findIndex((o, i) => !used.has(i) && o.title === was.title && o.page === was.page);
    if (k < 0) return null;
    used.add(k);
    return originals[k]!.dict;
  };
  const convert = (list: readonly OutlineItem[]): NewItem[] =>
    list.flatMap((item): NewItem[] => {
      const items = convert(item.items);
      const old = original(item.was);
      let go: NewItem['go'] | null = null;
      if (old !== null && item.page === (item.was?.page ?? null)) {
        const dest = old.get(N('Dest'));
        const action = old.get(N('A'));
        if (dest !== undefined) go = { key: 'Dest', value: dest };
        else if (action !== undefined) go = { key: 'A', value: action };
      }
      if (go === null && item.page !== null && item.page >= 0 && item.page < pages.length) {
        go = { key: 'Dest', value: context.obj([pages[item.page]!.ref, N('Fit')]) };
      }
      if (go === null) return items;
      const color = old?.get(N('C'));
      const flags = old?.get(N('F'));
      return [
        {
          title: PDFHexString.fromText(item.title.slice(0, 500)),
          go,
          ...(color !== undefined ? { color } : {}),
          ...(flags !== undefined ? { flags } : {}),
          closed: old !== null && closedOf(old),
          items,
        },
      ];
    });
  const next = convert(items);
  doc.catalog.delete(N('Outlines'));
  appendOutline(doc, next);
}

// ---- Page labels ----

interface LabelRange {
  readonly start: number;
  readonly dict: PDFDict;
}

function readLabelRanges(doc: PDFDocument): LabelRange[] {
  const { context } = doc;
  const out: LabelRange[] = [];
  const walk = (node: unknown, depth: number): void => {
    const dict = deref(context, node);
    if (!(dict instanceof PDFDict) || depth > 16) return;
    const nums = dict.lookup(N('Nums'));
    if (nums instanceof PDFArray) {
      for (let i = 0; i + 1 < nums.size(); i += 2) {
        const start = nums.lookup(i);
        const label = deref(context, nums.get(i + 1));
        if (start instanceof PDFNumber && label instanceof PDFDict) out.push({ start: start.asNumber(), dict: label });
      }
    }
    const kids = dict.lookup(N('Kids'));
    if (kids instanceof PDFArray) for (const kid of kids.asArray()) walk(kid, depth + 1);
  };
  walk(doc.catalog.get(N('PageLabels')), 0);
  return out.filter((r) => Number.isInteger(r.start) && r.start >= 0).sort((a, b) => a.start - b.start);
}

/**
 * Page labels for the pages that came from `from`, as a reader's own editor
 * keeps them: each range starts where its first page now is, at the number
 * that page had, and runs on from there. A page put in from elsewhere joins
 * the range of the page before it (or, at the very front, the one after),
 * and pages taken out leave no gap, so no two pages end up with one label.
 */
export function carryLabels(target: PDFDocument, from: PDFDocument, placed: ReadonlyMap<string, PDFRef>): void {
  const ranges = readLabelRanges(from);
  if (ranges.length === 0) return;
  const sourceIndex = new Map<string, number>();
  from.getPages().forEach((page, i) => {
    const copy = placed.get(page.ref.toString());
    if (copy !== undefined) sourceIndex.set(copy.toString(), i);
  });
  const rangeOf = (page: number): number => {
    let r = -1;
    for (let k = 0; k < ranges.length && ranges[k]!.start <= page; k++) r = k;
    return r;
  };
  const numberOf = (page: number, r: number): number => {
    const first = ranges[r]!.dict.lookup(N('St'));
    return (first instanceof PDFNumber ? first.asNumber() : 1) + page - ranges[r]!.start;
  };
  const pages = target.getPages();
  const member: Array<{ range: number; src: number | null }> = pages.map((p) => {
    const src = sourceIndex.get(p.ref.toString());
    return { range: src === undefined ? -2 : rangeOf(src), src: src ?? null };
  });
  if (member.every((m) => m.src === null)) return;
  // Pages from elsewhere join the range before them, or after them at the front.
  for (let i = 0; i < member.length; i++) if (member[i]!.src === null && i > 0) member[i] = { range: member[i - 1]!.range, src: null };
  for (let i = member.length - 1; i >= 0; i--) if (member[i]!.range === -2) member[i] = { range: member[i + 1]?.range ?? -1, src: null };
  const nums: PDFObject[] = [];
  let open = -3;
  let expected = 0;
  for (let i = 0; i < member.length; i++) {
    const { range, src } = member[i]!;
    const own = src !== null && range >= 0 ? numberOf(src, range) : null;
    // Within a run of one range the numbers simply run on, through pages put in and over pages taken out.
    const continues = range === open;
    if (!continues) {
      // The first page of a new run: its own number, or (a page from elsewhere) one less than the next page's.
      let first = own;
      if (first === null) {
        const next = member.findIndex((m, k) => k > i && m.src !== null && m.range === range);
        first = next >= 0 && range >= 0 ? Math.max(1, numberOf(member[next]!.src!, range) - (next - i)) : 1;
      }
      const label = range >= 0 ? ranges[range]!.dict.clone(target.context) : target.context.obj({ S: 'D' });
      label.delete(N('St'));
      if (first !== 1) label.set(N('St'), PDFNumber.of(first));
      const prefix = label.get(N('P'));
      if (prefix instanceof PDFRef) label.set(N('P'), (from.context.lookup(prefix) as PDFObject).clone());
      nums.push(PDFNumber.of(i), label);
      open = range;
      expected = first;
    }
    expected++;
  }
  target.catalog.set(N('PageLabels'), target.context.obj({ Nums: target.context.obj(nums) }));
}

// ---- Fit to paper ----

/**
 * Puts a page on a sheet of `width` × `height` (as the reader sees it), its
 * visible area scaled to fit and centred. The page stays itself: its words,
 * links, notes and form fields move and scale with it, rather than the page
 * being redrawn as a picture of itself on a new one. `enlarge` false leaves
 * a page that already fits at its real size.
 */
export function fitToPaper(doc: PDFDocument, page: PDFPage, width: number, height: number, enlarge: boolean): void {
  const { context } = doc;
  const crop = page.getCropBox();
  const rotation = normaliseRotation(page.getRotation().angle);
  const sideways = rotation === 90 || rotation === 270;
  // The sheet in the page's own, unturned space.
  const mw = sideways ? height : width;
  const mh = sideways ? width : height;
  const fit = Math.min(mw / crop.width, mh / crop.height);
  const s = enlarge ? fit : Math.min(1, fit);
  const tx = (mw - crop.width * s) / 2 - crop.x * s;
  const ty = (mh - crop.height * s) / 2 - crop.y * s;
  const n = (v: number) => (Math.round(v * 10000) / 10000).toString();
  page.node.normalize();
  const contents = page.node.Contents();
  const before = context.register(context.flateStream(`q ${n(s)} 0 0 ${n(s)} ${n(tx)} ${n(ty)} cm ${n(crop.x)} ${n(crop.y)} ${n(crop.width)} ${n(crop.height)} re W n\n`));
  const after = context.register(context.flateStream('\nQ\n'));
  if (contents instanceof PDFArray) {
    contents.insert(0, before);
    contents.push(after);
  } else {
    page.node.addContentStream(before);
    page.node.addContentStream(after);
  }
  page.setMediaBox(0, 0, mw, mh);
  for (const box of ['CropBox', 'BleedBox', 'TrimBox', 'ArtBox']) page.node.delete(N(box));

  // Everything placed on the page by coordinates moves with it.
  const x = (v: number) => v * s + tx;
  const y = (v: number) => v * s + ty;
  const points = (array: PDFArray): PDFArray => context.obj(array.asArray().map((v, i) => (v instanceof PDFNumber ? PDFNumber.of(i % 2 === 0 ? x(v.asNumber()) : y(v.asNumber())) : v)));
  const annots = annotsOf(context, page.node);
  for (const entry of annots?.asArray() ?? []) {
    const annot = deref(context, entry);
    if (!(annot instanceof PDFDict)) continue;
    for (const key of ['Rect', 'QuadPoints', 'Vertices', 'L', 'CL']) {
      const value = deref(context, annot.get(N(key)));
      if (value instanceof PDFArray) annot.set(N(key), points(value));
    }
    const ink = deref(context, annot.get(N('InkList')));
    if (ink instanceof PDFArray) {
      annot.set(N('InkList'), context.obj(ink.asArray().map((path) => {
        const list = deref(context, path);
        return list instanceof PDFArray ? points(list) : path;
      })));
    }
    const rd = deref(context, annot.get(N('RD')));
    if (rd instanceof PDFArray) annot.set(N('RD'), context.obj(rd.asArray().map((v) => (v instanceof PDFNumber ? PDFNumber.of(v.asNumber() * s) : v))));
  }
}
