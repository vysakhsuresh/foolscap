# Test fixtures

Every fixture is built on the fly by `pdfs.ts` with pdf-lib. No binary file is
committed, and a test that needs a document calls a function.

## What the stage-1 fixtures leave out, and why

The offline e2e (`tests/e2e/offline.spec.ts`) loads a tool page, waits for
`data-ready`, cuts the network, runs a job, and asserts that not one HTTP
request was made afterwards. That proof is only as good as the fixtures: pdf.js
fetches some of its own pieces lazily, from this site, the first time a
document needs them — and "after `data-ready`" is exactly when a fixture that
needed one would trigger the fetch and fail the test for the wrong reason.

Until the stage-8 service worker precaches `/pdfjs/**`, the fixtures therefore
contain none of these:

| Content | What pdf.js would fetch from `/pdfjs/<version>/` |
|---|---|
| A font that is not embedded and is not one of the standard 14 | `standard_fonts/*` (a Liberation or Foxit face) |
| Symbol or ZapfDingbats text | `standard_fonts/*` — these two are always fetched, even when system fonts are allowed |
| CJK text with a predefined CMap | `cmaps/*.bcmap` |
| JPEG 2000 (JPX) images | `wasm/openjpeg.wasm` |
| JBIG2 images | `wasm/jbig2.wasm` |
| An ICC colour profile | `wasm/qcms_bg.wasm` and `iccs/*` |

## About the Helvetica text

The page numbers are drawn in Helvetica, one of the standard 14 fonts. pdf-lib
does not embed a standard font: it writes `/BaseFont /Helvetica` and no font
program. On the page thread pdf.js runs with `useSystemFonts` on, so for a
standard font it fetches nothing from `standard_fonts/` and instead declares a
`@font-face` whose `src` lists local substitutes — for Helvetica: Helvetica,
Arial, Liberation Sans, Arimo, Nimbus Sans, DejaVu Sans and others — with the
Liberation file on this site as the LAST fallback. A browser only reaches that
URL when no local name matches. The e2e Chromium runs on Linux with Liberation
Sans and DejaVu Sans installed (Playwright's `install-deps` brings
`fonts-liberation`), so the fallback is never reached there. A device with none
of those faces — a stock Android phone — would fetch it, which is the honest
exception the brief describes for stage 1.

Every page also carries a filled rectangle, so the thumbnail test ("more than
one colour") never depends on text having been drawn at all.

## Checking an output

`pdfInfo(bytes)` reads a document back with pdf-lib and returns its page count,
each page's size and rotation, Producer, Creator, Title and whether it is
encrypted. Every page a fixture produces has a distinct width (`300 + 10 ×
index`), so `sourceIndices(info)` recovers which source page landed where after
a merge, split or organise. `stampsIn(bytes)` lists any forbidden string
(`pdf-lib`, `Foolscap`, `Sheaf`) found in an output; it must be empty.
