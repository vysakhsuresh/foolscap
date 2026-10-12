# Foolscap

**PDF tools that can't upload your files.**

Merge, split and organise PDFs in your browser. The work happens on your own
device; nothing is sent anywhere. Free, no sign-up, no limits, no watermark.

The web version of [Sheaf](https://github.com/vysakhsuresh/sheaf-android), the
Android app. `CLAUDE.md` is the brief and the rules; read it first.

## What is live

All thirty-seven tools, in five families:

| Family | Tools |
|---|---|
| Pages | Merge · Split (also at each chapter) · Organise pages · Extract or remove pages · Insert or replace pages · Crop pages · Bookmarks · Page labels · Split by size |
| Convert and print | Compress (or to a size: 100 KB, 200 KB…) · PDF to Word (scans too) · PDF to Excel · PDF to PowerPoint · PDF to EPUB or web page · Word or Excel to PDF · Images to PDF · PDF to images · Pages per sheet · Extract images |
| Mark up | Watermark · Page numbers (and Bates) · Sign · Mark up · Add text · Fill in a form · Page background · Header and footer |
| Protect | Add a password (or restrict only) · Digital signature (your .pfx certificate) · Remove a password · Remove areas · Clean hidden data · Attachments |
| Read | Read · Scan a document · Make searchable · Extract text |

**Read** is a viewer: zoom that redraws, find, the document's own contents,
night mode, print, read aloud (with a voice on the device only), and Then…
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
- Every page is served with a Content-Security-Policy (`app/public/_headers`)
  that allows connections to this origin only. The policy covers the workers
  that hold the document bytes, not just the pages.
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
- `tests/e2e/` (Playwright, Chromium, phone 360×780 and laptop 1280×860):
  each tool end to end with downloads inspected, the offline proof, the CSP
  on every path, tap targets, overflow, the display font.

Fixtures are generated at test time with pdf-lib; no binaries are committed.
`tests/fixtures/README.md` explains why stage-1 fixtures avoid fonts and
images that pdf.js would fetch lazily.

### Budgets (`tests/unit/size.test.ts`)

- No built file over 25 MiB (Cloudflare's limit).
- A tool page's initial scripts and styles — what blocks first paint — stay
  under 60 KB gzipped and contain no PDF library. Measured on this build:
  about 25 KB. pdf.js (≈130 KB gz) and the op worker with pdf-lib (≈1.1 MB
  raw) load after first paint and before the page reports itself ready.

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

**Preview:** every push to `main` publishes https://vysakhsuresh.github.io/foolscap/
through `.github/workflows/pages.yml` (unit tests first, then a build with
`FOOLSCAP_BASE=/foolscap/`, then the `gh-pages` branch). GitHub Pages cannot
send headers, so the preview carries the page-level policy as a `<meta>` tag;
the workers' policy and `frame-ancestors` only exist on Cloudflare.

**Home:** Cloudflare Pages, free plan. Build command `npm run build`, output directory
`dist`, Node 22. `app/public/_headers` is applied automatically. Set
`SITE_ORIGIN` in `app/src/site/config.ts` once the domain exists, so pages
carry canonical URLs.

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
