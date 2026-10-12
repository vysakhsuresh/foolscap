/** The Protect family: add and remove a password, and a document's details. */
import type { DocInfo, DocInfoField } from '../pdf';
import { baseName, forEachPdf, refused, store } from './common';
import type { AddPasswordParams, DocumentDetailsParams, NoParams, Op } from './op';

export const addPasswordOp: Op<AddPasswordParams> = {
  tool: 'add-password',
  arity: { kind: 'each' },
  title: () => 'Add a password',
  async run(inputs, params, ctx) {
    if (params.password.length === 0) return inputs.map((input) => refused([input], 'Type the password to lock it with.'));
    return forEachPdf(inputs, ctx, async (doc, input) => {
      const bytes = await doc.save({
        encrypt: { userPassword: params.password, allowPrinting: params.allowPrinting, allowCopying: params.allowCopying },
      });
      const allowed = [params.allowPrinting ? 'printing allowed' : 'printing blocked', params.allowCopying ? 'copying allowed' : 'copying blocked'];
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

function list(words: string[]): string {
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

export const documentDetailsOp: Op<DocumentDetailsParams> = {
  tool: 'document-details',
  arity: { kind: 'each' },
  title: (p) => (p.mode === 'strip' ? 'Remove hidden details' : 'Edit details'),
  async run(inputs, params, ctx) {
    return forEachPdf(inputs, ctx, async (doc, input) => {
      const before = doc.info();
      const base = baseName(input.name);
      if (params.mode === 'strip') {
        doc.stripMetadata();
        const had = (Object.keys(before) as DocInfoField[]).map((k) => LABEL[k]);
        const detail = had.length > 0 ? `Removed the ${list(had)}, and any hidden XMP metadata` : 'No details were set; any hidden XMP metadata removed';
        return store(ctx, 'document-details', [input], `${base} cleaned.pdf`, await doc.save(), detail);
      }
      const next: DocInfo = { title: params.title.trim(), author: params.author.trim(), subject: params.subject.trim(), keywords: params.keywords.trim() };
      const changed = (Object.keys(next) as DocInfoField[]).filter((k) => (before[k] ?? '') !== (next[k] ?? ''));
      if (changed.length === 0) return { kind: 'skipped', inputIds: [input.id], reason: 'Those details are what the file already has, so nothing changed.' };
      doc.setInfo(next);
      const detail = `Updated the ${list(changed.map((k) => LABEL[k]))}`;
      return store(ctx, 'document-details', [input], `${base} details.pdf`, await doc.save(), detail);
    });
  },
};
