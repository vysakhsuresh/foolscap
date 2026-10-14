# Foolscap

**PDF tools that can't upload your files.**

Merge, split and organise PDFs in your browser. The work happens on your own
device; nothing is sent anywhere. Free, no sign-up, no limits, no watermark.

The web version of [Sheaf](https://github.com/vysakhsuresh/sheaf-android), the
Android app. `CLAUDE.md` is the brief and the rules; read it first.

## What is live

All forty-five tools, in five families:

| Family | Tools |
|---|---|
| Pages | Merge · Split (also at each chapter) · Organise pages · Extract or remove pages · Insert or replace pages · Crop pages · Bookmarks · Page labels · Split by size |
| Convert and print | Compress (or to a size: 100 KB, 200 KB…) · PDF to Word (scans too) · PDF to Excel · PDF to PowerPoint · PDF to EPUB or web page · Word or Excel to PDF · Archive copy (PDF/A) · Rent receipts (a template: no file needed) · Images to PDF · PDF to images · Pages per sheet · Extract images |
| Mark up | Watermark · Page numbers (and Bates) · Sign · Edit text (in the document's own font, cell by cell, scanned pages too; find and replace) · Create a form (finds the blanks for you) · Fill in a form (save and reload answers, Acrobat .xfdf too) · Mark up (highlight, underline, strike out, pen, box, circle, arrow, line, measure, sticky note, text box, stamp, link) · Add image · Edit pictures (move, resize, take out, swap) · Add text · Page background · Header and footer |
| Protect | Remove areas (or find and remove: Aadhaar, PAN, phone, email, card numbers, any words) · Add a password (or restrict only) · Digital signature (your .pfx certificate) · Remove a password · Clean hidden data · Attachments |
| Read | Read · Compare two versions · Summarise and translate (on-device AI only) · Scan a document · Make searchable · Extract text |

**Read** is a viewer: zoom that redraws, find, the document's own contents,
night mode, a list of the document's comments, print, read aloud (with a
voice on the device only), and Then…
to any tool. **Scan** finds the sheet of paper in each
photo, lets you drag its corners right, straightens it and cleans it up
(colour, grey, or black and white that survives a shadow). **Make
searchable** reads a scan's words with Tesseract (English, and twenty more
languages from Malayalam and Hindi to Arabic and Japanese, each fetched from
this site only when picked) and lays them invisibly over
the page, so it can be searched and copied and still looks the same.

Sign, Add text, Mark up and Remove areas share one page editor
(`ui/page-editor.ts`): the page drawn large, tap to place, drag to draw or
move. **Remove areas** really removes: each marked page is redrawn as a
picture with the marked parts painted out, so the hidden words are not in the
file at all. **Compress** shrinks oversized photos, drops objects nothing
uses and packs uncompressed streams, and says so when a file cannot get
smaller. A file that needed a password to open keeps the same password.

Every result has **Save**, **Save all** (a folder, or one ZIP), **Share** (on
phones that can share files — straight into WhatsApp) and **Then…**, which
hands the result to the next tool without saving in between.

Every page has **Get help** (Email or WhatsApp, the same as
layerbit.co.in) and **Buy me a coffee**. Both are ordinary links; nothing is
fetched until they are tapped.

Tool pages are generated from `app/src/ops/tools.ts` by
`scripts/gen-pages.ts`; adding a tool is an entry there, an `Op`, its
settings in `ui/tool-options.ts`, and an icon in `ui/tool-icons.ts`.

## How we know nothing leaves

- There is no server. The site is a folder of files on Cloudflare Pages; a
  test fails if a `functions/` directory or a `_worker.js` ever appears.
- Every tool page, and every script, worker and asset, is served with a
  Content-Security-Policy (`app/public/_headers`) that allows connections to
  this origin only. The policy covers the workers that hold the document
  bytes, not just the pages. The home page and the guides carry Google ads
  under a looser policy of their own; they take no files, and a unit test
  fails if any other path the build writes is left without the strict one.
- The end-to-end tests load a tool page, cut the network
  (`context.setOffline(true)`), and run every tool. They also record every
  request from every page and assert each one went to this origin.
- No output is stamped: a unit test re-opens every result and checks that
  the Producer and Creator are the input's own and that the bytes never
  contain `pdf-lib`, `Foolscap` or `Sheaf`.

## Running it

```
npm install
npm run dev        # http://127.0.0.1:5173 (no CSP in dev; Vite's HMR needs inline styles)
npm run build      # dist/, what Cloudflare Pages publishes
npm run preview    # the built site at :4173, with the production headers applied
npm test           # typecheck, unit tests, then e2e against the built site
```

`npm run fonts` refreshes the self-hosted display font; `npm run pdfjs-assets`
(run automatically before dev and build) copies pdf.js's runtime pieces into
`app/public/pdfjs/<version>/`.

## Tests

- `tests/unit/` (vitest, Node): the page-range parser, the surgeon over real
  pdf-lib, the engine over real pdf.js, the file layer, the three ops end to
  end with a memory workspace, and the structural rules — the seam, where
  bytes may enter and leave, no `console.` in the app, no inline styles, the
  CSP's contents, no server, output sizes.
- `tests/unit/gauntlet.test.ts`: every op in the registry over awkward
  files — empty, not a PDF, damaged, cut short, locked (several kinds),
  scans, turned and offset pages, forms, odd and long names, mixed batches —
  checking it answers for every input in plain English, never throws or
  hangs, never changes an input, and makes files that reopen.
  `GAUNTLET_FULL=1` adds a 300-page file and the pdf.js corpus;
  `GAUNTLET_PERF=1` prints the timings in `tests/PERFORMANCE.md`.
- `tests/unit/realworld.test.ts` and `tests/e2e/realworld.spec.ts`: what
  testing with files from real producers found (Chromium print-to-PDF,
  LibreOffice, ReportLab, ImageMagick, scanner software), each kept as a
  small synthetic file in `tests/fixtures/real-producers.ts`: Malayalam and
  Hindi written with /ActualText, glyphs that carry a vowel sign, PDF/A,
  ASCII85-wrapped JPEGs, phone photos with their EXIF flag inside, sideways
  tables, LibreOffice's Word files.
  `tests/unit/realworld-sweep.test.ts` runs every tool over a corpus of such
  files built on this machine and writes every output for checking against
  the input; it is skipped unless `REALWORLD=1` (and `REALWORLD_DIR` says
  where the corpus is).
- `tests/e2e/` (Playwright, Chromium, phone 360×780 and laptop 1280×860):
  each tool end to end with downloads inspected, the offline proof, the CSP
  on every path, tap targets, overflow, the display font, awkward files
  dropped on the tool pages, every sitemap page's search tags, and ads
  loading on the real domain only, on the home page and guides only.

Fixtures are generated at test time with pdf-lib; no binaries are committed.
`tests/fixtures/README.md` explains why stage-1 fixtures avoid fonts and
images that pdf.js would fetch lazily.

### Budgets (`tests/unit/size.test.ts`)

- No built file over 25 MiB (Cloudflare's limit).
- A tool page's initial scripts and styles — what blocks first paint — stay
  under 60 KB gzipped and contain no PDF library. Measured on this build:
  about 25 KB. pdf.js (≈130 KB gz) and the op worker with pdf-lib (≈1.1 MB
  raw) load after first paint and before the page reports itself ready.

## pdf.js, corrected in one place

`scripts/pdfjs-patch.ts` makes one change to pdf.js's worker as it is
bundled (and as the tests load it): a glyph that carries a nonspacing mark
but has a width in its font is no longer read as taking no room. Without it,
Malayalam and Hindi from Chrome and LibreOffice came out with spaces inside
words. The build stops if pdf.js changes the code the patch corrects, and
`tests/unit/size.test.ts` checks the built worker carries it.

## Browser floor

Chrome/Edge 132+, Firefox 133+, Safari and iOS 18.4+ — what pdfjs-dist 6.4
needs, with `app/src/pdf/shims.ts` filling the four newest helpers it calls.
The tests run on Chromium; Safari and Firefox are checked by hand before a
release. Where a browser lacks the save dialog, the File System Access API or
share-with-files, the site falls back to a download, a ZIP and no share
button, and still works.

## Layout

```
app/
  index.html, tools/<id>/index.html, private/index.html   the pages
  public/_headers                                         the CSP and friends
  public/fonts/                                           Space Grotesk + OFL
  src/pdf/    the seam: pdf.js engine, pdf-lib surgeon, PageSelection, shims
  src/files/  DocumentStore, Workspace (OPFS via a storage worker; memory fallback), Exporter
  src/ops/    the one Op shape, the tool registry, merge / split / organise
  src/jobs/   JobRunner and the op worker
  src/ui/     tokens, components, the shell
  src/pages/  one entry per page
  src/site/   config: name, domain (unset until bought), feedback address
scripts/      font fetch, pdf.js asset copy, the Cloudflare-headers preview plugin
tests/        unit, e2e, fixtures
```

## Deploying

**Home:** https://foolscap.co.in on GitHub Pages, the domain pointed there
from GoDaddy (the same arrangement as layerbit.co.in). Every push to `main`
runs `.github/workflows/pages.yml`: unit tests first, then the build, then
the `gh-pages` branch. The workflow asks GitHub which domain the Pages
settings name; with one, it builds for that domain at the root and writes
the CNAME file, and without one it builds the preview at
https://vysakhsuresh.github.io/foolscap/ (noindex).

GitHub Pages cannot send headers, so every page carries its own policy as a
`<meta>` tag, taken from `app/public/_headers` for its path: the strict
policy on tool pages, the ad policy on the home page and guides. Two things
only a header can do are missing there: `frame-ancestors`, and a policy on
the workers themselves. Moving to Cloudflare Pages later adds both with no
code change: build command `npm run build`, output `dist`, `NODE_VERSION=22`;
`_headers` and `_redirects` are read automatically.

**Search and ads.** `SITE_ORIGIN` in `app/src/site/config.ts` writes the
canonical links, Open Graph tags, `sitemap.xml` and the sitemap line in
`robots.txt`. Every page carries structured data (WebApplication, HowTo,
FAQPage, BreadcrumbList) and the link-preview image `brand/og.png`. The 40
guides (`app/src/site/guides.ts`) and the help under each tool
(`app/src/site/tool-copy.ts`) are data; `scripts/gen-pages.ts` writes the
pages. AdSense (`ui/ads.ts`) loads only on the home page and the guides, only
on the real domain, after the page has loaded; placement is Auto ads in the
AdSense dashboard, and the consent message for Europe is set there under
Privacy & messaging. The GitHub Pages preview is marked noindex.

## Licences

| Library | Licence |
|---|---|
| `pdfjs-dist` | Apache-2.0 |
| `@cantoo/pdf-lib` | MIT |
| `fflate` | MIT |
| `pkijs`, `asn1js`, `bytestreamjs` (Digital signature) | BSD-3-Clause (`licenses/`) |
| `@noble/hashes`, `pvutils`, `pvtsutils`; `tslib` | MIT; 0BSD (`licenses/`) |
| Lucide icons (`lucide-static`) | ISC (`licenses/lucide-ISC.txt`) |
| `tesseract.js`, `tesseract.js-core` | Apache-2.0 (licences copied next to them in `/tesseract/`) |
| Tesseract language models (`@tesseract.js-data/*`, tessdata best_int: English, plus 20 fetched only when picked) | Apache-2.0 (packaged as MIT) |
| Space Grotesk | OFL (`app/public/fonts/OFL-*.txt`) |

Never MuPDF, PyMuPDF, iText or Ghostscript: all AGPL.

---

From [Layerbit](https://layerbit.co.in).
