# Foolscap — PDF tools that can't upload your files

Read this whole file before doing anything. The owner is Vysakh (calls you
"buddy"). He prefers plain, simple English and quick visual progress he can
open on his phone.

## What we are building

A free website that does to PDFs what every mainstream PDF site does — merge,
split, compress, sign, protect, read — except the work happens in the
visitor's browser and the file never leaves their device. It is the web
version of **Sheaf**, the owner's Android app (`vysakhsuresh/sheaf-android`);
Sheaf's README is the fuller statement of the thinking and is worth reading.

A foolscap is a paper size, named for the fool's-cap watermark the sheets once
carried. Indian families know the word from school.

Market leaders (iLovePDF, Smallpdf, PDF24, Adobe) upload the file to a server,
do the work there, and send it back — so they cap the free tier and paywall
the second tool. The newer "runs in your browser" sites are thin: fifteen
one-shot tools behind fifteen upload boxes, with a privacy paragraph instead
of a proof. We beat both with four things:

1. **Provable, not claimed.** Every page ships a Content-Security-Policy anyone
   can read, and once a tool page has loaded, the tools work with no
   connection. (Until the stage-8 service worker precaches `/pdfjs/**`,
   showing some documents on screen can need a piece of pdf.js fetched from
   this site the first time it is used. The honesty page says so.)
2. **Redaction that removes.** "Remove areas" rasterises the marked page; the
   text is gone, not covered.
3. **No limits, because there is no server.** No file-size cap, no task cap,
   no batch cap. Not generosity: arithmetic.
4. **A reader and a chain.** Plural in, plural out; "Then…" hands a result to
   the next tool; the viewer hands a page to any tool.

## Promises we never break

1. Free forever. No payment anywhere.
2. No sign-up, no account, no login.
3. No watermark, no branding stamped on anybody's document.
4. Nothing leaves the device. Documents are never uploaded, never sent to any
   API, never logged. The video of this promise is the Network tab.
4a. We never change the file you picked. Every result is a new file, and we
   never overwrite a file that already exists, even in a folder you chose.
5. No limits on file count, file size or number of jobs beyond what the
   visitor's own device can do — and when the device cannot, we say so.
6. Ads, if ever, on guide and landing pages only. Never on a tool page: the
   tool pages' CSP makes a third-party script impossible, which is the point.
7. Analytics, if ever, cookieless and on guide pages only. Never a file name,
   never a page count, never anything a visitor typed.
8. A file's name, size, page count or contents never go to `console.*`, into
   an Error message, a URL, `document.title`, localStorage, sessionStorage,
   IndexedDB or the feedback mail. Outcomes carry ids, not names.

## Who we design for

Someone on a cheap Android phone with a salary slip, a lease, a bank
statement or a scanned ID card, who needs two pages merged tonight and would
rather not hand them to strangers. Also a desktop user at work who has been
told not to upload company documents. Every screen must work for both. If a
step is not essential, remove it.

## Hard technical constraints

- Static site: HTML, CSS, TypeScript, built with Vite. No server, no
  database, no backend, no serverless function. Ever. Concretely: no
  `functions/` directory, no `dist/_worker.js`, no `wrangler.*`, and no
  `_redirects` line proxying to an absolute URL. `tests/unit/no-server.test.ts`
  fails if any exists — `connect-src 'self'` is only a proof while the origin
  is a folder of files that runs no code.
- Hosting: Cloudflare Pages free plan. 20,000 files per site, 25 MiB per
  file. `app/public/_headers` carries the headers. `tests/unit/size.test.ts`
  keeps every built file under 25 MiB.
- Everything self-hosted: scripts, fonts, WASM, pdf.js cmaps. No CDN, no
  third-party request from a tool page.
- Target device: a low-end Android on mobile data. Test at 360px first.
- Browser floor: Chrome/Edge 132+, Firefox 133+, Safari and iOS 18.4+. That
  is what pdfjs-dist 6.4 itself needs: its module evaluates the `Iterator`
  global at import, calls `Promise.withResolvers()` and reads its assets with
  `Response.bytes()`. Its generic build also calls four newer helpers
  (`Map.prototype.getOrInsertComputed`, `Math.sumPrecise`,
  `Uint8Array.prototype.toHex`, `Promise.try`) that even Chrome 141 lacks, so
  `app/src/pdf/shims.ts` installs guarded polyfills ahead of pdf.js on the
  page and inside its worker (`pdfjs-worker.ts` wraps the worker for that).
  Import `pdfjs-dist/build/*`, never `legacy/`. The e2e runs on Chromium (phone and
  laptop projects); Safari and Firefox are checked by hand before a release.
  Feature-detect OPFS, `showSaveFilePicker`, share-with-files.
- One tsconfig, DOM lib. Ambient declarations live in exactly two files:
  `app/src/files/fs-access.d.ts` (the save/directory pickers,
  `createSyncAccessHandle`, `FileSystemSyncAccessHandle` — and deliberately
  NOT `showOpenFilePicker` or `getAsFileSystemHandle`) and
  `app/src/jobs/worker-scope.d.ts` (the `WorkerScope` type worker entries
  cast `self` to). Worker files reach the global only through `self`, never
  `window` or `document`. No `as any`, `@ts-ignore` or `declare global`
  anywhere else; the rules test checks.
- Heavy work runs in a Web Worker. The page never freezes.
- No inline `style=""` attributes and no inline `<script>` in HTML: the CSP
  forbids them. Set styles with classes or `el.style.setProperty`.

## The architecture (mirrors Sheaf)

```
app/src/
  pdf/    PdfEngine (pdf.js) reads and rasterises; PdfSurgeon (pdf-lib)
          restructures and writes. PageSelection turns "1-3, 7, 12-" into
          indices. Nothing outside this package imports a PDF library.
  files/  DocumentStore — the only way a document enters (copies into the
          Workspace). Workspace — OPFS, memory fallback. Exporter — the only
          component that hands bytes back to the user.
  ops/    Op — the one shape. tools.ts — every tool, in one list.
  jobs/   JobRunner + op.worker — every op runs in a worker.
  ui/     Components, design tokens, the shell. pages/ — one entry per page.
  site/   config.ts — name, domain, feedback address.
app/tools/<id>/index.html   one HTML entry per live tool
app/public/_headers         the CSP and friends
```

### Rules the tests enforce

1. **The seam.** Outside `app/src/pdf/`, no file under `app/` mentions the
   substring `pdfjs-dist` or `@cantoo/pdf-lib` in any form (static import,
   `import type`, `export … from`, `import()`, triple-slash reference, Vite
   alias). Inside it, `engine*.ts` never mentions `@cantoo/pdf-lib` and
   `surgeon*.ts` never mentions `pdfjs-dist`, so the page bundle carries
   pdf.js only and the worker bundle pdf-lib only. `app/src/pdf/index.ts`
   exports types only. Widen the interface; never reach around it.
2. **Where documents come from and where bytes go.**
   2a. A document enters only as a `File` through `DocumentStore.import`.
   Nobody calls `showOpenFilePicker`, `DataTransferItem.getAsFileSystemHandle`,
   `webkitGetAsEntry` or `launchQueue`; a later file handler reads
   `handle.getFile()` once, inside `files/`, and drops the handle.
   2b. Only `app/src/files/exporter.ts` calls `showSaveFilePicker`,
   `showDirectoryPicker`, `navigator.share`, `navigator.canShare`,
   `URL.createObjectURL`, or sets a `download` attribute. It never replaces
   an existing file.
   2c. Only `app/src/files/workspace*.ts` (and its storage worker) call
   `navigator.storage.getDirectory` or `createSyncAccessHandle`, and only on
   handles descended from `getDirectory()`. `createWritable` is allowed there
   and in `exporter.ts`, which needs it for the save-dialog handle.
   The rules test strips comments, scans `app/**/*.ts` including `.d.ts`,
   and allows each identifier only in its named file.
3. **The shape.** `Op.run(inputs: FoolscapFile[], params, ctx): Outcome[]`.
   Plural in, plural out. One failed input is a `failed` outcome, never a
   thrown error that loses the rest of the batch. Every `produced` outcome
   carries a `detail` that says what was done. Ops never remove inputs.
4. **The CSP and offline.** Every path is served with the policy in
   `_headers` — the workers that hold the bytes live under `/assets/` and a
   worker's policy comes from its own response, not the page's.
   `createJobRunner()` and `createEngine()` create their workers at page load,
   never on first use; each exposes `ready`, and the page sets
   `data-ready="true"` on `<body>` when both resolve. The e2e waits for it,
   calls `context.setOffline(true)`, imports fixtures, runs every live tool,
   and separately asserts every request from navigation to the end was
   same-origin. Stage-1 fixtures embed every font and contain no JPX, JBIG2
   or ICC images; `tests/fixtures/README.md` says why.
5. **Size.** No built file over 25 MiB. A tool page's initial scripts — what
   blocks first paint — total under 60 KB gzipped and contain no PDF library;
   pdf-lib lives only in the op worker chunk and pdf.js in its own chunks,
   both fetched after first paint and before `data-ready`. The numbers live
   in `tests/unit/size.test.ts` (runs over `dist/` after `vite build`) and in
   the README.
6. **Licences.** Only Apache-2.0, MIT, BSD, OFL or public-domain code and
   fonts. **Never add MuPDF, PyMuPDF, iText or Ghostscript** — all AGPL, and
   Ghostscript is the one most likely to be reached for by accident.
7. **No stamp.** No output carries a Producer, Creator or Info entry the input
   did not have, and none ever contains the strings `pdf-lib`, `Foolscap` or
   `Sheaf`. Every `PDFDocument.load(` and `.create(` in `app/src/pdf/` passes
   `updateMetadata: false`; a unit test re-opens every op's output and checks.
8. **No names on the record.** `app/src` contains no `console.` call outside
   `ui/devlog.ts`, which is `import.meta.env.DEV`-guarded and takes no
   `FoolscapFile`.

| Library | Licence | Role |
|---|---|---|
| `pdfjs-dist` | Apache-2.0 | Reading and rasterising, behind `PdfEngine` |
| `@cantoo/pdf-lib` | MIT | Everything structural, and AES-256, behind `PdfSurgeon` |
| `fflate` | MIT | ZIP for "save all" |
| `tesseract.js` (+ core, English model) | Apache-2.0 | Make searchable, in the op worker, self-hosted under `/tesseract/` |
| Space Grotesk | OFL | The site's one face, self-hosted |

## Design direction

The Layerbit family, made playful. The ground is near-black (`#0a0c10`) lit
from above; surfaces are frosted glass; the type is **Space Grotesk**, the
same face as layerbit.co.in and the Sheaf app. Colour is neon light with a
meaning: **each family owns one gradient** (Pages cyan→blue, Convert
coral→pink, Mark up violet→fuchsia, Protect lime→emerald, Read yellow→amber)
that colours its cards, its tools' drop zones, titles and main buttons, so
twenty-seven tools read as five calm groups rather than a rainbow. Professional means restraint
everywhere else: one accent per screen, generous space, no decoration that
does not confirm something. Dark only, matching Layerbit.

Efficiency is part of the design. Under the headline: a finder ("join",
"lock", "jpg" all work, from `KEYWORDS` in tools.ts), a row of family jumps,
then the five families, live tools first and the rest as quiet dashed
"Soon" cards that are not links. Every tool page is generated from one
template (`scripts/gen-pages.ts`), carries its family's colour and a crumb
back to it, and ends with "More in <family>". On a phone the main button is pinned under the thumb, and the
drop zone shrinks to one line once files are in.

**Links are never underlined.** They are told apart by colour and weight, and
every one has the button focus ring. A test checks every page.

**Buy me a coffee** (a gold pill pinned top-right as on Layerbit, so it
stays as you scroll; a mug with three lines of steam; `HELP.coffee` in
`site/config.ts`) and **Get help** (Layerbit's glowing orb, bottom-right,
opening a popover with Email and WhatsApp — no script needed) match
layerbit.co.in. They are plain links: nothing is fetched until tapped, and
the privacy page says so. On a phone the orb steps aside once files are on a
tool page; Get help stays in every footer.

**The way home** is Layerbit's bottom-left glass pill with the mark in it, on
every tool page. It goes to `/#from-<tool>`, and the home page lands where
you left it (the scroll position is kept for the tab, a number and nothing
else), or on that tool's card, which glows once. On a phone it sits beside
the pinned button, never over the page.

Touch targets at least 44px. Text contrast at least 4.5:1 — muted text is
`#94a3b8` (7:1 on the ground); dark text on every gradient stop is 7:1 or
more. Nothing smaller than 24px is drawn in a gradient. The mark is the owner's
drawing: a PDF sheet wearing a jester's cap, a pen, and the stars around it,
its white background cut away (`app/public/brand/`, plus `favicon.ico` and
the install manifest). The name sits beside it, large.
Facts (Free forever, No sign-up…) are plain text with a tick, never pills
that look tappable; the nav marks the current page by colour, and a
background appears only under the pointer or the keyboard.

Copy is plain English in the Sheaf voice: short, confident, honest about
costs ("a redacted page becomes a picture"). Every button is a verb.

## Build order

1. ✅ Foundation: contracts, CSP, build. Merge, split, organise end to end,
   with the offline proof.
2. ✅ Thirteen more, no drawing needed: extract or remove pages, insert
   pages, crop, split by size, images to PDF, pages per sheet, extract
   images, watermark, page numbers, header and footer, add and remove a
   password, document details. 16 live.
2b. ✅ pdf.js inside the op worker (`pdf/engine-worker.ts`): PDF to images,
   extract text, compress. Then the page editor: sign, add text, mark up,
   remove areas, and fill in a form. 24 live.
2c. ✅ Read (viewer), Scan, Make searchable (tesseract.js in the op worker,
   self-hosted). All 27 live. **You are here.**
3. The reader, deeper: re-rendering zoom, find, outline, night mode, resume.
4. Complex-script text drawn as real text (harfbuzzjs). Until then Add text
   puts Malayalam, Hindi and the like in as a picture of the words, shaped
   by the browser.
5. More OCR languages (Malayalam, Hindi, Tamil), each a model fetched only
   when asked for.
6. The design pass, as a system.
7. SEO: one fast page per tool × intent, generated from `tools.ts`.
8. PWA: install, offline, share target, file handler. The service worker
   precaches `/pdfjs/**`; the offline e2e then adds a non-embedded-font, a
   CJK-CMap and a JPX fixture and the exception in rule 4 goes.
9. The gate: a corpus of awkward real PDFs run on every build.

## Working with the owner

- Show progress he can open on his phone early and often.
- Simple English, no jargon. Explain the decision, not the mechanism.
- Ask before adding anything that costs money, any third-party service, or
  anything that touches the promises above.
- Never commit secrets. Keep the README current.

## Decisions log

- **2026-10-10** Name is Foolscap; the Android app stays Sheaf. Domain not yet
  bought: `SITE_ORIGIN` is null until it is.
- **2026-10-10** `@cantoo/pdf-lib` over `pdf-lib`: maintained, MIT, and it
  encrypts and decrypts, so passwords need no WASM.
- **2026-10-10** The CSP is served on every path, including `/assets/*`,
  because a dedicated worker's CSP comes from its own script's response
  headers, not from the page: with the policy on `/tools/*` only, the op
  worker and pdf.js's worker — where the document bytes actually are — would
  run with no policy. `connect-src 'self'`, not `'none'`: pdf.js fetches
  cmaps, standard fonts, wasm decoders and ICC profiles from our origin on
  first use, and documents are passed as bytes, so nothing needs `blob:`
  there (`img-src blob:` stays for previews). The offline test is the proof
  that nothing needs the network once the page has loaded.
- **2026-10-10** The browser floor follows the library. pdfjs-dist 6.4 needs
  Chrome 132, Firefox 133 and Safari 18.4; a polyfill module for
  `Promise.withResolvers`, `Response.prototype.bytes` and a global `Iterator`
  could lower it later, and is not stage-1 work.
- **2026-10-10** Stage-1 thumbnails render on the page thread, where pdf.js's
  own worker parses and the page only paints. The op worker gets pdf.js only
  when a tool that rasterises asks for it (`ctx.engine()` is lazy).
- **2026-10-10** Contracts were adversarially reviewed before anything was
  built on them: 46 findings, 19 applied. The rules above are the result.
- **2026-10-12** Redesigned in the Layerbit family at the owner's request: the
  paper-and-highlighter look read as unprofessional. Dark glass, neon per-tool
  gradients, Space Grotesk (40 KB, down from 105 KB), no underlined links,
  Buy me a coffee and Get help as on layerbit.co.in.
- **2026-10-12** Thirteen more tools (16 live). Colour moved from the tool to
  its family, so the home page reads as five groups. Tool pages and the home
  tool list are generated from tools.ts by `scripts/gen-pages.ts` (run on
  predev/prebuild, output committed) so no page can drift. Settings are built
  from one kit (`ui/fields.ts`, `ui/tool-options.ts`).
- **2026-10-12** The built-in PDF fonts draw Latin text only, and pdf-lib
  draws an empty box for anything else rather than refusing. The surgeon
  checks every character against the font's set and fails with
  `unsupported-text` in words; complex scripts arrive with shaping (stage 4).
- **2026-10-13** New mark (page + cut-out F) replacing the fool's cap, which
  read as odd. AdSense: verification only — `ads.txt` and the
  `google-adsense-account` meta on every page, account
  `ca-pub-6072772587431629` (the same as Layerbit). No ad code runs anywhere:
  showing ads needs the home page's CSP opened to Google's ad scripts, which
  waits on the owner's explicit decision. Tool and privacy pages keep the
  strict policy regardless.
- **2026-10-13** pdf.js now also runs inside the op worker, for the tools that
  draw or read pages. It gets an OffscreenCanvas factory, a no-op filter
  factory, fonts drawn as paths, and its own worker passed in as a port; a
  tool whose op sets `engine: true` has the worker load it before the page
  reports ready, so the offline proof still holds. Everything an edit tool
  places is stored as fractions of the page as the reader sees it, so the
  editor and the surgeon never agree on a scale, only on a corner.
- **2026-10-13** Remove areas rasterises each marked page at 200 dpi with the
  areas painted black, then swaps the page for that picture: contents,
  resources and annotations go. That is the honest version of redaction.
- **2026-10-13** All 27 tools live. Make searchable runs tesseract.js (its
  own worker, started from the op worker) with every file self-hosted under
  `/tesseract/<version>/` and IndexedDB caching off; an op with `ocr: true`
  has the worker load the engine and model before the page reports ready,
  and the offline proof runs it. Scan's corner finder is Otsu plus the largest
  bright patch, which is cheap and right for paper on a table; the handles
  are there for the rest.
- **2026-10-13** The owner's jester-cap drawing replaces the cut-out F as the
  mark. Coffee pill pinned like Layerbit's, with a bigger, three-steam cup.
  A way home bottom-left on every tool page. Icon tiles made glossy and
  heavier. Drop a file anywhere on a tool page; Enter in the finder opens the
  first match; an install manifest. Buttons no longer jitter under a pointer
  resting on their edge.
