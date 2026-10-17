/*
 * Foolscap's service worker, written by scripts/vite-sw.ts at build time.
 * It keeps this site's own files so every tool works with no connection.
 * It never fetches anything from anywhere else.
 *
 * The one document it ever touches is one shared to Foolscap from another
 * app ("Share → Foolscap" on a phone): the share arrives as a post to
 * /open/, which is answered here and never reaches the network. The files
 * are held in memory only until the Open a file page asks for them, then
 * let go. They are never cached or stored.
 */
const VERSION = '14f48eb45bfb596b';
const BASE = '/';
const PRECACHE = ["","404.html","about/","assets/ai-panel-CgIwKg0V.js","assets/article-D8U-2sto.js","assets/bookmarks-panel-D8NiUinH.js","assets/dom-jzCrYAI9.js","assets/engine-BHs6K6dM.js","assets/engine-worker-U3PIsUyj.js","assets/flow-fQ_mnNCR.css","assets/form-panel-BK0Mi3_m.js","assets/home-CNJoGLzT.js","assets/jumps-BTgRYYZv.js","assets/ocr-DPzqrZHh.js","assets/op.worker-CHyUJb9f.js","assets/open-Txk6_A4B.js","assets/page-cover-CyRQINmH.js","assets/page-editor-3hVqyGms.js","assets/pdfjs-worker-D0Qz5bzv.js","assets/preload-helper-CRHRuCJH.js","assets/private-QbqP8vog.js","assets/reader-DEoKKKcm.js","assets/scan-panel-BNYwNWrJ.js","assets/shell-BKKF26o8.js","assets/shell-DqGAnoGX.css","assets/storage.worker-BuFLdDFI.js","assets/tool-CXKAxbAI.js","brand/apple-touch-icon.png","brand/favicon-48.png","brand/icon-192.png","brand/icon-512.png","brand/mark-line.svg","brand/mark.svg","brand/og.png","contact/","favicon.ico","favicon.svg","fonts/OFL-space-grotesk.txt","fonts/space-grotesk-latin-ext.woff2","fonts/space-grotesk-latin.woff2","guides/","guides/aadhaar-front-and-back-on-one-page/","guides/aadhaar-pdf-password/","guides/add-page-numbers-to-pdf/","guides/add-watermark-to-pdf/","guides/bank-statement-pdf-to-excel/","guides/compare-two-pdfs/","guides/compress-pdf-to-100kb/","guides/compress-pdf-to-1mb/","guides/compress-pdf-to-200kb/","guides/compress-pdf-to-500kb/","guides/compress-pdf-to-50kb/","guides/convert-pdf-to-pdf-a/","guides/delete-pages-from-pdf/","guides/digital-signature-pdf-dsc/","guides/edit-text-in-pdf/","guides/extract-images-from-pdf/","guides/extract-pages-from-pdf/","guides/fill-pdf-form/","guides/hide-aadhaar-number-in-pdf/","guides/hra-rent-receipt-generator/","guides/is-it-safe-to-upload-pdf-online/","guides/jpg-to-pdf/","guides/make-pdf-fillable/","guides/make-scanned-pdf-searchable/","guides/merge-pdf-files/","guides/password-protect-pdf/","guides/pdf-to-epub/","guides/pdf-to-jpg/","guides/pdf-to-word/","guides/pdf-tools-that-work-offline/","guides/photo-to-pdf-on-phone/","guides/redact-pdf/","guides/reduce-pdf-size-for-email/","guides/remove-password-from-bank-statement-pdf/","guides/remove-pdf-metadata/","guides/rotate-pdf-pages/","guides/scan-document-to-pdf-with-phone/","guides/sign-pdf-online-free/","guides/split-pdf/","guides/word-to-pdf/","manifest.webmanifest","open/","pdfjs/6.4.299/cmaps/78-EUC-H.bcmap","pdfjs/6.4.299/cmaps/78-EUC-V.bcmap","pdfjs/6.4.299/cmaps/78-H.bcmap","pdfjs/6.4.299/cmaps/78-RKSJ-H.bcmap","pdfjs/6.4.299/cmaps/78-RKSJ-V.bcmap","pdfjs/6.4.299/cmaps/78-V.bcmap","pdfjs/6.4.299/cmaps/78ms-RKSJ-H.bcmap","pdfjs/6.4.299/cmaps/78ms-RKSJ-V.bcmap","pdfjs/6.4.299/cmaps/83pv-RKSJ-H.bcmap","pdfjs/6.4.299/cmaps/90ms-RKSJ-H.bcmap","pdfjs/6.4.299/cmaps/90ms-RKSJ-V.bcmap","pdfjs/6.4.299/cmaps/90msp-RKSJ-H.bcmap","pdfjs/6.4.299/cmaps/90msp-RKSJ-V.bcmap","pdfjs/6.4.299/cmaps/90pv-RKSJ-H.bcmap","pdfjs/6.4.299/cmaps/90pv-RKSJ-V.bcmap","pdfjs/6.4.299/cmaps/Add-H.bcmap","pdfjs/6.4.299/cmaps/Add-RKSJ-H.bcmap","pdfjs/6.4.299/cmaps/Add-RKSJ-V.bcmap","pdfjs/6.4.299/cmaps/Add-V.bcmap","pdfjs/6.4.299/cmaps/Adobe-CNS1-0.bcmap","pdfjs/6.4.299/cmaps/Adobe-CNS1-1.bcmap","pdfjs/6.4.299/cmaps/Adobe-CNS1-2.bcmap","pdfjs/6.4.299/cmaps/Adobe-CNS1-3.bcmap","pdfjs/6.4.299/cmaps/Adobe-CNS1-4.bcmap","pdfjs/6.4.299/cmaps/Adobe-CNS1-5.bcmap","pdfjs/6.4.299/cmaps/Adobe-CNS1-6.bcmap","pdfjs/6.4.299/cmaps/Adobe-CNS1-UCS2.bcmap","pdfjs/6.4.299/cmaps/Adobe-GB1-0.bcmap","pdfjs/6.4.299/cmaps/Adobe-GB1-1.bcmap","pdfjs/6.4.299/cmaps/Adobe-GB1-2.bcmap","pdfjs/6.4.299/cmaps/Adobe-GB1-3.bcmap","pdfjs/6.4.299/cmaps/Adobe-GB1-4.bcmap","pdfjs/6.4.299/cmaps/Adobe-GB1-5.bcmap","pdfjs/6.4.299/cmaps/Adobe-GB1-UCS2.bcmap","pdfjs/6.4.299/cmaps/Adobe-Japan1-0.bcmap","pdfjs/6.4.299/cmaps/Adobe-Japan1-1.bcmap","pdfjs/6.4.299/cmaps/Adobe-Japan1-2.bcmap","pdfjs/6.4.299/cmaps/Adobe-Japan1-3.bcmap","pdfjs/6.4.299/cmaps/Adobe-Japan1-4.bcmap","pdfjs/6.4.299/cmaps/Adobe-Japan1-5.bcmap","pdfjs/6.4.299/cmaps/Adobe-Japan1-6.bcmap","pdfjs/6.4.299/cmaps/Adobe-Japan1-UCS2.bcmap","pdfjs/6.4.299/cmaps/Adobe-Korea1-0.bcmap","pdfjs/6.4.299/cmaps/Adobe-Korea1-1.bcmap","pdfjs/6.4.299/cmaps/Adobe-Korea1-2.bcmap","pdfjs/6.4.299/cmaps/Adobe-Korea1-UCS2.bcmap","pdfjs/6.4.299/cmaps/B5-H.bcmap","pdfjs/6.4.299/cmaps/B5-V.bcmap","pdfjs/6.4.299/cmaps/B5pc-H.bcmap","pdfjs/6.4.299/cmaps/B5pc-V.bcmap","pdfjs/6.4.299/cmaps/CNS-EUC-H.bcmap","pdfjs/6.4.299/cmaps/CNS-EUC-V.bcmap","pdfjs/6.4.299/cmaps/CNS1-H.bcmap","pdfjs/6.4.299/cmaps/CNS1-V.bcmap","pdfjs/6.4.299/cmaps/CNS2-H.bcmap","pdfjs/6.4.299/cmaps/CNS2-V.bcmap","pdfjs/6.4.299/cmaps/ETHK-B5-H.bcmap","pdfjs/6.4.299/cmaps/ETHK-B5-V.bcmap","pdfjs/6.4.299/cmaps/ETen-B5-H.bcmap","pdfjs/6.4.299/cmaps/ETen-B5-V.bcmap","pdfjs/6.4.299/cmaps/ETenms-B5-H.bcmap","pdfjs/6.4.299/cmaps/ETenms-B5-V.bcmap","pdfjs/6.4.299/cmaps/EUC-H.bcmap","pdfjs/6.4.299/cmaps/EUC-V.bcmap","pdfjs/6.4.299/cmaps/Ext-H.bcmap","pdfjs/6.4.299/cmaps/Ext-RKSJ-H.bcmap","pdfjs/6.4.299/cmaps/Ext-RKSJ-V.bcmap","pdfjs/6.4.299/cmaps/Ext-V.bcmap","pdfjs/6.4.299/cmaps/GB-EUC-H.bcmap","pdfjs/6.4.299/cmaps/GB-EUC-V.bcmap","pdfjs/6.4.299/cmaps/GB-H.bcmap","pdfjs/6.4.299/cmaps/GB-V.bcmap","pdfjs/6.4.299/cmaps/GBK-EUC-H.bcmap","pdfjs/6.4.299/cmaps/GBK-EUC-V.bcmap","pdfjs/6.4.299/cmaps/GBK2K-H.bcmap","pdfjs/6.4.299/cmaps/GBK2K-V.bcmap","pdfjs/6.4.299/cmaps/GBKp-EUC-H.bcmap","pdfjs/6.4.299/cmaps/GBKp-EUC-V.bcmap","pdfjs/6.4.299/cmaps/GBT-EUC-H.bcmap","pdfjs/6.4.299/cmaps/GBT-EUC-V.bcmap","pdfjs/6.4.299/cmaps/GBT-H.bcmap","pdfjs/6.4.299/cmaps/GBT-V.bcmap","pdfjs/6.4.299/cmaps/GBTpc-EUC-H.bcmap","pdfjs/6.4.299/cmaps/GBTpc-EUC-V.bcmap","pdfjs/6.4.299/cmaps/GBpc-EUC-H.bcmap","pdfjs/6.4.299/cmaps/GBpc-EUC-V.bcmap","pdfjs/6.4.299/cmaps/H.bcmap","pdfjs/6.4.299/cmaps/HKdla-B5-H.bcmap","pdfjs/6.4.299/cmaps/HKdla-B5-V.bcmap","pdfjs/6.4.299/cmaps/HKdlb-B5-H.bcmap","pdfjs/6.4.299/cmaps/HKdlb-B5-V.bcmap","pdfjs/6.4.299/cmaps/HKgccs-B5-H.bcmap","pdfjs/6.4.299/cmaps/HKgccs-B5-V.bcmap","pdfjs/6.4.299/cmaps/HKm314-B5-H.bcmap","pdfjs/6.4.299/cmaps/HKm314-B5-V.bcmap","pdfjs/6.4.299/cmaps/HKm471-B5-H.bcmap","pdfjs/6.4.299/cmaps/HKm471-B5-V.bcmap","pdfjs/6.4.299/cmaps/HKscs-B5-H.bcmap","pdfjs/6.4.299/cmaps/HKscs-B5-V.bcmap","pdfjs/6.4.299/cmaps/Hankaku.bcmap","pdfjs/6.4.299/cmaps/Hiragana.bcmap","pdfjs/6.4.299/cmaps/KSC-EUC-H.bcmap","pdfjs/6.4.299/cmaps/KSC-EUC-V.bcmap","pdfjs/6.4.299/cmaps/KSC-H.bcmap","pdfjs/6.4.299/cmaps/KSC-Johab-H.bcmap","pdfjs/6.4.299/cmaps/KSC-Johab-V.bcmap","pdfjs/6.4.299/cmaps/KSC-V.bcmap","pdfjs/6.4.299/cmaps/KSCms-UHC-H.bcmap","pdfjs/6.4.299/cmaps/KSCms-UHC-HW-H.bcmap","pdfjs/6.4.299/cmaps/KSCms-UHC-HW-V.bcmap","pdfjs/6.4.299/cmaps/KSCms-UHC-V.bcmap","pdfjs/6.4.299/cmaps/KSCpc-EUC-H.bcmap","pdfjs/6.4.299/cmaps/KSCpc-EUC-V.bcmap","pdfjs/6.4.299/cmaps/Katakana.bcmap","pdfjs/6.4.299/cmaps/LICENSE","pdfjs/6.4.299/cmaps/NWP-H.bcmap","pdfjs/6.4.299/cmaps/NWP-V.bcmap","pdfjs/6.4.299/cmaps/RKSJ-H.bcmap","pdfjs/6.4.299/cmaps/RKSJ-V.bcmap","pdfjs/6.4.299/cmaps/Roman.bcmap","pdfjs/6.4.299/cmaps/UniCNS-UCS2-H.bcmap","pdfjs/6.4.299/cmaps/UniCNS-UCS2-V.bcmap","pdfjs/6.4.299/cmaps/UniCNS-UTF16-H.bcmap","pdfjs/6.4.299/cmaps/UniCNS-UTF16-V.bcmap","pdfjs/6.4.299/cmaps/UniCNS-UTF32-H.bcmap","pdfjs/6.4.299/cmaps/UniCNS-UTF32-V.bcmap","pdfjs/6.4.299/cmaps/UniCNS-UTF8-H.bcmap","pdfjs/6.4.299/cmaps/UniCNS-UTF8-V.bcmap","pdfjs/6.4.299/cmaps/UniGB-UCS2-H.bcmap","pdfjs/6.4.299/cmaps/UniGB-UCS2-V.bcmap","pdfjs/6.4.299/cmaps/UniGB-UTF16-H.bcmap","pdfjs/6.4.299/cmaps/UniGB-UTF16-V.bcmap","pdfjs/6.4.299/cmaps/UniGB-UTF32-H.bcmap","pdfjs/6.4.299/cmaps/UniGB-UTF32-V.bcmap","pdfjs/6.4.299/cmaps/UniGB-UTF8-H.bcmap","pdfjs/6.4.299/cmaps/UniGB-UTF8-V.bcmap","pdfjs/6.4.299/cmaps/UniJIS-UCS2-H.bcmap","pdfjs/6.4.299/cmaps/UniJIS-UCS2-HW-H.bcmap","pdfjs/6.4.299/cmaps/UniJIS-UCS2-HW-V.bcmap","pdfjs/6.4.299/cmaps/UniJIS-UCS2-V.bcmap","pdfjs/6.4.299/cmaps/UniJIS-UTF16-H.bcmap","pdfjs/6.4.299/cmaps/UniJIS-UTF16-V.bcmap","pdfjs/6.4.299/cmaps/UniJIS-UTF32-H.bcmap","pdfjs/6.4.299/cmaps/UniJIS-UTF32-V.bcmap","pdfjs/6.4.299/cmaps/UniJIS-UTF8-H.bcmap","pdfjs/6.4.299/cmaps/UniJIS-UTF8-V.bcmap","pdfjs/6.4.299/cmaps/UniJIS2004-UTF16-H.bcmap","pdfjs/6.4.299/cmaps/UniJIS2004-UTF16-V.bcmap","pdfjs/6.4.299/cmaps/UniJIS2004-UTF32-H.bcmap","pdfjs/6.4.299/cmaps/UniJIS2004-UTF32-V.bcmap","pdfjs/6.4.299/cmaps/UniJIS2004-UTF8-H.bcmap","pdfjs/6.4.299/cmaps/UniJIS2004-UTF8-V.bcmap","pdfjs/6.4.299/cmaps/UniJISPro-UCS2-HW-V.bcmap","pdfjs/6.4.299/cmaps/UniJISPro-UCS2-V.bcmap","pdfjs/6.4.299/cmaps/UniJISPro-UTF8-V.bcmap","pdfjs/6.4.299/cmaps/UniJISX0213-UTF32-H.bcmap","pdfjs/6.4.299/cmaps/UniJISX0213-UTF32-V.bcmap","pdfjs/6.4.299/cmaps/UniJISX02132004-UTF32-H.bcmap","pdfjs/6.4.299/cmaps/UniJISX02132004-UTF32-V.bcmap","pdfjs/6.4.299/cmaps/UniKS-UCS2-H.bcmap","pdfjs/6.4.299/cmaps/UniKS-UCS2-V.bcmap","pdfjs/6.4.299/cmaps/UniKS-UTF16-H.bcmap","pdfjs/6.4.299/cmaps/UniKS-UTF16-V.bcmap","pdfjs/6.4.299/cmaps/UniKS-UTF32-H.bcmap","pdfjs/6.4.299/cmaps/UniKS-UTF32-V.bcmap","pdfjs/6.4.299/cmaps/UniKS-UTF8-H.bcmap","pdfjs/6.4.299/cmaps/UniKS-UTF8-V.bcmap","pdfjs/6.4.299/cmaps/V.bcmap","pdfjs/6.4.299/cmaps/WP-Symbol.bcmap","pdfjs/6.4.299/iccs/CGATS001Compat-v2-micro.icc","pdfjs/6.4.299/iccs/LICENSE","pdfjs/6.4.299/standard_fonts/FoxitDingbats.pfb","pdfjs/6.4.299/standard_fonts/FoxitFixed.pfb","pdfjs/6.4.299/standard_fonts/FoxitFixedBold.pfb","pdfjs/6.4.299/standard_fonts/FoxitFixedBoldItalic.pfb","pdfjs/6.4.299/standard_fonts/FoxitFixedItalic.pfb","pdfjs/6.4.299/standard_fonts/FoxitSerif.pfb","pdfjs/6.4.299/standard_fonts/FoxitSerifBold.pfb","pdfjs/6.4.299/standard_fonts/FoxitSerifBoldItalic.pfb","pdfjs/6.4.299/standard_fonts/FoxitSerifItalic.pfb","pdfjs/6.4.299/standard_fonts/FoxitSymbol.pfb","pdfjs/6.4.299/standard_fonts/LICENSE_FOXIT","pdfjs/6.4.299/standard_fonts/LICENSE_LIBERATION","pdfjs/6.4.299/standard_fonts/LiberationSans-Bold.ttf","pdfjs/6.4.299/standard_fonts/LiberationSans-BoldItalic.ttf","pdfjs/6.4.299/standard_fonts/LiberationSans-Italic.ttf","pdfjs/6.4.299/standard_fonts/LiberationSans-Regular.ttf","pdfjs/6.4.299/wasm/LICENSE_JBIG2","pdfjs/6.4.299/wasm/LICENSE_OPENJPEG","pdfjs/6.4.299/wasm/LICENSE_PDFJS_JBIG2","pdfjs/6.4.299/wasm/LICENSE_PDFJS_OPENJPEG","pdfjs/6.4.299/wasm/LICENSE_PDFJS_QCMS","pdfjs/6.4.299/wasm/LICENSE_QCMS","pdfjs/6.4.299/wasm/jbig2.wasm","pdfjs/6.4.299/wasm/jbig2_nowasm_fallback.js","pdfjs/6.4.299/wasm/openjpeg.wasm","pdfjs/6.4.299/wasm/openjpeg_nowasm_fallback.js","pdfjs/6.4.299/wasm/qcms_bg.wasm","private/","terms/","theme.js","tools/add-image/","tools/add-password/","tools/add-text/","tools/attachments/","tools/background/","tools/bookmarks/","tools/compare/","tools/compress/","tools/create-form/","tools/crop/","tools/digital-sign/","tools/document-details/","tools/edit-images/","tools/edit-text/","tools/extract-images/","tools/extract-pages/","tools/extract-text/","tools/fill-form/","tools/header-footer/","tools/images-to-pdf/","tools/insert-pages/","tools/mark-up/","tools/merge/","tools/n-up/","tools/ocr/","tools/office-to-pdf/","tools/organise/","tools/page-labels/","tools/page-numbers/","tools/pdf-a/","tools/pdf-to-epub/","tools/pdf-to-excel/","tools/pdf-to-images/","tools/pdf-to-powerpoint/","tools/pdf-to-word/","tools/read/","tools/remove-areas/","tools/remove-password/","tools/rent-receipts/","tools/scan/","tools/sign/","tools/split-by-size/","tools/split/","tools/summarise/","tools/watermark/"];
const CORE = `foolscap-core-${VERSION}`;
/** OCR models and anything else of ours fetched later, kept after first use. */
const KEPT = 'foolscap-kept';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CORE)
      .then((cache) => cache.addAll(PRECACHE.map((path) => BASE + path)))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('foolscap-core-') && key !== CORE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

/** Files shared to Foolscap, waiting for the Open a file page. */
let shared = [];

self.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== 'foolscap:shared?' || !event.source) return;
  event.source.postMessage({ type: 'foolscap:shared', files: shared });
  shared = [];
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;
  if (request.method === 'POST' && url.pathname === `${BASE}open/`) {
    // "Share → Foolscap": take the files, then show the page that will ask for them.
    event.respondWith(
      request
        .formData()
        .then((data) => {
          shared = data.getAll('files').filter((file) => file instanceof File);
        })
        .catch(() => {
          shared = [];
        })
        .then(() => Response.redirect(`${BASE}open/?shared`, 303)),
    );
    return;
  }
  if (request.method !== 'GET') return;

  if (request.mode === 'navigate') {
    // Pages: the newest when online, the kept copy when not.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CORE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request, { ignoreSearch: true }).then((hit) => hit || caches.match(BASE))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((response) => {
          // Whole, ordinary responses only: a partial one would be wrong the next time.
          if (response.ok && response.status === 200 && response.type === 'basic') {
            const copy = response.clone();
            caches.open(KEPT).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
