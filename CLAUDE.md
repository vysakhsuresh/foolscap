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

1. **Provable, not claimed.** Tool pages ship a Content-Security-Policy anyone
   can read, and they keep working with the network off.
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
5. No limits on file count, file size or number of jobs beyond what the
   visitor's own device can do — and when the device cannot, we say so.
6. Ads, if ever, on guide and landing pages only. Never on a tool page: the
   tool pages' CSP makes a third-party script impossible, which is the point.
7. Analytics, if ever, cookieless and on guide pages only. Never a file name,
   never a page count, never anything a visitor typed.

## Who we design for

Someone on a cheap Android phone with a salary slip, a lease, a bank
statement or a scanned ID card, who needs two pages merged tonight and would
rather not hand them to strangers. Also a desktop user at work who has been
told not to upload company documents. Every screen must work for both. If a
step is not essential, remove it.

## Hard technical constraints

- Static site: HTML, CSS, TypeScript, built with Vite. No server, no
  database, no backend, no serverless function. Ever.
- Hosting: Cloudflare Pages free plan. 20,000 files per site, 25 MiB per
  file. `app/public/_headers` carries the headers. A CI check keeps every
  built file under 25 MiB.
- Everything self-hosted: scripts, fonts, WASM, pdf.js cmaps. No CDN, no
  third-party request from a tool page.
- Target device: a low-end Android on mobile data. Test at 360px first.
- Browser floor: Chrome/Android of the last two years, Safari 16+, Firefox
  current. Feature-detect OPFS, `showSaveFilePicker`, share-with-files.
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

1. **The seam.** Nothing outside `app/src/pdf/` imports `pdfjs-dist` or
   `@cantoo/pdf-lib`. Widen the interface; never reach around it.
2. **The Exporter.** Only `app/src/files/exporter.ts` may call
   `showSaveFilePicker`, `showDirectoryPicker`, `createWritable`,
   `navigator.share`, or set a download attribute. Nobody may call
   `showOpenFilePicker` at all: the handle it returns can be written to,
   and that is the one way "we never touch your file" could break.
3. **The shape.** `Op.run(inputs: FoolscapFile[], params, ctx): Outcome[]`.
   Plural in, plural out. One failed input is a `failed` outcome, never a
   thrown error that loses the rest of the batch.
4. **The CSP.** Every `/tools/*` page is served with the policy in `_headers`
   and works after `context.setOffline(true)`. The e2e tests run against the
   built site under that exact policy.
5. **Size.** No built file over 25 MiB; the tool-page JS budget is stated in
   the README and checked.
6. **Licences.** Only Apache-2.0, MIT, BSD, OFL or public-domain code and
   fonts. **Never add MuPDF, PyMuPDF, iText or Ghostscript** — all AGPL, and
   Ghostscript is the one most likely to be reached for by accident.

| Library | Licence | Role |
|---|---|---|
| `pdfjs-dist` | Apache-2.0 | Reading and rasterising, behind `PdfEngine` |
| `@cantoo/pdf-lib` | MIT | Everything structural, and AES-256, behind `PdfSurgeon` |
| `fflate` | MIT | ZIP for "save all" |
| Bricolage Grotesque | OFL | Display face, self-hosted |

## Design direction

Playful and bright without being silly — the visitor is holding a bank
statement. The palette is paper, ink and highlighter: a warm paper ground, a
deep ink, one electric accent for shapes and states, and a strong action
colour for buttons. Big friendly type (Bricolage Grotesque for display,
system-ui for body so the body costs no bytes), chunky rounded shapes,
motion that confirms rather than decorates. Light and dark. Touch targets at
least 44px. Text contrast at least 4.5:1 — checked, not eyeballed. The mark
is a sheet of paper wearing a fool's cap: the etymology, drawn.

Copy is plain English in the Sheaf voice: short, confident, honest about
costs ("a redacted page becomes a picture"). Every button is a verb.

## Build order

1. ✅ Foundation: contracts, CSP, build. Merge, split, organise end to end,
   with the offline proof. **You are here.**
2. The dozen structural tools: extract, insert, crop, images↔PDF, n-up,
   split by size, extract images, document details, extract text.
3. The reader: re-rendering zoom, find, outline, night mode, resume.
4. Stamping: watermark, page numbers, header/footer, sign, mark up, add
   text, remove areas. Complex-script text needs shaping (harfbuzzjs).
5. The hard three: compress, passwords, OCR (tesseract.js, lazy-loaded).
6. The design pass, as a system.
7. SEO: one fast page per tool × intent, generated from `tools.ts`.
8. PWA: install, offline, share target, file handler.
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
- **2026-10-10** The tool-page CSP is `connect-src 'self' blob:`, not `'none'`:
  pdf.js must fetch its own worker, cmaps and fonts from our origin, and the
  built site has no server to talk to anyway. The offline test is the proof
  that nothing needs the network once the page has loaded.
