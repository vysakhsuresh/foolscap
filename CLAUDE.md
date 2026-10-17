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
6. Ads on the home page and guides only. Never on a tool page: the tool
   pages' CSP makes a third-party script impossible, which is the point.
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
- Hosting: GitHub Pages with the domain pointed from GoDaddy (see the
  decisions log); every page carries its policy as a meta tag. The site stays
  ready for Cloudflare Pages' free plan too (20,000 files, 25 MiB a file),
  where `app/public/_headers` carries the headers. `tests/unit/size.test.ts`
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
6. **Licences.** Only Apache-2.0, MIT, BSD (0BSD included), ISC, OFL or public-domain code
   and fonts (ISC is the two-clause BSD in fewer words; Lucide uses it). **Never add MuPDF, PyMuPDF, iText or Ghostscript** — all AGPL, and
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
| `tesseract.js` (+ core, English and 20 more models) | Apache-2.0 | Make searchable, in the op worker, self-hosted under `/tesseract/` |
| `pkijs`, `asn1js`, `bytestreamjs` | BSD-3-Clause | Digital signature: PKCS#12 and CMS, in the op worker only |
| `@noble/hashes`, `pvutils`, `pvtsutils` / `tslib` | MIT / 0BSD | Hashes and helpers under pkijs |
| Lucide (`lucide-static`) | ISC | The tool and family icons, copied into `ui/tool-icons.ts` by `scripts/gen-icons.mjs` |
| Space Grotesk | OFL | The site's one face, self-hosted |

## Design direction

The Layerbit family, made playful. The ground is near-black (`#0a0c10`) lit
from above; surfaces are frosted glass; the type is **Space Grotesk**, the
same face as layerbit.co.in and the Sheaf app. Colour is neon light with a
meaning: **each family owns one gradient** (Pages cyan→blue, Convert
coral→pink, Mark up violet→fuchsia, Protect lime→emerald, Read yellow→amber)
that colours its cards, its tools' drop zones, titles and main buttons, so
thirty-one tools read as five calm groups rather than a rainbow. Professional means restraint
everywhere else: one accent per screen, generous space, no decoration that
does not confirm something. Dark by default, matching Layerbit, with a light
theme one tap away (a sun/moon switch in every header) for offices and bright
rooms. Light is designed, not inverted: white glass on `#f6f7fb`, ink
`#0f172a`, muted `#475569`; each family keeps its neon for buttons, fills and
glows, and draws its titles, icons and edges in a deeper ink of the same hue
(`--deep-a`/`--deep-b` → `--ink-a`/`--ink-b`). Every colour is a token in
`tokens.css`; components never hard-code one, except the marks drawn on the
white paper of a document, which is white in both themes.

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
more. Nothing smaller than 24px is drawn in a gradient. The mark is one line: a
page whose top edge is a jester's cap, bells on its three points (the fool's
cap the paper carried), white on a cyan→violet tile; drawn inline in the
header, as the line alone in the way-home pill, and in `app/public/brand/`
for the favicon and install icons. The name sits beside it, large.

The icons are Lucide's, as on Layerbit: line drawings in the family's own
colour (`--icon-ink`, the middle of its gradient) on a faint tile of that
colour with a thin rim.
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
   self-hosted). All 27 live.
2d. ✅ The PDFelement gap, batch B: page background, page labels,
   attachments (in and out), a bookmarks editor, split at chapters, clean
   hidden data, restrict without a password, Bates numbering, replace pages,
   compress to a size, and print and read aloud in Read. 31 live.
2e. ✅ Converters: PDF to Word (scanned pages read with OCR), Excel,
   PowerPoint, EPUB or a web page; Word or Excel to PDF. Digital signature
   with the person's own .pfx. 37 live.
2f. ✅ The mark-up kit: underline, strike out, box, circle, arrow, line,
   measure, sticky notes (real comments), text boxes, stamps and links in
   Mark up; Add image; a comments list in Read. 38 live.
2g. ✅ Find and remove (Aadhaar, PAN, phone, email, card numbers, typed
   words) in Remove areas; Compare; Edit text with find and replace. 40
   live.
2h. ✅ The offline app (service worker, installable); Create a form, with
   blanks found for you; answers saved and loaded in Fill in a form;
   Summarise and translate with the browser's on-device AI only; Archive
   copy (PDF/A-2b); Rent receipts, the first template; the browser's spell
   checker on every box whose words go onto a page; Edit pictures (move,
   resize, take out, swap the pictures already on a page). 45 live: every
   free item on the PDFelement list. **You are here.**
3. The reader, deeper: re-rendering zoom, find, outline, night mode, resume.
4. Complex-script text drawn as real text (harfbuzzjs). Until then Add text
   puts Malayalam, Hindi and the like in as a picture of the words, shaped
   by the browser.
5. ✅ More OCR languages: twenty, each a model fetched from this site only
   when picked. Non-Latin words also come out as a .txt until the text
   layer gets a glyphless font.
6. The design pass, as a system.
7. SEO: one fast page per tool × intent, generated from `tools.ts`.
8. PWA: ✅ install and offline (`scripts/vite-sw.ts` writes `dist/sw.js`,
   precaching every page, script, font and `/pdfjs/**`; OCR models are kept on
   first use). Still to come: share target and file handler, and the offline
   e2e adding a non-embedded-font, a CJK-CMap and a JPX fixture.
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
- **2026-10-12** Domain bought: foolscap.co.in (`SITE_ORIGIN`). At the owner's
  word ("AdSense compatible, close every loop") ads are on: the home page and
  the guides only (`AD_PAGES`), Auto ads, loaded by `ui/ads.ts` after load
  and only on the real domain. Cloudflare joins a header two matching blocks
  set, so the CSP left `/*`: tool pages and every asset path get the strict
  policy, `/` and `/guides/*` an ad policy (https scripts, inline, eval;
  framing, plugins, forms and base still locked), and a rules test fails if
  any path the build writes has neither. The privacy page carries Google's
  required cookie disclosure. SEO: 40 guides and per-tool help as data,
  canonical, Open Graph image, structured data, sitemap, About, Terms,
  Contact, a real 404, a WhatsApp "Tell a friend" link in every footer; the
  GitHub Pages preview is noindex.
- **2026-10-13** Hosting is GitHub Pages with the domain pointed from GoDaddy,
  as for layerbit.co.in, at the owner's choice. The publish workflow finds the
  custom domain from the Pages settings, or else from `SITE_ORIGIN`, and
  builds for it (root base, CNAME — which on the gh-pages branch is what claims
  the domain);
  each page carries its policy as a meta tag from `_headers`. Cloudflare
  would add frame-ancestors and the workers' own policy, which only headers
  can carry; `_headers` stays so that move needs no code. The privacy page
  says "every tool page carries a policy", true on either host.
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
- **2026-10-13** At the owner's request: a professional vector mark (the
  capped page, one line) replaces the jester picture, and the tool icons are
  Lucide's, drawn in each family's colour on a faint tile, as on Layerbit.
  ISC added to the allowed licences for Lucide.
- **2026-10-13** A full test pass beyond the suite: 43 awkward real PDFs (the
  pdf.js corpus) through every tool in Node and the drawing tools in the
  browser; an axe-core audit of every page; the GitHub Pages base path end to
  end. Found and fixed: a catalog with no /Type (pdf-lib cannot find its
  pages; the surgeon now labels it and retries), the drop zone's nested
  button, the way-home pill outside a landmark, the reader's unfocusable
  scroller, and running a tool on a still-locked file. Page titles now lead
  with what people search ("Compress PDF online, free and private");
  sitemap.xml and the robots.txt pointer are generated once SITE_ORIGIN is set.
- **2026-10-12** Batch B of the PDFelement gap: 31 tools. Attachments is the
  one tool that takes any file (`InputKind 'pdf-and-files'`, FileKind
  `'other'`); everything it carries goes in and comes out byte for byte and
  is never opened. Read aloud uses only voices whose `localService` is true:
  a network voice would send the document's words to someone else's server,
  so where only those exist the button says so and does nothing. Print draws
  each page as a picture into a sheet only the printer sees, because handing
  the PDF to the browser's own viewer needs a blob URL outside the exporter.
  Restrict-only is labelled honestly as a request readers may ignore.
  Compress to a size tries photo strengths by binary search, then (only if
  ticked) pages as pictures, and always says which it did.
- **2026-10-12** Two helper branches merged: twenty OCR languages, each
  model fetched from this site only when picked; and certificate signatures
  (PKCS#12 opened in the browser, CMS `adbe.pkcs7.detached`, appended as an
  incremental update so an earlier signature stays valid). The Digital
  signature tool reads the .pfx in the page and sends it with the run's
  params, like a typed password: never into the workspace, never kept. It is
  a key, not a document, so rule 2a's "documents enter only through
  DocumentStore" is not bent. An expired certificate is refused with its
  date rather than producing a signature every reader marks invalid. 0BSD
  (tslib, already shipped through pdf-lib) is allowed as a BSD form.
- **2026-10-12** Converters. PDF to Word and Excel infer paragraphs,
  headings, lists and tables from where pdf.js says each word sits
  (`PdfView.layout`, `convert/text-layout.ts`); a scanned page is read with
  the OCR reader when asked. Word or Excel to PDF lays the document out with
  the PDF's own fonts so words stay selectable, and has the browser draw any
  line those fonts cannot (Malayalam, Hindi) as a picture rather than a box.
  The page no longer imports the ops at all: `ops/meta.ts` holds each tool's
  arity and worker flags, a unit test keeps it equal to the ops, and every
  pdf-lib and pkijs path goes through `PdfSurgeon`, so a tool page's first
  script stays under 60 KB and carries no PDF or crypto library.
- **2026-10-12** The mark-up kit. Notes and links are real annotations (a
  reader lists a note as a comment, in any script, and opens a link), never
  pictures of them; a link only ever opens https, http, mailto or tel.
  Everything else is drawn into the page, upright as the reader sees it on
  any /Rotate. Measure writes the length on real paper (points to mm). The
  editor keeps lines and pen strokes in its SVG layer (undo, not move) and
  every other mark as a box you can move and remove.
- **2026-10-12** Find and remove marks every match on the pages for a look
  before anything goes, and then goes through the same rasterising redaction
  as a hand-drawn area. Compare is a patience diff over words (unique words
  anchor it, so a moved paragraph does not mark everything after it) and
  marks the newer file: green for new words, a comment where words went.
  Edit text is honest about what it is: the old line is painted over in the
  page's own colour and the new one written in its place; the old words
  remain underneath, and the tool says so and points to Remove areas.
- **2026-10-12** The offline app. The service worker is generated from what
  the build wrote (so its version changes whenever a file does), precaches
  this site's own files only, serves pages network-first and everything else
  cache-first, and never touches another origin. It registers after load and
  not at all when the phone asks to save data. The e2e blocks service workers
  everywhere except `offline-app.spec.ts`, so the other tests still watch the
  real network. Forms: Create a form adds real AcroForm fields and can find
  the blanks (____, ☐) itself; Fill in a form saves answers as .json and
  reads .json or Acrobat .xfdf back. Summarise and translate uses Chrome's
  on-device Summarizer and Translator only, and says so where they are
  missing rather than reaching for an online AI.
- **2026-10-12** PDF/A: an sRGB ICC profile generated in code (no profile
  file, so no licence to carry), XMP mirroring the Info details, a file ID,
  printable annotations, scripts and attachments out. Fonts the file does not
  carry cannot be fixed without the font, so the result says so rather than
  claiming compliance. Templates are tools with `input: 'none'` and arity
  `none`: no drop zone, the run starts from what is typed. Rent receipts come
  first (HRA, every salaried person in India, every year); amounts in Indian
  words and lakh grouping, Rs. rather than ₹ so the words stay real text.
- **2026-10-12** Edit pictures reads the page's own drawing instructions
  (`pdf/content-stream.ts`: q/Q/cm and Do, stepping over strings, inline
  images and stray brackets) and finds each picture by where it is drawn,
  matched against what pdf.js reports, so the two never have to agree on a
  count. Taking out removes the draw call; moving wraps it in a matrix that
  takes the old box to the new one; swapping draws a new picture, kept to its
  own shape, in the old box. Nothing else in the page's drawing is touched.
- **2026-10-12** Edit text works cell by cell. pdf.js reports the gap
  between table columns as a blank item stretched across it; `layout()` now
  drops blank items, and `segmentsOf` cuts each line at column-sized gaps,
  so changing one amount in a statement row repaints that amount only.
  Figures keep their right edge (a text mark can be `align: 'right'`), find
  and replace matches whole words and numbers ("5,000.00" is not inside
  "15,000.00"), and the ink colour is read back from the blend small print
  makes with the paper, so a black amount is not rewritten in grey.
- **2026-10-14** Edit text, after a real purchase order and a scanned letter
  broke it. A table's cells are cut at the lines drawn between them
  (`page-cover.ts` reads upright lines from pdf.js's path data; `segmentsOf`
  splits at them and gives each cell its room), so a brand a few points from
  the description beside it is its own cell. A font's family comes from its
  real name first ("MicrosoftSansSerif" is sans). New words are written in the
  document's own font when it can draw every letter for certain
  (`surgeon-fonts.ts`: codes from its ToUnicode map or WinAnsi, widths from its
  own Widths or W; a subset only writes characters the page already shows in
  it), else in the nearest built-in one, and are squeezed to 85% then made
  smaller to stay inside the cell (`fit-line.ts`, shared by preview and
  writer). The patch over the old words stops at the cell's lines, and the
  paper colour is the one most of the line's box is. Scanned pages are
  editable: "Read the words on this page" sends a picture of the page to the
  op worker's OCR reader (the one message that carries pixels; the model is
  fetched on first use, so this needs the connection once), the printed column
  lines are found in the picture (and the "|" the reader makes of them
  dropped), bold is judged by ink, and a change repaints only the words that
  changed (`ui/scan-lines.ts`). A changed line cannot be dragged off the words
  it covers.
- **2026-10-14** Zoom wherever a page is worked on (`ui/zoom.ts`, one kit):
  − 100% + buttons (tap the size to fit again), two fingers to pinch and to
  move about, Ctrl or ⌘ with the wheel (a trackpad pinch), and + − 0 on the
  keyboard. The page editor (all eight drawing tools) zooms to 400% inside its
  own scrolling frame and draws the page again sharp once zooming stops,
  capped at 3200 pixels across for a phone's memory; everything placed is in
  fractions of the page, so a mark made zoomed lands where it was put. The
  pinch is read in the capture phase, and a second finger undoes whatever the
  first one started (a mark put down, a box moved). Read stretches its pages
  as the fingers move and redraws on release. Organise's − and + size the
  thumbnails (wheel only: two fingers there move pages). Scan shows a
  magnifier with cross hairs over the corner being dragged.
- **2026-10-17** A light theme, at the owner's request for office users. Dark
  stays the default and the brand, and is not overridden by the system's
  preference: most office machines say "light", and following them would
  quietly make light the default. A sun/moon switch (44px, `aria-pressed`,
  label "Light theme") sits in every header beside the nav, clear of the
  coffee pill at 360px. The choice is the word `light` or `dark` under
  `foolscap.theme` in localStorage (wrapped in try/catch): a preference, not
  anything a visitor typed, so promise 8 holds, and the privacy page says so.
  It is applied by `public/theme.js`, a plain blocking script in every
  `<head>` (inline is forbidden by the CSP; a module would run after first
  paint and flash dark), served under the strict policy; it also sets
  `color-scheme` and `theme-color`. `ui/theme.ts` is the switch and follows
  other tabs. Every hard-coded colour in components.css and content.css went
  into a token (`--wash`, `--field`, `--panel`, `--float`, `--soft`,
  `--code-*`, `--shadow-float` …) so light is designed rather than inverted.
  Neon on white cannot be read, so each family gained a deeper ink
  (`--deep-a/b`) that light uses for titles, crumbs, icons and edges; buttons
  keep the neon gradient with dark text. Document pages stay white paper;
  Read's night mode is unchanged. `tests/e2e/theme.spec.ts` measures contrast
  on real rendered pages in both themes.
