/** The Protect family: add and remove a password, and a document's details. */
import type { DocInfo, DocInfoField, StripReport } from '../pdf';
import { baseName, forEachPdf, lockNote, plural, refused, saveKeepingLock, store } from './common';
import type { AddPasswordParams, DocumentDetailsParams, NoParams, Op } from './op';

export const addPasswordOp: Op<AddPasswordParams> = {
  tool: 'add-password',
  arity: { kind: 'each' },
  title: (p) => (p.mode === 'restrict' ? 'Restrict printing and copying' : 'Add a password'),
  async run(inputs, params, ctx) {
    const restrict = params.mode === 'restrict';
    if (!restrict && params.password.length === 0) return inputs.map((input) => refused([input], 'Type the password to lock it with.'));
    const editing = params.allowEditing === true;
    if (restrict && params.allowPrinting && params.allowCopying && editing) {
      return inputs.map((input) => refused([input], 'Everything is allowed, so there is nothing to restrict. Untick something.'));
    }
    return forEachPdf(inputs, ctx, async (doc, input) => {
      const bytes = await doc.save({
        encrypt: {
          userPassword: restrict ? '' : params.password,
          allowPrinting: params.allowPrinting,
          allowCopying: params.allowCopying,
          allowEditing: editing,
          ...(restrict ? { restrictOnly: true } : {}),
        },
      });
      const allowed = [
        params.allowPrinting ? 'printing allowed' : 'printing blocked',
        params.allowCopying ? 'copying allowed' : 'copying blocked',
        editing ? 'editing allowed' : 'editing blocked',
      ];
      if (restrict) return store(ctx, 'add-password', [input], `${baseName(input.name)} restricted.pdf`, bytes, `Opens without a password; ${allowed.join(', ')}`);
      return store(ctx, 'add-password', [input], `${baseName(input.name)} locked.pdf`, bytes, `Locked with AES-256; ${allowed.join(', ')}`);
    });
  },
};

export const removePasswordOp: Op<NoParams> = {
  tool: 'remove-password',
  arity: { kind: 'each' },
  title: () => 'Remove a password',
  async run(inputs, _params, ctx) {
    return forEachPdf(inputs, ctx, async (doc, input) => {
      if (!doc.wasEncrypted) return { kind: 'skipped', inputIds: [input.id], reason: 'This file has no password, so there is nothing to remove.' };
      // Saved without `encrypt`, the output is plain whatever the input was.
      const bytes = await doc.save();
      const typed = ctx.passwords.has(input.id);
      const detail = typed ? 'Password removed: it opens without one now' : 'Printing and copying restrictions removed';
      return store(ctx, 'remove-password', [input], `${baseName(input.name)} unlocked.pdf`, bytes, detail);
    });
  },
};

const LABEL: Record<DocInfoField, string> = {
  title: 'title',
  author: 'author',
  subject: 'subject',
  keywords: 'keywords',
  creator: 'creator',
  producer: 'producer',
};

function list(words: string[], and = 'and'): string {
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} ${and} ${words[words.length - 1]}`;
}

/** What a metadata strip found, as phrases for "Removed …". */
function strippedParts(before: DocInfo, stripped: StripReport): string[] {
  const parts: string[] = [];
  const had = (Object.keys(before) as DocInfoField[]).map((k) => LABEL[k]);
  if (had.length > 0) parts.push(`the ${list(had)}`);
  if (stripped.xmp > 0) parts.push(stripped.xmp === 1 ? 'the hidden XMP metadata' : `${stripped.xmp} hidden XMP metadata packets`);
  if (stripped.photos > 0) parts.push(`the camera details (device, time, place) inside ${plural(stripped.photos, 'photo')}`);
  if (stripped.privateData > 0) parts.push('private data an editing program left');
  return parts;
}

export const documentDetailsOp: Op<DocumentDetailsParams> = {
  tool: 'document-details',
  arity: { kind: 'each' },
  title: (p) => (p.mode === 'strip' ? 'Remove hidden details' : p.mode === 'clean' ? 'Clean hidden data' : 'Edit details'),
  async run(inputs, params, ctx) {
    return forEachPdf(inputs, ctx, async (doc, input) => {
      const before = doc.info();
      const base = baseName(input.name);
      if (params.mode === 'strip') {
        const parts = strippedParts(before, doc.stripMetadata());
        if (parts.length === 0) return { kind: 'skipped', inputIds: [input.id], reason: 'This file has no title, author or other hidden details, so there is nothing to remove.' };
        const { bytes, relocked } = await saveKeepingLock(ctx, doc, input);
        return store(ctx, 'document-details', [input], `${base} cleaned.pdf`, bytes, `Removed ${list(parts)}${lockNote(relocked)}`);
      }
      if (params.mode === 'clean') {
        const report = doc.clean({ scripts: true, attachments: params.attachments, comments: params.comments, metadata: true });
        const parts = report.stripped ? strippedParts(before, report.stripped) : [];
        if (report.scripts > 0) parts.push(plural(report.scripts, 'script or action', 'scripts and actions'));
        if (report.attachments > 0) parts.push(plural(report.attachments, 'attached file'));
        if (report.comments > 0) parts.push(plural(report.comments, 'comment'));
        const looked = ['details', 'metadata', 'scripts', ...(params.attachments ? ['attached files'] : []), ...(params.comments ? ['comments'] : [])];
        const detail = parts.length > 0 ? `Removed ${list(parts)}` : `Nothing hidden was found: no ${list(looked, 'or')}`;
        const { bytes, relocked } = await saveKeepingLock(ctx, doc, input);
        return store(ctx, 'document-details', [input], `${base} cleaned.pdf`, bytes, `${detail}${lockNote(relocked)}`);
      }
      // One file: an empty box removes that detail. Several: an empty box
      // leaves each file's own, so setting one author on ten files does not
      // wipe ten titles.
      const several = inputs.length > 1;
      const typed: DocInfo = { title: params.title.trim(), author: params.author.trim(), subject: params.subject.trim(), keywords: params.keywords.trim() };
      const next: DocInfo = Object.fromEntries(Object.entries(typed).filter(([, v]) => !several || v !== '')) as DocInfo;
      const changed = (Object.keys(next) as DocInfoField[]).filter((k) => (before[k] ?? '') !== (next[k] ?? ''));
      if (changed.length === 0) return { kind: 'skipped', inputIds: [input.id], reason: 'Those details are what the file already has, so nothing changed.' };
      const hadXmp = doc.setInfo(next);
      const removed = changed.filter((k) => (next[k] ?? '') === '');
      const set = changed.filter((k) => (next[k] ?? '') !== '');
      const parts = [set.length > 0 ? `Set the ${list(set.map((k) => LABEL[k]))}` : '', removed.length > 0 ? `${set.length > 0 ? 'removed' : 'Removed'} the ${list(removed.map((k) => LABEL[k]))}` : ''].filter(Boolean);
      const xmp = hadXmp ? '; the hidden XMP copy that still held the old details was removed' : '';
      const { bytes, relocked } = await saveKeepingLock(ctx, doc, input);
      return store(ctx, 'document-details', [input], `${base} details.pdf`, bytes, `${parts.join('; ')}${xmp}${lockNote(relocked)}`);
    });
  },
};

export const pdfAOp: Op<NoParams> = {
  tool: 'pdf-a',
  arity: { kind: 'each' },
  title: () => 'Archive copy (PDF/A)',
  async run(inputs, _params, ctx) {
    return forEachPdf(inputs, ctx, async (doc, input) => {
      const report = doc.makeArchival();
      // An archive copy is never locked: the standard forbids it, so it opens for whoever keeps it.
      const bytes = await doc.save();
      const took = [
        report.scripts > 0 ? plural(report.scripts, 'script or action', 'scripts and actions') : '',
        report.attachments > 0 ? plural(report.attachments, 'attached file') : '',
      ].filter(Boolean);
      const parts = ['PDF/A-2b archive copy: colour profile and archive details added'];
      if (took.length > 0) parts.push(`${took.join(' and ')} taken out, as the standard asks`);
      if (doc.wasEncrypted) parts.push('the password is gone, as archives must open for anyone');
      if (report.fontsMissing > 0) {
        parts.push(`${plural(report.fontsMissing, 'font')} the file uses ${report.fontsMissing === 1 ? 'is' : 'are'} not inside it, so a strict checker will flag that; saving it again from the program that made it, with fonts embedded, fixes it`);
      }
      return store(ctx, 'pdf-a', [input], `${baseName(input.name)} (PDF-A).pdf`, bytes, parts.join('; '));
    });
  },
};

