# Foolscap

**PDF tools that can't upload your files.**

Merge, split and organise PDFs in your browser. The work happens on your own
device; nothing is sent anywhere. Free, no sign-up, no limits, no watermark.

The web version of [Sheaf](https://github.com/vysakhsuresh/sheaf-android), the
Android app. `CLAUDE.md` is the brief and the rules; read it first.

## What is live

| Tool | What it does |
|---|---|
| Merge | Join several PDFs into one, in the order you choose |
| Split | Every N pages, single pages, or by ranges like `1-3, 7, 12-` |
| Organise pages | Reorder, rotate and delete pages, with thumbnails |

Every result has **Save**, **Save all** (a folder, or one ZIP), **Share** (on
phones that can share files — straight into WhatsApp) and **Then…**, which
hands the result to the next tool without saving in between.

Every page has **Get help** (Email or WhatsApp, the same as
layerbit.co.in) and **Buy me a coffee**. Both are ordinary links; nothing is
fetched until they are tapped.

The other twenty-four tools are listed on the home page as coming soon, in
the order they will arrive (see the build order in `CLAUDE.md`).

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
| Space Grotesk | OFL (`app/public/fonts/OFL-*.txt`) |

Never MuPDF, PyMuPDF, iText or Ghostscript: all AGPL.

---

From [Layerbit](https://layerbit.co.in).
