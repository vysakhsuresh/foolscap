/** The only public surface of the ops: the shape, the registry, and a lookup. */
import { extractImagesOp, imagesToPdfOp } from './convert-ops';
import { headerFooterOp, pageNumbersOp, watermarkOp } from './mark-ops';
import { addImageOp, addTextOp, createFormOp, editImagesOp, editTextOp, fillFormOp, markUpOp, removeAreasOp, signOp } from './edit-ops';
import { digitalSignOp } from './certify-ops';
import { compareOp } from './compare-ops';
import { mergeOp } from './merge';
import { officeToPdfOp, pdfToEpubOp, pdfToExcelOp, pdfToPowerPointOp, pdfToWordOp } from './office-ops';
import type { Op } from './op';
import { organiseOp } from './organise';
import { compressImageOp } from './photo-ops';
import { cropOp, extractPagesOp, insertPagesOp, nUpOp, splitBySizeOp } from './pages-ops';
import { addPasswordOp, documentDetailsOp, pdfAOp, removePasswordOp } from './protect-ops';
import { compressOp, extractTextOp, ocrOp, pdfToImagesOp } from './render-ops';
import { scanOp } from './scan-ops';
import { splitOp } from './split';
import { rentReceiptsOp } from './template-ops';
import { attachmentsOp, backgroundOp, bookmarksOp, pageLabelsOp } from './structure-ops';
import { toolById, type ToolId } from './tools';

export * from './op';
export * from './tools';

/**
 * Every live tool's Op, by id. A tool is `live` in tools.ts only once it has
 * an entry here; the site test checks the two lists agree.
 */
const OPS: Partial<Record<ToolId, Op<never>>> = {
  merge: mergeOp,
  split: splitOp,
  organise: organiseOp,
  'extract-pages': extractPagesOp,
  'insert-pages': insertPagesOp,
  crop: cropOp,
  'split-by-size': splitBySizeOp,
  'n-up': nUpOp,
  'images-to-pdf': imagesToPdfOp,
  'extract-images': extractImagesOp,
  watermark: watermarkOp,
  'page-numbers': pageNumbersOp,
  'header-footer': headerFooterOp,
  'add-password': addPasswordOp,
  'remove-password': removePasswordOp,
  'document-details': documentDetailsOp,
  compress: compressOp,
  'compress-image': compressImageOp,
  'pdf-to-images': pdfToImagesOp,
  'extract-text': extractTextOp,
  sign: signOp,
  'add-text': addTextOp,
  'mark-up': markUpOp,
  'remove-areas': removeAreasOp,
  'fill-form': fillFormOp,
  scan: scanOp,
  ocr: ocrOp,
  background: backgroundOp,
  'page-labels': pageLabelsOp,
  attachments: attachmentsOp,
  bookmarks: bookmarksOp,
  'digital-sign': digitalSignOp,
  'pdf-to-word': pdfToWordOp,
  'pdf-to-excel': pdfToExcelOp,
  'pdf-to-powerpoint': pdfToPowerPointOp,
  'pdf-to-epub': pdfToEpubOp,
  'office-to-pdf': officeToPdfOp,
  'add-image': addImageOp,
  compare: compareOp,
  'edit-text': editTextOp,
  'create-form': createFormOp,
  'pdf-a': pdfAOp,
  'rent-receipts': rentReceiptsOp,
  'edit-images': editImagesOp,
};

export function getOp(id: ToolId): Op {
  const op = OPS[id];
  if (op === undefined) throw new Error(`${toolById(id).title} isn't ready yet.`);
  // Params are plain data from the page; each op checks its own.
  return op as unknown as Op;
}

/** The ids that have an Op, for the site test. */
export const OP_IDS: readonly ToolId[] = Object.keys(OPS) as ToolId[];
