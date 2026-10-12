# Performance

Every tool, timed by the gauntlet (`GAUNTLET_PERF=1 npx vitest run tests/unit/gauntlet.test.ts -t timed`)
in Node on the 4-CPU build machine, with pages really drawn (`@napi-rs/canvas`)
and a stand-in for the text reader (so Make searchable and PDF to Word's scan
reading time the page drawing only; Tesseract itself adds a few seconds a page
in the browser). Two documents:

- **40-page report**: A4 pages of typed paragraphs, a photo on every fourth
  page, 4 MB.
- **300 pages**: `bigPdf(300)` from the fixtures, one large number on each page,
  every page a different width (300 to 3,290 pt), 130 KB.

Times are for the whole run, including writing the result. "made" is how many
files came out (0 means the tool rightly said there was nothing to do: no
password to remove, no attachments, already small, and so on).

| Tool | 40-page report (4 MB, 10 photos) | 300 pages (130 KB) |
|---|---|---|
| merge | 0.05 s (1 made) | 0.11 s (1 made) |
| split | 0.09 s (20 made) | 0.10 s (150 made) |
| organise | 0.04 s (1 made) | 0.07 s (1 made) |
| extract-pages | 0.02 s (1 made) | 0.02 s (1 made) |
| insert-pages | 0.04 s (1 made) | 0.07 s (1 made) |
| crop | 0.03 s (1 made) | 0.06 s (1 made) |
| split-by-size | 0.19 s (5 made) | 0.00 s (0 made) |
| n-up | 0.07 s (1 made) | 0.13 s (1 made) |
| extract-images | 0.36 s (10 made) | 0.02 s (0 made) |
| watermark | 0.04 s (1 made) | 0.57 s (1 made) |
| page-numbers | 0.04 s (1 made) | 0.12 s (1 made) |
| header-footer | 0.05 s (1 made) | 0.18 s (1 made) |
| add-password | 0.50 s (1 made) | 0.08 s (1 made) |
| remove-password | 0.01 s (0 made) | 0.02 s (0 made) |
| document-details | 0.05 s (1 made) | 0.07 s (1 made) |
| compress | 0.55 s (1 made) | 0.07 s (0 made) |
| pdf-to-images (72 dpi) | 2.42 s (40 made) | 4.74 s (300 made) |
| extract-text | 0.27 s (1 made) | 0.27 s (1 made) |
| sign | 0.04 s (1 made) | 0.07 s (1 made) |
| add-text | 0.03 s (1 made) | 0.06 s (1 made) |
| mark-up | 0.04 s (1 made) | 0.07 s (1 made) |
| remove-areas | 0.20 s (1 made) | 0.10 s (1 made) |
| fill-form | 0.01 s (0 made) | 0.02 s (0 made) |
| ocr | 0.30 s (0 made) | 148.09 s (1 made) |
| background | 0.04 s (1 made) | 0.10 s (1 made) |
| page-labels | 0.03 s (1 made) | 0.06 s (1 made) |
| attachments | 0.01 s (0 made) | 0.02 s (0 made) |
| bookmarks | 0.03 s (1 made) | 0.06 s (1 made) |
| digital-sign | 0.13 s (1 made) | 0.09 s (1 made) |
| pdf-to-word (scans read) | 0.48 s (1 made) | 155.14 s (1 made) |
| pdf-to-excel | 0.37 s (1 made) | 0.44 s (1 made) |
| pdf-to-powerpoint | 5.17 s (1 made) | 5.38 s (1 made) |
| pdf-to-epub | 0.49 s (1 made) | 0.44 s (1 made) |
| add-image | 0.03 s (1 made) | 0.06 s (1 made) |
| compare | 0.57 s (1 made) | 0.56 s (1 made) |
| edit-text | 0.03 s (1 made) | 0.06 s (1 made) |
| create-form | 0.04 s (1 made) | 0.06 s (1 made) |
| pdf-a | 0.04 s (1 made) | 0.06 s (1 made) |
| edit-images | 0.02 s (0 made) | 0.03 s (0 made) |

Reading the two slow rows: every page of the 300-page file has fewer letters
than a page of text, so Make searchable and PDF to Word (with "Read scanned
pages too", its default) treat each one as a scan and draw it at 300 dpi for
the reader, about half a second a page, on pages up to 3,290 pt wide. That is
the work being asked for, not waste; on a real scan Tesseract's own reading
time is larger still. PowerPoint draws every page at 1,600 px for its slide.

## What the gauntlet found and fixed

Sizes are what came out, not time, but they were the real performance bugs:
a file several times bigger than it needs to be is slower to save, share and
open, and on a phone it can be the difference between done and out of memory.

| Case | Before | After |
|---|---|---|
| Pages per sheet, 100 pages sharing one logo (150 KB) | 12.1 MB | 164 KB |
| Crop to A4, the same file | 12.1 MB | 188 KB |
| Merge, the same file and a cover page | 515 KB | 154 KB |
| Insert pages, the same file | 274 KB | 154 KB |
| Tiled watermark, 300 pages (130 KB in) | 5.2 MB, 2.2 s | 0.57 MB, 0.6 s |
| Tiled watermark, the 40-page report | +240 KB | +7 KB |

pdf-lib makes a fresh object copier for every `embedPage` call and every
`copyPages` call, so whatever pages share (a logo, a font, a background) was
copied again for every page or every batch of 25. The surgeon now keeps one
copier per source document and builds the page XObject itself. A tiled
watermark was a couple of hundred separate text draws, each with its own
transparency state, on every page; it is now one form per page size that
every page draws.
