import type { ToolId } from '../ops/tools';

/**
 * How-to pages for the things people actually search for. Plain text only;
 * inside any string, `[words](/tools/<id>/)` or `[words](/guides/<slug>/)`
 * makes an internal link (no other links). Generated into /guides/<slug>/ by
 * scripts/gen-pages.ts.
 */
export interface Guide {
  /** Lower-case, hyphenated, the search phrase itself: 'compress-pdf-to-100kb'. */
  readonly slug: string;
  /** The <title>: leads with the search phrase, at most 60 characters, ends with nothing (the generator adds no suffix). */
  readonly title: string;
  /** The page heading, a question or plain statement. */
  readonly h1: string;
  /** Meta description: 120–158 characters, says what the page gets you, mentions free/no upload where natural. */
  readonly description: string;
  /** The tool the page sends people to. Must be a live tool id. */
  readonly tool: ToolId;
  /** Two to four other live tools worth a link. */
  readonly related: readonly ToolId[];
  /** One or two sentences answering the query straight away. */
  readonly intro: string;
  /** Three to six steps, each one sentence, starting with a verb. Used for HowTo structured data. */
  readonly steps: readonly string[];
  /** Two to four short sections of real help (why it happens, what to watch for, a tip). */
  readonly sections: ReadonlyArray<{ readonly heading: string; readonly paragraphs: readonly string[] }>;
  /** Three to five questions people really ask, with short true answers. Used for FAQPage structured data. */
  readonly faq: ReadonlyArray<{ readonly q: string; readonly a: string }>;
}

export const GUIDES: readonly Guide[] = [
  // ---- Compress to a size: the upload-form limits ----
  {
    slug: 'compress-pdf-to-100kb',
    title: 'Compress PDF to 100 KB, free and without uploading',
    h1: 'How to compress a PDF to under 100 KB',
    description: 'Get a PDF under 100 KB for an exam, job or government portal. Free, no sign-up, and the file is made smaller on your own device, never uploaded.',
    tool: 'compress',
    related: ['extract-pages', 'scan', 'pdf-to-images'],
    intro: 'Open Compress, choose To a size, pick 100 KB and press Compress it. The file is made smaller in your browser, so it never leaves your phone or computer.',
    steps: [
      'Open the Compress tool and add your PDF.',
      'Choose To a size under How to squeeze.',
      'Pick 100 KB.',
      'Press Compress it and read the line under the result, which gives the new size.',
      'Save the file, or tap Share to send it to another app.',
    ],
    sections: [
      {
        heading: 'Why portals ask for 100 KB',
        paragraphs: [
          'Exam, job and scholarship portals keep each upload small so that lakhs of applications fit on their servers and open quickly for the people checking them. A photo of one page straight from a phone camera can be 2 or 3 MB, so a scanned certificate is usually far over the limit before you start.',
        ],
      },
      {
        heading: 'What gets smaller, and what does not',
        paragraphs: [
          'Compress shrinks the photos inside the PDF, trying the gentlest setting first and stopping at the first one that fits under 100 KB. Typed text and lines are never touched, so they stay crisp. The result says how sharp the photos still are.',
          'If photos alone cannot get the file under 100 KB, the result says so. Tick Let pages become pictures and run it again: each page is redrawn as one picture, as sharp as the limit allows. It looks the same, but the words can no longer be selected, which an upload portal does not care about.',
        ],
      },
      {
        heading: 'When 100 KB is still too small',
        paragraphs: [
          'A long document may not fit in 100 KB and stay readable. Upload only the pages the portal asks for: [Extract pages](/tools/extract-pages/) makes a file with just those. If you are photographing a certificate, [Scan](/tools/scan/) in Black and white gives a far smaller file to begin with than a colour photo.',
          'We count 1 KB as 1,000 bytes. A file made under 100 KB here is also under 100 KB on a portal that counts 1 KB as 1,024 bytes.',
        ],
      },
    ],
    faq: [
      { q: 'Will my document still be readable?', a: 'For most certificates and forms, yes. Compress picks the gentlest setting that fits. If 100 KB is too small for the file to stay readable, it gives you the smallest version that still reads and tells you so.' },
      { q: 'Is my file uploaded anywhere?', a: 'No. The work happens in your browser, on your device. Nothing is sent to us or anyone else, and the tool keeps working with the internet switched off.' },
      { q: 'Can I compress several PDFs at once?', a: 'Yes. Add them all and each comes back under 100 KB. Save all saves them together, as a folder or one ZIP.' },
      { q: 'The portal wants a JPG, not a PDF. Will this help?', a: 'Not directly; Compress makes PDFs smaller. To turn a page into a picture, use [PDF to images](/tools/pdf-to-images/) with JPEG at Screen sharpness, which gives the smallest image.' },
    ],
  },
  {
    slug: 'compress-pdf-to-200kb',
    title: 'Compress PDF to 200 KB online, free and private',
    h1: 'How to get a PDF under 200 KB',
    description: 'Make a PDF smaller than 200 KB for an application form in a few taps. Free, no sign-up, no watermark, and your file is never uploaded to a server.',
    tool: 'compress',
    related: ['merge', 'scan', 'extract-pages'],
    intro: '200 KB is the size Compress offers first. Open it, choose To a size, keep 200 KB selected and press Compress it.',
    steps: [
      'Open Compress and add the PDF, or several.',
      'Choose To a size.',
      'Leave 200 KB selected.',
      'Press Compress it.',
      'Check the new size in the result line, then save or share the file.',
    ],
    sections: [
      {
        heading: 'Several documents in one upload',
        paragraphs: [
          'Some forms take a single file for all your certificates. Put them together with [Merge](/tools/merge/) first, in the order the form lists them, then compress the merged file to 200 KB. Compressing each one first and merging afterwards usually gives a bigger file, because the limit was spent on each piece.',
        ],
      },
      {
        heading: 'Keep the original',
        paragraphs: [
          'Compress always makes a new file and never changes the one you picked. Keep the original somewhere safe: a 200 KB copy is right for a portal, but not for printing or for a later form that allows more.',
          'If the photos come out softer than you would like, try again at [500 KB](/guides/compress-pdf-to-500kb/) if the form allows it, or cut the file down to the pages it needs with [Extract pages](/tools/extract-pages/).',
        ],
      },
      {
        heading: 'Start small',
        paragraphs: [
          'The size of a scanned PDF comes almost entirely from its photos. A page made with [Scan](/tools/scan/) in Grey or Black and white starts much smaller than a colour photo, so it needs less squeezing and stays sharper at 200 KB.',
        ],
      },
    ],
    faq: [
      { q: 'Why does my PDF come out at, say, 180 KB and not exactly 200?', a: 'Compress stops at the gentlest setting that fits under the limit, so the result is usually a little under it. That is the sharpest version that fits.' },
      { q: 'What if it cannot reach 200 KB?', a: 'The result says so and gives you the smallest file it could make with the text kept as text. Tick Let pages become pictures to go further.' },
      { q: 'Is there a limit on file size or how many I do?', a: 'No. There is no server, so there is nothing to limit. Your own device does the work.' },
    ],
  },
  {
    slug: 'compress-pdf-to-50kb',
    title: 'Compress PDF to 50 KB: free, on your own device',
    h1: 'How to compress a PDF to 50 KB',
    description: 'Shrink a PDF to under 50 KB for strict upload forms. Type any size you need, free and with no sign-up. The file is never uploaded anywhere.',
    tool: 'compress',
    related: ['scan', 'extract-pages', 'split'],
    intro: '50 KB is not one of the ready-made sizes, so choose Other and type 50. Compress then finds the sharpest version of your PDF that fits.',
    steps: [
      'Open Compress and add your PDF.',
      'Choose To a size, then Other.',
      'Type 50 in Size in KB.',
      'Tick Let pages become pictures if the PDF is a scan of more than one page.',
      'Press Compress it, then save the result.',
    ],
    sections: [
      {
        heading: 'How much fits in 50 KB',
        paragraphs: [
          'Fifty kilobytes is very little. One clear page of a certificate or ID usually fits, especially in black and white. Three or four scanned pages often do not, unless each page is turned into a fairly soft picture. Compress tells you what it did, and if 50 KB is too small for the file to stay readable it says that instead of handing you an unreadable page.',
        ],
      },
      {
        heading: 'Ways to make it fit',
        paragraphs: [
          'Send only what is asked for. If the form wants the first page of a marksheet, keep that page alone with [Extract pages](/tools/extract-pages/), or break the file into single pages with [Split](/tools/split/).',
          'Photograph it again with [Scan](/tools/scan/) and choose Black and white. Shadows go, the paper turns white and the file is a fraction of the size of a colour photo, which leaves more of the 50 KB for sharpness.',
        ],
      },
      {
        heading: 'Any size you need',
        paragraphs: [
          'Other takes any size from 10 KB up, so the same steps work for 20 KB, 30 KB or 300 KB. For the common limits there are guides for [100 KB](/guides/compress-pdf-to-100kb/) and [200 KB](/guides/compress-pdf-to-200kb/).',
        ],
      },
    ],
    faq: [
      { q: 'What is the smallest size I can ask for?', a: '10 KB. Below that, a page cannot hold enough detail to be read.' },
      { q: 'Will the words still be selectable?', a: 'Only if photo shrinking alone was enough. If pages had to become pictures to fit, the result says so and the words are part of the picture.' },
      { q: 'Does the tool add a watermark or a logo?', a: 'No. Nothing is added to your document, ever.' },
    ],
  },
  {
    slug: 'compress-pdf-to-500kb',
    title: 'Compress PDF to 500 KB without losing quality',
    h1: 'How to get a PDF under 500 KB and keep it sharp',
    description: 'Reduce a PDF to under 500 KB with photos still sharp and text untouched. Free, no sign-up, no watermark, done in your browser with no upload.',
    tool: 'compress',
    related: ['merge', 'split-by-size', 'images-to-pdf'],
    intro: 'Open Compress, choose To a size and pick 500 KB. At this size most documents keep sharp photos, and the text is never touched.',
    steps: [
      'Open Compress and add the PDF.',
      'Choose To a size.',
      'Pick 500 KB.',
      'Press Compress it and check the result line, which says how sharp the photos are.',
      'Save the file or share it.',
    ],
    sections: [
      {
        heading: 'A comfortable limit',
        paragraphs: [
          '500 KB is room enough for several scanned pages, a set of certificates merged into one, or a photo-heavy brochure. Compress starts with the gentlest photo setting and stops as soon as the file fits, so at 500 KB the result often reads photos still sharp.',
        ],
      },
      {
        heading: 'Making one file from several',
        paragraphs: [
          'If your documents are photos, [Images to PDF](/tools/images-to-pdf/) makes them one PDF, one picture per page. If they are already PDFs, [Merge](/tools/merge/) joins them. Then compress the single file to 500 KB.',
        ],
      },
      {
        heading: 'When you need a sharper copy, or a smaller one',
        paragraphs: [
          'For printing, use the original or the Light setting, which keeps photos print-sharp. For a stricter form, see [compressing to 200 KB](/guides/compress-pdf-to-200kb/). If the limit is per file and you may upload several, [Split by size](/tools/split-by-size/) cuts a big PDF into parts that each fit a limit in MB.',
        ],
      },
    ],
    faq: [
      { q: 'Does compressing change my text?', a: 'No. Text and drawings are never touched. Only photos are made lighter, unless you tick Let pages become pictures.' },
      { q: 'My file is already under 500 KB. What happens?', a: 'Nothing is changed. The result says the file is already under 500 KB.' },
      { q: 'Do I need to install anything?', a: 'No. It runs in the browser you already have, on a phone or a computer.' },
      { q: 'Is my file uploaded to be compressed?', a: 'No. It is made smaller in your browser, on your device, and nothing is sent anywhere.' },
    ],
  },
  {
    slug: 'compress-pdf-to-1mb',
    title: 'Compress PDF to 1 MB, free with no upload',
    h1: 'How to reduce a PDF to under 1 MB',
    description: 'Bring a big PDF under 1 MB for a portal or an email, with text left crisp. Free, no sign-up, no limits, and your file is never sent to a server.',
    tool: 'compress',
    related: ['split-by-size', 'extract-pages', 'merge'],
    intro: 'Open Compress, choose To a size and pick 1 MB. It shrinks the photos inside as gently as it can and stops as soon as the file is under 1 MB.',
    steps: [
      'Open Compress and add your PDF.',
      'Choose To a size.',
      'Pick 1 MB.',
      'Press Compress it.',
      'Save the new file, which is named with the size it is under.',
    ],
    sections: [
      {
        heading: 'Where a 1 MB limit comes from',
        paragraphs: [
          'Many government, university and job portals allow 1 MB or 2 MB per document. A scanned file of ten pages from a phone can easily be 10 MB or more, because each page is a full-size photo. Shrinking the photos is usually enough to reach 1 MB without the pages looking any different on screen.',
        ],
      },
      {
        heading: 'If the limit is 2 MB or more',
        paragraphs: [
          'Choose Other and type the size in KB: 2000 for 2 MB, 5000 for 5 MB. We count 1 MB as 1,000 KB, so a file made under 2000 KB is under 2 MB however the portal counts.',
        ],
      },
      {
        heading: 'When one file will never fit',
        paragraphs: [
          'A long scanned book may not fit in 1 MB and stay readable. If the portal takes several uploads, [Split by size](/tools/split-by-size/) cuts it into parts that each fit. If it only needs some pages, [Extract pages](/tools/extract-pages/) keeps just those.',
        ],
      },
    ],
    faq: [
      { q: 'How long does it take?', a: 'Seconds for a few pages; longer for a big scan on an older phone, because your own device does the work. A progress line shows what it is doing.' },
      { q: 'Can I compress a password-protected PDF?', a: 'Yes. Type its password when asked. The smaller file keeps the same password.' },
      { q: 'Is it really free?', a: 'Yes. No payment, no sign-up and no limit on how many files you compress.' },
    ],
  },
  {
    slug: 'reduce-pdf-size-for-email',
    title: 'Reduce PDF size for email: compress or split, free',
    h1: 'How to make a PDF small enough to email',
    description: 'PDF too big to attach? Compress it, or split it into parts under 5, 10 or 25 MB. Free and private: the file never leaves your own device.',
    tool: 'compress',
    related: ['split-by-size', 'extract-pages'],
    intro: 'Compress the PDF with Balanced or Strong. If it is still too big, [Split by size](/tools/split-by-size/) cuts it into parts that each fit the email limit.',
    steps: [
      'Open Compress and add the PDF.',
      'Choose Balanced, or Strong if the file is very large.',
      'Press Compress it and check the new size.',
      'Split the result by size if it is still over the email limit.',
      'Attach the file, or tap Share on a phone to send it straight from the result.',
    ],
    sections: [
      {
        heading: 'How big an attachment can be',
        paragraphs: [
          'Gmail allows attachments up to 25 MB in one email. Many office email systems allow less, often 10 MB, and the person receiving may have a lower limit than you. Email also makes a file a little bigger in transit, so aim comfortably under the limit rather than just under it.',
        ],
      },
      {
        heading: 'Which setting to choose',
        paragraphs: [
          'Balanced keeps photos sharp on any screen and fine to print, and usually halves the size or better. Strong is for email limits: photos get softer, text stays exactly as it was. If neither makes the file smaller, it has no photos to shrink, and the result says so rather than handing back a copy.',
        ],
      },
      {
        heading: 'Splitting instead',
        paragraphs: [
          'Some files cannot shrink much: a long report that is mostly text is already small for what it holds. [Split by size](/tools/split-by-size/) makes parts under 5, 10 or 25 MB, or any size you type, which you send in separate emails. Or send only the pages that matter with [Extract pages](/tools/extract-pages/).',
        ],
      },
    ],
    faq: [
      { q: 'Will compressing ruin how it looks?', a: 'Balanced is sharp on any screen. Only Strong softens photos noticeably, and text is never touched by either.' },
      { q: 'Is my document sent anywhere while it is compressed?', a: 'No. It is made smaller in your browser. The only place it goes is wherever you send it afterwards.' },
      { q: 'Can I compress several attachments at once?', a: 'Yes. Add them all; each one comes back smaller, and Save all saves them together.' },
    ],
  },

  // ---- Passwords on Indian documents ----
  {
    slug: 'aadhaar-pdf-password',
    title: 'Aadhaar PDF password: open and unlock e-Aadhaar',
    h1: 'What is the password for the e-Aadhaar PDF?',
    description: 'The e-Aadhaar password is the first four letters of your name in capitals plus your year of birth. Then unlock it for good, free, with no upload.',
    tool: 'remove-password',
    related: ['remove-areas', 'compress', 'images-to-pdf'],
    intro: 'The password is the first four letters of your name, as written on your Aadhaar, in capital letters, followed by your year of birth. Priya Nair born in 1992 types PRIY1992.',
    steps: [
      'Open Remove a password and add the e-Aadhaar PDF.',
      'Type the password when the file asks for it: four capital letters of your name and your year of birth.',
      'Tap Unlock.',
      'Press Unlock it to make a copy that opens without a password.',
      'Save the unlocked copy, and keep the original too.',
    ],
    sections: [
      {
        heading: 'If the password does not work',
        paragraphs: [
          'Check the letters are capitals, and that you used the name exactly as it appears on the Aadhaar, not a nickname or the spelling on another document. The year is four digits, the year only, not the full date of birth.',
        ],
      },
      {
        heading: 'Think before you unlock it',
        paragraphs: [
          'The password is there because the file carries your Aadhaar number, address and photo. An unlocked copy opens for anyone who gets hold of it. If someone only needs proof of identity, consider sending a copy with the number hidden: see [how to hide the Aadhaar number](/guides/hide-aadhaar-number-in-pdf/).',
          'The e-Aadhaar is also digitally signed by UIDAI. Any changed copy, an unlocked one included, no longer passes that signature check in a PDF reader. Where an office verifies the signature, give them the original file and the password instead.',
        ],
      },
      {
        heading: 'After unlocking',
        paragraphs: [
          'A portal that refuses a locked PDF will usually take the unlocked one. If it also has a size limit, [Compress](/tools/compress/) can bring the file under 100 KB or 200 KB. To print the card part on its own page, see [Aadhaar front and back on one page](/guides/aadhaar-front-and-back-on-one-page/).',
        ],
      },
    ],
    faq: [
      { q: 'Can this find the password for me?', a: 'No. It unlocks a file only with the password you type. It does not guess or break passwords.' },
      { q: 'Is my Aadhaar uploaded when I unlock it?', a: 'No. The file is opened and unlocked in your browser, on your device. Nothing is sent anywhere, and the password is never stored.' },
      { q: 'Do I have to unlock it to open it?', a: 'No. Any PDF reader opens it with the password. Unlock it only when a website or office needs a copy without one.' },
    ],
  },
  {
    slug: 'remove-password-from-bank-statement-pdf',
    title: 'Remove password from bank statement PDF, free',
    h1: 'How to remove the password from a bank statement PDF',
    description: 'Unlock a bank statement PDF with the password your bank gave you, and save a copy that opens without it. Free, private, and nothing is uploaded.',
    tool: 'remove-password',
    related: ['pdf-to-excel', 'merge', 'remove-areas'],
    intro: 'Open Remove a password, add the statement, type the password your bank set and press Unlock it. You get a copy that opens without a password; the original is left as it was.',
    steps: [
      'Open Remove a password and add the statement, or several.',
      'Type each file’s password when asked and tap Unlock.',
      'Press Unlock it.',
      'Save the unlocked copies.',
    ],
    sections: [
      {
        heading: 'What the password usually is',
        paragraphs: [
          'Banks build the password from details they already hold about you. Often it is your date of birth, your customer ID, or part of your name together with part of your date of birth, in a set pattern. It differs from bank to bank and sometimes between kinds of statement, so check the email the statement came with: it normally says exactly what to type.',
        ],
      },
      {
        heading: 'Why you might want it unlocked',
        paragraphs: [
          'Loan applications, visa files and accountants often want statements they can open without asking you for a password, and some upload forms refuse locked PDFs altogether. Several months can then be joined into one file with [Merge](/tools/merge/), in order.',
          'If you want the numbers in a spreadsheet, you do not need to unlock it first: [PDF to Excel](/tools/pdf-to-excel/) asks for the password itself. See [bank statement to Excel](/guides/bank-statement-pdf-to-excel/).',
        ],
      },
      {
        heading: 'Share less',
        paragraphs: [
          'An unlocked statement shows your account number and every transaction to whoever opens it. If the reader only needs some of it, hide the rest with [Remove areas](/tools/remove-areas/), which takes the marked parts out of the file for good rather than drawing a box over them.',
        ],
      },
    ],
    faq: [
      { q: 'I don’t know the password. Can you unlock it?', a: 'No. The tool only unlocks a file with the password you type; it does not guess passwords. Your bank’s email, website or branch can tell you the format.' },
      { q: 'Is my statement sent to a server?', a: 'No. It is unlocked in your browser. Your statement and its password never leave your device.' },
      { q: 'Can I unlock twelve months at once?', a: 'Yes. Add them all, type each password when asked, and Save all saves the unlocked copies together.' },
    ],
  },
  {
    slug: 'bank-statement-pdf-to-excel',
    title: 'Bank statement PDF to Excel converter, free',
    h1: 'How to convert a bank statement PDF to Excel',
    description: 'Turn a bank statement PDF into an Excel sheet with dates, amounts and balances as real numbers. Free, private, and your statement is never uploaded.',
    tool: 'pdf-to-excel',
    related: ['remove-password', 'merge', 'ocr'],
    intro: 'Open PDF to Excel, add the statement and press Make a spreadsheet. Every page’s transactions come out as one table, with amounts as numbers you can add up.',
    steps: [
      'Open PDF to Excel and add the statement.',
      'Type its password if it asks, and tap Unlock.',
      'Leave Read scanned pages too ticked if the statement is a scan or a photo.',
      'Press Make a spreadsheet.',
      'Open the .xlsx in Excel, Google Sheets or any spreadsheet app.',
    ],
    sections: [
      {
        heading: 'What you get',
        paragraphs: [
          'A statement runs over many pages, each repeating the column headings. The converter joins the transactions from every page into one Table sheet, keeps the headings once, and joins back rows that a page break cut in two. Account details from the first page and any summary box at the end go on a second sheet, Other details, so nothing is lost.',
          'Amounts arrive as numbers, not text, so a SUM or a filter on the debit column works straight away.',
        ],
      },
      {
        heading: 'Check it before you rely on it',
        paragraphs: [
          'The columns are worked out from where the words line up on the page. On a tidy statement that is exact; on an unusual layout a value can land in the next column. Add up the credits and debits and check the closing balance against the statement before you use the sheet for tax or accounts.',
        ],
      },
      {
        heading: 'Several months, scans and locked files',
        paragraphs: [
          'Add several statements at once and each becomes its own spreadsheet. If you would rather have one, join the PDFs with [Merge](/tools/merge/) first. A statement that was printed and scanned has no words in it, only a picture of them; Read scanned pages too reads the picture, more slowly. A locked statement can be converted as it is, or unlocked first with [Remove a password](/tools/remove-password/).',
        ],
      },
    ],
    faq: [
      { q: 'Is my bank statement uploaded?', a: 'No. It is read and converted in your browser, on your device. That matters with a document this private, and you can check it: the tool works with the internet switched off.' },
      { q: 'Does it work with any bank?', a: 'It works from the layout, not from a list of banks, so any statement with clear columns converts. Check the totals, as above.' },
      { q: 'Can I get a CSV instead?', a: 'It makes an .xlsx. Any spreadsheet app can save that as CSV in one step.' },
      { q: 'Is there a page limit?', a: 'No. A long statement just takes a little longer on an older phone.' },
    ],
  },

  // ---- Pages ----
  {
    slug: 'merge-pdf-files',
    title: 'Merge PDF files into one, free and private',
    h1: 'How to merge PDF files into one',
    description: 'Join several PDFs into one file in the order you choose. Free, no sign-up, no file limit, no watermark, and your files never leave your device.',
    tool: 'merge',
    related: ['organise', 'images-to-pdf', 'compress'],
    intro: 'Open Merge, add the PDFs, put them in order with the up and down arrows, and press Merge into one file.',
    steps: [
      'Open Merge and add two or more PDFs.',
      'Use the up and down arrows to put them in order.',
      'Type the password for any locked file when asked.',
      'Press Merge into one file.',
      'Save the merged PDF, or tap Then to hand it to another tool.',
    ],
    sections: [
      {
        heading: 'Fixing the order inside',
        paragraphs: [
          'Merge puts whole files end to end. To move single pages, turn one round or drop one, open the merged file in [Organise pages](/tools/organise/). The Then button on the result takes it straight there without saving in between.',
        ],
      },
      {
        heading: 'Photos and PDFs together',
        paragraphs: [
          'Merge takes PDFs. If some of your pages are photos, make them a PDF first with [Images to PDF](/tools/images-to-pdf/), then merge that with the rest. For a form with an upload limit, [Compress](/tools/compress/) the merged file afterwards; see [compress to 200 KB](/guides/compress-pdf-to-200kb/).',
        ],
      },
      {
        heading: 'No limits, because there is no server',
        paragraphs: [
          'Most PDF sites upload your files, so they cap how many and how big. Here the joining happens in your browser, one file at a time, so forty scans cost no more memory than the result plus one. The only limit is what your own device can hold.',
        ],
      },
    ],
    faq: [
      { q: 'How many PDFs can I merge?', a: 'As many as your device can handle. There is no cap on count or size.' },
      { q: 'Are my files uploaded?', a: 'No. They are joined in your browser and never leave your device.' },
      { q: 'Does it change the original files?', a: 'No. The merged PDF is a new file. The ones you picked are never changed.' },
      { q: 'Can I merge on my phone?', a: 'Yes. It works in the phone’s browser, and Share sends the result straight to WhatsApp or email on phones that can share files.' },
    ],
  },
  {
    slug: 'aadhaar-front-and-back-on-one-page',
    title: 'Aadhaar front and back on one page as a PDF',
    h1: 'How to put the Aadhaar front and back on one page',
    description: 'Combine photos of your Aadhaar front and back into one PDF, or onto one A4 sheet, in your browser. Free, no sign-up, and the photos are never uploaded.',
    tool: 'images-to-pdf',
    related: ['n-up', 'compress', 'scan'],
    intro: 'Make the two photos one PDF with Images to PDF, then use Pages per sheet with 2 per sheet to put both sides on a single A4 page.',
    steps: [
      'Open Images to PDF and add the front photo, then the back.',
      'Choose Same as each image for the page size and press Make a PDF.',
      'Tap Then on the result and choose Pages per sheet.',
      'Pick 2 per sheet and A4, and press Lay it out.',
      'Save the one-page PDF, or compress it if a portal has a size limit.',
    ],
    sections: [
      {
        heading: 'One PDF, or one page?',
        paragraphs: [
          'Many forms just want both sides in one file. Images to PDF alone does that: two pages, front then back. When the form says one page, or you want to print both sides on one sheet, [Pages per sheet](/tools/n-up/) puts the two pages side by side on a landscape A4.',
        ],
      },
      {
        heading: 'Better photos, smaller files',
        paragraphs: [
          'Photograph the card flat, in good light, with no flash glare across the number. [Scan](/tools/scan/) finds the card’s edges in each photo, straightens it and cleans it up, which gives a neater result than a raw photo. A portal’s size limit is easy to meet afterwards with [Compress](/tools/compress/).',
        ],
      },
      {
        heading: 'If you have the e-Aadhaar PDF',
        paragraphs: [
          'The e-Aadhaar downloaded from UIDAI already has the front and back of the card at the bottom of its page. You may not need photos at all. Its password is explained in [Aadhaar PDF password](/guides/aadhaar-pdf-password/).',
          'If the copy is going to someone who does not need your full number, hide it first: see [how to hide the Aadhaar number](/guides/hide-aadhaar-number-in-pdf/).',
        ],
      },
    ],
    faq: [
      { q: 'Are my Aadhaar photos uploaded?', a: 'No. The PDF is made in your browser and the photos never leave your device.' },
      { q: 'My iPhone photos will not open. Why?', a: 'Some browsers cannot read iPhone HEIC photos. Share them as JPEG, or set Settings, Camera, Formats to Most Compatible, and add them again.' },
      { q: 'Can I put them one above the other instead?', a: 'Pages per sheet places two pages side by side on a landscape sheet. With 4 per sheet they go in the top row of a portrait sheet.' },
    ],
  },
  {
    slug: 'jpg-to-pdf',
    title: 'JPG to PDF: convert photos to one PDF, free',
    h1: 'How to convert JPG images to a PDF',
    description: 'Turn JPG, PNG or WebP images into one PDF, one picture per page, in any order. Free, no sign-up, no watermark, and nothing is uploaded.',
    tool: 'images-to-pdf',
    related: ['scan', 'compress', 'merge'],
    intro: 'Open Images to PDF, add your pictures, put them in order and press Make a PDF. Each image becomes one page.',
    steps: [
      'Open Images to PDF and add the images.',
      'Use the up and down arrows to set the page order.',
      'Choose a page size: A4, Letter, or Same as each image.',
      'Choose a margin: none, small or large.',
      'Press Make a PDF and save it.',
    ],
    sections: [
      {
        heading: 'Which images work',
        paragraphs: [
          'JPEG, PNG, WebP, GIF and BMP all work. iPhone HEIC photos work where the browser can read them; where it cannot, the tool says so and how to share them as JPEG instead. Photos taken sideways on a phone come out the right way up.',
        ],
      },
      {
        heading: 'Page size',
        paragraphs: [
          'A4 suits anything that will be printed or uploaded to an Indian form: each picture is fitted onto an A4 page. Same as each image makes every page the shape of its picture, which suits screenshots and posters.',
        ],
      },
      {
        heading: 'Photos of paper',
        paragraphs: [
          'If the pictures are photos of documents, [Scan](/tools/scan/) does more: it finds the sheet’s corners, straightens it and cleans it up so it looks scanned. To add the result to other PDFs, use [Merge](/tools/merge/); to meet a size limit, use [Compress](/tools/compress/).',
        ],
      },
    ],
    faq: [
      { q: 'How many images can I add?', a: 'As many as you like. There is no limit beyond your device’s memory.' },
      { q: 'Are my photos uploaded?', a: 'No. The PDF is put together in your browser, and the photos stay on your device.' },
      { q: 'Does it make the photos blurry?', a: 'No. JPEGs go in as they are. Other formats, and photos that need turning upright, are re-saved as high-quality JPEGs.' },
      { q: 'The PDF is too big for a form. What now?', a: 'Tap Then on the result and choose Compress, then pick a size such as 200 KB. See [compress to 200 KB](/guides/compress-pdf-to-200kb/).' },
    ],
  },
  {
    slug: 'photo-to-pdf-on-phone',
    title: 'Photo to PDF on your phone, no app needed',
    h1: 'How to turn a photo into a PDF on your phone',
    description: 'Make a PDF from photos on an Android phone or iPhone in the browser, with no app to install. Free, no sign-up, and the photos never leave your phone.',
    tool: 'images-to-pdf',
    related: ['scan', 'compress', 'merge'],
    intro: 'Open Images to PDF in your phone’s browser, tap to choose photos from the gallery, and press Make a PDF. Then tap Share to send it to WhatsApp or email.',
    steps: [
      'Open Images to PDF in Chrome, Safari or any current phone browser.',
      'Tap the drop zone and choose the photos from your gallery.',
      'Put them in order with the up and down arrows.',
      'Press Make a PDF.',
      'Tap Share to send it, or Save to keep it in Downloads.',
    ],
    sections: [
      {
        heading: 'No app, and nothing uploaded',
        paragraphs: [
          'The PDF is made by your phone’s own browser. Your photos are not sent anywhere, which matters when they are of an ID card, a cheque or a medical report. You can add the site to your home screen to open it like an app; see [PDF tools that work offline](/guides/pdf-tools-that-work-offline/).',
        ],
      },
      {
        heading: 'Taking the photo',
        paragraphs: [
          'If you are photographing a paper document, [Scan](/tools/scan/) gives a cleaner result: it straightens the page, removes the background and can make it black and white, which is also much smaller.',
        ],
      },
      {
        heading: 'Sending it',
        paragraphs: [
          'On phones that can share files, Share hands the PDF straight to WhatsApp, Gmail or any other app. If a form needs it smaller, open it in [Compress](/tools/compress/) with the Then button and pick a size such as 200 KB.',
        ],
      },
    ],
    faq: [
      { q: 'Does it work on a cheap Android phone?', a: 'Yes. It is built for low-end phones first. A large batch of photos just takes a little longer.' },
      { q: 'Where does the PDF go when I save it?', a: 'Into your phone’s Downloads, like any other download, unless you share it straight to an app instead.' },
      { q: 'Do I need to sign up?', a: 'No. There is no account, no sign-up and no login.' },
    ],
  },
  {
    slug: 'scan-document-to-pdf-with-phone',
    title: 'Scan a document to PDF with your phone camera',
    h1: 'How to scan a document to PDF with your phone',
    description: 'Photograph paper with your phone and get a straight, clean PDF scan in your browser. Free, no app, no sign-up, and the photos are never uploaded.',
    tool: 'scan',
    related: ['ocr', 'compress', 'images-to-pdf'],
    intro: 'Open Scan, take a photo of each page, check the corners it found, choose Black and white or Colour, and press Make the PDF.',
    steps: [
      'Open Scan and take a photo of each page, or choose photos you already took.',
      'Check the round handles sit on the corners of the paper, and drag any that do not.',
      'Choose Colour, Grey or Black and white.',
      'Choose A4, Letter or As photographed for the page size.',
      'Press Make the PDF and save or share it.',
    ],
    sections: [
      {
        heading: 'What Scan does to each photo',
        paragraphs: [
          'It finds the sheet of paper in the photo, straightens it so the edges are square even if you held the phone at an angle, cuts away the table around it and evens out the light. Black and white turns the paper white and the writing crisp, and survives a shadow across the page.',
        ],
      },
      {
        heading: 'Getting a good photo',
        paragraphs: [
          'Put the paper on a darker surface, so its edges stand out. Hold the phone above the page rather than at a steep angle, and avoid your own shadow. Daylight beats flash, which leaves a bright patch.',
        ],
      },
      {
        heading: 'After scanning',
        paragraphs: [
          'A scan is a picture of words, so you cannot search or copy them yet. [Make searchable](/tools/ocr/) reads the words and lays them invisibly over the page. For an upload with a size limit, [Compress](/tools/compress/) it; a black and white scan is usually small already.',
        ],
      },
    ],
    faq: [
      { q: 'Which look should I choose?', a: 'Black and white for letters, forms and printed pages. Grey if there are photos. Colour if stamps, signatures in blue ink or coloured marks matter.' },
      { q: 'Are my photos uploaded?', a: 'No. Every photo is straightened and cleaned in your browser, on your phone.' },
      { q: 'Can I scan many pages into one PDF?', a: 'Yes. Add all the photos; each becomes one page, in the order listed.' },
    ],
  },
  {
    slug: 'split-pdf',
    title: 'Split PDF into separate files, free and private',
    h1: 'How to split a PDF into several files',
    description: 'Split a PDF every few pages, into single pages, by page ranges or at each chapter. Free, no sign-up, no limits, and nothing is uploaded.',
    tool: 'split',
    related: ['extract-pages', 'split-by-size', 'bookmarks'],
    intro: 'Open Split, add the PDF, choose how to split it and press Split it up. Each part is a new PDF; the original stays as it was.',
    steps: [
      'Open Split and add the PDF.',
      'Choose Every few pages, One page per file, By page ranges or At each chapter.',
      'Type the number or the ranges if the choice needs one.',
      'Press Split it up.',
      'Tap Save all to save the parts as a folder or one ZIP.',
    ],
    sections: [
      {
        heading: 'Which way to split',
        paragraphs: [
          'Every few pages suits a pile of forms scanned together, each of the same length: a 10-page file split every 3 gives files of 3, 3, 3 and 1 pages. By page ranges gives one file per range you type, such as 1-2, 3-7, 8-. At each chapter makes one file per top-level bookmark, named after it.',
        ],
      },
      {
        heading: 'Split or extract?',
        paragraphs: [
          'Split makes several files. If you only want one file with a few pages from the original, [Extract pages](/tools/extract-pages/) is quicker. If the reason to split is an email or upload limit in MB, [Split by size](/tools/split-by-size/) works out the parts for you.',
        ],
      },
      {
        heading: 'No bookmarks?',
        paragraphs: [
          'At each chapter needs the PDF to have bookmarks. If it has none, add them with [Bookmarks](/tools/bookmarks/), or split by page ranges instead.',
        ],
      },
    ],
    faq: [
      { q: 'Is there a page limit?', a: 'No. The file is split in your browser, one part at a time, so long files work too.' },
      { q: 'Are my files uploaded?', a: 'No. Nothing leaves your device.' },
      { q: 'What does 12- mean in a range?', a: 'Page 12 to the last page. You can mix ranges and single pages, separated by commas: 1-3, 7, 12-.' },
      { q: 'Does splitting change the original?', a: 'No. Each part is a new file; the PDF you picked stays whole.' },
    ],
  },
  {
    slug: 'extract-pages-from-pdf',
    title: 'Extract pages from PDF: keep only what you need',
    h1: 'How to extract pages from a PDF',
    description: 'Make a new PDF with just the pages you pick, like 1-3, 7 or 12 to the end. Free, no sign-up, no watermark, and the file is never uploaded.',
    tool: 'extract-pages',
    related: ['split', 'organise', 'compress'],
    intro: 'Open Extract or remove pages, type the pages you want, leave Keep these pages selected and press Make the new file.',
    steps: [
      'Open Extract or remove pages and add the PDF.',
      'Type the pages to keep, such as 1-3, 7.',
      'Leave Keep these pages selected.',
      'Press Make the new file.',
      'Save it, or tap Then to send it to another tool.',
    ],
    sections: [
      {
        heading: 'Typing the pages',
        paragraphs: [
          'Separate pages and ranges with commas. 1-3 means pages 1, 2 and 3. 12- means page 12 to the end. 1-3, 7, 12- keeps all three groups, in the order of the original.',
        ],
      },
      {
        heading: 'When to use it',
        paragraphs: [
          'A portal wants only the first page of a marksheet, or one month from a year of statements, or the signed page of an agreement. Sending only that page keeps the file small and shares less. To bring it under an upload limit as well, follow it with [Compress](/tools/compress/).',
        ],
      },
      {
        heading: 'Several files from one',
        paragraphs: [
          'Extract makes one new file. To cut a PDF into several files at once, use [Split](/tools/split/). To change the order of pages, use [Organise pages](/tools/organise/).',
          'The opposite job, taking a few pages out and keeping the rest, is the same tool with Remove these pages chosen; see [delete pages from a PDF](/guides/delete-pages-from-pdf/).',
        ],
      },
    ],
    faq: [
      { q: 'Does it change my original PDF?', a: 'No. You get a new file with only those pages. The original is untouched.' },
      { q: 'Can I extract pages from a locked PDF?', a: 'Yes, with its password. Type it when the file asks.' },
      { q: 'Is the file uploaded?', a: 'No. The new file is made in your browser.' },
      { q: 'Will the pages lose quality?', a: 'No. The pages are copied into the new file as they are, not redrawn, so text stays text and photos are untouched.' },
    ],
  },
  {
    slug: 'delete-pages-from-pdf',
    title: 'Delete pages from PDF online, free, no upload',
    h1: 'How to delete pages from a PDF',
    description: 'Remove blank, extra or private pages from a PDF and save a clean copy. Free, no sign-up, no watermark, done in your browser with no upload.',
    tool: 'extract-pages',
    related: ['organise', 'remove-areas', 'split'],
    intro: 'Open Extract or remove pages, type the pages to take out, choose Remove these pages and press Make the new file.',
    steps: [
      'Open Extract or remove pages and add the PDF.',
      'Type the pages to delete, such as 2, 5-6.',
      'Choose Remove these pages.',
      'Press Make the new file.',
      'Save the new PDF.',
    ],
    sections: [
      {
        heading: 'Seeing the pages first',
        paragraphs: [
          'If you would rather see the pages than type numbers, [Organise pages](/tools/organise/) shows every page as a picture. Tap the bin under each page you do not want, then Save the new order. You can also turn and move pages there in the same go.',
        ],
      },
      {
        heading: 'Deleted means gone',
        paragraphs: [
          'The new file is built from the pages you keep. A deleted page is not hidden inside it; it is not in the file at all.',
          'If only part of a page is private, such as one account number, you do not need to delete the whole page. [Remove areas](/tools/remove-areas/) takes out just the parts you mark.',
        ],
      },
      {
        heading: 'Blank pages from a scanner',
        paragraphs: [
          'Scanners that do both sides of the paper leave a blank page after every one-sided sheet. Type their numbers, such as 2, 4, 6, 8, and choose Remove these pages; or open the file in Organise pages, where blank pages are easy to spot, and tap the bin under each. A file without its blank pages is also smaller, which helps with an upload limit.',
        ],
      },
    ],
    faq: [
      { q: 'Can I delete every page but one?', a: 'Yes. You must leave at least one page.' },
      { q: 'Does it change the file I picked?', a: 'No. Every result is a new file; the original stays as it was.' },
      { q: 'Is it safe for private documents?', a: 'The file never leaves your device: pages are removed in your browser.' },
      { q: 'I deleted the wrong page. Can I undo it?', a: 'Your original file is unchanged, so start again from it. In Organise pages, tapping the bin again brings a page back before you save.' },
    ],
  },
  {
    slug: 'rotate-pdf-pages',
    title: 'Rotate PDF pages and save them, free',
    h1: 'How to rotate pages in a PDF and save it',
    description: 'Turn sideways or upside-down PDF pages the right way and save the file that way for good. Free, no sign-up, and the PDF is never uploaded.',
    tool: 'organise',
    related: ['scan', 'extract-pages', 'merge'],
    intro: 'Open Organise pages, tap the turn button under each page that is the wrong way, and press Save the new order.',
    steps: [
      'Open Organise pages and add the PDF.',
      'Tap the turn button under a page to rotate it a quarter turn.',
      'Tap again until the page is upright.',
      'Move or delete pages too, if you like.',
      'Press Save the new order and save the file.',
    ],
    sections: [
      {
        heading: 'Saved, not just shown',
        paragraphs: [
          'Turning a page in a PDF reader usually changes only how you are viewing it. Organise saves the turn into the file, so the page is upright for everyone who opens it, and on paper when it is printed.',
        ],
      },
      {
        heading: 'Why pages come out sideways',
        paragraphs: [
          'Phones guess which way is up from how they are held, and a document photographed flat on a table often fools them. [Scan](/tools/scan/) and [Images to PDF](/tools/images-to-pdf/) both read the photo’s own orientation and put pages the right way up from the start.',
        ],
      },
      {
        heading: 'Everything in one go',
        paragraphs: [
          'The same screen moves pages earlier or later and deletes them, so you can fix a whole scanned bundle at once. To join several files first, use [Merge](/tools/merge/), then tap Then to bring the result here. Nothing is saved until you press Save the new order, so you can try things freely.',
        ],
      },
    ],
    faq: [
      { q: 'Can I rotate just one page?', a: 'Yes. Each page has its own turn button; the others stay as they are.' },
      { q: 'Does rotating lower the quality?', a: 'No. The page is turned, not redrawn, so nothing about it changes but its direction.' },
      { q: 'Is my file uploaded?', a: 'No. Everything happens in your browser.' },
      { q: 'Can I rotate a PDF on my phone?', a: 'Yes. The page pictures and buttons are made for touch, and the result can be shared straight from the phone.' },
    ],
  },

  // ---- Signing ----
  {
    slug: 'sign-pdf-online-free',
    title: 'Sign PDF online free: draw your signature',
    h1: 'How to sign a PDF online for free',
    description: 'Draw or type your signature and place it anywhere on a PDF, on a phone or computer. Free, no sign-up, no watermark, and nothing is uploaded.',
    tool: 'sign',
    related: ['add-text', 'fill-form', 'add-image', 'digital-sign'],
    intro: 'Open Sign, draw your signature with a finger or mouse, tap the page where it goes, and press Place the signature.',
    steps: [
      'Open Sign and add the PDF.',
      'Draw your signature in the box, or type your name instead.',
      'Tap the page where the signature goes.',
      'Drag it to move it, and drag its corner to resize it.',
      'Press Place the signature and save the signed PDF.',
    ],
    sections: [
      {
        heading: 'More than one place',
        paragraphs: [
          'Agreements often need a signature on every page. Go to the next page and tap again: the same signature goes down each time. To write the date or your name beside it, use [Add text](/tools/add-text/). For a form with real fields, fill it in first with [Fill in a form](/tools/fill-form/).',
        ],
      },
      {
        heading: 'Using your signature on paper',
        paragraphs: [
          'If you would rather use your real ink signature, sign a sheet of white paper, photograph it, and place the photo with [Add image](/tools/add-image/). A PNG with a see-through background sits cleanly on the page.',
        ],
      },
      {
        heading: 'A drawn signature and a digital one',
        paragraphs: [
          'A drawn signature is a picture of your handwriting on the page. That is what most everyday forms, rental agreements and office paperwork expect. It does not prove who placed it. When a document must carry a certificate that a reader can check, such as with a Class 3 DSC, you need a [digital signature](/guides/digital-signature-pdf-dsc/) instead.',
        ],
      },
    ],
    faq: [
      { q: 'Is my signature saved anywhere?', a: 'No. It is drawn in your browser, placed on your PDF, and forgotten when you leave the page. Nothing is uploaded or stored.' },
      { q: 'Can I sign on my phone?', a: 'Yes. Draw with your finger; the page and the pad are made for touch.' },
      { q: 'Is a drawn signature legally valid?', a: 'Whether it is accepted depends on the document and who receives it. Many everyday documents accept one; some legal and government filings require a certificate-based digital signature.' },
    ],
  },
  {
    slug: 'digital-signature-pdf-dsc',
    title: 'Digitally sign a PDF with your DSC (.pfx) file',
    h1: 'How to digitally sign a PDF with a .pfx certificate',
    description: 'Sign a PDF with your DSC or .pfx certificate so a reader can check who signed and that nothing changed since. Free, in your browser, with no upload.',
    tool: 'digital-sign',
    related: ['sign', 'pdf-a', 'remove-password'],
    intro: 'Open Digital signature, add the PDF, choose your .pfx or .p12 certificate file, type its password and press Sign it digitally.',
    steps: [
      'Open Digital signature and add the PDF.',
      'Choose your certificate file, a .pfx or .p12.',
      'Type the certificate’s password.',
      'Leave Show the signature on the last page ticked for a visible box, and add a reason if you like.',
      'Press Sign it digitally and save the signed PDF.',
    ],
    sections: [
      {
        heading: 'How it differs from a drawn signature',
        paragraphs: [
          'A drawn signature is a picture: anyone can copy it onto another page. A digital signature is worked out from the document’s exact contents with a key that only the certificate’s owner holds. A PDF reader can then show who signed it, which authority issued their certificate, and whether even one character has changed since.',
        ],
      },
      {
        heading: 'DSC on a USB token',
        paragraphs: [
          'In India, a Digital Signature Certificate (DSC) is issued by a licensed certifying authority, and Class 3 is the kind most government portals ask for. Most Class 3 DSCs live on a USB token whose key cannot be copied out. A web page cannot reach a token, so this tool cannot use one: sign with the utility that came with the token.',
          'This tool needs the certificate as a file: a .pfx or .p12, as issued by some employers and organisations, or exported from your own computer. The file and its password stay on your device and are forgotten when you leave the page.',
        ],
      },
      {
        heading: 'Sign last',
        paragraphs: [
          'Any change after signing breaks the signature, so finish the document first. Fill it in, add page numbers, or make an archive copy with [Archive copy (PDF/A)](/tools/pdf-a/), then sign. A locked PDF must be unlocked with [Remove a password](/tools/remove-password/) before it can be signed. An earlier signature on the document stays valid when you add yours.',
        ],
      },
    ],
    faq: [
      { q: 'Will Adobe Acrobat show it as valid?', a: 'Acrobat will show that the document has not changed since signing. Whether it also shows your identity as trusted depends on whether it trusts the authority that issued your certificate.' },
      { q: 'My certificate has expired. Can I still use it?', a: 'No. Readers would mark the signature not valid, so the tool refuses and shows the date it ran out. Renew it with whoever issued it.' },
      { q: 'Is my certificate uploaded?', a: 'No. The .pfx and its password are read in your browser, used once, and forgotten. They are never stored or sent anywhere.' },
      { q: 'Can I just draw my signature instead?', a: 'Yes, with [Sign](/tools/sign/), for documents that do not need a certificate.' },
    ],
  },

  // ---- Marking up ----
  {
    slug: 'add-page-numbers-to-pdf',
    title: 'Add page numbers to PDF, free and private',
    h1: 'How to add page numbers to a PDF',
    description: 'Number the pages of a PDF at the top or bottom, as 1, Page 1 or 1 of 12, and skip the cover. Free, no sign-up, and the file is never uploaded.',
    tool: 'page-numbers',
    related: ['header-footer', 'page-labels', 'merge'],
    intro: 'Open Page numbers, choose where the numbers go and how they look, and press Add the numbers.',
    steps: [
      'Open Page numbers and add the PDF.',
      'Choose where: top or bottom, left, centre or right.',
      'Choose a style: 1, 1 of 12, Page 1 or Page 1 of 12.',
      'Tick Leave the first page unnumbered if it is a cover.',
      'Press Add the numbers and save the file.',
    ],
    sections: [
      {
        heading: 'Starting from another number',
        paragraphs: [
          'First number sets where counting starts. If this document follows another of 20 pages, start at 21. To number several files as one, join them with [Merge](/tools/merge/) first.',
        ],
      },
      {
        heading: 'Bates numbering for legal files',
        paragraphs: [
          'Choose Bates in Style for numbers like ACME-000001. Type what goes before the number and how many digits it has. Bates runs one sequence through every page of every file you add, in the order you added them, which is what court bundles and discovery sets need.',
        ],
      },
      {
        heading: 'Printed numbers and reader page numbers',
        paragraphs: [
          'Page numbers are printed on the page. A PDF reader also has its own page box, which counts from the cover. To make that box say i, ii, iii for the front pages and 1 from the first chapter, use [Page labels](/tools/page-labels/). For a running line of text, such as a title or a date, use [Header and footer](/tools/header-footer/).',
        ],
      },
    ],
    faq: [
      { q: 'Can I number several PDFs at once?', a: 'Yes. Add them all; each is numbered on its own, except with Bates, which numbers them as one sequence.' },
      { q: 'Will the numbers cover my text?', a: 'They sit near the edge of the page. If a page has text right at the edge, choose another position, such as the top instead of the bottom.' },
      { q: 'Is my PDF uploaded?', a: 'No. The numbers are added in your browser.' },
    ],
  },
  {
    slug: 'add-watermark-to-pdf',
    title: 'Add a watermark to PDF: DRAFT, COPY or a name',
    h1: 'How to add a watermark to a PDF',
    description: 'Stamp DRAFT, CONFIDENTIAL or your name across every page of a PDF, once or repeated. Free, no sign-up, and the file never leaves your device.',
    tool: 'watermark',
    related: ['add-password', 'header-footer', 'remove-areas'],
    intro: 'Open Watermark, type the words, choose how strong and whether once or repeated, and press Add the watermark.',
    steps: [
      'Open Watermark and add one or more PDFs.',
      'Type the watermark text, such as DRAFT or COPY.',
      'Choose Light, Medium or Strong.',
      'Choose Once, across the middle, or Repeated all over.',
      'Press Add the watermark and save the files.',
    ],
    sections: [
      {
        heading: 'A watermark on ID copies',
        paragraphs: [
          'When you hand a copy of your Aadhaar, PAN or passport to a bank, landlord or employer, a watermark that says what it is for makes it harder to reuse. Something like FOR HOME LOAN APPLICATION ONLY, repeated all over, is a common habit. Keep it light enough that the details can still be read.',
        ],
      },
      {
        heading: 'What a watermark does not do',
        paragraphs: [
          'A watermark discourages copying; it does not prevent it, and someone with the right editor could take it off. To stop a file being opened at all, use [Add a password](/tools/add-password/). To take a detail out of a document for good, use [Remove areas](/tools/remove-areas/).',
        ],
      },
      {
        heading: 'Text along the edge instead',
        paragraphs: [
          'For a quieter mark, such as CONFIDENTIAL along the top of every page, use [Header and footer](/tools/header-footer/). The watermark text takes English letters and numbers for now. Repeated all over is harder to crop out than a single mark across the middle.',
        ],
      },
    ],
    faq: [
      { q: 'Is a watermark added to my file by this site?', a: 'Only the one you type. This site never stamps its own name or logo on anything.' },
      { q: 'Can I watermark many files at once?', a: 'Yes. Add them all and each gets the same watermark.' },
      { q: 'Will the watermark hide my text?', a: 'Light and Medium let the page show through clearly. Strong is for when the mark matters more than easy reading.' },
      { q: 'Are my files uploaded?', a: 'No. The watermark is added in your browser.' },
    ],
  },
  {
    slug: 'edit-text-in-pdf',
    title: 'Edit text in PDF: change words, free',
    h1: 'How to edit the text in a PDF',
    description: 'Fix a typo, change a date or an amount, or find and replace a word in a PDF. Free, no sign-up, no watermark, and your file is never uploaded.',
    tool: 'edit-text',
    related: ['add-text', 'remove-areas', 'pdf-to-word'],
    intro: 'Open Edit text, tap the line you want to change, type the new words and press Save the changes.',
    steps: [
      'Open Edit text and add the PDF.',
      'Tap any outlined words on the page.',
      'Change them in the box above the page.',
      'Use Find and replace to change a word everywhere at once.',
      'Press Save the changes and save the new file.',
    ],
    sections: [
      {
        heading: 'How the change is made',
        paragraphs: [
          'The old words are painted over in the page’s own colour and the new ones written in their place, in the nearest built-in font. In a table, each cell is its own piece, so changing one amount in a row changes only that amount, and figures keep their right edge.',
        ],
      },
      {
        heading: 'The old words are still underneath',
        paragraphs: [
          'Painting over does not delete. Anyone who copies the text from the page can still find the old words. If the point of the change is to hide something, use [Remove areas](/tools/remove-areas/), which takes it out of the file for good.',
        ],
      },
      {
        heading: 'When to use something else',
        paragraphs: [
          'Edit text changes words already on the page. To write something new, such as a name on a blank line, use [Add text](/tools/add-text/). For a long rewrite, [PDF to Word](/tools/pdf-to-word/) gives you an editable document to work on. A scanned page has no words to edit, only a picture of them.',
        ],
      },
    ],
    faq: [
      { q: 'Will the new text match the old font?', a: 'It uses the nearest of the built-in fonts, so it is close but not always identical, especially with decorative fonts.' },
      { q: 'Does find and replace match parts of words?', a: 'No. It matches whole words and whole numbers, so 5,000.00 does not change 15,000.00.' },
      { q: 'Can I edit a scanned PDF?', a: 'Not with this tool; a scan has no text in it. Add new words over it with [Add text](/tools/add-text/).' },
    ],
  },
  {
    slug: 'fill-pdf-form',
    title: 'Fill PDF form online free, no sign-up',
    h1: 'How to fill in a PDF form',
    description: 'Type into the fields of a PDF form, tick the boxes, and save it filled in or sealed. Free, no sign-up, and your answers never leave your device.',
    tool: 'fill-form',
    related: ['add-text', 'sign', 'create-form'],
    intro: 'Open Fill in a form, add the PDF, type your answers in the boxes it lists, and press Fill it in.',
    steps: [
      'Open Fill in a form and add the PDF form.',
      'Type your answers in the fields shown, and tick the boxes that apply.',
      'Tick Seal the answers if nobody should change them afterwards.',
      'Tick Also save my answers as a file if you will fill the same form again.',
      'Press Fill it in and save the filled form.',
    ],
    sections: [
      {
        heading: 'If it says the PDF has no fields',
        paragraphs: [
          'Many forms are just printed pages saved as PDF, with lines to write on but no boxes to type into. The tool says so when it finds no fields. Write on those with [Add text](/tools/add-text/): tap the line and type. If you will hand the same form to many people, [Create a form](/tools/create-form/) turns it into a real fillable one.',
        ],
      },
      {
        heading: 'Sealed or still editable',
        paragraphs: [
          'Leave Seal the answers off and the form stays fillable, so it can be corrected later. Turn it on and the answers become part of the page, which is what you want before sending a final copy.',
        ],
      },
      {
        heading: 'The same form next month',
        paragraphs: [
          'Also save my answers as a file keeps a small .json of what you typed. Next time, choose that file and the form fills itself in. It also reads .xfdf answers saved from Adobe Acrobat. Then sign the form with [Sign](/tools/sign/).',
        ],
      },
    ],
    faq: [
      { q: 'Are my answers sent anywhere?', a: 'No. They are written into the PDF in your browser. Nothing you type leaves your device.' },
      { q: 'Can I fill a form that has a password?', a: 'Yes. Type its password when asked; the filled copy keeps the same password.' },
      { q: 'Do I need Adobe Acrobat?', a: 'No. Any browser on a phone or computer works.' },
    ],
  },
  {
    slug: 'make-pdf-fillable',
    title: 'Make a PDF fillable: create form fields, free',
    h1: 'How to make a PDF form fillable',
    description: 'Turn a printed form into a PDF people can type into, with text boxes, tick boxes and lists. Free, no sign-up, and nothing is uploaded.',
    tool: 'create-form',
    related: ['fill-form', 'scan', 'add-password'],
    intro: 'Open Create a form, tap Find the blanks for me, check the fields it adds, and press Make it fillable.',
    steps: [
      'Open Create a form and add the PDF.',
      'Tap Find the blanks for me to turn lines and empty boxes into fields.',
      'Drag across any other space where an answer goes, choosing Text, Paragraph, Tick box or Choice list.',
      'Tap a field to rename it or take it away.',
      'Press Make it fillable and save the form.',
    ],
    sections: [
      {
        heading: 'Finding the blanks',
        paragraphs: [
          'Find the blanks looks through the page’s text for lines of underscores and empty tick boxes, and puts a field on each, named after the words beside it. It saves a lot of dragging on a long form, but check every one: a decorative line may become a field it should not.',
        ],
      },
      {
        heading: 'Real form fields',
        paragraphs: [
          'The fields are standard PDF form fields, so the form can be filled in Adobe Acrobat, a phone’s PDF viewer, a browser, or [Fill in a form](/tools/fill-form/). Choice lists offer the options you type, so answers come back consistent.',
        ],
      },
      {
        heading: 'Starting from paper',
        paragraphs: [
          'Only have a printed copy? Photograph it with [Scan](/tools/scan/) in Black and white, then bring the PDF here. A scan is a picture with no text in it, so Find the blanks has nothing to look through: drag the fields on by hand.',
        ],
      },
    ],
    faq: [
      { q: 'What kinds of field can I add?', a: 'Text, Paragraph for longer answers, Tick box, and Choice list.' },
      { q: 'Is my form uploaded?', a: 'No. The fields are added in your browser.' },
      { q: 'Can people fill it on a phone?', a: 'Yes. Most phone PDF viewers and browsers can fill standard form fields.' },
      { q: 'Does it change how the form looks?', a: 'No. The fields sit over the page; the printed form underneath is not touched.' },
    ],
  },

  // ---- Protect ----
  {
    slug: 'password-protect-pdf',
    title: 'Password protect a PDF with AES-256, free',
    h1: 'How to put a password on a PDF',
    description: 'Lock a PDF with a password using AES-256, so nobody can open it without it. Free, no sign-up, and the file and password never leave your device.',
    tool: 'add-password',
    related: ['remove-password', 'watermark', 'document-details'],
    intro: 'Open Add a password, type the password twice, and press Lock it. The locked copy cannot be opened without that password.',
    steps: [
      'Open Add a password and add the PDF.',
      'Leave Lock it with a password selected.',
      'Type the password, then type it again.',
      'Choose whether printing, copying and changes are allowed.',
      'Press Lock it and save the locked copy.',
    ],
    sections: [
      {
        heading: 'Choosing a password',
        paragraphs: [
          'The lock is AES-256, the strongest kind a PDF can carry, but a password anyone can guess undoes it. Avoid your date of birth or phone number alone if the file is going to people who know them. Send the password a different way from the file, such as a phone call or a separate message.',
        ],
      },
      {
        heading: 'Write it down',
        paragraphs: [
          'Nobody can open the file without the password, us included. It is never stored or sent anywhere, so there is no reset. Keep the unlocked original, or the password, somewhere safe.',
        ],
      },
      {
        heading: 'Only restricting printing and copying',
        paragraphs: [
          'Only restrict printing, copying and editing makes a file that opens for anyone, with those actions blocked in readers that respect the settings. Most do, but someone determined can switch them off, so use a real password for anything secret. To mark a copy as yours, add a [watermark](/tools/watermark/); to strip the author and other hidden details before sending, use [Clean hidden data](/tools/document-details/).',
        ],
      },
    ],
    faq: [
      { q: 'Can I lock several PDFs with the same password?', a: 'Yes. Add them all; each is locked with the password you type.' },
      { q: 'Is my password sent to your server?', a: 'There is no server. The file is locked in your browser, and the password is never stored or sent.' },
      { q: 'How do I take the password off later?', a: 'Use [Remove a password](/tools/remove-password/) and type it in.' },
    ],
  },
  {
    slug: 'hide-aadhaar-number-in-pdf',
    title: 'Hide Aadhaar number in a PDF: masked copy',
    h1: 'How to hide your Aadhaar number before sharing it',
    description: 'Make a masked copy of your Aadhaar with the number truly removed, not just covered. Free, no sign-up, and the file never leaves your own device.',
    tool: 'remove-areas',
    related: ['remove-password', 'images-to-pdf', 'watermark'],
    intro: 'Open Remove areas, add the Aadhaar PDF, drag across the first eight digits wherever the number appears, and press Remove them. The digits are taken out of the file, not just covered.',
    steps: [
      'Open Remove areas and add the Aadhaar PDF, typing its password if asked.',
      'Drag across the first eight digits of the number, leaving the last four showing.',
      'Do the same everywhere the number appears, on every page.',
      'Mark the QR code too if the person does not need it.',
      'Press Remove them and save the masked copy.',
    ],
    sections: [
      {
        heading: 'Why a black box is not enough',
        paragraphs: [
          'Drawing a black rectangle over a number in most editors only covers it. The digits are still in the file underneath, and anyone can copy them out. Remove areas redraws each marked page as a picture with the marked parts painted out, so the hidden digits are not in the file at all.',
        ],
      },
      {
        heading: 'Finding every copy of the number',
        paragraphs: [
          'The number often appears more than once: on the letter, on the card part and sometimes in small print. Open Find and remove, tick Aadhaar numbers and tap Find and mark them to see every one marked. That marks the whole number; for a masked copy that keeps the last four digits, drag across the first eight by hand instead.',
          'The QR code carries your details as well. Mark it if the copy is going somewhere that will not scan it.',
        ],
      },
      {
        heading: 'Photos of the card, and the official route',
        paragraphs: [
          'If you have photos of the card, make them a PDF with [Images to PDF](/tools/images-to-pdf/) first. A photo has no text to search, so drag across the number by hand. UIDAI also lets you download a masked Aadhaar from its own site, showing only the last four digits; either way, check the result before you send it. A light [watermark](/tools/watermark/) saying what the copy is for adds another layer.',
        ],
      },
    ],
    faq: [
      { q: 'Can someone recover the hidden digits?', a: 'No. The marked page is replaced by a picture with those parts painted out; the digits are not in the file.' },
      { q: 'Is my Aadhaar uploaded?', a: 'No. Everything happens in your browser, on your device.' },
      { q: 'Will the rest of the page still work?', a: 'It looks the same, but a marked page becomes a picture, so its other words can no longer be selected or searched.' },
      { q: 'Does UIDAI’s signature still check out?', a: 'No. Any changed copy loses it. Where an office needs to verify the signature, it needs the original.' },
    ],
  },
  {
    slug: 'redact-pdf',
    title: 'Redact PDF for free: remove text, not just cover it',
    h1: 'How to redact a PDF properly',
    description: 'Black out names, numbers and photos in a PDF so they are truly gone, not hidden under a box. Find Aadhaar, PAN or phone numbers too. Free, no upload.',
    tool: 'remove-areas',
    related: ['document-details', 'ocr', 'edit-text'],
    intro: 'Open Remove areas, drag across everything that should go, and press Remove them. Each marked page is rebuilt as a picture with those parts painted out, so the hidden text cannot be copied or recovered.',
    steps: [
      'Open Remove areas and add the PDF.',
      'Drag across each name, number or photo that should go.',
      'Open Find and remove to mark every Aadhaar, PAN, phone number, email, card number or word you type.',
      'Check every page, then press Remove them.',
      'Save the redacted copy and keep the original private.',
    ],
    sections: [
      {
        heading: 'Why black boxes fail',
        paragraphs: [
          'Most editors redact by drawing a black box over the words. The words stay in the file underneath, and anyone can select them, copy them or search for them. Documents have been leaked exactly this way. Real redaction has to take the words out, and that is what this tool does.',
        ],
      },
      {
        heading: 'The cost, honestly',
        paragraphs: [
          'A marked page becomes a picture of itself. It looks the same, but its other words can no longer be selected or searched, and any form answers on that page go too. Pages you do not mark are left as they were. If the file must be searchable again, run [Make searchable](/tools/ocr/) on the result; the removed parts are paint, so there is nothing there to read back.',
        ],
      },
      {
        heading: 'Hidden details beyond the page',
        paragraphs: [
          'A PDF can also carry an author name, the program that made it, comments and attached files. [Clean hidden data](/tools/document-details/) strips those. Painting over words with [Edit text](/tools/edit-text/) does not redact: the old words remain underneath.',
        ],
      },
    ],
    faq: [
      { q: 'What can Find and remove look for?', a: 'Aadhaar numbers, PAN numbers, phone numbers, email addresses and card numbers, plus any words or names you type, separated by commas.' },
      { q: 'Does it find numbers in a scan?', a: 'No. A scan is a picture with no text to search, so drag across those parts by hand.' },
      { q: 'Is my document uploaded?', a: 'No. Redaction happens in your browser. The document never leaves your device.' },
    ],
  },
  {
    slug: 'remove-pdf-metadata',
    title: 'Remove PDF metadata: author, dates and more',
    h1: 'How to remove hidden metadata from a PDF',
    description: 'Strip the author, the program that made it, dates and hidden XMP details from a PDF before you send it. Free, no sign-up, and nothing is uploaded.',
    tool: 'document-details',
    related: ['remove-areas', 'attachments', 'add-password'],
    intro: 'Open Clean hidden data, keep Clean everything hidden selected, and press Clean it. The pages stay exactly as they are.',
    steps: [
      'Open Clean hidden data and add one or more PDFs.',
      'Choose Clean everything hidden, Remove the hidden details, or Set new details.',
      'Untick Comments and notes or Attached files if you want to keep them.',
      'Press Clean it.',
      'Save the cleaned copy and send that one.',
    ],
    sections: [
      {
        heading: 'What a PDF carries besides its pages',
        paragraphs: [
          'Most PDFs record a title, an author, the program that made them and when, often your name as set on the computer that made it. Some also hold a second copy of those details in hidden XMP data, comments from earlier drafts, attached files, and scripts that run when the file opens.',
        ],
      },
      {
        heading: 'The three choices',
        paragraphs: [
          'Clean everything hidden removes the details, the hidden XMP data, scripts and actions, and by choice comments and attached files: the one to use before a file goes outside. Remove the hidden details takes only the details. Set new details lets you write a proper title and author instead, and an empty box removes that detail.',
        ],
      },
      {
        heading: 'What it does not touch',
        paragraphs: [
          'Words and pictures on the pages stay as they are. If a name or number is printed on a page, use [Remove areas](/tools/remove-areas/). The file name is not inside the file; rename it yourself before sending. To look at or take out attached files rather than drop them, use [Attachments](/tools/attachments/).',
        ],
      },
    ],
    faq: [
      { q: 'Will it change how the document looks?', a: 'No. Only hidden data is removed. The pages are not touched.' },
      { q: 'Is my file uploaded?', a: 'No. It is cleaned in your browser.' },
      { q: 'Does this site add its own metadata?', a: 'No. Results never carry this site’s name, and a test checks every tool’s output for it.' },
    ],
  },

  // ---- Convert ----
  {
    slug: 'pdf-to-word',
    title: 'PDF to Word converter: free, even from a scan',
    h1: 'How to convert a PDF to an editable Word file',
    description: 'Convert a PDF to an editable Word .docx with headings, lists and tables, even from a scan. Free, no sign-up, and your file is never uploaded.',
    tool: 'pdf-to-word',
    related: ['office-to-pdf', 'edit-text', 'ocr'],
    intro: 'Open PDF to Word, add the PDF and press Make a Word file. You get a .docx you can edit in Word, Google Docs or any office app.',
    steps: [
      'Open PDF to Word and add the PDF, or several.',
      'Leave Read scanned pages too ticked if any pages are scans.',
      'Press Make a Word file.',
      'Save the .docx and open it in your word processor.',
    ],
    sections: [
      {
        heading: 'What comes across',
        paragraphs: [
          'Headings, paragraphs, lists and tables are worked out from where the words sit on each page, so a tidy PDF comes out tidy. Fonts become their nearest Word font. Pictures stay in the PDF for now, so a document with photos comes across as its text and tables.',
        ],
      },
      {
        heading: 'Scanned pages',
        paragraphs: [
          'A scan is a picture of words. With Read scanned pages too ticked, those pages are read by a text reader before converting, which is slower and best with clear, straight scans. The reader is fetched from this site the first time it is needed.',
        ],
      },
      {
        heading: 'Do you need Word at all?',
        paragraphs: [
          'For a typo or a changed date, [Edit text](/tools/edit-text/) edits the PDF directly and keeps its layout. When you are done in Word, [Word or Excel to PDF](/tools/office-to-pdf/) turns it back, or use your word processor’s own Save as PDF, which keeps your fonts exactly.',
        ],
      },
    ],
    faq: [
      { q: 'Is my PDF uploaded to convert it?', a: 'No. It is read and converted in your browser, on your device.' },
      { q: 'Will it look exactly like the PDF?', a: 'Close, not identical. A PDF fixes every word’s position; a Word file flows text. Complex layouts may need tidying.' },
      { q: 'Can I convert a scanned PDF to Word?', a: 'Yes. Leave Read scanned pages too ticked; it reads English text in the scan.' },
    ],
  },
  {
    slug: 'word-to-pdf',
    title: 'Word to PDF: convert .docx and .xlsx, free',
    h1: 'How to convert a Word document to PDF',
    description: 'Turn a Word .docx or Excel .xlsx into a PDF with the words still selectable. Free, no sign-up, no watermark, and your document never leaves your device.',
    tool: 'office-to-pdf',
    related: ['pdf-to-word', 'merge', 'compress'],
    intro: 'Open Word or Excel to PDF, add the .docx or .xlsx file and press Make the PDF.',
    steps: [
      'Open Word or Excel to PDF.',
      'Add the .docx or .xlsx files.',
      'Press Make the PDF.',
      'Save the PDF, or tap Then to merge or compress it.',
    ],
    sections: [
      {
        heading: 'What is kept',
        paragraphs: [
          'Headings, lists, tables, links and pictures are laid out on A4, with the words kept as real text you can select and search. Wide spreadsheets go on sideways pages. Malayalam, Hindi and other scripts are drawn by your browser, so they show correctly.',
        ],
      },
      {
        heading: 'What is not, yet',
        paragraphs: [
          'Fonts become the nearest of Helvetica, Times or Courier. Headers, footers and footnotes are left out for now. Older .doc and .xls files need saving as .docx or .xlsx first.',
          'If you have Word, Google Docs or LibreOffice, their own Save as PDF or Download as PDF keeps your exact fonts and headers. This tool is for when you do not have them, such as on a phone, or on a work computer where you should not upload files.',
        ],
      },
      {
        heading: 'After converting',
        paragraphs: [
          'Join it with other PDFs using [Merge](/tools/merge/), or bring it under an upload limit with [Compress](/tools/compress/). Going the other way is [PDF to Word](/tools/pdf-to-word/).',
        ],
      },
    ],
    faq: [
      { q: 'Is my document uploaded?', a: 'No. The PDF is laid out in your browser.' },
      { q: 'Can I convert an Excel sheet?', a: 'Yes. Each sheet comes out as a table; wide ones on sideways pages.' },
      { q: 'Why does my .doc file not work?', a: 'Only the newer .docx and .xlsx are read. Open the old file in an office app and save it as .docx first.' },
      { q: 'Can I convert several files at once?', a: 'Yes. Add them all; each becomes its own PDF, and Merge can join them afterwards.' },
    ],
  },
  {
    slug: 'pdf-to-jpg',
    title: 'PDF to JPG: save each page as an image, free',
    h1: 'How to convert PDF pages to JPG images',
    description: 'Save every page of a PDF, or just the ones you pick, as a JPG or PNG image at screen or print sharpness. Free, no sign-up, and nothing is uploaded.',
    tool: 'pdf-to-images',
    related: ['extract-images', 'images-to-pdf', 'extract-pages'],
    intro: 'Open PDF to images, choose JPEG, pick a sharpness and press Save as images. Each page becomes its own picture.',
    steps: [
      'Open PDF to images and add the PDF.',
      'Choose JPEG, or PNG for sharp text and diagrams.',
      'Pick Screen, Sharing or Print sharpness.',
      'Type the pages you want, or leave it empty for all of them.',
      'Press Save as images, then Save all for a folder or one ZIP.',
    ],
    sections: [
      {
        heading: 'Which format and sharpness',
        paragraphs: [
          'JPEG gives smaller files and suits pages with photos. PNG keeps text and lines perfectly crisp but is bigger. Screen is 72 dpi, for a quick look or the smallest file; Sharing is 150 dpi, good for WhatsApp; Print is 300 dpi.',
        ],
      },
      {
        heading: 'When a form wants an image',
        paragraphs: [
          'Some portals want a certificate as a JPG, not a PDF. Pick the one page, choose JPEG at Sharing or Screen, and save. A single page at Screen sharpness is usually small. If the text looks too soft at Screen, try Sharing and check the size again.',
        ],
      },
      {
        heading: 'Pages or the photos inside them?',
        paragraphs: [
          'This tool draws each whole page as a picture. If you want the original photos stored inside the PDF at full quality, use [Extract images](/tools/extract-images/). To go the other way, [Images to PDF](/tools/images-to-pdf/) turns pictures into a PDF.',
        ],
      },
    ],
    faq: [
      { q: 'Is my PDF uploaded?', a: 'No. Pages are drawn as images in your browser.' },
      { q: 'Can I convert just one page?', a: 'Yes. Type its number in Pages, such as 3.' },
      { q: 'How do I get all the images at once?', a: 'Save all saves them into a folder you choose, or as one ZIP where the browser cannot save to a folder.' },
      { q: 'Can I send the pages on WhatsApp?', a: 'Yes. On phones that can share files, Share sends the images straight to WhatsApp or any other app.' },
    ],
  },
  {
    slug: 'extract-images-from-pdf',
    title: 'Extract images from PDF at original quality',
    h1: 'How to extract images from a PDF',
    description: 'Save the photos and pictures stored inside a PDF as files, exactly as they are, with no re-compression. Free, no sign-up, and nothing is uploaded.',
    tool: 'extract-images',
    related: ['pdf-to-images', 'edit-images', 'compress'],
    intro: 'Open Extract images, add the PDF and press Pull the images out. Every picture inside comes out as its own file, at the quality it was stored.',
    steps: [
      'Open Extract images and add the PDF.',
      'Press Pull the images out.',
      'Look through the list: each image says its size and the page it came from.',
      'Save the ones you want, or Save all.',
    ],
    sections: [
      {
        heading: 'Originals, not screenshots',
        paragraphs: [
          'The images are taken out exactly as they are stored in the file: no redrawing, no re-compression, no loss. A JPEG comes out as the same JPEG that was put in, often at a far higher resolution than the page shows.',
        ],
      },
      {
        heading: 'When it finds nothing, or one image per page',
        paragraphs: [
          'Drawings, charts and text are not pictures, so they do not come out. A scanned PDF usually stores each page as one image, so you get one picture per page. A few images use colour formats that cannot be saved as files yet; the result says how many. To capture a page exactly as it looks, use [PDF to images](/tools/pdf-to-images/).',
        ],
      },
      {
        heading: 'Changing the pictures instead',
        paragraphs: [
          'To move, resize, take out or swap a picture inside the PDF itself, use [Edit pictures](/tools/edit-images/). If the PDF is big because of its pictures, [Compress](/tools/compress/) makes them lighter. Pictures in a file you received may belong to someone else, so check before you reuse them.',
        ],
      },
    ],
    faq: [
      { q: 'Are the images lower quality than the originals?', a: 'No. They are the bytes stored in the PDF, saved as they are.' },
      { q: 'Is my PDF uploaded?', a: 'No. The images are taken out in your browser.' },
      { q: 'Some images came out as .jp2 files. What are they?', a: 'JPEG 2000, a format some PDFs use. Many photo viewers cannot open it; [PDF to images](/tools/pdf-to-images/) gives you the page as an ordinary JPEG.' },
    ],
  },

  // ---- Read and capture ----
  {
    slug: 'make-scanned-pdf-searchable',
    title: 'OCR PDF: make a scanned PDF searchable, free',
    h1: 'How to make a scanned PDF searchable',
    description: 'Read the words in a scanned PDF so you can search and copy them, in English, Malayalam, Hindi, Tamil and more. Free, private, never uploaded.',
    tool: 'ocr',
    related: ['scan', 'extract-text', 'pdf-to-word'],
    intro: 'Open Make searchable, pick the language the scan is in, and press Make it searchable. The words are laid invisibly over each page, which looks exactly the same.',
    steps: [
      'Open Make searchable and add the scanned PDF.',
      'Pick the main language of the scan, and up to two more if it mixes languages.',
      'Press Make it searchable.',
      'Save the result and search it with your PDF reader’s find.',
    ],
    sections: [
      {
        heading: 'Languages',
        paragraphs: [
          'English is ready straight away. Twenty more can be picked, among them Malayalam, Hindi, Tamil, Telugu, Kannada, Bengali, Marathi, Gujarati, Punjabi and Urdu, as well as Arabic, French, Chinese and Japanese. Each is fetched from this site the first time you pick it, and the size is shown before you start. Pick only the languages actually on the page: each extra one makes the reading slower.',
        ],
      },
      {
        heading: 'Indian scripts, honestly',
        paragraphs: [
          'The invisible layer inside the PDF can hold English letters only for now. When you pick Malayalam, Hindi or another language not written in English letters, everything read also comes out as a .txt file beside the PDF, so you can copy and search it there. The result says which file holds what.',
        ],
      },
      {
        heading: 'Better scans read better',
        paragraphs: [
          'Straight, sharp, high-contrast pages read best. [Scan](/tools/scan/) in Black and white gives the reader its easiest job. Pages that already have text are left alone. To get the words out as plain text afterwards, use [Extract text](/tools/extract-text/); for an editable document, [PDF to Word](/tools/pdf-to-word/).',
        ],
      },
    ],
    faq: [
      { q: 'Is my scan uploaded to be read?', a: 'No. The reading happens in your browser. Only the language model comes from this site, once; your document goes nowhere.' },
      { q: 'Will it change how my pages look?', a: 'No. The words go in as an invisible layer; the pictures are not touched.' },
      { q: 'How accurate is it?', a: 'Very good on clean printed text, weaker on handwriting, faint copies and unusual fonts. Check anything important.' },
      { q: 'Can I pick more than one language?', a: 'Yes, up to three. More than that makes the reading worse, not better.' },
    ],
  },
  {
    slug: 'hra-rent-receipt-generator',
    title: 'Rent receipt generator for HRA: free PDF',
    h1: 'How to make rent receipts for your HRA claim',
    description: 'Make monthly rent receipts for HRA in one PDF: amount in words, owner’s PAN, ready to print and sign. Free, nothing to upload, nothing stored.',
    tool: 'rent-receipts',
    related: ['sign', 'merge', 'scan'],
    intro: 'Open Rent receipts, type your name, the owner’s name, the address and the monthly rent, choose the months, and press Make the receipts. No file needed.',
    steps: [
      'Open Rent receipts and type your name, the owner’s name and the address.',
      'Type the monthly rent and choose the first month and how many months.',
      'Choose how you paid: bank transfer, UPI, cheque or cash.',
      'Type the owner’s PAN if the rent is over ₹1,00,000 a year.',
      'Press Make the receipts, then print, have each one signed, and give them to your employer.',
    ],
    sections: [
      {
        heading: 'What the receipts contain',
        paragraphs: [
          'One receipt per month, two to a page: who paid, the amount in figures and in words (Rupees Fifteen Thousand only), the month, the property address, how it was paid, the owner’s name, and a line for the owner’s signature and the date. The first month starts in April, the start of the financial year, unless you change it. Up to 24 months at once.',
        ],
      },
      {
        heading: 'When the owner’s PAN is needed',
        paragraphs: [
          'If the rent you pay comes to more than ₹1,00,000 in the year, about ₹8,333 a month, your employer needs your landlord’s PAN to allow the HRA exemption. Type it and it is printed on every receipt.',
          'For rent paid in cash over ₹5,000, receipts commonly carry a revenue stamp signed across by the owner. Choose Cash and the receipts mark the place for one.',
        ],
      },
      {
        heading: 'Before you hand them in',
        paragraphs: [
          'The HRA exemption is claimed under the old tax regime; the new regime does not allow it. Receipts should match what you actually paid, and keeping bank or UPI records of the payments helps if you are asked. If your employer takes the receipts online, have them signed, photograph them with [Scan](/tools/scan/), and send one PDF; [Merge](/tools/merge/) joins it with your rent agreement if needed.',
        ],
      },
    ],
    faq: [
      { q: 'Is what I type stored or sent anywhere?', a: 'No. The receipts are made in your browser and nothing you type is kept or sent.' },
      { q: 'Can I sign them on screen?', a: 'The owner signs the receipts, not you. If your employer accepts a signature placed on the PDF, the owner can use [Sign](/tools/sign/); otherwise print them and sign in ink.' },
      { q: 'Can the names be in Malayalam or Hindi?', a: 'Yes. Words the PDF fonts cannot draw are drawn by your browser so they show correctly.' },
      { q: 'What if I moved house during the year?', a: 'Make two sets: one for the months at each address, with each owner’s name.' },
    ],
  },
  {
    slug: 'compare-two-pdfs',
    title: 'Compare two PDFs: see every word that changed',
    h1: 'How to compare two versions of a PDF',
    description: 'See what changed between two PDFs, word by word: new words highlighted, removed words noted. Free, no sign-up, and neither file is uploaded.',
    tool: 'compare',
    related: ['read', 'ocr', 'mark-up'],
    intro: 'Open Compare, add the older version first and then the newer one, and press Compare them. The newer file comes back with every change marked.',
    steps: [
      'Open Compare.',
      'Add the older version first, then the newer one.',
      'Press Compare them.',
      'Open the marked copy: new words are highlighted in green, and a comment marks each place words were taken out.',
    ],
    sections: [
      {
        heading: 'What it compares',
        paragraphs: [
          'Words, not pictures or layout. A paragraph that moved does not make everything after it look changed. Fonts, spacing and images are not compared.',
        ],
      },
      {
        heading: 'Good for',
        paragraphs: [
          'A rent agreement or offer letter that came back revised, a contract after the other side’s edits, a policy document with a new version. Reading two long versions side by side is slow and easy to get wrong; a word-by-word comparison misses nothing. Read the marked copy in any PDF reader, or in [Read](/tools/read/), which lists the comments so you can step through each removal.',
        ],
      },
      {
        heading: 'Scanned versions',
        paragraphs: [
          'A scan has no words to compare, only pictures of them. Run each version through [Make searchable](/tools/ocr/) first, then compare the results. To add your own notes to the marked copy, use [Mark up](/tools/mark-up/).',
          'Order matters. Add the older version first: the newer one is the file that comes back marked, so green always means added since the older version, and a comment always means taken out.',
        ],
      },
    ],
    faq: [
      { q: 'Are my documents uploaded?', a: 'No. Both are read and compared in your browser.' },
      { q: 'Can I compare more than two files?', a: 'Two at a time: the older, then the newer.' },
      { q: 'Does it change the newer file?', a: 'No. You get a new, marked copy; both files you picked stay as they were.' },
      { q: 'Does it notice a changed number, like a rent amount?', a: 'Yes. Numbers are words too: the new amount is highlighted and a comment shows the old one.' },
    ],
  },
  {
    slug: 'pdf-to-epub',
    title: 'PDF to EPUB: read a PDF easily on your phone',
    h1: 'How to convert a PDF to EPUB for a phone or e-reader',
    description: 'Turn a PDF into an EPUB e-book or a web page whose text reflows to fit a phone or Kindle screen. Free, no sign-up, and the file is never uploaded.',
    tool: 'pdf-to-epub',
    related: ['read', 'ocr', 'pdf-to-word'],
    intro: 'Open PDF to EPUB, choose EPUB e-book, and press Make the e-book. The text then reflows to fit any screen instead of making you zoom and scroll.',
    steps: [
      'Open PDF to EPUB or web page and add the PDF.',
      'Choose EPUB e-book, or A web page for one .html file.',
      'Tick Read scanned pages too if the PDF is a scan.',
      'Press Make the e-book.',
      'Open the EPUB in Apple Books, Google Play Books or another reader, or send it to a Kindle.',
    ],
    sections: [
      {
        heading: 'Why a PDF is hard to read on a phone',
        paragraphs: [
          'A PDF keeps every page the size it was printed, so on a phone you zoom in and drag sideways along every line. An EPUB holds the text, not the page, so the reader app wraps it to your screen and lets you choose the font size.',
        ],
      },
      {
        heading: 'What to expect',
        paragraphs: [
          'Chapters start at each heading. The page layout gives way to plain flowing text, so it suits books, reports and notes much better than forms, slides or anything laid out in columns. Amazon’s Send to Kindle accepts EPUB files.',
        ],
      },
      {
        heading: 'Reading the PDF as it is',
        paragraphs: [
          'If the layout matters, [Read](/tools/read/) opens the PDF itself with zoom, find and a night mode. For a scan, Read scanned pages too reads the words first; for a better reading, [Make searchable](/tools/ocr/) offers more languages.',
        ],
      },
    ],
    faq: [
      { q: 'Is my book uploaded?', a: 'No. It is converted in your browser.' },
      { q: 'Are pictures kept?', a: 'The conversion is about the text. For a picture-heavy PDF, read it as a PDF instead.' },
      { q: 'What is the web page option for?', a: 'One .html file that opens in any browser, with the text reflowing like an e-book. Handy for sharing or for screen readers.' },
    ],
  },
  {
    slug: 'convert-pdf-to-pdf-a',
    title: 'Convert PDF to PDF/A for court and archive filing',
    h1: 'How to convert a PDF to PDF/A',
    description: 'Make a PDF/A-2b archive copy for court filing or long-term records, with a colour profile and details inside. Free, no sign-up, no upload.',
    tool: 'pdf-a',
    related: ['digital-sign', 'document-details', 'compress'],
    intro: 'Open Archive copy (PDF/A), add the PDF and press Make the archive copy. You get a PDF/A-2b copy; the pages look exactly the same.',
    steps: [
      'Open Archive copy (PDF/A) and add one or more PDFs.',
      'Press Make the archive copy.',
      'Read the result line, which says what was changed and anything a strict checker would flag.',
      'Save the copy, and check it with the portal’s own validator if it has one.',
    ],
    sections: [
      {
        heading: 'What PDF/A is',
        paragraphs: [
          'PDF/A is the form of PDF made for keeping. It must carry everything needed to show it the same way in decades, and nothing that depends on outside programs. Some court e-filing systems, government offices and record keepers ask for it.',
        ],
      },
      {
        heading: 'What changes',
        paragraphs: [
          'A colour profile and the archive details go inside. Scripts and attached files come out, as the standard asks, and a password is removed, because an archive must open for anyone. The pages themselves stay exactly as they are.',
        ],
      },
      {
        heading: 'Fonts, honestly',
        paragraphs: [
          'PDF/A needs every font the file uses to be inside it. A font that is missing cannot be added without the font itself, so the result says so rather than claiming the copy passes. Saving the document again from the program that made it, with fonts embedded, and then making the archive copy fixes that.',
          'If the filing also needs a [digital signature](/tools/digital-sign/), make the archive copy first and sign it afterwards: any change after signing breaks the signature. If the portal also has a size limit, see [compress to 1 MB](/guides/compress-pdf-to-1mb/).',
        ],
      },
    ],
    faq: [
      { q: 'Which PDF/A version does it make?', a: 'PDF/A-2b, the level most portals that ask for PDF/A accept.' },
      { q: 'Is my document uploaded?', a: 'No. The archive copy is made in your browser.' },
      { q: 'Will it pass a validator?', a: 'If the file has its fonts inside it, it is built to. If not, the result tells you before you find out from the portal.' },
    ],
  },

  // ---- The privacy question ----
  {
    slug: 'is-it-safe-to-upload-pdf-online',
    title: 'Is it safe to upload PDFs to online PDF tools?',
    h1: 'Is it safe to upload your PDF to an online tool?',
    description: 'What happens to a PDF when you upload it to an online tool, and how to use PDF tools that never upload it at all. Free, no sign-up, checkable.',
    tool: 'compress',
    related: ['merge', 'remove-areas', 'document-details'],
    intro: 'When you upload a PDF, a copy goes to someone else’s computer and you are trusting what they do with it. Tools that work inside your browser never send the file, so there is nothing to trust.',
    steps: [
      'Open the tool you need, such as Compress or Merge, and let the page load.',
      'Switch on airplane mode or turn off Wi-Fi.',
      'Add your PDF and run the tool.',
      'See that it still works: the file never needed the internet, so it was never sent.',
    ],
    sections: [
      {
        heading: 'How most PDF sites work',
        paragraphs: [
          'Most PDF sites upload your file to their server, do the work there, and send the result back. Many say they delete files after a while, and many probably do. But the copy has left your device, it passes through their systems, and you cannot check what happens to it. For a bank statement, an Aadhaar or a salary slip, that is a real question.',
        ],
      },
      {
        heading: 'How this site works',
        paragraphs: [
          'Every tool here runs in your browser. There is no server that could receive your file: the site is a folder of pages and scripts, and every page tells the browser it may connect to this site only. Once a tool page has loaded, the tool works with no connection at all.',
          'You can check this yourself. The airplane-mode test above is one way. Another, on a computer, is the browser’s developer tools: open the Network tab and watch as you run a tool. No file goes out.',
        ],
      },
      {
        heading: 'What still needs care',
        paragraphs: [
          'Keeping a file away from strangers while you work on it does not make it safe to send. Before sharing, take out what the reader does not need with [Remove areas](/tools/remove-areas/), and strip the author and other hidden details with [Clean hidden data](/tools/document-details/). On a shared computer, remember that what you save goes into its Downloads folder.',
        ],
      },
    ],
    faq: [
      { q: 'If nothing is uploaded, how does it work?', a: 'Your browser can do far more than show pages. The tools are programs that run inside it, using your device’s own processor and memory.' },
      { q: 'Do you keep any record of my files?', a: 'No. Not a file, not a name, not a page count. There is no server to keep them on.' },
      { q: 'Why is it free?', a: 'Because there is no server doing the work, each file costs us nothing to process. That is also why there are no limits.' },
    ],
  },
  {
    slug: 'pdf-tools-that-work-offline',
    title: 'PDF tools that work offline, in your browser',
    h1: 'PDF tools that work with no internet',
    description: 'Merge, split, compress, sign and read PDFs with no internet connection, on a phone or computer. Free, installable, nothing uploaded, no sign-up.',
    tool: 'read',
    related: ['merge', 'compress', 'sign', 'ocr'],
    intro: 'Open the site once with a connection and every tool keeps working without one. You can also install it so it opens from your home screen like an app.',
    steps: [
      'Open this site once while you are online.',
      'Choose Install or Add to Home screen from your browser’s menu, if you like.',
      'Go offline: a flight, a train, or a place with no signal.',
      'Open the site or the installed app and use any tool as normal.',
    ],
    sections: [
      {
        heading: 'Why it works offline',
        paragraphs: [
          'The tools run in your browser, not on a server, so the internet is only needed to fetch the site itself. After your first visit, the site keeps its pages, scripts and fonts on your device and opens them from there when there is no connection. If your phone’s data saver is on, it skips this to save your data.',
        ],
      },
      {
        heading: 'What needs the internet once',
        paragraphs: [
          'A few things are fetched the first time they are used and kept afterwards. [Make searchable](/tools/ocr/) downloads each reading language the first time you pick it. Summarise and translate uses the AI built into your browser, which may download its own model once. Everything else, from [Merge](/tools/merge/) to [Compress](/tools/compress/) and [Sign](/tools/sign/), needs nothing more.',
        ],
      },
      {
        heading: 'Proof that nothing is uploaded',
        paragraphs: [
          'A tool that works with the internet switched off cannot be sending your file anywhere. That is why this matters beyond flights: it is the simplest way to check a privacy promise. See [is it safe to upload PDFs online](/guides/is-it-safe-to-upload-pdf-online/) for more.',
        ],
      },
    ],
    faq: [
      { q: 'Do I have to install anything?', a: 'No. Installing is optional; the site works offline in the browser once you have visited it.' },
      { q: 'Does it work offline on a phone?', a: 'Yes, in any current phone browser.' },
      { q: 'Is it the same as the online version?', a: 'Yes. There is only one version: the tools always run on your device.' },
    ],
  },
];
