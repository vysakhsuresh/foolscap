#!/bin/bash
# Builds the real-world corpus that tests/unit/realworld-sweep.test.ts runs every tool over:
#   REALWORLD_DIR=/some/dir bash tests/realworld/build.sh
# Needs Chromium (Playwright's), LibreOffice with its Python (uno), poppler-utils, ImageMagick and
# Python 3 with Pillow, ReportLab, python-docx, openpyxl and python-pptx. Optional: Noto Sans Malayalam
# and Devanagari woff2 files in $REALWORLD_DIR/gen/fonts. Every document is fictional.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
RW="${REALWORLD_DIR:?set REALWORLD_DIR}"
mkdir -p "$RW/pdf" "$RW/img" "$RW/office/lo" "$RW/tmp" "$RW/gen/fonts"
LO="soffice -env:UserInstallation=file://$RW/lo-profile --headless"

# Chromium print-to-PDF: invoices, tickets, bills, statements, résumé, Form 16, admit card, certificate, Malayalam and Hindi letters…
REALWORLD_DIR="$RW" node "$here/html-docs.mjs"

# Word, Excel and PowerPoint sources, then LibreOffice's own copies and PDFs of them, with its export options.
python3 -I "$here/office-src.py" "$RW/office"
python3 -I "$here/fodt.py" "$RW/office"
cd "$RW/office"
$LO --convert-to docx study.fodt membership-form.fodt --outdir . >/dev/null
$LO --convert-to xlsx:"Calc MS Excel 2007 XML" budget.xlsx gst-register.xlsx --outdir lo >/dev/null
$LO --convert-to docx:"MS Word 2007 XML" report.docx --outdir lo >/dev/null
conv() { local out=$1 opts=$2 in=$3 filt=$4 t; t=$(mktemp -d); $LO --convert-to "pdf:${filt}:${opts}" "$in" --outdir "$t" >/dev/null; mv "$t"/*.pdf "$RW/pdf/$out"; rmdir "$t"; }
conv lo-report.pdf '{}' report.docx writer_pdf_Export
conv lo-study.pdf '{}' study.fodt writer_pdf_Export
conv lo-study-pdfa-tagged.pdf '{"SelectPdfVersion":{"type":"long","value":"2"},"UseTaggedPDF":{"type":"boolean","value":"true"}}' study.fodt writer_pdf_Export
conv lo-study-pdfua.pdf '{"PDFUACompliance":{"type":"boolean","value":"true"}}' study.fodt writer_pdf_Export
conv lo-study-hybrid.pdf '{"IsAddStream":{"type":"boolean","value":"true"}}' study.fodt writer_pdf_Export
conv lo-malayalam-leave.pdf '{}' malayalam-leave.docx writer_pdf_Export
conv lo-resume.pdf '{}' resume.docx writer_pdf_Export
conv lo-budget.pdf '{}' budget.xlsx calc_pdf_Export
conv lo-gst-register.pdf '{}' gst-register.xlsx calc_pdf_Export
conv lo-attendance.pdf '{}' attendance.xlsx calc_pdf_Export
conv lo-deck.pdf '{}' deck.pptx impress_pdf_Export
conv lo-report-locked.pdf '{"EncryptFile":{"type":"boolean","value":"true"},"DocumentOpenPassword":{"type":"string","value":"x"}}' report.docx writer_pdf_Export
conv lo-report-restricted.pdf '{"RestrictPermissions":{"type":"boolean","value":"true"},"PermissionPassword":{"type":"string","value":"owner"},"Printing":{"type":"long","value":"0"},"Changes":{"type":"long","value":"0"},"EnableCopyingOfContent":{"type":"boolean","value":"false"}}' report.docx writer_pdf_Export
conv lo-report-watermark.pdf '{"Watermark":{"type":"string","value":"DRAFT COPY"}}' report.docx writer_pdf_Export
conv lo-report-lowres.pdf '{"ReduceImageResolution":{"type":"boolean","value":"true"},"MaxImageResolution":{"type":"long","value":"75"},"Quality":{"type":"long","value":"40"}}' report.docx writer_pdf_Export
python3 "$here/lo-form.py" "$RW/pdf/lo-form.pdf"

# Scanner-style PDFs, ImageMagick scans and phone photos, ReportLab documents, poppler re-renders.
python3 -I "$here/scans.py" "$RW"
python3 -I "$here/reportlab-docs.py" "$RW"
cd "$RW/pdf"
for f in chrome-invoice-gst lo-report chrome-malayalam-letter scan-salary-slip-ocr chrome-web-article; do pdftocairo -pdf $f.pdf cairo-$f.pdf; done
python3 -I "$here/incr.py" chrome-salary-slip.pdf incr-salary-slip-annotated.pdf
convert "$RW"/img/photo-*.jpg "$RW"/img/photo-*.jpg "$RW"/img/grey-salary-slip.jpg -quality 92 im-big-scan-bundle.pdf
ls "$RW/pdf" | wc -l
# Then: REALWORLD=1 REALWORLD_DIR=$RW npx vitest run tests/unit/realworld-sweep.test.ts, and with REALWORLD_DIR set,
# the differential checks in check/: convert.py, marks.py, pages.py, extract_text.py, compress.py, ocr.py.
