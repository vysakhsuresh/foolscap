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
  /** Two to six short sections of real help (why it happens, what to watch for, a worked example, common mistakes). */
  readonly sections: ReadonlyArray<{ readonly heading: string; readonly paragraphs: readonly string[] }>;
  /** Three to six questions people really ask, with short true answers. Used for FAQPage structured data. */
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
      'Save the file, or tap Send to hand it to another app.',
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
          'If photos alone cannot get the file under 100 KB, the result says so. Tick Let pages become pictures and run it again: each page is redrawn as one picture, as sharp as the limit allows. It looks the same, and its words are kept invisibly underneath, so it can still be searched and copied.',
        ],
      },
      {
        heading: 'When 100 KB is still too small',
        paragraphs: [
          'A long document may not fit in 100 KB and stay readable. Upload only the pages the portal asks for: [Extract pages](/tools/extract-pages/) makes a file with just those. If you are photographing a certificate, [Scan](/tools/scan/) in Black and white gives a far smaller file to begin with than a colour photo.',
          'We count 1 KB as 1,000 bytes. A file made under 100 KB here is also under 100 KB on a portal that counts 1 KB as 1,024 bytes.',
        ],
      },
      {
        heading: 'Common mistakes',
        paragraphs: [
          'The most common one is compressing a file that was already compressed, again and again. Each round softens the photos a little more while the size barely moves. Always start from the original: Compress never changes the file you picked, so it is still there to go back to.',
          'Another is photographing a certificate in colour under a yellow bulb. The colour cast, the shadow and the table around the page all take up room that sharp text could have used. Re-take it in daylight, or use [Scan](/tools/scan/) in Black and white, before you compress.',
        ],
      },
    ],
    faq: [
      { q: 'Will my document still be readable?', a: 'For most certificates and forms, yes. Compress picks the gentlest setting that fits. If 100 KB is too small for the file to stay readable, it tells you so, and with Let pages become pictures ticked it gives you the smallest version that still reads.' },
      { q: 'Is my file uploaded anywhere?', a: 'No. The work happens in your browser, on your device. Nothing is sent to us or anyone else, and the tool keeps working with the internet switched off.' },
      { q: 'Can I compress several PDFs at once?', a: 'Yes. Add them all and each comes back under 100 KB. Save all saves them together, as a folder or one ZIP.' },
      { q: 'The portal wants a JPG, not a PDF. Will this help?', a: 'Not directly; Compress makes PDFs smaller. To turn a page into a picture, use [PDF to images](/tools/pdf-to-images/) with JPEG at Screen sharpness, which gives the smallest image.' },
      { q: 'The portal says my file is still too big. Why?', a: 'Check that you chose the new file, not the original: the new one’s name ends with (under 100 KB). If the portal still refuses it, run it again with Other and a slightly lower size, such as 90, in case the portal counts differently from what it says.' },
      { q: 'Can I do this on my phone?', a: 'Yes. It works in the phone’s browser. A long scan takes a little longer on a phone than on a computer, and a line shows what it is doing.' },
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
      {
        heading: 'What 200 KB can hold',
        paragraphs: [
          'As a rough guide, 200 KB comfortably holds one or two clear scanned pages, or many pages of a typed document with a logo or two. A typed PDF straight from a word processor or a bank’s website is often far under the limit already, because text takes very little space; the size of a PDF is almost always in its pictures. If yours is a scan of many pages, all of them share the same 200 KB, so expect softer photos the more pages there are.',
        ],
      },
      {
        heading: 'A worked example',
        paragraphs: [
          'Say a scholarship form wants your caste certificate, income certificate and a marksheet as one PDF under 200 KB, and you have three phone photos of a few MB each. Open [Scan](/tools/scan/), add the three photos, choose Black and white and A4, and press Make the PDF. Tap Then, choose Compress, pick To a size and 200 KB, and press Compress it.',
          'The result line gives the new size and says how sharp the photos stayed. Open the file once before uploading and zoom in on the smallest print, such as a roll number, to check it can be read.',
        ],
      },
      {
        heading: 'If the portal still refuses it',
        paragraphs: [
          'Some portals refuse a file for reasons other than its size: a password on the PDF, or a file name with spaces and symbols. Take any password off with [Remove a password](/tools/remove-password/), rename the file to something plain such as marksheet.pdf, and try again. If the portal insists the size is wrong when it is not, make the file again with Other and a slightly lower size, such as 190.',
        ],
      },
    ],
    faq: [
      { q: 'Why does my PDF come out at, say, 180 KB and not exactly 200?', a: 'Compress stops at the gentlest setting that fits under the limit, so the result is usually a little under it. That is the sharpest version that fits.' },
      { q: 'What if it cannot reach 200 KB?', a: 'The result says so and gives you the smallest file it could make with the text kept as text. Tick Let pages become pictures to go further.' },
      { q: 'Is there a limit on file size or how many I do?', a: 'No. There is no server, so there is nothing to limit. Your own device does the work.' },
      { q: 'Should I compress each certificate separately or together?', a: 'Follow the form. If it has one upload box per document, compress each one to the limit on its own. If it has one box for everything, merge first, then compress the merged file.' },
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
      {
        heading: 'Where 50 KB limits turn up',
        paragraphs: [
          'Very small limits usually apply to a single page: a signature, a caste or domicile certificate, a photo ID, a category certificate on a recruitment or exam portal. They are normally set per document, and the instructions often give a format and sometimes pixel sizes as well. Read those first. If the portal asks for a JPG rather than a PDF, this is the wrong tool: save the page with [PDF to images](/tools/pdf-to-images/) as a JPEG at Screen sharpness instead.',
        ],
      },
      {
        heading: 'A worked example',
        paragraphs: [
          'Suppose a form wants your Class 10 certificate as a PDF under 50 KB, and you have a colour phone photo of it. Open Scan, add the photo, check the corners, choose Black and white and A4, and press Make the PDF. Tap Then and choose Compress. Choose To a size, then Other, type 50, tick Let pages become pictures, and press Compress it.',
          'A single black and white page usually fits. Zoom in on the result to check that your name, the roll number and the marks are still clear before you upload it.',
        ],
      },
      {
        heading: 'When it says 50 KB is too small',
        paragraphs: [
          'If the result says the limit is too small for the file to stay readable, take it seriously: an unreadable upload can get an application rejected just as surely as one that is too big. Cut the file down to the one page that matters, take the photo again in better light, or check whether the portal allows a larger size for that kind of document. Some forms list different limits for different documents on the same page.',
        ],
      },
    ],
    faq: [
      { q: 'What is the smallest size I can ask for?', a: '10 KB. Below that, a page cannot hold enough detail to be read.' },
      { q: 'Will the words still be selectable?', a: 'Only if photo shrinking alone was enough. If pages had to become pictures to fit, the result says so and the words are part of the picture.' },
      { q: 'Does the tool add a watermark or a logo?', a: 'No. Nothing is added to your document, ever.' },
      { q: 'Why is my one-page PDF so far over 50 KB to start with?', a: 'A phone photo of one page is usually a few MB, because it records every shade of the paper and the table around it. Scanning it in black and white throws away what the page does not need.' },
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
      {
        heading: 'To a size, or Light, Balanced and Strong?',
        paragraphs: [
          'Compress works in two ways. To a size aims for a number, which is what an upload form needs. Light, Balanced and Strong each apply one fixed setting and give whatever size comes out, which suits a file you are emailing or keeping. If the form says under 500 KB, use To a size: one fixed setting might give 300 KB on one file and 900 KB on another, and only To a size keeps trying until it fits.',
        ],
      },
      {
        heading: 'A worked example',
        paragraphs: [
          'A visa or loan file wants your last six months of salary slips as one PDF under 500 KB. If they arrived as separate PDFs from your employer’s payroll site, add them all to [Merge](/tools/merge/), put them in date order and press Merge into one file. Tap Then, choose Compress, pick To a size and 500 KB, and press Compress it.',
          'Typed salary slips are mostly text, so they often fit without any visible change. If the slips are scans, the result line says how sharp the photos stayed.',
        ],
      },
      {
        heading: 'Checking quality before you send',
        paragraphs: [
          'Open the compressed file and zoom in on the smallest print, such as an account number or a seal. If it is crisp, you are done. If it has gone soft, use a bigger limit if one is allowed, or take out pages that are not needed with [Extract pages](/tools/extract-pages/). Do not compress the result a second time: start again from the original, which is always left as it was.',
        ],
      },
    ],
    faq: [
      { q: 'Does compressing change my text?', a: 'No. Text and drawings are never touched. Only photos are made lighter, unless you tick Let pages become pictures.' },
      { q: 'My file is already under 500 KB. What happens?', a: 'Nothing is changed. The result says the file is already under 500 KB.' },
      { q: 'Do I need to install anything?', a: 'No. It runs in the browser you already have, on a phone or a computer.' },
      { q: 'Is my file uploaded to be compressed?', a: 'No. It is made smaller in your browser, on your device, and nothing is sent anywhere.' },
      { q: 'Will a 500 KB file print well?', a: 'Typed text prints perfectly at any size, because it is never touched. Photos at this size are usually fine for an ID or a certificate; for a brochure or photographs, print the original instead.' },
      { q: 'Can I pick a size between the ready ones, like 400 KB?', a: 'Yes. Choose Other and type 400. Any size from 10 KB up works.' },
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
      {
        heading: 'Several documents, each with its own limit',
        paragraphs: [
          'Many portals have one upload box per document, each with its own limit: 1 MB for a degree certificate, 200 KB for a photo, 50 KB for a signature. You can add many PDFs to Compress at once, but To a size applies one limit to every file in that run. For different limits, run the tool once for each limit, adding only the files that share it.',
        ],
      },
      {
        heading: 'A worked example',
        paragraphs: [
          'A university application wants a 12-page scanned document under 1 MB, and the scan is 14 MB. Open Compress, add it, choose To a size and 1 MB, and press Compress it. The tool tries photo settings from gentle to strong and keeps the gentlest that fits; on a scan this size, the result line may say the photos are a little softer.',
          'Zoom in on a page of small print to check it still reads. If even the strongest photo setting cannot reach 1 MB, the result says so, and ticking Let pages become pictures goes further.',
        ],
      },
      {
        heading: 'Why phone scans make big PDFs',
        paragraphs: [
          'Phone cameras take photos of many megapixels and save each one as a few MB. A PDF made from those photos keeps every pixel, far more than a page needs on screen or even on paper. Shrinking the photos to the size the page actually shows them at is where nearly all of the saving comes from, and at normal zoom the difference is hard to see.',
        ],
      },
    ],
    faq: [
      { q: 'How long does it take?', a: 'Seconds for a few pages; longer for a big scan on an older phone, because your own device does the work. A progress line shows what it is doing.' },
      { q: 'Can I compress a password-protected PDF?', a: 'Yes. Type its password when asked. The smaller file keeps the same password.' },
      { q: 'Is it really free?', a: 'Yes. No payment, no sign-up and no limit on how many files you compress.' },
      { q: 'Is 1 MB the same as 1024 KB here?', a: 'No. Here 1 MB is 1,000 KB and 1 KB is 1,000 bytes, slightly smaller than counting in 1,024s. So a file made under 1 MB here is under 1 MB on any portal, however it counts.' },
      { q: 'Can I compress a PDF made from Word to 1 MB?', a: 'Usually it is already well under, because typed text takes little space. If it is not, its pictures are the reason, and Compress shrinks those.' },
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
      'Tap Then and choose Split by size if the result is still over the email limit.',
      'Attach the file, or tap Send on a phone to send it straight from the result.',
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
          'Some files cannot shrink much: a long report that is mostly text is already small for what it holds. [Split by size](/tools/split-by-size/) makes parts under 5, 10 or 25 MB, or any size you type, which you send in separate emails; see [split a PDF by size](/guides/split-pdf-into-smaller-files-by-size/). Or send only the pages that matter with [Extract pages](/tools/extract-pages/).',
        ],
      },
      {
        heading: 'A link, or the file itself?',
        paragraphs: [
          'Some email services offer to put a large attachment in their cloud storage and send a link instead. That works, but the file then lives on their servers, and the person receiving has to open the link and may need an account. For a private document, a smaller file, or a few parts sent in separate emails, keeps it in the email itself, where you know who has it.',
        ],
      },
      {
        heading: 'A worked example',
        paragraphs: [
          'You need to email a 38 MB scanned property document to a lawyer whose office accepts 10 MB per email. Open Compress, add the file, choose Strong and press Compress it. If the result is still over 10 MB, tap Then and choose Split by size, pick 10 MB and press Split into parts that fit.',
          'Send part 1 and part 2 in two emails, with a line in each saying which part it is. The sizes here are only an example; the result line always gives the real ones.',
        ],
      },
      {
        heading: 'Sending from a phone',
        paragraphs: [
          'On a phone, Share hands the file straight to Gmail, Outlook or WhatsApp without saving it first. WhatsApp also takes PDFs as documents, with a much higher size limit than most email, so ask what the person prefers before squeezing a file hard. If you saved the file instead, it is in your Downloads, where any app can attach it from.',
        ],
      },
    ],
    faq: [
      { q: 'Will compressing ruin how it looks?', a: 'Balanced is sharp on any screen. Only Strong softens photos noticeably, and text is never touched by either.' },
      { q: 'Is my document sent anywhere while it is compressed?', a: 'No. It is made smaller in your browser. The only place it goes is wherever you send it afterwards.' },
      { q: 'Can I compress several attachments at once?', a: 'Yes. Add them all; each one comes back smaller, and Save all saves them together.' },
      { q: 'Why is my PDF so big in the first place?', a: 'Almost always photos: a phone camera or a scanner set to high quality stores far more detail than a page needs. A PDF of typed text is usually small, even with many pages.' },
      { q: 'Does splitting change the pages?', a: 'No. The pages are shared out between the parts in order, untouched. The person receiving can join them again with [Merge](/tools/merge/).' },
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
      'Type the password in the box under the file, four capital letters of your name and your year of birth, and tap Unlock.',
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
      {
        heading: 'Names with initials, or short names',
        paragraphs: [
          'Initials, full stops and spaces are where most people get stuck. Use the name exactly as it is printed on your Aadhaar, in capitals. If your name starts with an initial, or is shorter than four letters, UIDAI’s own help pages give worked examples for names like these; check there rather than guessing, since a wrong try only costs a moment, but many wrong tries are frustrating.',
        ],
      },
      {
        heading: 'Which file to give a portal or office',
        paragraphs: [
          'Offices differ. Some want the e-Aadhaar exactly as downloaded, with its password, because they check UIDAI’s signature. Others refuse any locked PDF and need an unlocked copy. Some accept, or prefer, a masked Aadhaar. The upload page or the office’s instructions usually say which; when they do not, keep all three ready: the original, an unlocked copy, and a masked one.',
        ],
      },
      {
        heading: 'A worked example',
        paragraphs: [
          'Ravi Kumar, born in 1988, downloads his e-Aadhaar for a rental agreement. He opens Remove a password, adds the file, types RAVI1988 in the box under it and taps Unlock. He presses Unlock it and saves the copy. Because the landlord only needs proof of identity, he then opens [Remove areas](/tools/remove-areas/) with that copy and masks the first eight digits before sending it.',
        ],
      },
    ],
    faq: [
      { q: 'Can this find the password for me?', a: 'No. It unlocks a file only with the password you type. It does not guess or break passwords.' },
      { q: 'Is my Aadhaar uploaded when I unlock it?', a: 'No. The file is opened and unlocked in your browser, on your device. Nothing is sent anywhere, and the password is never stored.' },
      { q: 'Do I have to unlock it to open it?', a: 'No. Any PDF reader opens it with the password. Unlock it only when a website or office needs a copy without one.' },
      { q: 'It says the password is wrong. What now?', a: 'Type it again slowly: four characters of your name in capitals and four digits for the year. If it still fails, download the e-Aadhaar again from UIDAI’s site and try with the fresh file.' },
      { q: 'Can I change the e-Aadhaar password?', a: 'No, it is set by UIDAI. You can save an unlocked copy here, or lock a copy with a password of your own using [Add a password](/tools/add-password/).' },
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
      'Type each file’s password in the box under it and tap Unlock.',
      'Press Unlock it to make copies that open without a password.',
      'Save the unlocked copies, or use Save all to keep them together.',
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
      {
        heading: 'Common mistakes',
        paragraphs: [
          'Most failed tries come from the format, not the details. Banks are strict: the date of birth may be DDMMYYYY or only DDMM, the name in capitals or small letters, with no spaces. Copy the format from the bank’s email exactly. A statement downloaded from net banking can also carry a different password from the one emailed every month; the download page usually says what it is.',
        ],
      },
      {
        heading: 'A worked example',
        paragraphs: [
          'You need twelve monthly statements for a home loan, each locked with the same password. Open Remove a password and add all twelve. Type the password in the box under each and tap Unlock. Press Unlock it, then Save all to keep the unlocked copies in one folder.',
          'Tap Then to take them to [Merge](/tools/merge/), drag them into month order, and press Merge into one file, so the lender gets one tidy PDF instead of twelve.',
        ],
      },
      {
        heading: 'Keep the original',
        paragraphs: [
          'The unlocked copy is a new file; the locked original is left exactly as it was. Keep the original as your own record, and send the unlocked copy only where it is needed. If you would rather send something locked, [Add a password](/tools/add-password/) can lock the merged file with a password of your own, which you give to the lender separately.',
        ],
      },
    ],
    faq: [
      { q: 'I don’t know the password. Can you unlock it?', a: 'No. The tool only unlocks a file with the password you type; it does not guess passwords. Your bank’s email, website or branch can tell you the format.' },
      { q: 'Is my statement sent to a server?', a: 'No. It is unlocked in your browser. Your statement and its password never leave your device.' },
      { q: 'Can I unlock twelve months at once?', a: 'Yes. Add them all, type each password when asked, and Save all saves the unlocked copies together.' },
      { q: 'Will the statement’s details change when I unlock it?', a: 'No. Unlocking changes nothing on the pages; it only takes away the need for a password to open the file.' },
      { q: 'Can I unlock a credit card statement the same way?', a: 'Yes. Any PDF whose password you know unlocks the same way. Card statements usually have their own password format, given in the card’s email.' },
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
      {
        heading: 'A worked example',
        paragraphs: [
          'You want the year’s total for rent and school fees from twelve monthly statements. Join them in month order with Merge, then open the merged file here and press Make a spreadsheet. In the Table sheet, filter the description column for the payee’s name, and a SUM on the debit column gives the year’s total. Keep the PDFs: the spreadsheet is your working copy, and the statements are the record.',
          'If you would rather have one spreadsheet per month, add the twelve statements here without merging them; each becomes its own .xlsx, and Save all keeps them together.',
        ],
      },
      {
        heading: 'Common problems, and their fixes',
        paragraphs: [
          'If some amounts arrive as text, the statement may print them with Cr or Dr after the figure; a find and replace in your spreadsheet app clears those. If dates sort oddly, set the date column’s format to a date. If whole columns are empty, the statement was probably a scan converted with Read scanned pages too unticked: tick it and run it again.',
        ],
      },
    ],
    faq: [
      { q: 'Is my bank statement uploaded?', a: 'No. It is read and converted in your browser, on your device. That matters with a document this private, and you can check it: the tool works with the internet switched off.' },
      { q: 'Does it work with any bank?', a: 'It works from the layout, not from a list of banks, so any statement with clear columns converts. Check the totals, as above.' },
      { q: 'Can I get a CSV instead?', a: 'It makes an .xlsx. Any spreadsheet app can save that as CSV in one step.' },
      { q: 'Is there a page limit?', a: 'No. A long statement just takes a little longer on an older phone.' },
      { q: 'Does it work for credit card statements and passbooks?', a: 'It works from the layout, so any statement with clear columns converts. A photographed passbook works too with Read scanned pages too ticked, though a clean scan reads far better than a photo.' },
      { q: 'Will Excel open the file?', a: 'Yes, and so will Google Sheets, LibreOffice Calc and other spreadsheet apps: it is a standard .xlsx file.' },
    ],
  },

  {
    slug: 'e-pan-pdf-password',
    title: 'e-PAN PDF password: open and unlock your e-PAN',
    h1: 'What is the password for the e-PAN PDF?',
    description: 'The e-PAN PDF is usually locked with your date of birth as DDMMYYYY. Open it, or save a copy without the password, free and without uploading it.',
    tool: 'remove-password',
    related: ['watermark', 'compress', 'remove-areas'],
    intro: 'The e-PAN PDF is usually locked with your date of birth written as eight digits: day, month and year. Born on 5 August 1990, you type 05081990. Any PDF reader opens it with that, and Remove a password saves a copy that opens without it.',
    steps: [
      'Open Remove a password and add the e-PAN PDF.',
      'Type your date of birth as DDMMYYYY in the box under the file and tap Unlock.',
      'Press Unlock it to save a copy that needs no password.',
      'Save the unlocked copy, and keep the original as it came.',
    ],
    sections: [
      {
        heading: 'Where the password comes from',
        paragraphs: [
          'An e-PAN is your PAN card as a PDF, sent by email or downloaded after you apply. Whether it came from Protean (formerly NSDL e-Gov), from UTIITSL or from the income tax site’s instant e-PAN, the PDF is usually locked with the date of birth on your PAN record, written as DDMMYYYY with no spaces or slashes. For a company, firm or trust it is usually the date of incorporation or formation, in the same form.',
          'The email that came with the e-PAN, or the page you downloaded it from, states the format. Check there first: it takes a moment, and it settles the question for your file.',
        ],
      },
      {
        heading: 'If the password does not work',
        paragraphs: [
          'Most failed tries are the format, not the date. Use two digits for the day and two for the month, with a leading zero: 5 August 1990 is 05081990, not 581990. Leave out slashes, dashes and spaces. Use the date as your PAN record has it, which is the date printed on your PAN card; if it differs from the date on your other documents, the PAN one is the one to try. A firm or company uses its own date, never a partner’s or director’s birthday.',
          'If it still fails, download the e-PAN again from the site that issued it and try the fresh file, in case the first download was cut short.',
        ],
      },
      {
        heading: 'Think before you unlock it',
        paragraphs: [
          'An unlocked copy opens for anyone who gets hold of it, and a PAN is used for bank accounts, loans, investments and tax. You do not need to unlock the file to read or print it: any PDF reader asks for the password and opens it. Unlock it when a portal refuses locked PDFs, or when someone needs a copy without the password.',
          'The e-PAN is issued digitally signed. Any changed copy, an unlocked one included, no longer passes that signature check in a PDF reader, and the result line here says so. Where an office checks the signature, give them the original file and the password instead.',
        ],
      },
      {
        heading: 'Before you send a copy',
        paragraphs: [
          'When you hand a copy to a landlord, a broker or a new bank, a light [watermark](/tools/watermark/) saying what it is for, such as FOR SAVINGS ACCOUNT KYC ONLY, makes it harder to reuse for anything else. If a portal sets a size limit, [Compress](/tools/compress/) brings the file under 100 KB or 200 KB. If a form wants your PAN and Aadhaar in one file, join them with [Merge](/tools/merge/); the e-Aadhaar has a password of its own, explained in [Aadhaar PDF password](/guides/aadhaar-pdf-password/).',
        ],
      },
      {
        heading: 'A worked example',
        paragraphs: [
          'Meera, born on 3 January 1995, needs her e-PAN for a mutual fund account, and the upload page refuses locked files. She opens Remove a password, adds the e-PAN, types 03011995 in the box under it and taps Unlock. She presses Unlock it and saves the copy. Then she taps Then, chooses Watermark, types FOR MUTUAL FUND KYC ONLY, chooses Light and Repeated all over, and uploads that copy. The original, still locked and still signed, stays in her phone’s files.',
        ],
      },
    ],
    faq: [
      { q: 'Can this find the password for me?', a: 'No. It opens a file only with the password you type. It does not guess or break passwords.' },
      { q: 'Is my e-PAN uploaded when I unlock it?', a: 'No. It is unlocked in your browser, on your device, and the password is forgotten as soon as it has been used. Nothing is sent anywhere.' },
      { q: 'Why does the result say the digital signature no longer checks out?', a: 'Because the unlocked copy is a new file. The original keeps its signature: send that one, with the password, wherever the signature is verified.' },
      { q: 'Can I put a password of my own on it?', a: 'Yes. Unlock it here, then lock the copy with [Add a password](/tools/add-password/), using a password you choose and share separately.' },
      { q: 'Can I hide my PAN on a copy?', a: 'Yes, with [Remove areas](/tools/remove-areas/). Its Find and remove can mark PAN numbers for you, and the marked digits are taken out of the file, not just covered.' },
      { q: 'Is the password the same as for the e-Aadhaar?', a: 'No. The e-Aadhaar uses four letters of your name in capitals and your year of birth. See [Aadhaar PDF password](/guides/aadhaar-pdf-password/).' },
    ],
  },
  {
    slug: 'remove-pdf-print-copy-restrictions',
    title: 'Remove PDF restrictions: allow printing and copying',
    h1: 'How to print or copy from a PDF that will not let you',
    description: 'A PDF opens but printing or copying is blocked? Save a copy without the restrictions, free, in your browser. Honest about what it cannot unlock.',
    tool: 'remove-password',
    related: ['add-password', 'extract-text', 'read'],
    intro: 'A PDF that opens without asking but will not print or copy has a permissions lock, not an open password. Add it to Remove a password and press Unlock it: the copy comes back with printing and copying allowed, and the pages unchanged.',
    steps: [
      'Open Remove a password and add the PDF.',
      'If it asks for a password to open it, type that password and tap Unlock.',
      'Press Unlock it.',
      'Check the result line, which says what was removed.',
      'Save the copy, then print or copy from it as normal.',
    ],
    sections: [
      {
        heading: 'Two kinds of PDF password',
        paragraphs: [
          'A PDF can carry two passwords. An open password, which Acrobat calls the document open password, stops anyone reading the file without it. A permissions password lets the file open for everyone, but asks readers to block printing, copying text or making changes. Acrobat, Chrome and most readers obey those blocks, which is why the Print button is greyed out, or copying gives you nothing.',
          'You can usually tell which you have. If the file opens without asking you anything, but some actions do not work, it is the second kind. Acrobat Reader also marks such a file SECURED in its title bar, and its document properties list what is not allowed.',
        ],
      },
      {
        heading: 'What Remove a password does with it',
        paragraphs: [
          'A file with only a permissions password opens here without asking. Press Unlock it and you get a new copy with no restrictions, named with unlocked at the end, and the result line says the printing and copying restrictions were removed. Nothing on the pages changes: the words, pictures and layout are exactly as they were.',
          'A file with an open password asks for it first. Type it in the box under the file, tap Unlock, and the copy comes back with no password and no restrictions at all.',
        ],
      },
      {
        heading: 'What it cannot do',
        paragraphs: [
          'It cannot open a file whose open password you do not know. It does not guess passwords, try lists of them or break them, and nothing on this site will. If you have lost the password to a file sent to you, the sender can tell you the format or send it again.',
          'An e-book bought from a store and tied to one reading app is a different kind of lock, not an ordinary PDF password, and this tool does not open it either.',
        ],
      },
      {
        heading: 'Should you remove it?',
        paragraphs: [
          'Restrictions are often switched on by the program that made the file, with no thought behind them: a statement, a society’s accounts, a form you were asked to print and sign. Removing them from your own documents, or from files you have been asked to print, is reasonable. A book, a paid report or course material may carry them because its owner does not want copies made. Removing the restriction does not change what the copyright allows, so ask the owner when in doubt.',
        ],
      },
      {
        heading: 'A worked example',
        paragraphs: [
          'Your housing society emails the annual accounts as a PDF that opens on your phone, but Print is greyed out and you need a paper copy for the general body meeting. Open Remove a password and add it. It opens without asking, because it has no open password. Press Unlock it: the result line says the printing and copying restrictions were removed. Save the copy and print it from your reader as usual.',
          'If you only needed the words, take the unlocked copy to [Extract text](/tools/extract-text/), which gives them as plain text to paste anywhere.',
        ],
      },
      {
        heading: 'Restricting your own files',
        paragraphs: [
          'To send a file that opens for anyone but asks readers not to print, copy or change it, use [Add a password](/tools/add-password/) and choose Only restrict printing, copying and editing. As this page shows, that is a request rather than a lock, so use a real open password for anything private, and send the password separately from the file.',
        ],
      },
    ],
    faq: [
      { q: 'Is my file uploaded to remove the restrictions?', a: 'No. The copy is made in your browser, on your device, and the file never leaves it.' },
      { q: 'Will the copy look different?', a: 'No. Only the security settings go. Every page stays exactly as it was.' },
      { q: 'The file asks for a password I do not know. Can you open it?', a: 'No. Only the person who set it, or who sent you the file, can give you that password.' },
      { q: 'Can I unlock several files at once?', a: 'Yes. Add them all; each comes back without restrictions, and Save all keeps the copies together.' },
      { q: 'What if the PDF was digitally signed?', a: 'The unlocked copy is a new file, so the signature no longer checks out in it, and the result line says so. Keep the original for anyone who verifies the signature.' },
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
    intro: 'Open Merge, add the PDFs, drag them into order, and press Merge into one file.',
    steps: [
      'Open Merge and add two or more PDFs.',
      'Drag them into order (on a phone, hold a file a moment first), or use the arrows.',
      'Type the password of any locked file in the box under it and tap Unlock.',
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
      {
        heading: 'Common mistakes',
        paragraphs: [
          'The most common is getting the order wrong and noticing only after sending. The list on the page is the order of the result, top to bottom, so check it before you press the button. Another is merging one huge scan with several small typed files and then finding the result too big to upload: compress the merged file to the limit afterwards, or compress the big scan on its own first.',
        ],
      },
      {
        heading: 'A worked example',
        paragraphs: [
          'A passport office wants your address proof, date of birth proof and an affidavit as one PDF. Add the three files, use the arrows so they match the order of the checklist, and press Merge into one file. The result is named after the first file with + 2 more, and the line under it gives the number of pages, which should be the three files’ pages added together.',
          'Save it, or tap Then and choose Compress if the upload has a size limit.',
        ],
      },
      {
        heading: 'Locked files and passwords',
        paragraphs: [
          'Locked files can be merged once you type their passwords. The merged file has no password, because each input may have had a different one, and the result says so. If what you are sending is private, lock the merged file with [Add a password](/tools/add-password/) and send the password separately, by a phone call or a message.',
          'Pages are copied across as they are, not redrawn, so typed text stays selectable and photos stay exactly as sharp as they were in the files you added.',
        ],
      },
    ],
    faq: [
      { q: 'How many PDFs can I merge?', a: 'As many as your device can handle. There is no cap on count or size.' },
      { q: 'Are my files uploaded?', a: 'No. They are joined in your browser and never leave your device.' },
      { q: 'Does it change the original files?', a: 'No. The merged PDF is a new file. The ones you picked are never changed.' },
      { q: 'Can I merge on my phone?', a: 'Yes. It works in the phone’s browser, and Share sends the result straight to WhatsApp or email on phones that can share files.' },
      { q: 'Can I merge on a work computer without installing anything?', a: 'Yes. It runs in the browser, so nothing is installed, and the files never leave the computer, which matters where company documents must not be uploaded.' },
      { q: 'What if one of the files will not open?', a: 'The others are still merged, and the result names the one that could not be read. If that file is damaged, ask whoever sent it for a fresh copy.' },
    ],
  },
  {
    slug: 'aadhaar-front-and-back-on-one-page',
    title: 'Aadhaar front and back on one page as a PDF',
    h1: 'How to put the Aadhaar front and back on one page',
    description: 'Combine photos of your Aadhaar front and back into one PDF, or onto one A4 sheet, in your browser. Free, no sign-up, and the photos are never uploaded.',
    tool: 'images-to-pdf',
    related: ['n-up', 'compress', 'scan'],
    intro: 'Make the two photos one PDF with Images to PDF, then use Pages per sheet with 2 pages on each sheet to put both sides on a single A4 page.',
    steps: [
      'Open Images to PDF and add the front photo, then the back.',
      'Choose Same as each image for the page size and press Make a PDF.',
      'Tap Then on the result and choose Pages per sheet.',
      'Pick 2 pages on each sheet and A4, and press Lay it out.',
      'Save the one-page PDF, or compress it if a portal has a size limit.',
    ],
    sections: [
      {
        heading: 'One PDF, or one page?',
        paragraphs: [
          'Many forms just want both sides in one file. Images to PDF alone does that: two pages, front then back. When the form says one page, or you want to print both sides on one sheet, [Pages per sheet](/tools/n-up/) puts the two pages on one A4 sheet, turned whichever way shows them biggest: two wide card photos go one above the other on an upright sheet, like a photocopy of both sides.',
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
      {
        heading: 'A worked example',
        paragraphs: [
          'Your bank wants a self-attested copy of your Aadhaar, front and back on one A4 sheet. Photograph both sides on a dark table. Open Scan, add the two photos, check the corners, choose Colour or Grey and As photographed, and press Make the PDF. Tap Then, choose Pages per sheet, pick 2 per sheet and A4, and press Lay it out. Print it, sign across it, and you have the copy they asked for.',
        ],
      },
      {
        heading: 'What offices usually expect',
        paragraphs: [
          'Most offices want both sides legible, the photo clear, and nothing cut off at the edges. Many ask for a self-attested copy, meaning you sign the printed copy yourself, often with the date and a line saying what it is for. If the copy goes by email instead, a light [watermark](/tools/watermark/) stating its purpose does a similar job. Check the office’s own instructions first, since some have their own format.',
        ],
      },
      {
        heading: 'Common mistakes',
        paragraphs: [
          'Flash glare across the number, a thumb over a corner, and a photo taken at a steep angle are the usual reasons a copy is refused. Hold the phone directly above the card, use daylight, and let the card fill most of the frame. If a photo comes out on its side, Scan and Images to PDF both turn it upright from the phone’s own record of which way it was held.',
        ],
      },
    ],
    faq: [
      { q: 'Are my Aadhaar photos uploaded?', a: 'No. The PDF is made in your browser and the photos never leave your device.' },
      { q: 'My iPhone photos will not open. Why?', a: 'Some browsers cannot read iPhone HEIC photos. Share them as JPEG, or set Settings, Camera, Formats to Most Compatible, and add them again.' },
      { q: 'Will they go side by side or one above the other?', a: 'Whichever shows them bigger. Wide card photos go one above the other on an upright sheet; upright pages go side by side on a sideways one.' },
      { q: 'Can I do the same for a PAN card or driving licence?', a: 'Yes. The same steps work for any two-sided card.' },
      { q: 'Should the copy be in colour?', a: 'Colour shows the photo and any hologram best, and many offices prefer it; grey prints cheaper and is often accepted. Check what the office asks for.' },
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
      'Drag the pictures into page order, or use the arrows.',
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
      {
        heading: 'A worked example',
        paragraphs: [
          'You have five photos of handwritten class notes to send as one file. Open Images to PDF, add the five photos, and use the arrows so the first page is at the top. Choose A4 and a Small margin, and press Make a PDF. The result line says five images on A4. If the photos are of paper, try the same photos in Scan too: it straightens them and whitens the paper, which reads better and makes a smaller file.',
        ],
      },
      {
        heading: 'Margins and borders',
        paragraphs: [
          'None puts each picture right to the edge of the page, which suits photos and posters. Small leaves a narrow white border, which looks tidy when printed and keeps the picture clear of the printer’s own margin, where many printers cannot print. Large leaves room to write notes or punch holes for a file. With Same as each image, a margin puts a white border around the picture at its own shape.',
          'If you are not sure, A4 with a Small margin is a safe choice for anything that might be printed or uploaded to a form, and Same as each image with None is best for anything only ever read on a screen.',
        ],
      },
      {
        heading: 'Common mistakes',
        paragraphs: [
          'Adding photos in the gallery’s order without checking: galleries often sort newest first, which puts the last page at the top. Putting a wide screenshot on A4, where it ends up small in the middle of a tall page; Same as each image keeps each one full size. And sending a 20 MB PDF of phone photos to a form that wants 1 MB: tap Then and [Compress](/tools/compress/) it to the limit.',
        ],
      },
    ],
    faq: [
      { q: 'How many images can I add?', a: 'As many as you like. There is no limit beyond your device’s memory.' },
      { q: 'Are my photos uploaded?', a: 'No. The PDF is put together in your browser, and the photos stay on your device.' },
      { q: 'Does it make the photos blurry?', a: 'No. JPEG and PNG pictures go in exactly as they are. WebP, BMP and HEIC pictures, and photos that need turning upright, are saved again as high-quality JPEGs, and GIFs as PNGs.' },
      { q: 'The PDF is too big for a form. What now?', a: 'Tap Then on the result and choose Compress, then pick a size such as 200 KB. See [compress to 200 KB](/guides/compress-pdf-to-200kb/).' },
      { q: 'Can I make a PDF from PNG screenshots?', a: 'Yes. PNG pictures go in exactly as they are, and Same as each image keeps each page the shape of the screen.' },
      { q: 'Can I make one PDF per photo?', a: 'Yes. Tick A separate PDF for each image: every photo becomes its own PDF, named after it, in one go.' },
    ],
  },
  {
    slug: 'photo-to-pdf-on-phone',
    title: 'Photo to PDF on your phone, no app needed',
    h1: 'How to turn a photo into a PDF on your phone',
    description: 'Make a PDF from photos on an Android phone or iPhone in the browser, with no app to install. Free, no sign-up, and the photos never leave your phone.',
    tool: 'images-to-pdf',
    related: ['scan', 'compress', 'merge'],
    intro: 'Open Images to PDF in your phone’s browser, tap to choose photos from the gallery, and press Make a PDF. Then tap Send to send it to WhatsApp or email.',
    steps: [
      'Open Images to PDF in Chrome, Safari or any current phone browser.',
      'Tap the drop zone and choose the photos from your gallery.',
      'Drag them into order, or use the arrows.',
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
      {
        heading: 'On an Android phone',
        paragraphs: [
          'Open the site in Chrome or the phone’s own browser and open Images to PDF. Tapping the drop zone opens the phone’s picker, where you can choose from the gallery or from Files; in most pickers, a long press on one photo starts selecting several at once. After Make a PDF, Save puts the file in Downloads, and Share opens the list of apps that can take it.',
          'On a slow mobile connection, it helps to open the site once on Wi-Fi. After that, the tools load from the phone itself, and making the PDF uses no mobile data at all, however many photos it holds.',
        ],
      },
      {
        heading: 'On an iPhone',
        paragraphs: [
          'Open the site in Safari and open Images to PDF. Tapping the drop zone offers the Photo Library, the camera, or Files. Photos are usually handed over as JPEG; if one arrives in the HEIC format and cannot be read here, the tool says so, and setting Camera, Formats to Most Compatible fixes it for future photos. Saved PDFs usually land in the Files app, under Downloads.',
        ],
      },
      {
        heading: 'A worked example',
        paragraphs: [
          'A college asks for your fee receipt and ID card as one PDF on WhatsApp. Open Images to PDF on your phone, add the two photos, check the order, and press Make a PDF. Tap Share, choose WhatsApp, and pick the chat. The PDF arrives as a document at full quality, rather than as photos that WhatsApp would squeeze. If the college sets a size limit instead, tap Then before sharing and choose Compress, with a size such as 500 KB.',
        ],
      },
    ],
    faq: [
      { q: 'Does it work on a cheap Android phone?', a: 'Yes. It is built for low-end phones first. A large batch of photos just takes a little longer.' },
      { q: 'Where does the PDF go when I save it?', a: 'Into your phone’s Downloads, like any other download, unless you share it straight to an app instead.' },
      { q: 'Do I need to sign up?', a: 'No. There is no account, no sign-up and no login.' },
      { q: 'Can I add more photos later?', a: 'Make a new PDF with all of them, or make a PDF of the new photos and join the two with [Merge](/tools/merge/).' },
      { q: 'Does it work without internet?', a: 'Yes, once the site has loaded. See [PDF tools that work offline](/guides/pdf-tools-that-work-offline/).' },
      { q: 'Why is my PDF so big?', a: 'Phone photos are large. Tap Then and choose [Compress](/tools/compress/) with a size such as 500 KB, or photograph paper with Scan in Black and white, which starts much smaller.' },
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
      {
        heading: 'When a corner is wrong',
        paragraphs: [
          'Scan looks for the largest bright patch in each photo and its four corners, which is right for paper on a table. It can be fooled by a white table, a second sheet in the frame, or paper that curls at the edges. When a handle is off, drag it to the real corner of the sheet; Find the page again asks it to look afresh. Whatever lies inside the four handles becomes the page, straightened.',
        ],
      },
      {
        heading: 'A worked example',
        paragraphs: [
          'You need to send a signed three-page rent agreement to your landlord tonight. Lay page one on a dark table near a window and photograph it from straight above; do the same for pages two and three. Open Scan, add the three photos, check each page’s handles, choose Black and white and A4, and press Make the PDF. Open the result to check every page reads, then Share it.',
        ],
      },
      {
        heading: 'Colour, Grey or Black and white',
        paragraphs: [
          'Black and white suits most paperwork and makes shadows and yellowed paper disappear. It can lose faint pencil, light stamps and photographs, so choose Grey when a page has a photo or a pale seal. Choose Colour when the colour itself matters: a blue ink signature an office wants to see, a coloured stamp, a chart, or a certificate with a hologram. Colour makes the biggest file of the three.',
        ],
      },
    ],
    faq: [
      { q: 'Which look should I choose?', a: 'Black and white for letters, forms and printed pages. Grey if there are photos. Colour if stamps, signatures in blue ink or coloured marks matter.' },
      { q: 'Are my photos uploaded?', a: 'No. Every photo is straightened and cleaned in your browser, on your phone.' },
      { q: 'Can I scan many pages into one PDF?', a: 'Yes. Add all the photos; each becomes one page, in the order listed.' },
      { q: 'Is it as good as a real scanner?', a: 'For everyday paperwork it is usually close enough that offices accept it. A flatbed scanner still wins for photographs and very fine print, because a phone photo is never perfectly flat or evenly lit.' },
      { q: 'Can I fix a page that came out sideways?', a: 'Yes. Turn it with the page’s turn button before you make the PDF, or afterwards in [Organise pages](/tools/organise/).' },
      { q: 'Does scanning use mobile data?', a: 'No. The photos are straightened and cleaned on your phone and nothing is sent anywhere, so it works the same on a slow connection or none.' },
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
      {
        heading: 'A worked example',
        paragraphs: [
          'Your office scanned twenty one-page invoices into a single 20-page PDF, and accounts wants each as its own file. Open Split, add the PDF, choose One page per file and press Split it up. You get twenty PDFs named part 1 of 20 to part 20 of 20, in page order. Tap Save all to put them in one folder, or one ZIP, then rename each one after its invoice number.',
          'Every part is a new PDF and the original stays whole, so if a split goes wrong, start over with a different choice.',
        ],
      },
      {
        heading: 'Splitting by ranges',
        paragraphs: [
          'Ranges are for documents whose parts are not all the same length. A 15-page application with a 2-page form, a 6-page report and the annexures after it splits with 1-2, 3-8, 9-. Each range becomes one file, named with its pages, in the order typed. Two ranges may share a page, such as a cover both files need, and a range typed backwards, like 8-3, is read the right way round.',
          'Splitting at each chapter needs bookmarks. Each top-level bookmark starts a new file, named with its number and its title, and any pages before the first bookmark become a file of their own, so nothing is lost. If the chapters come out wrong, fix the bookmarks with [Bookmarks](/tools/bookmarks/) and split again.',
        ],
      },
      {
        heading: 'Common mistakes',
        paragraphs: [
          'Splitting every 2 pages when the forms in the file are not all the same length leaves one form across two files: check each form’s page count first, or use ranges. Splitting a locked PDF gives locked parts, each still asking for the password, which surprises the people who receive them; unlock the file first with [Remove a password](/tools/remove-password/) if that is not wanted.',
        ],
      },
    ],
    faq: [
      { q: 'Is there a page limit?', a: 'No. The file is split in your browser, one part at a time, so long files work too.' },
      { q: 'Are my files uploaded?', a: 'No. Nothing leaves your device.' },
      { q: 'What does 12- mean in a range?', a: 'Page 12 to the last page. You can mix ranges and single pages, separated by commas: 1-3, 7, 12-.' },
      { q: 'Does splitting change the original?', a: 'No. Each part is a new file; the PDF you picked stays whole.' },
      { q: 'Can I split a PDF on my phone?', a: 'Yes. It runs in the phone’s browser. Send all hands the parts to another app, or Save all keeps them.' },
      { q: 'How do I join the parts back together?', a: 'Add them to [Merge](/tools/merge/) in order and press Merge into one file.' },
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
      {
        heading: 'A worked example',
        paragraphs: [
          'A college portal wants only the first page of your 4-page degree certificate PDF, and your final marksheet, which is page 9 of a 10-page file. Open Extract or remove pages, add the certificate, type 1, leave Keep these pages selected, and press Make the new file. Tap Start over, add the marksheet file, type 9 and do the same. Each new file holds just the page the portal asked for, named with that page’s number.',
        ],
      },
      {
        heading: 'Typing pages without fuss',
        paragraphs: [
          'You do not have to type ranges perfectly. A backwards range such as 9-3 is read as 3 to 9, a page number beyond the end is ignored, -4 means the first four pages, and spaces do not matter. The pages come out in the order of the original whatever order you type them, so if you also want them in a different order, take the result into [Organise pages](/tools/organise/).',
        ],
      },
      {
        heading: 'Keep, remove, or split?',
        paragraphs: [
          'Keep is quickest when you want a few pages out of many. Remove is quickest when you want most of them, minus a few. Split is for when every page should end up somewhere, in several files. All three leave the original as it was and make new files, so you can try one and then another.',
          'Locked files work the same way: type the password in the box under the file and tap Unlock first, and the new file keeps the same password. The new file is usually smaller than the original, often by more than its share of the pages, because pictures used only on the dropped pages leave with them.',
        ],
      },
    ],
    faq: [
      { q: 'Does it change my original PDF?', a: 'No. You get a new file with only those pages. The original is untouched.' },
      { q: 'Can I extract pages from a locked PDF?', a: 'Yes, with its password. Type it when the file asks.' },
      { q: 'Is the file uploaded?', a: 'No. The new file is made in your browser.' },
      { q: 'Will the pages lose quality?', a: 'No. The pages are copied into the new file as they are, not redrawn, so text stays text and photos are untouched.' },
      { q: 'Can I take pages from several PDFs into one file?', a: 'Extract from each, then join the results with [Merge](/tools/merge/). Or merge first, and extract the pages you want from the merged file.' },
      { q: 'Can I extract pages on a phone?', a: 'Yes. Type the pages in the box just as you would on a computer, and share the new file straight to WhatsApp or email.' },
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
      {
        heading: 'A worked example',
        paragraphs: [
          'A bank asks for your salary slip, but the PDF from your employer has four pages: the slip, a tax summary, and two pages of terms. Open Extract or remove pages, add it, type 2-4, choose Remove these pages and press Make the new file. The new file is named with the pages it left out and holds only the slip. Check it, then send that one and keep the full original for yourself.',
        ],
      },
      {
        heading: 'Common mistakes',
        paragraphs: [
          'Typing the pages to keep while Remove these pages is chosen, or the other way round, is the classic slip. The result line counts what was removed and what is left, so read it before sending. Page numbers printed on the pages may not match the file’s own count, for example when a cover has no number: type the position of the page in the file, as the reader’s page box or Organise pages shows it.',
        ],
      },
      {
        heading: 'Private pages',
        paragraphs: [
          'Deleting a page from the copy you send is the cleanest way to share less, because the page is not in the new file at all. If the page must stay but carries one private detail, Remove areas takes out only that part. If the file’s hidden details matter as well, such as the author’s name, follow up with [Clean hidden data](/tools/document-details/).',
          'The person you send it to can see how many pages the file has. If a missing page would raise questions, say in your message what you left out and why.',
        ],
      },
    ],
    faq: [
      { q: 'Can I delete every page but one?', a: 'Yes. You must leave at least one page.' },
      { q: 'Does it change the file I picked?', a: 'No. Every result is a new file; the original stays as it was.' },
      { q: 'Is it safe for private documents?', a: 'The file never leaves your device: pages are removed in your browser.' },
      { q: 'I deleted the wrong page. Can I undo it?', a: 'Your original file is unchanged, so start again from it. In Organise pages, tapping the bin again brings a page back before you save.' },
      { q: 'Does deleting pages make the file smaller?', a: 'Usually, yes: a page’s own text and pictures leave with it. A page that shared its fonts or pictures with pages you kept saves less.' },
      { q: 'Can I delete pages on my phone?', a: 'Yes. Type the page numbers, or use Organise pages, where each page has a bin button big enough for a thumb.' },
    ],
  },
  {
    slug: 'rotate-pdf-pages',
    title: 'Rotate PDF pages and save them, free',
    h1: 'How to rotate pages in a PDF and save it',
    description: 'Turn sideways or upside-down PDF pages the right way and save the file that way for good. Free, no sign-up, and the PDF is never uploaded.',
    tool: 'organise',
    related: ['scan', 'extract-pages', 'merge'],
    intro: 'Open Organise pages, tap the rotate button under each page that is the wrong way, and press Save the new order.',
    steps: [
      'Open Organise pages and add the PDF.',
      'Tap the rotate button under a page to turn it a quarter turn clockwise.',
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
      {
        heading: 'A worked example',
        paragraphs: [
          'A scanned 10-page agreement has pages 3 and 7 upside down and page 5 on its side. Open Organise pages and add it. Tap the rotate button under page 3 twice, under page 7 twice, and under page 5 once or three times, until each picture is upright. Press Save the new order. The result line says 3 rotated, and every reader, printer and portal now shows those pages the right way up.',
        ],
      },
      {
        heading: 'Which way it turns',
        paragraphs: [
          'Each tap turns a page a quarter turn clockwise. Two taps turn it upside down, and four bring it back to where it started. The picture of the page turns as you tap, so you can see when it is right before saving anything. A page that was saved sideways on purpose, such as a wide table, can be left as it is.',
          'Pages are turned, not redrawn, so a rotated page keeps its text selectable and its photos exactly as sharp as before. If the same scan also has pages in the wrong order, move them with Move earlier and Move later on the same screen, and drop any blank pages with the bin, so a single save fixes everything at once.',
        ],
      },
      {
        heading: 'Common mistakes',
        paragraphs: [
          'Turning a page in a phone’s PDF viewer and then sending the file: most viewers only change the view on your own screen, so the person receiving still sees the page sideways. Turning it here saves the turn in the file. Another slip is fixing the direction after compressing and uploading; rotate first, so the file you compress and upload is the finished one.',
        ],
      },
    ],
    faq: [
      { q: 'Can I rotate just one page?', a: 'Yes. Each page has its own rotate button; the others stay as they are.' },
      { q: 'Does rotating lower the quality?', a: 'No. The page is turned, not redrawn, so nothing about it changes but its direction.' },
      { q: 'Is my file uploaded?', a: 'No. Everything happens in your browser.' },
      { q: 'Can I rotate a PDF on my phone?', a: 'Yes. The page pictures and buttons are made for touch, and the result can be shared straight from the phone.' },
      { q: 'Can I turn a photo before it becomes a PDF?', a: 'Yes. In [Scan](/tools/scan/), each page has its own turn button before you make the PDF.' },
      { q: 'Will a portal see the pages the right way up?', a: 'Yes. The turn is saved in the file itself, so any reader, printer or portal shows the page the way you left it.' },
    ],
  },

  {
    slug: 'merge-form-16-part-a-and-part-b',
    title: 'Merge Form 16 Part A and Part B into one PDF, free',
    h1: 'How to merge Form 16 Part A and Part B into one PDF',
    description: 'Join Form 16 Part A and Part B into one PDF in the right order, unlocking them if needed, ready for a bank or employer. Free, and nothing is uploaded.',
    tool: 'merge',
    related: ['remove-password', 'compress', 'bookmarks'],
    intro: 'Open Merge, add Part A and then Part B, check the order and press Merge into one file. If either part is locked, type its password in the box under it first.',
    steps: [
      'Open Merge and add Form 16 Part A, then Part B, and any annexure such as Form 12BA.',
      'Drag them into order if they came in the wrong one: Part A first.',
      'Type the password of any locked part in the box under it and tap Unlock.',
      'Press Merge into one file and check the page count in the result line.',
      'Save the merged PDF, or tap Then to compress it for an upload limit.',
    ],
    sections: [
      {
        heading: 'What the two parts are',
        paragraphs: [
          'Form 16 is the certificate of tax deducted from your salary, and your employer issues it in two parts. Part A is generated through the income tax department’s TRACES system: it carries your employer’s TAN, your PAN, and the tax deducted and deposited each quarter. Part B is the working: your salary, the exemptions and deductions, and the tax worked out on them. Some employers add Form 12BA, a statement of perquisites, when the salary included any.',
          'Many employers send the parts as separate PDFs, and many offices that ask for Form 16 want one file. Check first, though: some employers already send both parts in a single PDF, and then there is nothing to merge.',
        ],
      },
      {
        heading: 'Which order, and why it matters',
        paragraphs: [
          'Part A first, then Part B, then any annexure. That is the order the form itself follows, and the order a bank officer or an accountant expects to read. Merge joins whole files end to end in the order of the list on the page, top to bottom, so check the list before you press the button; a phone often lists files by name, which can put Part B first.',
          'If you changed jobs during the year, you have a Form 16 from each employer for the months you worked there. Keep each employer’s parts together, earlier job first. The merged file keeps any bookmarks the parts carried; to add your own, such as Part A and Part B for each employer, open the result in [Bookmarks](/tools/bookmarks/).',
        ],
      },
      {
        heading: 'Locked parts and signatures',
        paragraphs: [
          'Some employers lock Form 16 with a password. It is set by the employer, not by the tax department, so it differs from company to company; the email or the payroll portal that delivered it usually says what it is. Type it in the box under the file and tap Unlock. The merged file comes out with no password, because two parts could carry two different ones. If you want it locked, take the result to [Add a password](/tools/add-password/).',
          'Form 16 is often digitally signed by the employer. A merged copy is a new file, so a PDF reader will not show that signature as valid inside it. That is fine for most uses. Where someone verifies the employer’s signature, give them the original files as they came.',
        ],
      },
      {
        heading: 'Where the merged file goes',
        paragraphs: [
          'You do not attach Form 16 when you file your return on the income tax site: you use it to fill the return in, and keep it as your record. The places that ask for it are usually a bank for a loan, a new employer, a visa file or your accountant, sometimes through a portal with a size limit. Typed Form 16 PDFs are usually small, but scanned or signed copies can be large: tap Then and choose [Compress](/tools/compress/) with To a size, or see [compress a PDF to 1 MB](/guides/compress-pdf-to-1mb/).',
        ],
      },
      {
        heading: 'A worked example',
        paragraphs: [
          'Arun changed jobs in October. He has Part A and Part B from his first employer, and Part A, Part B and a Form 12BA from the second: five PDFs, and the second employer’s are locked with a password its email gave him. He opens Merge, adds all five, and drags them into order: first employer’s Part A and Part B, then the second employer’s Part A, Part B and Form 12BA. He types the password under each locked file and taps Unlock, presses Merge into one file, and checks that the page count in the result line is the five files’ pages added together.',
          'Before sending it to his home loan officer, he compares the tax deducted in each Part A with his Form 26AS on the income tax site. They should agree; if they do not, the employer is the one to ask.',
        ],
      },
      {
        heading: 'Common mistakes',
        paragraphs: [
          'Sending last year’s Part A with this year’s Part B: check the assessment year printed on each part before merging. Compressing the parts one by one and then merging, which spends the size limit twice; merge first, then compress the merged file once. And merging a photo of a printed Form 16: if you only have paper, photograph each page with [Scan](/tools/scan/) first, so the pages come out straight and readable.',
        ],
      },
    ],
    faq: [
      { q: 'Is my Form 16 uploaded anywhere?', a: 'No. The parts are joined in your browser, on your device, and nothing is sent to us or anyone else. That matters for a document carrying your PAN and salary.' },
      { q: 'Do I need to merge Form 16 to file my income tax return?', a: 'No. The return is filed without attaching Form 16. Merging helps when a bank, employer or accountant wants it as one file.' },
      { q: 'What is the password on my Form 16?', a: 'Your employer sets it, so it differs between companies. The email or payroll portal that sent it normally says; if not, ask HR.' },
      { q: 'Can I merge on my phone?', a: 'Yes. Add the parts from your phone’s files, put them in order, and use Send to pass the merged PDF to WhatsApp or email.' },
      { q: 'Can I take out a page I do not need?', a: 'Yes. Tap Then, choose [Extract or remove pages](/tools/extract-pages/), and remove it by its page number.' },
    ],
  },
  {
    slug: 'insert-or-replace-pages-in-pdf',
    title: 'Insert or replace pages in a PDF, free and private',
    h1: 'How to insert pages into a PDF, or replace a page',
    description: 'Put pages from another PDF into the middle of one, add blank pages, or swap a page for a corrected one. Free, no sign-up, and nothing is uploaded.',
    tool: 'insert-pages',
    related: ['extract-pages', 'organise', 'merge', 'scan'],
    intro: 'Open Insert pages, add the main PDF first and then the pages to put in, choose After a page or In place of pages, and press Insert them. The main file’s other pages stay exactly as they were.',
    steps: [
      'Open Insert pages and add the main PDF first: the one that gets the new pages.',
      'Add the PDF to put into it, or choose Blank pages and say how many.',
      'Choose After a page and type its number, or In place of pages and type the pages to swap out.',
      'Press Insert them.',
      'Check the page count in the result line, then save the new file.',
    ],
    sections: [
      {
        heading: 'Insert, merge or replace?',
        paragraphs: [
          '[Merge](/tools/merge/) puts whole files end to end. Insert pages puts pages into the middle of one: an annexure after page 12, a signed page in place of an unsigned one, a blank page for notes. The first file in the list always receives the pages, and every file after it goes in whole, one after another, at the place you chose. If you need only part of another PDF, cut it down first with [Extract or remove pages](/tools/extract-pages/).',
        ],
      },
      {
        heading: 'Replacing a page',
        paragraphs: [
          'Choose In place of pages and type the page to swap out, such as 7, or a range such as 7-8. Those pages come out, and the new ones go in where the first of them was. The numbers need not match: one corrected page can replace two, or three new pages one old one. The result line says which pages were replaced and how many the file has now, a quick check that you typed the right number.',
          'Page numbers here are positions in the file, counting the first page as 1. If the document has a cover or a contents page without numbers, the number printed on a page may differ from its position.',
        ],
      },
      {
        heading: 'A corrected page in a signed document',
        paragraphs: [
          'A common case: an agreement has gone round for signatures and one page needs a correction, or one party signed a page on paper and sent back a photo of it. Swapping the page is easy, but it changes what was signed. Do it only when everyone who signed agrees, and have them initial or sign the new page too. If the document carries a digital signature, any change, a swapped page included, shows as a change after signing, so replace pages before anyone signs digitally, not after.',
          'For a page signed on paper, photograph it with [Scan](/tools/scan/) in Black and white or Grey, then add that PDF here as the second file and choose In place of pages.',
        ],
      },
      {
        heading: 'Blank pages',
        paragraphs: [
          'Blank pages, from 1 to 500 at a time, take the size and direction of the page just before them, so a blank page in a landscape section is landscape too. They give room for handwritten notes or a signature, or keep double-sided printing in step so that each chapter starts on the front of a sheet. Type 0 in After a page to put pages in before the first one.',
        ],
      },
      {
        heading: 'A worked example',
        paragraphs: [
          'Sanjay’s 18-page rental agreement is ready, but the owner wants a two-page furniture inventory added after page 12, and page 3 has the wrong deposit amount. He opens Insert pages, adds the agreement first and the inventory second, chooses After a page, types 12 and presses Insert them: the result line says 2 pages added after page 12, 20 in all. He taps Then, chooses Insert pages again, adds the corrected page 3 as the second file, chooses In place of pages, types 3 and presses Insert them. Both of them then sign the finished 20 pages.',
        ],
      },
      {
        heading: 'Bookmarks, passwords and order',
        paragraphs: [
          'The main file’s bookmarks, page labels and details are kept, and the inserted file’s own bookmarks come along. If the main file was locked, the new file is locked with the same password; type each locked file’s password in the box under it and tap Unlock first. To change the order of pages afterwards, or turn one the right way up, use [Organise pages](/tools/organise/).',
        ],
      },
    ],
    faq: [
      { q: 'How do I put pages at the very start?', a: 'Choose After a page and type 0.' },
      { q: 'How do I add pages at the end?', a: 'Type the last page’s number in After a page, or use [Merge](/tools/merge/), which puts whole files end to end.' },
      { q: 'Can I insert pages from two files at once?', a: 'Yes. Add the main file first, then the others in order; they go in one after another at the same place.' },
      { q: 'Is my file uploaded?', a: 'No. The new file is put together in your browser, on your device, and nothing is sent anywhere.' },
      { q: 'Can I insert a photo as a page?', a: 'Make it a PDF first with [Images to PDF](/tools/images-to-pdf/) or Scan, then insert that.' },
      { q: 'Does it change my original?', a: 'No. You get a new file; the PDFs you picked are never changed.' },
    ],
  },
  {
    slug: 'add-bookmarks-to-pdf',
    title: 'Add bookmarks to a PDF: a clickable contents list',
    h1: 'How to add bookmarks to a PDF',
    description: 'Add, rename and nest bookmarks so a long PDF opens with a contents list you can tap in any reader. Free, no sign-up, and the file is never uploaded.',
    tool: 'bookmarks',
    related: ['split', 'page-labels', 'read', 'merge'],
    intro: 'Open Bookmarks, add the PDF, tap Add a bookmark, type a title and the page it opens, and press Save the bookmarks. Readers then list them as the document’s contents, and a tap jumps straight to that page.',
    steps: [
      'Open Bookmarks and add the PDF; any bookmarks it has appear as a list.',
      'Tap Add a bookmark, type its title, and type the page it should open.',
      'Use the arrows to move a bookmark up or down, or in a level to put it under the one above.',
      'Rename or delete any bookmark that is wrong.',
      'Press Save the bookmarks and save the new file.',
    ],
    sections: [
      {
        heading: 'Why bookmark a long PDF',
        paragraphs: [
          'A 150-page report, a thesis, a tender or a court bundle is slow to get around by scrolling, especially on a phone. Bookmarks give it a contents list that readers show in a side panel, often called Bookmarks, Outline or Contents: tap Chapter 4 and you are there. They print nothing and change nothing on the pages; they only add a way to move about.',
        ],
      },
      {
        heading: 'Page numbers: count from the first page',
        paragraphs: [
          'The page you type is the page’s position in the file, counting the first page as 1, not the number printed on it. In a report whose printed numbering starts after a cover and four pages of contents, printed page 1 is the sixth page of the file, so its bookmark needs 6. Open the file in [Read](/tools/read/) in another tab and step through it to find where each chapter starts.',
          'If you would rather the reader’s own page box agreed with the printed numbers, so that typing 1 lands on printed page 1, set that with [Page labels](/tools/page-labels/).',
        ],
      },
      {
        heading: 'Chapters and sections',
        paragraphs: [
          'A bookmark moved in a level sits under the one above it, as a section of that chapter; readers show it indented and let you fold it away. Keep the top level for the big divisions, such as chapters, annexures or each document in a bundle, and put sections inside them. Short titles that match the headings printed in the document read best: Chapter 3, Annexure B, Salary slips 2026.',
          'Top-level bookmarks have a second use: [Split](/tools/split/) can cut a file at each one with At each chapter, naming every part after its bookmark.',
        ],
      },
      {
        heading: 'Tidying bookmarks a file already has',
        paragraphs: [
          'Files made by word processors and scanners often arrive with messy bookmarks: every heading at one level, titles cut short, entries pointing at the wrong page. They all appear in the list, where you can rename, move, nest or delete them. A bookmark that opens a web page rather than a page of the document is kept as it is, unless you type a page for it. Saving an empty list removes every bookmark.',
        ],
      },
      {
        heading: 'From Word, and after merging',
        paragraphs: [
          'If you still have the Word file, Word’s own Save as PDF can create bookmarks from the headings, in its options, which is quicker for a long document with proper headings. After joining several files with [Merge](/tools/merge/), each file’s own bookmarks come along in order; adding one top-level bookmark per original file, such as Agreement, Annexure A and Annexure B, makes the merged bundle easy to move around.',
        ],
      },
      {
        heading: 'A worked example',
        paragraphs: [
          'Divya merged a 96-page project report from six chapter files and wants a contents panel for the examiners. She opens Bookmarks and adds it; the list shows a few stray entries carried over from the chapter files, which she deletes. She taps Add a bookmark six times, typing Chapter 1 Introduction with page 5, Chapter 2 Literature review with page 14, and so on, checking each position in Read. She puts two sections under Chapter 4 with the arrow that moves a bookmark in a level, presses Save the bookmarks, and the report now opens with a contents list in any full reader.',
        ],
      },
    ],
    faq: [
      { q: 'Will the bookmarks show on a phone?', a: 'In most full PDF readers, yes, usually behind a contents or outline button. Some very simple viewers ignore them; the bookmarks are still in the file.' },
      { q: 'Is my PDF uploaded?', a: 'No. The bookmarks are written into the file in your browser, on your device.' },
      { q: 'Do bookmarks change the pages or the file size?', a: 'They change nothing on the pages and add very little to the size.' },
      { q: 'Can bookmark titles be in Malayalam or Hindi?', a: 'Yes. Titles are stored as text in any script, and readers show them as typed.' },
      { q: 'Does a locked PDF stay locked?', a: 'Yes. Type its password when asked; the new file keeps the same password.' },
    ],
  },
  {
    slug: 'crop-pdf-margins',
    title: 'Crop PDF margins: trim white space and scan borders',
    h1: 'How to crop the margins of a PDF',
    description: 'Trim white margins or a scanner’s dark border off PDF pages, by millimetres or found for you. Free, in your browser, and nothing is uploaded.',
    tool: 'crop',
    related: ['mark-up', 'remove-areas', 'n-up'],
    intro: 'Open Crop pages, choose Remove the white margins to have them found for you, or Trim the margins and type the millimetres, and press Crop it.',
    steps: [
      'Open Crop pages and add the PDF.',
      'Choose Remove the white margins, Trim the margins, or Trim each edge separately.',
      'Type the millimetres if your choice needs them.',
      'Type pages in Which pages to crop only some, or leave it empty for all.',
      'Press Crop it and save the cropped copy.',
    ],
    sections: [
      {
        heading: 'Three ways to trim',
        paragraphs: [
          'Remove the white margins looks at each page and trims it to just outside its words and pictures, leaving a thin border of about 2 mm. Trim the margins takes the same amount off every edge, from 1 to 100 mm. Trim each edge separately takes a different amount off the top, right, bottom and left, as you see the page: for a scan that sits off-centre, or a document with a wide binding margin on one side.',
        ],
      },
      {
        heading: 'Scans with black or grey borders',
        paragraphs: [
          'A scanner lid left open, or a photocopy of a page smaller than the glass, leaves a dark band round the page. Remove the white margins looks for white paper, so a dark band counts as part of the page and stays. Trim those by millimetres instead.',
          'To find how wide the band is, open the page in [Mark up](/tools/mark-up/), choose Measure and drag across it: the length is written in millimetres, measured on the same page you are about to crop, so the number carries straight across. Leave without saving the marks. Paper that came out yellow or grey in the scan can also be too dark to count as margin; millimetres work on any page.',
        ],
      },
      {
        heading: 'Cropping hides; it does not remove',
        paragraphs: [
          'Cropping sets a new visible edge for each page. Whatever falls outside it is still inside the file, and any PDF editor could widen the page again to show it. That is right for tidying borders, and wrong for hiding a name, an account number or a signature in the margin: for those, [Remove areas](/tools/remove-areas/) takes them out of the file for good. It also means cropping hardly changes the file’s size.',
        ],
      },
      {
        heading: 'Cropping only some pages',
        paragraphs: [
          'Type pages in Which pages, such as 1-3, 7, to crop only those; the rest keep their edges. Edges are measured as you see the page, so the top is the top even on a page that was scanned sideways. If the margin you ask for would leave almost nothing of a page, the tool refuses and names the page, rather than handing you a sliver.',
        ],
      },
      {
        heading: 'A worked example',
        paragraphs: [
          'Joseph copied a 30-page notebook on an office copier with the lid up, and every page has a black band about 12 mm wide down the left and 8 mm along the bottom. He measures both once with Mark up’s Measure, then opens Crop pages, chooses Trim each edge separately, types 0 for the top and right, 8 for the bottom and 12 for the left, and presses Crop it. The result line repeats the four margins for all 30 pages. He taps Then and chooses [Pages per sheet](/tools/n-up/) with 2 on each sheet, and the trimmed pages fill their places instead of printing black bands.',
        ],
      },
      {
        heading: 'After cropping',
        paragraphs: [
          'Trimmed pages print larger when laid out with Pages per sheet, read better on a phone, and look tidier in a merged bundle. To put every page on A4 afterwards, see [resize PDF pages to A4](/guides/resize-pdf-pages-to-a4/). For photos of paper, [Scan](/tools/scan/) crops as it straightens each page, which usually beats cropping afterwards.',
        ],
      },
    ],
    faq: [
      { q: 'Is my file uploaded?', a: 'No. The pages are cropped in your browser, and the file stays on your device.' },
      { q: 'Can I undo a crop?', a: 'Your original is never changed, so start again from it. The cropped copy also still holds what was trimmed, which is why cropping is no way to hide anything.' },
      { q: 'Does cropping make the file smaller?', a: 'Hardly. The trimmed parts are still in the file. For a smaller file, use [Compress](/tools/compress/).' },
      { q: 'Can I crop just one page?', a: 'Yes. Type its number in Which pages; the others stay as they are.' },
      { q: 'Why did Remove the white margins find nothing to remove?', a: 'What is on the pages already runs to their edges, the paper is not white enough, or the pages are blank. Trim by millimetres instead.' },
    ],
  },
  {
    slug: 'resize-pdf-pages-to-a4',
    title: 'Resize PDF pages to A4: fit every page, free',
    h1: 'How to resize every page of a PDF to A4',
    description: 'Fit every page of a PDF onto A4, from Letter forms, receipts or screenshots, so the file prints evenly. Free, in your browser, and nothing is uploaded.',
    tool: 'crop',
    related: ['images-to-pdf', 'merge', 'n-up'],
    intro: 'Open Crop pages, choose Fit every page on A4 and press Crop it. Each page is scaled to fit an A4 sheet, kept in proportion and centred, and a wide page gets a sideways sheet.',
    steps: [
      'Open Crop pages and add the PDF, or several.',
      'Choose Fit every page on A4.',
      'Tick Leave smaller pages at their real size if small pages, such as a receipt or an ID card, should not be enlarged.',
      'Type pages in Which pages to fit only some, or leave it empty for all.',
      'Press Crop it and save the copy, whose name ends with on A4.',
    ],
    sections: [
      {
        heading: 'Why a PDF ends up with mixed sizes',
        paragraphs: [
          'A PDF put together from several sources keeps each page at its own size: a US Letter form from a foreign employer, a phone screenshot, a long thin receipt, a scan made at an odd size. On screen it hardly shows. On paper, or in an office that expects A4, it does: some pages print tiny, some are cut off at the edges, and the printer may stop to ask about paper.',
        ],
      },
      {
        heading: 'What fitting to A4 does',
        paragraphs: [
          'Each page is scaled to fit inside an A4 sheet, kept in proportion and centred, so nothing is stretched or cut off. An upright page goes on an upright sheet and a wide page on a sideways one. The page is not redrawn as a picture: text stays text you can select, and drawings stay sharp, only smaller or larger. A page that was already A4 looks exactly as it did.',
          'Pages smaller than A4 are enlarged to fill the sheet. Tick Leave smaller pages at their real size for an ID card, a receipt or a photo you want printed at its true size in the middle of the sheet. Leave it unticked for a small form you want filling the page.',
        ],
      },
      {
        heading: 'Fit, not trim',
        paragraphs: [
          'This sits in Crop pages because both change a page’s edges, but it does the opposite of trimming: nothing is cut away, and a page bigger than A4, such as an A3 drawing, is shrunk to fit. To cut away margins instead, see [crop PDF margins](/guides/crop-pdf-margins/). For photos that are not a PDF yet, [Images to PDF](/tools/images-to-pdf/) puts each one on an A4 page as it makes the file.',
        ],
      },
      {
        heading: 'Letter, and printing',
        paragraphs: [
          'Fit every page on Letter does the same for the US size, for a file going to someone who prints on Letter paper. Either way, print at actual size or 100%: the pages already match the paper, so there is nothing for the printer to shrink, and fit to page would only make each page a little smaller for no reason.',
        ],
      },
      {
        heading: 'A worked example',
        paragraphs: [
          'Neha’s visa checklist asks for her documents as one PDF, printed on A4. She has her US employer’s letter on Letter paper, three bank statements on A4, a phone screenshot of a booking and a scanned taxi receipt. She joins them with [Merge](/tools/merge/), taps Then and chooses Crop pages. She chooses Fit every page on A4, ticks Leave smaller pages at their real size so the receipt is not blown up to fill a sheet, and presses Crop it. The result line says the pages were put on A4, and the printout is even from first page to last.',
        ],
      },
      {
        heading: 'Common mistakes',
        paragraphs: [
          'Expecting a small receipt to print large with Leave smaller pages at their real size ticked: it stays its real size by design. Fitting a scan with a wide dark border, which carries the border along: trim it first with Trim each edge separately, then tap Then and fit. And laying out the A4 pages several to a sheet before checking them: fit first, look through the result, then use [Pages per sheet](/tools/n-up/) if you need it.',
        ],
      },
    ],
    faq: [
      { q: 'Is my file uploaded?', a: 'No. The pages are fitted in your browser, on your device.' },
      { q: 'Does it make text blurry?', a: 'No. Pages are scaled, not turned into pictures, so text stays sharp and selectable.' },
      { q: 'Can I fit only some pages?', a: 'Yes. Type them in Which pages, like 1, 4-6; the others keep their size.' },
      { q: 'Will it stretch my page to fill the sheet?', a: 'Never. The page keeps its proportions, so a page of a different shape has white space above and below, or at the sides.' },
      { q: 'Does a locked PDF stay locked?', a: 'Yes. Type its password when asked; the A4 copy keeps the same password.' },
    ],
  },
  {
    slug: 'split-pdf-into-smaller-files-by-size',
    title: 'Split a PDF by size: parts under 5, 10 or 25 MB',
    h1: 'How to split a large PDF into parts under a size limit',
    description: 'Cut a big PDF into parts that each fit an upload or email limit, as few parts as possible, pages untouched. Free, in your browser, and never uploaded.',
    tool: 'split-by-size',
    related: ['compress', 'split', 'merge'],
    intro: 'Open Split by size, add the big PDF, pick the most each part may be, 5, 10 or 25 MB or another size, and press Split into parts that fit. You get as few parts as possible, each under the limit, with the pages in order.',
    steps: [
      'Open Split by size and add the PDF.',
      'Choose 5 MB, 10 MB or 25 MB, or Another size and type the megabytes.',
      'Press Split into parts that fit.',
      'Read each part’s size and pages in the result.',
      'Save the parts, or use Save all, and upload or send them in order.',
    ],
    sections: [
      {
        heading: 'When splitting beats compressing',
        paragraphs: [
          'Compressing makes one smaller file, but it softens photos, and a long scan may not fit a limit however hard it is squeezed. Splitting leaves every page exactly as it was and shares the pages out between files. It is the right choice when a portal or an inbox takes several files but caps each one: an insurance claim with a long hospital record, a tender with its drawings, a scanned property file.',
          'If the place you are sending to takes only one file, [Compress](/tools/compress/) is the tool instead; see [compress a PDF to 1 MB](/guides/compress-pdf-to-1mb/).',
        ],
      },
      {
        heading: 'How the parts are made',
        paragraphs: [
          'Each part is made as big as it can be while staying under your limit, so you get as few parts as possible. They are rarely equal. The tool saves each candidate part and measures it rather than guessing, because fonts and pictures shared between pages are copied into every part that uses them: ten pages of a 50 MB file are seldom a fifth of it. A part of photos may hold a few pages, and a part of typed text hundreds.',
          'Here 1 MB is 1,000,000 bytes, slightly less than some programs count, so a part made under 10 MB is under 10 MB wherever it is checked.',
        ],
      },
      {
        heading: 'Pages bigger than the limit',
        paragraphs: [
          'A single page can be bigger than the limit on its own, such as a high-resolution scan of a map or a site plan. It cannot be split further, so it becomes a part by itself, and the result line says it is bigger than the limit. Save that part, open [Compress](/tools/compress/), add it alone and choose To a size, then send it with the others.',
        ],
      },
      {
        heading: 'Choosing the size',
        paragraphs: [
          'Use the limit the portal or email states, as it is: the parts are already measured safely under it. For email, remember that the person receiving may have a lower limit than you, and 5 MB is safe for almost any inbox. Another size takes anything from 1 MB to 1,000 MB; a limit written in KB is the same number divided by 1,000, so 2,000 KB is 2 MB. For limits under 1 MB, split by pages with [Split](/tools/split/) and compress the parts instead.',
        ],
      },
      {
        heading: 'Sending the parts',
        paragraphs: [
          'Parts are named part 1, part 2 and so on, in page order, and the result gives each one’s size and the pages it holds. Upload them in that order, and if a portal lets you name each upload, use the pages: Hospital record, pages 1 to 46. By email, say in each message which part it is and how many there are. The person receiving can put them back together with [Merge](/tools/merge/).',
        ],
      },
      {
        heading: 'A worked example',
        paragraphs: [
          'Farah has a 62 MB scan of her father’s hospital records for an insurance claim, and the claim portal takes several files of up to 10 MB each. She opens Split by size, adds the scan, leaves 10 MB chosen and presses Split into parts that fit. The parts come back each under 10 MB, with their pages listed, and she uploads them in order, part 1 first. Had the portal taken only one file, she would have compressed instead, and checked that the doctors’ notes still read clearly.',
        ],
      },
    ],
    faq: [
      { q: 'Are the pages changed or compressed?', a: 'No. Pages are only shared out between the parts, in order, exactly as they were.' },
      { q: 'Can I choose the number of parts instead?', a: 'Not here. For a set number of pages in each part, use [Split](/tools/split/) with Every few pages.' },
      { q: 'My file is already under the limit. What happens?', a: 'Nothing is split, and the result says the file is already under that size.' },
      { q: 'Is my file uploaded to be split?', a: 'No. It is split in your browser, on your device. The only place the parts go is wherever you send them.' },
      { q: 'Does a locked PDF give locked parts?', a: 'Yes, each with the same password. Unlock it first with [Remove a password](/tools/remove-password/) if the person receiving should not need it.' },
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
          'If you would rather use your real ink signature, sign a sheet of white paper, photograph it, and place the photo with [Add image](/tools/add-image/). A PNG with a see-through background sits cleanly on the page. For a company seal as well, see [add a company stamp and signature](/guides/add-company-stamp-and-signature-to-pdf/).',
        ],
      },
      {
        heading: 'A drawn signature and a digital one',
        paragraphs: [
          'A drawn signature is a picture of your handwriting on the page. That is what most everyday forms, rental agreements and office paperwork expect. It does not prove who placed it. When a document must carry a certificate that a reader can check, such as with a Class 3 DSC, you need a [digital signature](/guides/digital-signature-pdf-dsc/) instead.',
        ],
      },
      {
        heading: 'A worked example',
        paragraphs: [
          'Your landlord emails a 5-page rent agreement to be signed on every page. Open Sign and add it. Draw your signature in the box, choose blue ink, and tap near the bottom right of page 1. Drag the signature into place and drag its corner to size it. Use the next-page arrow and tap once on each other page. Press Place the signature, add the date beside the last one with Add text, and send it back.',
        ],
      },
      {
        heading: 'A signature that looks like yours',
        paragraphs: [
          'Draw slowly, and larger than you would on paper; the signature is trimmed and fitted to the page when you place it. A stylus, or a laptop’s touchpad, gives a smoother line than a mouse. If you sign often, keep a photo of your ink signature on white paper and place it with [Add image](/tools/add-image/): it looks exactly like your hand every time.',
          'Typing your name instead gives a neat signature in a handwriting-style font your device already has. It suits forms that ask for a signature of any kind, but it looks less like your own hand, so an office that compares signatures may prefer the drawn one.',
        ],
      },
      {
        heading: 'What is usually accepted',
        paragraphs: [
          'Private agreements, consent forms and most office paperwork commonly accept a drawn signature. Banks, courts and some government filings may insist on ink on paper, a certificate-based digital signature, or an eSign service of their own. When in doubt, ask the person who will receive the document before you sign it, rather than after it is refused.',
        ],
      },
    ],
    faq: [
      { q: 'Is my signature saved anywhere?', a: 'No. It is drawn in your browser, placed on your PDF, and forgotten when you leave the page. Nothing is uploaded or stored.' },
      { q: 'Can I sign on my phone?', a: 'Yes. Draw with your finger; the page and the pad are made for touch.' },
      { q: 'Is a drawn signature legally valid?', a: 'Whether it is accepted depends on the document and who receives it. Many everyday documents accept one; some legal and government filings require a certificate-based digital signature.' },
      { q: 'Can I take a signature off after placing it?', a: 'Before saving, yes: select it and remove it. After saving it is part of the page, so start again from your original, which is never changed.' },
      { q: 'Can I sign a PDF that has a password?', a: 'Yes. Type the password in the box under the file and tap Unlock; the signed copy keeps the same password.' },
      { q: 'Does it work offline?', a: 'Yes, once the page has loaded. Signing never needed the internet in the first place.' },
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
      'Leave Show the signature on the page ticked for a visible box, choose the first or last page, and add a reason and a place if you like.',
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
      {
        heading: 'Getting a .pfx file',
        paragraphs: [
          'Some organisations issue certificates as a .pfx or .p12 file with a password. If a certificate is installed on your own computer, the system’s certificate manager may let you export it with its private key as a .pfx, protected by a password you choose; whether it allows that depends on how the certificate was installed. A certificate on a USB token is built so that its key cannot be copied out at all, which is exactly what makes a token safe.',
        ],
      },
      {
        heading: 'Checking the signature',
        paragraphs: [
          'Open the signed file in Adobe Acrobat Reader and look at its signature panel. It shows who signed, when, and whether the document has changed since. If it says the signer’s identity is unknown or not trusted, the document can still be unchanged: Acrobat simply does not trust the authority that issued the certificate yet, which the person receiving can change in their own Acrobat settings.',
        ],
      },
    ],
    faq: [
      { q: 'Will Adobe Acrobat show it as valid?', a: 'Acrobat will show that the document has not changed since signing. Whether it also shows your identity as trusted depends on whether it trusts the authority that issued your certificate.' },
      { q: 'My certificate has expired. Can I still use it?', a: 'No. Readers would mark the signature not valid, so the tool refuses and shows the date it ran out. Renew it with whoever issued it.' },
      { q: 'Is my certificate uploaded?', a: 'No. The .pfx and its password are read in your browser, used once, and forgotten. They are never stored or sent anywhere.' },
      { q: 'Can I just draw my signature instead?', a: 'Yes, with [Sign](/tools/sign/), for documents that do not need a certificate.' },
      { q: 'Can I sign several PDFs in one go?', a: 'One at a time. Sign the first and save it, then add the next PDF and sign it the same way.' },
      { q: 'Can I sign on a phone?', a: 'Yes, if the .pfx file is on the phone. Choose it from the phone’s files, type its password, and sign just as on a computer.' },
    ],
  },

  {
    slug: 'add-company-stamp-and-signature-to-pdf',
    title: 'Add a company stamp and signature to a PDF, free',
    h1: 'How to put your company seal and signature on a PDF',
    description: 'Put your company’s round seal and your signature on a quotation, invoice or letter in PDF, on a phone or computer. Free, and nothing is uploaded.',
    tool: 'add-image',
    related: ['sign', 'mark-up', 'add-text', 'digital-sign'],
    intro: 'Photograph your seal on white paper and place it with Add image, then tap Then and add your signature with Sign. For a ready-made PAID, RECEIVED or APPROVED stamp, Mark up has those built in.',
    steps: [
      'Stamp your seal on plain white paper, photograph it in daylight, and remove the background in a photo app that saves PNG.',
      'Open Add image, add the PDF, and tap Choose a photo, a logo or a stamp to pick the seal picture.',
      'Tap the page where the seal goes, drag it into place, size it by its corner, and press Place it.',
      'Tap Then, choose Sign, draw your signature and tap where it goes.',
      'Press Place the signature and save the sealed, signed PDF.',
    ],
    sections: [
      {
        heading: 'A clean picture of the seal',
        paragraphs: [
          'Press the seal once, firmly, with fresh ink, on clean white paper. Photograph it from straight above in daylight, close enough that the seal fills most of the photo, with no shadow across it. A crisp, even impression matters more than the camera.',
          'A JPEG photo always carries its white paper with it, which shows as a white patch on a letterhead with a coloured band or over printed lines. Remove the background in your phone’s photo editor, or any app that saves a PNG with a see-through background, and the seal sits on the page like real ink. Do this well once, keep the finished PNG somewhere safe, and reuse it.',
        ],
      },
      {
        heading: 'Placing the seal and the signature',
        paragraphs: [
          'Add image puts the picture where you tap and keeps its shape as you resize it, so a round seal stays round. Tap another page to place it there too; each copy moves and sizes on its own. Large photos are shrunk to a sensible size first, so a phone photo does not add megabytes to the PDF.',
          'Then the signature: [Sign](/tools/sign/) lets you draw it with a finger or a mouse, in blue or black, and place it the same way. Many businesses sign across the edge of the seal, as on paper; others sign above the printed name with the seal beside it. If the document has no printed place for your name, designation and the date, write them with [Add text](/tools/add-text/).',
        ],
      },
      {
        heading: 'Ready-made office stamps',
        paragraphs: [
          'For marks that are words rather than a seal, [Mark up](/tools/mark-up/) has stamps built in: Approved, Paid, Received, Draft, Confidential, Urgent, Copy and Void, or your own words, such as RECEIVED 12 OCT 2026, set in capitals in black, blue or red. Choose Stamp, pick one, tap the page and drag its corner to size it. They suit an accounts desk marking bills paid or received, or a draft that must not be mistaken for the final copy.',
        ],
      },
      {
        heading: 'A picture, or a digital signature?',
        paragraphs: [
          'A seal and signature placed this way are pictures on the page, as on a scan of a stamped paper. That is what most quotations, purchase orders, letters and invoices sent by email carry. It does not prove who placed them, and anyone with the file could copy the picture, so send stamped copies only to the people who need them.',
          'Where a document must show who signed and that nothing changed since, as some filings and tenders require, a certificate-based [digital signature](/tools/digital-sign/) is the tool, added last, after the seal and every other change; see [digitally sign a PDF with your DSC](/guides/digital-signature-pdf-dsc/). Whether a stamped PDF is enough depends on who receives it, so ask when it matters.',
        ],
      },
      {
        heading: 'A worked example',
        paragraphs: [
          'Suresh runs a small printing shop and sends quotations as PDFs from his laptop. He stamps his round seal on white paper once, photographs it, removes the background in a photo app and saves it as seal.png. For each quotation, he opens Add image, adds the PDF, chooses seal.png, taps near the bottom right of the last page and sizes the seal to about the width of his printed name. He presses Place it, taps Then, chooses Sign, draws his signature across the seal’s lower edge and presses Place the signature. The file he emails looks like a stamped paper quotation, and neither it nor his seal was ever uploaded anywhere.',
        ],
      },
      {
        heading: 'Common mistakes',
        paragraphs: [
          'A seal photographed at an angle comes out oval and smudged: hold the phone straight above it. A seal placed too large looks odd; on an A4 page most seals are only a few centimetres across, so compare it with the text around it. And sealing every page of a long document one by one, when the page that needs it is usually only the last, or the one with the signature block.',
        ],
      },
    ],
    faq: [
      { q: 'Are my seal and signature stored on your site?', a: 'No. They are placed on the page in your browser and forgotten when you leave. Nothing is uploaded, and nothing is kept.' },
      { q: 'Can I place the seal and signature in one go?', a: 'Yes. Sign across the seal on white paper, photograph the two together, and place that one picture with Add image.' },
      { q: 'Why is there a white box around my seal?', a: 'The picture is a JPEG, or a PNG with a white background. Remove the background in a photo app and save it as PNG.' },
      { q: 'Can I do this on my phone?', a: 'Yes. Every step works in a phone’s browser. Pinch to zoom in before placing, so the seal lands exactly where you want it.' },
      { q: 'Is a stamped and signed PDF legally valid?', a: 'It depends on the document and who receives it. Many businesses accept one for quotations, invoices and letters; filings that require a digital signature need a certificate.' },
    ],
  },
  {
    slug: 'fill-and-sign-pdf-form-on-phone',
    title: 'Fill and sign a PDF form on your phone, no app',
    h1: 'How to fill in and sign a PDF form on your phone',
    description: 'Fill in a PDF form, sign it with your finger and send it back on WhatsApp or email, all in your phone’s browser. Free, no app, nothing uploaded.',
    tool: 'fill-form',
    related: ['sign', 'add-text', 'scan'],
    intro: 'Open Fill in a form in your phone’s browser, type your answers in the boxes it lists, and press Fill it in. Tap Then, choose Sign, sign with your finger, and send the finished form straight to WhatsApp or email.',
    steps: [
      'Get the PDF onto your phone as a file, then open Fill in a form and add it.',
      'Type your answers in the list of boxes, and tick Seal the answers for the final copy.',
      'Press Fill it in, then tap Then and choose Sign.',
      'Draw your signature with a finger, tap the page where it goes, and press Place the signature.',
      'Tap Send and pick WhatsApp, Gmail or another app, or Save to keep it.',
    ],
    sections: [
      {
        heading: 'Getting the PDF into the browser',
        paragraphs: [
          'The form has to be on your phone as a file first. From email, download the attachment. From WhatsApp, open the document once so it is stored on the phone, then tap the drop zone on the tool page and find it among your files. If you have installed this site from your browser’s menu, Foolscap also appears when you share a PDF from another app, and its Open a file page suggests what to do with it.',
        ],
      },
      {
        heading: 'Typing answers on a small screen',
        paragraphs: [
          'You do not have to pinch and zoom around the page to hit tiny boxes. Fill in a form reads the form’s own fields and lists them as ordinary boxes, one under another, each with its name, so the phone keyboard works as it does anywhere else. Ticks are tick boxes and lists are drop-downs. If a field has a set length, the box says how many characters it takes.',
          'Type dates and numbers exactly as the form asks, such as DD/MM/YYYY, because each answer goes into its field just as typed. A field called Text7 tells you nothing: put a test word in it, press Fill it in and see where it lands. Your original never changes, so trying costs nothing.',
        ],
      },
      {
        heading: 'Signing with a finger',
        paragraphs: [
          'In Sign, draw slowly and larger than you would on paper; the signature is trimmed and fitted when you place it. If it comes out shaky, tap Clear and draw it again. Blue ink is chosen at first. Pinch to zoom in on the signature line, tap where the signature goes, then drag it into place and drag its corner to size it. If the form wants the date beside it, tap Then once more and use [Add text](/tools/add-text/).',
        ],
      },
      {
        heading: 'Forms with no boxes to type in',
        paragraphs: [
          'If the tool says the PDF has no fields, the form is a printed page saved as a PDF. Write on it with [Add text](/tools/add-text/) instead: type an answer, tap just above its line, and repeat. Zoom in before tapping, and choose Small for narrow lines. If you only have the form on paper, photograph each page with [Scan](/tools/scan/) first.',
        ],
      },
      {
        heading: 'Saving answers for next time',
        paragraphs: [
          'Tick Also save my answers as a file, and a small .json file comes out beside the filled form. Next time the same form arrives, add it, choose Fill it from saved answers, and pick that file: the boxes fill themselves. It is handy for forms that come back every year, such as a school’s details form or an insurance renewal. The file holds only what you typed, so keep it as private as the form.',
          'When that answers file comes out too, the result holds two kinds of file, so Then is not offered. Save the filled form, then open [Sign](/tools/sign/) and add it yourself.',
        ],
      },
      {
        heading: 'A worked example',
        paragraphs: [
          'A school sends a fillable consent form on WhatsApp, to be returned signed tonight. Priya opens it once in WhatsApp, opens Fill in a form, adds it, types her child’s name, class and her phone number into the listed boxes and ticks the boxes that apply. She ticks Seal the answers and presses Fill it in. She taps Then, chooses Sign, signs with her finger in blue, taps the parent’s signature line and presses Place the signature. She taps Send, picks WhatsApp and the class teacher’s chat, and the signed form goes back as a document.',
        ],
      },
    ],
    faq: [
      { q: 'Do I need to install an app?', a: 'No. It works in Chrome, Safari or any current phone browser. Installing the site from the browser’s menu is optional.' },
      { q: 'Is the form uploaded while I fill it?', a: 'No. Your answers and signature are written into the PDF in your phone’s browser; nothing is sent to us or anyone else.' },
      { q: 'Should I seal the answers before signing?', a: 'For the copy you send, yes: sealing makes the answers part of the page so nobody can change them later. See [flatten a PDF form](/guides/flatten-pdf-form/).' },
      { q: 'Where does the filled form go?', a: 'Save puts it in your phone’s Downloads. Send hands it to another app without saving first, on phones that can share files.' },
      { q: 'Can I do this on an iPhone?', a: 'Yes. Open the site in Safari; everything works the same way, and saved files go to the Files app.' },
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
          'Choose Bates in Style for numbers like ACME-000001. Type what goes before the number and how many digits it has. Bates runs one sequence through every page of every file you add, in the order you added them, which is what court bundles and discovery sets need. See [Bates numbering](/guides/bates-numbering-pdf/).',
        ],
      },
      {
        heading: 'Printed numbers and reader page numbers',
        paragraphs: [
          'Page numbers are printed on the page. A PDF reader also has its own page box, which counts from the cover. To make that box say i, ii, iii for the front pages and 1 from the first chapter, use [Page labels](/tools/page-labels/). For a running line of text, such as a title or a date, use [Header and footer](/tools/header-footer/).',
        ],
      },
      {
        heading: 'A worked example',
        paragraphs: [
          'A 40-page project report has a cover, and the numbering should start at 1 on the page after it, at the bottom centre, as Page 1 of 39. Open Page numbers, add the report, choose Bottom, centre and the style Page 1 of 12, leave First number at 1, tick Leave the first page unnumbered, and press Add the numbers. The cover stays clean, and the last page reads Page 39 of 39.',
        ],
      },
      {
        heading: 'Which style to use',
        paragraphs: [
          'A plain 1 is quiet and suits books and reports. 1 of 12 and Page 1 of 12 tell a reader at once when a page is missing, which matters for agreements, applications and anything printed and handed in loose. Page 1 reads clearly to people who do not handle many documents. Bates is for legal bundles, where one number must identify one page across many files.',
          'Whatever the style, the numbers are small and plain, in dark grey, a short way in from the edge. If your document already has a printed footer, put the numbers at the top instead, or in the opposite corner, so the two do not overlap or crowd each other.',
        ],
      },
      {
        heading: 'Common mistakes',
        paragraphs: [
          'Numbering each file and then merging them gives several page 1s: merge first, then number the merged file. Numbering a scan whose pages have a dark border can make the numbers hard to see, so try another corner. And the numbers are printed onto the page for good, so number the final version only, after every page has been added or taken out.',
        ],
      },
    ],
    faq: [
      { q: 'Can I number several PDFs at once?', a: 'Yes. Add them all; each is numbered on its own, except with Bates, which numbers them as one sequence.' },
      { q: 'Will the numbers cover my text?', a: 'They sit near the edge of the page. If a page has text right at the edge, choose another position, such as the top instead of the bottom.' },
      { q: 'Is my PDF uploaded?', a: 'No. The numbers are added in your browser.' },
      { q: 'Can I remove page numbers later?', a: 'Not with this tool; they become part of the page. Keep your original, which is never changed, and number again from it.' },
      { q: 'Does it number a locked PDF?', a: 'Yes. Type its password when asked; the numbered copy keeps the same password.' },
      { q: 'Can I put the numbers at the top?', a: 'Yes. Choose Top with left, centre or right under Where.' },
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
      'Choose a layout: Once, diagonally; Once, straight across; or Repeated all over.',
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
          'For a quieter mark, such as CONFIDENTIAL along the top of every page, use [Header and footer](/tools/header-footer/). The watermark can be in any language. Repeated all over is harder to crop out than a single mark across the middle.',
        ],
      },
      {
        heading: 'A worked example',
        paragraphs: [
          'A housing society asks for copies of your PAN and Aadhaar for its records. Put them in one PDF with [Merge](/tools/merge/), or with [Images to PDF](/tools/images-to-pdf/) if they are photos, then open Watermark. Type FOR SOCIETY RECORDS ONLY and the date, choose Light and Repeated all over, and press Add the watermark. Every page now says what it was given for, so a copy used for anything else stands out.',
        ],
      },
      {
        heading: 'Choosing the words',
        paragraphs: [
          'Say briefly what the copy is for and who it is for: FOR BANK KYC ONLY, SUBMITTED TO ABC HOUSING, COPY FOR VISA FILE. A date helps too. Keep private details, and your own signature, out of the watermark itself. Short words can go large across the middle of the page; a long line works better repeated, where each copy can be smaller and still be read.',
          'A date is especially useful on ID copies: a copy dated last year, presented for something new, is easy to question. Write it in a form nobody can misread, such as 12 OCT 2026 rather than 12/10/26, and keep the whole line short enough to read at a glance.',
        ],
      },
      {
        heading: 'Common mistakes',
        paragraphs: [
          'Strong over a dense page can make small print unreadable, and an office may refuse a copy it cannot read; Light is usually enough. Watermarking a file and then losing the clean original is another: the mark is part of the new file, so keep the unmarked copy safe for the next time someone asks. And a watermark is not a lock; it only says what the copy is for.',
        ],
      },
    ],
    faq: [
      { q: 'Is a watermark added to my file by this site?', a: 'Only the one you type. This site never stamps its own name or logo on anything.' },
      { q: 'Can I watermark many files at once?', a: 'Yes. Add them all and each gets the same watermark.' },
      { q: 'Will the watermark hide my text?', a: 'Light and Medium let the page show through clearly. Strong is for when the mark matters more than easy reading.' },
      { q: 'Are my files uploaded?', a: 'No. The watermark is added in your browser.' },
      { q: 'Can I watermark in Malayalam or Hindi?', a: 'Yes. Words in those scripts are drawn by your browser, in the same place a typed watermark would sit, and written invisibly underneath once, so a search still finds them.' },
      { q: 'Can I use a watermark and a password together?', a: 'Yes. Add the watermark first, then lock the result with [Add a password](/tools/add-password/).' },
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
          'The old words are painted over in the page’s own colour and the new ones written in their place, in the document’s own font where it can draw every letter, or else the nearest built-in one. In a table, each cell is its own piece, so changing one amount in a row changes only that amount, and figures keep their right edge.',
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
          'Edit text changes words already on the page. To write something new, such as a name on a blank line, use [Add text](/tools/add-text/). For a long rewrite, [PDF to Word](/tools/pdf-to-word/) gives you an editable document to work on. A scanned page is a picture of words: tap Read the words on this page and they become editable, and only the words you change are repainted.',
        ],
      },
      {
        heading: 'A worked example',
        paragraphs: [
          'An invoice PDF has the wrong date, 12 March instead of 21 March, in two places. Open Edit text and add it. Open Find and replace, type 12 March in Find and 21 March in Replace with, and tap Replace everywhere. Both places change, each painted over and rewritten at the same size. Press Save the changes, then open the new copy and check it before sending.',
        ],
      },
      {
        heading: 'Find and replace, carefully',
        paragraphs: [
          'Find and replace matches whole words and whole numbers, so replacing 500 does not touch 5,000 or 1500. It changes every match in the file, so search for something specific: a full name, a whole date, an amount with its decimals. Leaving Replace with empty paints the words out with nothing new written in, though, as with every change here, the old words stay in the file underneath.',
          'After replacing, step through the pages with the arrows and look at each change before saving. It takes a minute, and it is much quicker than finding a wrong change after the file has gone out.',
        ],
      },
      {
        heading: 'Common mistakes',
        paragraphs: [
          'Using Edit text to hide a number before sharing: the old words are still in the file. Changing a single word in the middle of a line set in a fancy font, so it stands out; change the whole line for a more even look. And editing a document that is not yours to change: altering an official document, such as a certificate or a bank statement, can be a serious offence whatever tool is used.',
        ],
      },
    ],
    faq: [
      { q: 'Will the new text match the old font?', a: 'Often. The document’s own font is used where it can draw every letter of the new words; otherwise the nearest built-in font, which is close but not always identical, especially to a decorative font.' },
      { q: 'Does find and replace match parts of words?', a: 'No. It matches whole words and whole numbers, so 5,000.00 does not change 15,000.00.' },
      { q: 'Can I edit a scanned PDF?', a: 'Yes. Tap Read the words on this page first: the words are read on your device, and only the ones you change are repainted. Check names and numbers, as they were read from a picture. To add new words instead, use [Add text](/tools/add-text/).' },
      { q: 'Can I change Malayalam or Hindi text?', a: 'Yes. The old words are covered and the new ones are drawn by your browser, so they read correctly, with the same words written invisibly underneath so they can be searched and copied. Words in English letters go in as real text.' },
      { q: 'Does it work on a locked PDF?', a: 'Yes. Type its password when asked; the edited copy keeps the same password.' },
      { q: 'Can I undo a change?', a: 'Before saving, change the words back. After saving, start again from your original, which is never changed.' },
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
          'Leave Seal the answers off and the form stays fillable, so it can be corrected later. Turn it on and the answers become part of the page, which is what you want before sending a final copy. See [flatten a PDF form](/guides/flatten-pdf-form/) for more.',
        ],
      },
      {
        heading: 'The same form next month',
        paragraphs: [
          'Also save my answers as a file keeps a small .json of what you typed. Next time, choose that file and the form fills itself in. It also reads .xfdf answers saved from Adobe Acrobat. Then sign the form with [Sign](/tools/sign/).',
        ],
      },
      {
        heading: 'A worked example',
        paragraphs: [
          'A scholarship form arrives as a fillable PDF. Open Fill in a form and add it. The fields appear as a list with their names: type your answers, tick the boxes that apply, and choose from the drop-down lists. Tick Also save my answers as a file, since next year’s form will ask the same things. Leave Seal the answers off, press Fill it in, and check the result. When it is right, fill it again with Seal the answers on for the copy you send.',
        ],
      },
      {
        heading: 'Fields with unhelpful names',
        paragraphs: [
          'Field names come from whoever made the form, and some say little, like Text1 or Field_23. When a name does not tell you what goes in it, open the form in [Read](/tools/read/) in another tab to see the printed labels, or fill that field with a test word, save, and see where it lands. Your original is never changed, so trying costs nothing.',
        ],
      },
      {
        heading: 'Languages and fonts',
        paragraphs: [
          'Answers are written with the form’s own font where it can draw them. An answer in Malayalam or Hindi is kept as real words in the field and shown with a picture of the words drawn inside the box, so it reads correctly in any reader and stays put when you seal the form.',
          'Dates and numbers deserve a second look: type them in the format the form asks for, such as DD/MM/YYYY, because each answer goes into its field exactly as typed.',
        ],
      },
    ],
    faq: [
      { q: 'Are my answers sent anywhere?', a: 'No. They are written into the PDF in your browser. Nothing you type leaves your device.' },
      { q: 'Can I fill a form that has a password?', a: 'Yes. Type its password when asked; the filled copy keeps the same password.' },
      { q: 'Do I need Adobe Acrobat?', a: 'No. Any browser on a phone or computer works.' },
      { q: 'Can I sign the form too?', a: 'Yes. Fill it in first, then take the result to [Sign](/tools/sign/) with the Then button.' },
      { q: 'Why do my saved answers not fill a new form?', a: 'Answers are matched by field name. A new version of the form with renamed fields will not match, and the tool says so rather than filling the wrong boxes.' },
      { q: 'Can I fill the form on my phone?', a: 'Yes. The fields are listed as ordinary boxes, so typing on a phone keyboard is easy, and the result can be shared straight from the phone. See [fill and sign a form on your phone](/guides/fill-and-sign-pdf-form-on-phone/).' },
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
      {
        heading: 'A worked example',
        paragraphs: [
          'A school wants parents to fill in an admission form on their phones. Open Create a form and add the PDF. Tap Find the blanks for me: each line of underscores becomes a text field named after the words beside it, such as Name of the child. Add a Paragraph field for the address, Tick box fields for transport and lunch, and a Choice list for the class, with the choices typed in and separated by commas.',
          'Rename anything unclear, press Make it fillable, and fill the result once yourself in Fill in a form before sending it to every parent.',
        ],
      },
      {
        heading: 'Naming fields well',
        paragraphs: [
          'The name is what many readers show beside the box, and what saved answers are matched by. Use plain names that say what goes in: Father’s name, Date of birth (DD/MM/YYYY), Mobile number. Each field needs a name of its own; if you give two the same name, a number is added to keep them apart.',
          'Choice lists keep answers tidy. A list of classes, blood groups, or simply Yes and No gives answers you can sort later, where free typing gives every spelling there is. Keep text fields for answers that really are free, such as names and addresses.',
        ],
      },
      {
        heading: 'Common mistakes',
        paragraphs: [
          'Trusting Find the blanks without checking: a decorative line of underscores becomes a field too. Drawing fields too small for a phone: make a text box as tall as the printed line, and a tick box big enough for a finger. And forgetting that the field sits on top of the page; a field drawn over printed words hides them when someone types in it.',
        ],
      },
    ],
    faq: [
      { q: 'What kinds of field can I add?', a: 'Text, Paragraph for longer answers, Tick box, and Choice list.' },
      { q: 'Is my form uploaded?', a: 'No. The fields are added in your browser.' },
      { q: 'Can people fill it on a phone?', a: 'Yes. Most phone PDF viewers and browsers can fill standard form fields.' },
      { q: 'Does it change how the form looks?', a: 'No. The fields sit over the page; the printed form underneath is not touched.' },
      { q: 'Can I add a place for a signature?', a: 'Leave that space empty: people can place a drawn signature on it with [Sign](/tools/sign/) after filling in the form.' },
      { q: 'Will people need special software to fill it?', a: 'No. Acrobat Reader, the viewers built into browsers and most phone PDF apps fill standard fields, and so does Fill in a form here.' },
    ],
  },

  {
    slug: 'bates-numbering-pdf',
    title: 'Bates numbering for PDFs: legal page numbers, free',
    h1: 'How to add Bates numbers to a set of PDFs',
    description: 'Give every page of a set of PDFs a Bates number like CASE-000001, running on from file to file in order. Free, in your browser, nothing uploaded.',
    tool: 'page-numbers',
    related: ['merge', 'organise', 'header-footer', 'pdf-a'],
    intro: 'Open Page numbers, add the files in order, choose Bates under Style, type what goes before the number and how many digits it has, and press Add the numbers. One sequence runs through every page of every file.',
    steps: [
      'Open Page numbers and add every PDF in the set.',
      'Drag the files into the order the numbers should run, or use the arrows.',
      'Choose Bates under Style, and a place under Where.',
      'Type the prefix in Before the number, then set Digits and First number.',
      'Press Add the numbers and save each numbered file.',
    ],
    sections: [
      {
        heading: 'What Bates numbers are for',
        paragraphs: [
          'A Bates number gives every page in a set of documents its own label, such as CASE-000001, so that any single page can be cited and found by its number alone, whichever file it sits in. The name comes from the Bates numbering machine once used to stamp paper. Law offices use it for discovery and court bundles, and it is just as useful for arbitration papers, due diligence, insurance claims and any large exchange of documents where people must point to pages without confusion.',
          'Where a court or tribunal sets its own format for numbering pages, follow its rules. The other styles in Page numbers give a plain running number, and First number lets a second volume carry on from the first.',
        ],
      },
      {
        heading: 'Prefix, digits and first number',
        paragraphs: [
          'Before the number is the label at the front: a case code, a party’s initials or a matter number, such as ABC-. Digits sets how long the number is, padded with zeros: 6 gives 000001, which leaves room for 999,999 pages. First number is where counting starts, usually 1.',
          'When a second set follows one already produced, carry on rather than starting again. If the first set ended at ABC-000412, give the next one First number 413, with the same prefix and digits, and the two sets read as one.',
        ],
      },
      {
        heading: 'Order is everything',
        paragraphs: [
          'Bates numbers run through the files in the order they are listed on the page, and through each file’s pages in order. Put the files in the order of your index before pressing the button: drag a row by its handle, or use its arrows. Each file comes back as its own PDF, named with the first number on it, and the result line gives the range each file got, so the index can be written straight from it.',
          'If pages inside a file are in the wrong order, fix that first with [Organise pages](/tools/organise/): once numbered, a moved page carries its old number with it.',
        ],
      },
      {
        heading: 'Where the number sits',
        paragraphs: [
          'Where offers the bottom and top of the page, at the left, centre or right. Bottom right is a common place for Bates numbers, clear of the document’s own page numbers and letterheads. The number is small and plain, on a small white patch so it stays readable over a scan or a dark border. If a page already has something printed in that corner, choose another place for the whole set rather than mixing positions.',
        ],
      },
      {
        heading: 'After numbering',
        paragraphs: [
          'To have one file, join the numbered files with [Merge](/tools/merge/) in the same order. To add the matter’s name along the top of every page, use [Header and footer](/tools/header-footer/) on the numbered files. If the set must be filed as PDF/A, make the [archive copy](/tools/pdf-a/) after numbering, and if it must carry a digital signature, sign last of all, because any later change breaks it.',
        ],
      },
      {
        heading: 'A worked example',
        paragraphs: [
          'A law firm’s clerk has to produce 14 PDFs of letters and invoices for an arbitration, numbered as one set with the prefix XYZ-. She opens Page numbers, adds all 14, and drags them into the order of her index. She chooses Bates under Style and Bottom, right under Where, types XYZ- in Before the number, leaves Digits at 6 and First number at 1, and presses Add the numbers. Each file comes back named with its first number, and the result lines read XYZ-000001 to XYZ-000023, XYZ-000024 to XYZ-000031, and so on, ready to copy into the index.',
        ],
      },
    ],
    faq: [
      { q: 'Are the documents uploaded?', a: 'No. The numbers are added in your browser, on your device. For confidential or privileged papers, that means they never pass through anyone else’s server.' },
      { q: 'Can I skip the cover page?', a: 'Not with Bates: every page in the set gets a number, as the practice expects. The other styles can leave a cover unnumbered.' },
      { q: 'How many digits should I use?', a: 'Six is a common choice and covers up to 999,999 pages. Whatever you choose, keep it the same for the whole matter.' },
      { q: 'What if I get the order wrong?', a: 'Your originals are never changed. Put the files in the right order and number them again from the originals.' },
      { q: 'Can I number one big merged file instead?', a: 'Yes. Merge first, then number the single file; its pages run XYZ-000001 onwards in the same way.' },
    ],
  },
  {
    slug: 'write-in-malayalam-or-hindi-on-pdf',
    title: 'Write in Malayalam or Hindi on a PDF, free',
    h1: 'How to write Malayalam, Hindi or Tamil on a PDF',
    description: 'Type Malayalam, Hindi, Tamil or another Indian script onto a PDF: it looks right, and it can still be searched and copied. Free, nothing uploaded.',
    tool: 'add-text',
    related: ['fill-form', 'edit-text', 'watermark', 'header-footer'],
    intro: 'Open Add text, type the words in your own script, tap the page where they go and press Write it on. Your browser draws the letters so they join and shape correctly, and the same words go in invisibly underneath, so a search finds them and copying gives them back.',
    steps: [
      'Open Add text and add the PDF.',
      'Switch your keyboard to Malayalam, Hindi or your language, and type the words in the What to write box.',
      'Choose Small, Medium or Large, and black, blue or red.',
      'Tap the page where the words go, and drag them into place.',
      'Press Write it on and save the new copy.',
    ],
    sections: [
      {
        heading: 'Why Indian scripts trip up PDF tools',
        paragraphs: [
          'PDF tools usually write with the fonts built into the PDF format, and those fonts only know English letters. Malayalam, Hindi, Tamil and the other Indian scripts need a font that has their letters and a program that joins them: a consonant and a vowel sign become one shape, and conjuncts stack or merge. Without both, you get empty boxes, or letters in the wrong order.',
          'Here, words those built-in fonts cannot draw are drawn by your own browser, which already shapes Malayalam and Hindi correctly on every web page you read, and placed on the page as a sharp picture of the words. Underneath it, the same words are written as invisible text in your script, so the PDF can still be searched, and copying from it gives back exactly what you typed.',
        ],
      },
      {
        heading: 'Typing in your script',
        paragraphs: [
          'On an Android phone, Gboard and most other keyboards can add Malayalam, Hindi, Tamil and other Indian languages in their settings, including layouts where you type the sound in English letters and pick the word in your script. On a computer, Windows and macOS both let you add Indian-language keyboards in their language settings. Or copy the words from any message or document and paste them into the box.',
          'What you paste must be real text in that script, the kind a phone keyboard types. Words typed years ago in older typing software, which stored Malayalam or Hindi letters under English keys, paste as a jumble of English letters and come out that way on the page.',
        ],
      },
      {
        heading: 'What it looks like',
        paragraphs: [
          'The letters are drawn in the Malayalam or Hindi font your device already uses, so they look the way your phone or computer shows those scripts everywhere else; a phone and a laptop may draw them in slightly different styles, and both read correctly. The picture is drawn larger than it shows on screen, so it stays clear when the page is zoomed. Small, Medium and Large set the size, and the colour can be black, blue or red.',
          'A line that mixes scripts, such as an English name inside a Malayalam sentence, is drawn the same way. Lines entirely in English letters and numbers go in as ordinary PDF text instead. The rupee sign is not in the built-in fonts either, so a line with ₹ in it is drawn by the browser too, and still searches.',
        ],
      },
      {
        heading: 'Other places your script works',
        paragraphs: [
          'For forms with real fields, [Fill in a form](/tools/fill-form/) keeps a Malayalam or Hindi answer as real words in the field and shows a picture of them inside the box. To change words already printed on a page, [Edit text](/tools/edit-text/) draws the new words the same way. A [watermark](/tools/watermark/), a [header or footer](/tools/header-footer/) and your own words on a stamp in [Mark up](/tools/mark-up/) take any script too.',
        ],
      },
      {
        heading: 'A worked example',
        paragraphs: [
          'A temple committee in Thrissur keeps its donation receipt as a PDF with blank lines for the donor’s name and the offering. Anitha opens Add text, adds the receipt, switches her phone keyboard to Malayalam and types the donor’s name. She chooses Medium and black, taps just above the name line and drags the words into place. She taps above the next line, which puts a new piece of text there, and types the offering, പുഷ്പാഞ്ജലി, over it. She presses Write it on and sends the copy. In the saved file, searching for the name finds it, and copying it gives back the Malayalam she typed.',
        ],
      },
      {
        heading: 'Common mistakes',
        paragraphs: [
          'Placing words on the printed line rather than just above it, so the line runs through them: on a phone, pinch to zoom in first. Typing a long paragraph as one piece, which runs off the edge of the page; press Enter in the box to break it into lines, or place it as several pieces. And expecting to edit the words after saving: they become part of the page, so check them before you press Write it on. Your original is always left as it was.',
        ],
      },
    ],
    faq: [
      { q: 'Can people search and copy what I wrote?', a: 'Yes. The words are written invisibly under the picture of them, in your script, so a reader’s find and copy work on them.' },
      { q: 'Is anything I type sent anywhere?', a: 'No. The words are drawn and written into the PDF in your browser, on your device, and never leave it.' },
      { q: 'Which scripts work?', a: 'Any your device can show: Malayalam, Hindi, Tamil, Telugu, Kannada, Bengali, Gujarati, Punjabi, Urdu, Arabic and more.' },
      { q: 'Will it look the same on someone else’s phone?', a: 'Yes. The words are a picture inside the PDF, so every reader shows exactly what you placed, whatever fonts it has.' },
      { q: 'Can I change the words after saving?', a: 'Not in the saved copy. Start again from your original, which is never changed.' },
    ],
  },
  {
    slug: 'add-logo-or-photo-to-pdf',
    title: 'Add a logo or photo to a PDF, free and private',
    h1: 'How to add a logo, photo or picture to a PDF',
    description: 'Put a logo, a passport photo or any picture onto a PDF page, then move and resize it. Free, no sign-up, no watermark, and nothing is uploaded.',
    tool: 'add-image',
    related: ['edit-images', 'sign', 'header-footer'],
    intro: 'Open Add image, add the PDF, tap Choose a photo, a logo or a stamp, pick the picture and tap the page where it goes. Drag it into place, drag its corner to size it, and press Place it.',
    steps: [
      'Open Add image and add the PDF.',
      'Tap Choose a photo, a logo or a stamp, and pick the picture.',
      'Tap the page where it goes; tap other pages to place it there too.',
      'Drag it into place, and drag its corner to make it bigger or smaller.',
      'Press Place it and save the new copy.',
    ],
    sections: [
      {
        heading: 'A passport photo on a form',
        paragraphs: [
          'Many application forms have a box for a photo. The picture keeps its shape as you resize it, so it will not squash to fit a box of a different shape. Before you start, crop the photo in your phone’s gallery to the box’s shape, usually a little taller than it is wide, with a plain light background if the form asks for one. Then place it, zoom in, and size it by its corner until it sits just inside the printed box.',
          'Whether a placed photo is accepted depends on who receives the form. Some offices want a printed photo pasted on paper; others are happy with one placed on the PDF. Read the form’s own instructions.',
        ],
      },
      {
        heading: 'A logo on a letter or quotation',
        paragraphs: [
          'For a logo on a letter, a quotation or a price list, a PNG with a see-through background sits cleanly on coloured or lined paper, while a JPEG brings its white box with it. Place it on the first page, or tap each page that needs it; each copy moves and sizes on its own, so line them up by eye at the same zoom.',
          'For a long document with a logo on every page, placing it page by page is slow. If words will do, [Header and footer](/tools/header-footer/) puts a line such as your company’s name along every page in one go.',
        ],
      },
      {
        heading: 'Keeping the file small',
        paragraphs: [
          'A phone photo can be several MB. Add image shrinks a big picture to at most 2,000 pixels on its longest side before it goes on the page, which stays sharp on screen and on paper, so one photo does not swell the PDF. A photo taken sideways is turned upright first, from the phone’s own record of how it was held.',
        ],
      },
      {
        heading: 'Adding, or changing what is there?',
        paragraphs: [
          'Add image puts a new picture on the page. To move, resize, take out or swap a picture already in the PDF, such as an old logo, use [Edit pictures](/tools/edit-images/) instead; see [replace a logo or picture in a PDF](/guides/replace-image-or-logo-in-pdf/). For a signature, [Sign](/tools/sign/) lets you draw one, and a photo of your ink signature works here too.',
        ],
      },
      {
        heading: 'A worked example',
        paragraphs: [
          'Kiran is sending his marriage biodata as a PDF and wants his photo at the top right of the first page. He crops the photo in his gallery to a portrait shape, opens Add image, adds the biodata and chooses the photo. He taps near the top right of page 1, drags the photo into the corner, and drags its corner until it is about a quarter of the page wide. He presses Place it, opens the copy to check that nothing printed is hidden under the photo, and sends it.',
        ],
      },
      {
        heading: 'Common mistakes',
        paragraphs: [
          'Tapping the page before choosing a picture: choose the picture first, then tap. Placing a JPEG logo on a coloured letterhead, which shows a white rectangle round it. And placing a photo over printed words, which hides them in the saved copy, because the picture becomes part of the page. Check the position before you press Place it; your original is never changed, so a wrong placement costs only a fresh start.',
        ],
      },
    ],
    faq: [
      { q: 'Which picture types work?', a: 'JPEG and PNG work everywhere; other types, such as WebP, where your browser can read them.' },
      { q: 'Is my photo uploaded?', a: 'No. It is placed on the page in your browser and stays on your device.' },
      { q: 'Can I place the same logo on every page?', a: 'Yes: tap each page that needs it. There is no single button for every page at once.' },
      { q: 'Can I change it after placing it?', a: 'Before saving, drag it, resize it, or take it off with its ×. After saving it is part of the page; [Edit pictures](/tools/edit-images/) can move or take it out, or start again from your original.' },
      { q: 'Will it lower the quality of the rest of the PDF?', a: 'No. Only the new picture is added; everything else on the page stays exactly as it was.' },
    ],
  },
  {
    slug: 'replace-image-or-logo-in-pdf',
    title: 'Replace, move or delete an image in a PDF, free',
    h1: 'How to replace a logo or picture in a PDF',
    description: 'Swap an old logo for a new one, move or resize a photo, or take a picture out of a PDF, leaving everything else as it was. Free, no upload.',
    tool: 'edit-images',
    related: ['add-image', 'extract-images', 'remove-areas'],
    intro: 'Open Edit pictures, add the PDF and go to the page. Tap the picture, then choose Replace the selected picture with another, or drag it, size it, or tap its × to take it out. Press Save the changes.',
    steps: [
      'Open Edit pictures and add the PDF.',
      'Go to the page with the picture; every picture on it is outlined.',
      'Tap the picture to select it.',
      'Choose Replace the selected picture with another, or drag it, drag its corner, or tap its ×.',
      'Press Save the changes and save the new copy.',
    ],
    sections: [
      {
        heading: 'Swapping a logo',
        paragraphs: [
          'A company changed its logo, a template still carries the old one, or a brochure needs this year’s photo. Select the old picture and choose the new one: it goes into the old picture’s box, keeping its own shape, so a square logo replacing a wide one sits centred rather than stretched. A PNG with a see-through background suits logos, because the page shows around them.',
          'Only that picture changes. Text, lines and other pictures on the page stay exactly where they were, because the tool changes the one instruction that draws the picture and nothing else.',
        ],
      },
      {
        heading: 'Moving, resizing and taking out',
        paragraphs: [
          'Drag a selected picture to move it, and drag its corner to resize it. Tap its × to take it out, and tap × again if you change your mind before saving. Every change shows on the page before anything is saved, and the result line says how many pictures were moved, replaced or taken out, and whether any change could not be made.',
        ],
      },
      {
        heading: 'When a picture cannot be selected',
        paragraphs: [
          'Some things that look like pictures are not. A logo drawn from lines and shapes, as many sharp logos are, is not a picture inside the file and cannot be selected. A scanned page is one picture of the whole sheet, so a logo on a scan is part of that one picture. And a picture tucked inside a larger drawing may not be editable on its own. When a change cannot be made, the result says so rather than failing quietly.',
          'In those cases you can still cover the old logo with [Add image](/tools/add-image/): a new picture with a solid background, placed over it, hides it on the page. The old one stays underneath, though, and anyone with an editor could uncover it.',
        ],
      },
      {
        heading: 'Taking out is not removing for privacy',
        paragraphs: [
          'A picture taken out is no longer drawn, so nobody sees it, but its data may still be stored inside the file. That is fine for an outdated logo. For a private photo, a picture of an ID card or a signature that must not travel with the file, use [Remove areas](/tools/remove-areas/) on that part of the page instead, which takes it out of the file for good.',
        ],
      },
      {
        heading: 'A worked example',
        paragraphs: [
          'A school’s fee circular template still has last year’s logo at the top of each of its three pages. Meena opens Edit pictures, adds the PDF, taps the logo on page 1, chooses Replace the selected picture with another and picks the new logo, a PNG. She steps to pages 2 and 3 and does the same, presses Save the changes, and checks the copy: the new logo sits where the old one was, and the text below it has not moved.',
        ],
      },
      {
        heading: 'Keeping a copy of a picture first',
        paragraphs: [
          'If you want the old picture as a file before you change it, [Extract images](/tools/extract-images/) saves every picture in the PDF exactly as stored. Your original PDF is never changed either way: each save makes a new copy beside it, named with pictures edited.',
        ],
      },
    ],
    faq: [
      { q: 'Does the new picture get stretched?', a: 'No. It keeps its own shape inside the old picture’s box.' },
      { q: 'Is my PDF uploaded?', a: 'No. The pictures are changed in your browser, on your device, and nothing is sent anywhere.' },
      { q: 'Can I replace a picture on every page at once?', a: 'No. Select and swap it on each page that has it; the other pages stay as they are until you do.' },
      { q: 'Why can I not select the logo?', a: 'It is probably drawn from shapes rather than stored as a picture, or it is part of a scanned page. Cover it with Add image instead, knowing the old one stays underneath.' },
      { q: 'Does a locked PDF stay locked?', a: 'Yes. Type its password when asked; the new copy keeps the same password.' },
    ],
  },
  {
    slug: 'flatten-pdf-form',
    title: 'Flatten a PDF form: lock the answers into the page',
    h1: 'How to flatten a PDF form so the answers cannot change',
    description: 'Flatten a filled PDF form so its answers become part of the page and cannot be changed or lost. Free, in your browser, and nothing is uploaded.',
    tool: 'fill-form',
    related: ['merge', 'add-password', 'digital-sign'],
    intro: 'In Fill in a form, tick Seal the answers and press Fill it in. The answers are flattened into the page: they look the same, but they are no longer boxes anyone can type into.',
    steps: [
      'Open Fill in a form and add the filled form.',
      'Check the answers in the list, and change any that need it.',
      'Tick Seal the answers.',
      'Press Fill it in.',
      'Save the sealed copy and send that one; keep the fillable original for corrections.',
    ],
    sections: [
      {
        heading: 'What flattening means',
        paragraphs: [
          'A fillable PDF keeps each answer in a field that sits on top of the page, separate from what is printed. Flattening, which this site calls sealing, writes each answer into the page itself and removes the fields. The sealed form looks just as it did, but there is nothing left to click or type into, and the answers travel as part of the page wherever the file goes.',
        ],
      },
      {
        heading: 'Why offices and portals ask for it',
        paragraphs: [
          'Answers in fields can be changed by anyone who opens the file, which is the point while a form is being filled, and a problem once it is final. Fields can also behave differently from one program to another: some forms’ fields do not print, some simple viewers show them empty, and when two copies of the same form are joined into one file, fields with the same name can end up showing the same answer. A sealed form avoids all of that: what you see is what everyone sees.',
        ],
      },
      {
        heading: 'Sealing a form filled somewhere else',
        paragraphs: [
          'You can seal a form that was filled in another app. Add it here, and the answers already in its fields show in the list. Tick Seal the answers and press Fill it in without changing anything, and the answers as they stand are written into the page.',
          'If the tool says the PDF has no fields, there is nothing left to flatten: either it was sealed already, or it was only ever a printed page.',
        ],
      },
      {
        heading: 'Before you seal',
        paragraphs: [
          'Sealing cannot be undone in the sealed copy, so keep the fillable one: the file you picked is never changed, and a corrected version is a minute’s work from it. Check every answer in the list first, especially dates and numbers. If you will fill the same form again, tick Also save my answers as a file in the same run.',
          'Answers in English letters stay real text after sealing, so they can still be searched and copied. An answer in Malayalam, Hindi or another script the form’s font cannot draw becomes a picture of its words, which reads correctly everywhere but cannot be searched.',
        ],
      },
      {
        heading: 'Sealed is not locked',
        paragraphs: [
          'Sealing stops the answers being edited as form answers. It does not stop a determined person editing the page, any more than a printed form stops someone with a pen. To stop the file being opened at all, lock it with [Add a password](/tools/add-password/). To show who signed and that nothing changed since, add a [digital signature](/tools/digital-sign/) last, after sealing.',
        ],
      },
      {
        heading: 'A worked example',
        paragraphs: [
          'An insurance claim form arrives as a fillable PDF, and the claims portal wants the completed form and the hospital bills as one PDF. Kavya fills it in with Fill in a form, leaving Seal the answers off, and checks the result. When it is right, she adds that filled copy, ticks Seal the answers and presses Fill it in. She taps Then, chooses [Merge](/tools/merge/), adds the bills after the form and presses Merge into one file. The portal gets one file whose answers cannot be changed or lost on the way.',
        ],
      },
    ],
    faq: [
      { q: 'Is flattening the same as Seal the answers?', a: 'Yes. Seal the answers flattens the form: every answer becomes part of the page, and the fields are removed.' },
      { q: 'Can I unflatten a form?', a: 'No. Once sealed, the answers are printed on the page. Go back to your fillable original, which is never changed.' },
      { q: 'Is my form uploaded to be flattened?', a: 'No. It is sealed in your browser, on your device, and nothing you typed is sent anywhere.' },
      { q: 'Does a locked form stay locked?', a: 'Yes. Type its password when asked; the sealed copy keeps the same password.' },
      { q: 'Can I flatten a form on my phone?', a: 'Yes. Tick the box and press the button, just as on a computer. See [fill and sign a form on your phone](/guides/fill-and-sign-pdf-form-on-phone/).' },
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
      {
        heading: 'A worked example',
        paragraphs: [
          'You are emailing your salary slips to a loan agent. Open Add a password and add the PDFs. Type a password, such as three unrelated words with a number, and type it again. Leave Allow copying text unticked, and press Lock it. Send the files by email, then send the password by WhatsApp or a phone call, never in the same email as the files.',
        ],
      },
      {
        heading: 'What the three permissions mean',
        paragraphs: [
          'Allow printing lets the person print the file once it is open. Allow copying text lets them select and copy its words. Allow changes and comments lets them edit it or add notes. They apply to someone who has opened the file, in readers that respect them, which includes Acrobat and Chrome. They are good for keeping a contract from being casually edited, not for keeping a secret.',
          'Only restrict printing, copying and editing makes a file that opens for anyone, with those actions blocked in readers that respect them. It suits a brochure or a price list you want read but not reused, and never a document that must stay private, because a determined person can switch the blocks off.',
        ],
      },
      {
        heading: 'Common mistakes',
        paragraphs: [
          'Using a password the person can guess from the document itself, such as the date of birth printed inside it, so the file is no safer than an envelope. Writing the password in the same email as the file. And locking the only copy: there is no reset, so keep the unlocked original and send a locked copy.',
        ],
      },
    ],
    faq: [
      { q: 'Can I lock several PDFs with the same password?', a: 'Yes. Add them all; each is locked with the password you type.' },
      { q: 'Is my password sent to your server?', a: 'There is no server. The file is locked in your browser, and the password is never stored or sent.' },
      { q: 'How do I take the password off later?', a: 'Use [Remove a password](/tools/remove-password/) and type it in.' },
      { q: 'Will the person be able to open it on a phone?', a: 'Yes. Phone PDF viewers ask for the password and open it, like any locked bank statement.' },
      { q: 'Is AES-256 really secure?', a: 'The lock itself is the strongest a PDF can have. How safe the file really is depends on the password: a long one that nobody can guess is what makes it strong.' },
      { q: 'Can I change the password later?', a: 'Unlock the file with [Remove a password](/tools/remove-password/) using the old one, then lock the unlocked copy again with the new one.' },
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
      {
        heading: 'A worked example',
        paragraphs: [
          'A rental broker asks for your Aadhaar. Open Remove areas and add your e-Aadhaar, typing its password if it is still locked. On the letter part, drag across the first eight digits of the number, leaving the last four. Do the same on the card part at the bottom, and drag across the QR code. Press Remove them, open the result, and zoom in on each place to check that no digit escaped before you send it.',
        ],
      },
      {
        heading: 'Where a masked copy is usually enough',
        paragraphs: [
          'A masked copy is widely accepted where only proof of identity or address is needed, such as hotels, rentals and many private services. Where an office must check the full number itself, or verify UIDAI’s signature, it will want the full e-Aadhaar instead. Ask which they need: whenever a masked copy is enough, it shares less of you.',
        ],
      },
    ],
    faq: [
      { q: 'Can someone recover the hidden digits?', a: 'No. The marked page is replaced by a picture with those parts painted out; the digits are not in the file.' },
      { q: 'Is my Aadhaar uploaded?', a: 'No. Everything happens in your browser, on your device.' },
      { q: 'Will the rest of the page still work?', a: 'It looks the same, but a marked page becomes a picture, so its other words can no longer be selected or searched.' },
      { q: 'Does UIDAI’s signature still check out?', a: 'No. Any changed copy loses it. Where an office needs to verify the signature, it needs the original.' },
      { q: 'Can I mask the number on a printed Aadhaar?', a: 'Yes. Photograph it with [Scan](/tools/scan/), then drag across the digits here. A scan has no text, so Find and remove cannot find them, but marking by hand works on any page.' },
      { q: 'Is this the same as UIDAI’s masked Aadhaar?', a: 'No. UIDAI’s masked Aadhaar is made and signed by UIDAI. A copy masked here is your own copy with digits removed, so it no longer carries UIDAI’s signature.' },
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
      {
        heading: 'A worked example',
        paragraphs: [
          'You are sending a bank statement to show your salary credits, and want to hide your account number, your address and every other transaction. Open Remove areas and add it. Open Find and remove, tick card numbers and phone numbers, type your account number and street name in the words box, and tap Find and mark them. Check each mark, then drag across the other transaction lines by hand. Press Remove them and look through the result.',
        ],
      },
      {
        heading: 'Checking a redaction',
        paragraphs: [
          'Open the redacted copy and try to select text on a marked page: nothing can be selected, because the page is now a picture. Search for the hidden name with your reader’s find; it should not be found on that page. If a page you did not mark still shows the name, it was missed, so go back to the original, mark it too, and run it again.',
        ],
      },
      {
        heading: 'Common mistakes',
        paragraphs: [
          'Missing the second copy: names and numbers often appear again in a header, a footer, a signature block or a photo of an ID. Redacting the original and keeping no clean copy for your own records. And trusting a highlighter set to black, or a black shape in a drawing app: both cover the words, and neither removes them.',
        ],
      },
    ],
    faq: [
      { q: 'What can Find and remove look for?', a: 'Aadhaar numbers, PAN numbers, phone numbers, email addresses and card numbers, plus any words or names you type, separated by commas.' },
      { q: 'Does it find numbers in a scan?', a: 'Not as it is: a scan is a picture with no text to search. Run [Make searchable](/tools/ocr/) first and then search, checking every mark, or drag across those parts by hand.' },
      { q: 'Is my document uploaded?', a: 'No. Redaction happens in your browser. The document never leaves your device.' },
      { q: 'Does redaction make the file bigger?', a: 'Marked pages become pictures, which are usually larger than text, so the file may grow. [Compress](/tools/compress/) can bring it down afterwards.' },
      { q: 'Can I redact on my phone?', a: 'Yes. Drag across each part with your finger; zoom in first for small print, so the mark covers every letter.' },
      { q: 'Can the black areas be taken off later?', a: 'No. They are part of the picture the page became; there is nothing underneath to uncover.' },
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
      {
        heading: 'How to see what a PDF carries',
        paragraphs: [
          'Most readers show a document’s details under File, then Properties or Document properties: the title, author, the program that made it, and the dates. That is a good first check. Hidden XMP data, comments and attachments may not show there, so the result line of Clean everything hidden lists what it actually found and removed.',
          'On a phone, many PDF viewers have a details or properties option in their menu that shows the same thing. Look at it once before and once after cleaning: the title, author and program lines should be empty afterwards, or show only what you typed with Set new details. If they still show old details, check that you opened the cleaned copy and not the original.',
        ],
      },
      {
        heading: 'A worked example',
        paragraphs: [
          'You made your CV on an office laptop, and the PDF’s author is the name set on that laptop. Before sending it to another company, open Clean hidden data, keep Clean everything hidden, and press Clean it. If you like, run the cleaned copy again with Set new details, typing your own name as the author and Curriculum vitae as the title, so whoever opens the properties sees something sensible.',
        ],
      },
      {
        heading: 'Common mistakes',
        paragraphs: [
          'Cleaning the details but leaving a give-away file name, such as Final_v3_with_HR_comments.pdf: rename the copy before sending. Cleaning a file and then editing it in another program, which may write its own details back in, so clean last. And expecting this to remove names printed on the pages, which it never touches.',
        ],
      },
    ],
    faq: [
      { q: 'Will it change how the document looks?', a: 'No. Only hidden data is removed. The pages are not touched.' },
      { q: 'Is my file uploaded?', a: 'No. It is cleaned in your browser.' },
      { q: 'Does this site add its own metadata?', a: 'No. Results never carry this site’s name, and a test checks every tool’s output for it.' },
      { q: 'Does it clean a locked PDF?', a: 'Yes. Type the password when asked; the cleaned copy keeps the same password.' },
      { q: 'Is there anything it cannot clean?', a: 'Words and pictures on the pages, and anything that is part of them, such as a name inside a photo. Those need [Remove areas](/tools/remove-areas/).' },
      { q: 'Can I clean many files at once?', a: 'Yes. Add them all; each is cleaned the same way, and Save all keeps the cleaned copies together.' },
    ],
  },

  {
    slug: 'attach-files-to-pdf',
    title: 'Attach files to a PDF, or take attachments out',
    h1: 'How to attach files inside a PDF, and take them out',
    description: 'Put a spreadsheet, photos or any file inside a PDF so they travel with it, or save the files a PDF already carries. Free, and nothing is uploaded.',
    tool: 'attachments',
    related: ['document-details', 'merge', 'pdf-a'],
    intro: 'Open Attachments, keep Put files inside the PDF, add the PDF first and then the files, and press Attach or take out. To get files out of a PDF, choose Take out the attached files instead.',
    steps: [
      'Open Attachments and choose Put files inside the PDF, or Take out the attached files.',
      'Add the PDF first, then, to attach, the files to put inside it.',
      'Press Attach or take out.',
      'Save the PDF with its attachments, or save each file that came out.',
    ],
    sections: [
      {
        heading: 'Why put files inside a PDF',
        paragraphs: [
          'An attachment travels inside the PDF, so a set of files cannot be separated by accident. An invoice can carry the spreadsheet behind it, a report its raw photos, a signed form the scan of the ID it refers to, a thesis its data. The person receiving gets one file to save and forward, and opens the attachments when they need them.',
          'Any kind of file can go in: Excel sheets, Word files, photos, other PDFs, a ZIP. The PDF grows by about the size of what you attach. No size limit is set here, but the email or portal you send it through may have one, and attachments count towards it.',
        ],
      },
      {
        heading: 'How the person receiving finds them',
        paragraphs: [
          'Readers list attachments in a panel of their own, often marked with a paperclip: Adobe Acrobat Reader has an Attachments panel, and Firefox’s built-in viewer shows them in its sidebar. Not every viewer shows them, and many phone viewers do not. So say in your message that the PDF carries attachments, and what they are; the result line here reminds you to.',
        ],
      },
      {
        heading: 'Taking files out',
        paragraphs: [
          'Choose Take out the attached files, add the PDF and press Attach or take out. Every file it carries comes out exactly as it went in, byte for byte, with its own name, and Save all keeps them together. If a PDF carries none, the result says so.',
          'Files attached to a PDF from someone you do not know deserve the care you would give any unexpected email attachment. Nothing here opens or checks them; they are carried, and handed back, exactly as they are.',
        ],
      },
      {
        heading: 'Attachments leave with the file',
        paragraphs: [
          'Attachments are easy to forget, and they go wherever the PDF goes. Before sending a PDF outside, check what it carries. To drop every attachment at once, use [Clean hidden data](/tools/document-details/), which takes them out along with the other hidden details. An [archive copy (PDF/A)](/tools/pdf-a/) also leaves them out, as the standard it follows asks.',
          'If the PDF is digitally signed, attaching files makes a new copy in which the signature no longer checks out, and the result line says so. Attach first, and sign last.',
        ],
      },
      {
        heading: 'A worked example',
        paragraphs: [
          'Deepa is sending her accountant a PDF of the year’s rent receipts, and wants the twelve bank transfer screenshots and the rent agreement to go with it. She opens Attachments, keeps Put files inside the PDF, adds the receipts PDF first, then the screenshots and the agreement, and presses Attach or take out. The result says 13 files attached inside. She emails one PDF and tells her accountant to open its attachments panel, from which he saves the screenshots straight out.',
        ],
      },
      {
        heading: 'Attach, or merge?',
        paragraphs: [
          'Attaching keeps each file as itself, in its own format, which suits spreadsheets, photos at full size and anything that is not a PDF. If everything is a PDF and should be read page after page, [Merge](/tools/merge/) them into one document instead: every page shows in any viewer, with no panel to find.',
        ],
      },
    ],
    faq: [
      { q: 'Are my files uploaded?', a: 'No. They are put inside the PDF in your browser, as they are, and never opened, checked or sent anywhere.' },
      { q: 'Is there a size limit?', a: 'None is set here; your device’s memory is the only limit. Email and portals have their own limits, and attachments count towards them.' },
      { q: 'What if two files have the same name?', a: 'The second is renamed with (2) at the end, so both can be found in the reader’s list.' },
      { q: 'Can I attach files to a locked PDF?', a: 'Yes. Type its password when asked; the result stays locked with the same password.' },
      { q: 'How do I remove all attachments?', a: 'Use [Clean hidden data](/tools/document-details/) with Attached files too ticked.' },
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
      'If any pages are scans, choose under Scanned pages: as a picture, as editable words, or both.',
      'Press Make a Word file.',
      'Save the .docx and open it in your word processor.',
    ],
    sections: [
      {
        heading: 'What comes across',
        paragraphs: [
          'Headings, paragraphs, lists and tables are worked out from where the words sit on each page, so a tidy PDF comes out tidy, and bold stays bold. Photos and pictures come along in their places. Page numbers and headers repeated on every page are left out, and a paragraph split by a page break is joined again. Fonts become their nearest Word font.',
        ],
      },
      {
        heading: 'Scanned pages',
        paragraphs: [
          'A scan is a picture of words. By default a scanned page goes into Word as that picture, exactly as it looks, which is right for passports, ID cards and certificates. Choose Editable words and its words are used instead: the ones a scanner already hid in the file, or else read from the picture by a text reader fetched from this site the first time, which is slower and best with clear, straight scans.',
        ],
      },
      {
        heading: 'Do you need Word at all?',
        paragraphs: [
          'For a typo or a changed date, [Edit text](/tools/edit-text/) edits the PDF directly and keeps its layout. When you are done in Word, [Word or Excel to PDF](/tools/office-to-pdf/) turns it back, or use your word processor’s own Save as PDF, which keeps your fonts exactly.',
        ],
      },
      {
        heading: 'A worked example',
        paragraphs: [
          'You have a 6-page typed project report as a PDF and need to change two paragraphs and a table. Open PDF to Word, add it, and press Make a Word file. Open the .docx: headings arrive as Word headings and the table as a real table you can add rows to. Make the changes, then use Word’s own Save as PDF, or Word or Excel to PDF on a phone, for the new version.',
        ],
      },
      {
        heading: 'What converts well, and what does not',
        paragraphs: [
          'Typed documents with one column of text, clear headings and simple tables convert best: letters, reports, notices, and resumes made in a word processor. Brochures with text in boxes, magazines with several columns, and forms built from many small pieces of text come out with the right words in a layout that needs tidying. Their pictures come along, placed between the paragraphs rather than floating where they were.',
          'Text that was typed into the PDF comes across exactly, letter for letter, because it is copied rather than read from a picture. Only scanned pages depend on the text reader, so a mostly typed document with a scanned annexure converts well everywhere except the annexure, which is worth checking line by line.',
        ],
      },
      {
        heading: 'Common mistakes',
        paragraphs: [
          'Expecting editable text from a scan while Scanned pages is set to Keep as a picture: choose Editable words and run it again. Expecting exact fonts: Word gets the nearest match, so check the headings and spacing. And converting just to fix a typo, when Edit text changes the PDF itself and keeps every font and position as it was.',
        ],
      },
    ],
    faq: [
      { q: 'Is my PDF uploaded to convert it?', a: 'No. It is read and converted in your browser, on your device.' },
      { q: 'Will it look exactly like the PDF?', a: 'Close, not identical. A PDF fixes every word’s position; a Word file flows text. Complex layouts may need tidying.' },
      { q: 'Can I convert a scanned PDF to Word?', a: 'Yes. Each scanned page goes in as a picture by default; choose Editable words to get its text, and check names and numbers.' },
      { q: 'Can it convert Malayalam or Hindi PDFs?', a: 'Where the PDF holds real text in those scripts, the words come across as they are stored, which for some older files is garbled. Scanned pages are read in English only, so a scanned Malayalam page will not convert properly.' },
      { q: 'Does it work on a phone?', a: 'Yes. The .docx opens in the Word or Google Docs app on the phone.' },
      { q: 'Can I convert several PDFs at once?', a: 'Yes. Add them all; each becomes its own .docx, and Save all saves them together.' },
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
          'Headings, lists, tables, links and pictures are laid out on the Word file’s own page size, with the words kept as real text you can select and search. Headers and footers go on every page with their page numbers worked out, and footnotes are gathered under Notes at the end. Wide spreadsheets go on sideways pages. Lines in Malayalam, Hindi and other scripts are drawn by your browser and placed as pictures, so they show correctly, with the same words written invisibly underneath so they can still be searched and copied.',
        ],
      },
      {
        heading: 'What is not, yet',
        paragraphs: [
          'Fonts become the nearest of Helvetica, Times or Courier, so a document set in a special font looks plainer. Footnotes move to the end rather than the foot of each page. Older .doc and .xls files need saving as .docx or .xlsx first.',
          'If you have Word, Google Docs or LibreOffice, their own Save as PDF or Download as PDF keeps your exact fonts and spacing. This tool is for when you do not have them, such as on a phone, or on a work computer where you should not upload files.',
        ],
      },
      {
        heading: 'After converting',
        paragraphs: [
          'Join it with other PDFs using [Merge](/tools/merge/), or bring it under an upload limit with [Compress](/tools/compress/). Going the other way is [PDF to Word](/tools/pdf-to-word/).',
        ],
      },
      {
        heading: 'A worked example',
        paragraphs: [
          'A college wants your resume as a PDF, and you only have the .docx on your phone. Open Word or Excel to PDF, add the file, and press Make the PDF. Open the result to check the line breaks and the table of your marks. Then save it, or tap Then and choose Compress if the portal sets a size limit.',
        ],
      },
      {
        heading: 'Excel sheets as PDF',
        paragraphs: [
          'Each sheet in a workbook comes out in turn, as a table, with its name as a heading when there is more than one sheet. Columns that are empty all the way down are left out, numbers line up on the right, and the first row is set in bold and comes back at the top of every page. Dates and amounts show as their cells show them. A sheet too wide for an upright A4 page goes on sideways pages, in smaller type when even that is too narrow. Charts are not drawn; for those, use the spreadsheet app’s own export.',
          'Check that totals worked out by formulas show the figures you expect before you send the PDF. If only one sheet of a workbook should become a PDF, delete the others from a copy of the workbook first, or save that sheet as a workbook of its own, and convert that.',
        ],
      },
      {
        heading: 'Common mistakes',
        paragraphs: [
          'Converting an old .doc file: save it as .docx first in any office app. Typing page numbers by hand into a document: use Word’s own page-number field in the footer, which comes out right on every page. And checking the PDF only on a computer when it will mostly be read on a phone: open it on both if it matters.',
        ],
      },
    ],
    faq: [
      { q: 'Is my document uploaded?', a: 'No. The PDF is laid out in your browser.' },
      { q: 'Can I convert an Excel sheet?', a: 'Yes. Each sheet comes out as a table; wide ones on sideways pages.' },
      { q: 'Why does my .doc file not work?', a: 'Only the newer .docx and .xlsx are read. Open the old file in an office app and save it as .docx first.' },
      { q: 'Can I convert several files at once?', a: 'Yes. Add them all; each becomes its own PDF, and Merge can join them afterwards.' },
      { q: 'Will the PDF be searchable?', a: 'Yes. Words in English letters are real text you can search and copy. Lines in other scripts are placed as pictures with the same words written invisibly underneath, so search finds them too.' },
      { q: 'Does it work on a phone?', a: 'Yes, that is what it is for: a .docx sent to you on WhatsApp or by email can become a PDF in the phone’s browser, with nothing to install.' },
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
      {
        heading: 'A worked example',
        paragraphs: [
          'A job portal wants your experience letter as a JPG under 300 KB, and you have it as a 2-page PDF. Open PDF to images, add it, choose JPEG and Sharing, type 1 in Pages and press Save as images. The result line gives the image’s size; if it is over 300 KB, run it again at Screen. Zoom in on the image to check the letter still reads before you upload it.',
        ],
      },
      {
        heading: 'Pages on WhatsApp',
        paragraphs: [
          'Sending a page as a picture lets the person see it straight away in the chat, without opening a file. Sharing sharpness, 150 dpi, is plenty for a phone screen. WhatsApp shrinks pictures sent as photos, so for a page with small print, send the image as a document instead, which keeps it sharp. Send all sends every page in one go.',
          'On a computer, Save all puts every page into a folder you pick, named with the page numbers so they stay in order; where the browser cannot save into a folder, it makes one ZIP instead. To send only a few pages, type them in Pages, such as 1, 3-4, before pressing the button, rather than converting the whole file.',
        ],
      },
      {
        heading: 'Common mistakes',
        paragraphs: [
          'Choosing Print for a form that wants a small file: Print makes images several times bigger than Sharing. Choosing JPEG for a page of fine text, which can blur the edges of letters; PNG keeps them crisp. And using this tool to get photos out of a PDF at full quality, when Extract images does that without redrawing anything.',
        ],
      },
    ],
    faq: [
      { q: 'Is my PDF uploaded?', a: 'No. Pages are drawn as images in your browser.' },
      { q: 'Can I convert just one page?', a: 'Yes. Type its number in Pages, such as 3.' },
      { q: 'How do I get all the images at once?', a: 'Save all saves them into a folder you choose, or as one ZIP where the browser cannot save to a folder.' },
      { q: 'Can I send the pages on WhatsApp?', a: 'Yes. On phones that can share files, Share sends the images straight to WhatsApp or any other app.' },
      { q: 'How big is each image?', a: 'It depends on the page and the settings, and the result line gives each image’s size. Screen makes the smallest files and Print the largest.' },
      { q: 'Does each image show the whole page?', a: 'Yes. Each image is the full page as a reader shows it, margins included. To cut out part of a page, use your phone’s or computer’s own photo editor afterwards.' },
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
          'Drawings, charts and text are not pictures, so they do not come out. A scanned PDF usually stores each page as one image, so you get one picture per page. Pictures stored as a colour palette, in print CMYK, or as black-and-white fax or JBIG2 scans are decoded the way a reader shows them and saved as PNG. To capture a page exactly as it looks, use [PDF to images](/tools/pdf-to-images/).',
        ],
      },
      {
        heading: 'Changing the pictures instead',
        paragraphs: [
          'To move, resize, take out or swap a picture inside the PDF itself, use [Edit pictures](/tools/edit-images/). If the PDF is big because of its pictures, [Compress](/tools/compress/) makes them lighter. Pictures in a file you received may belong to someone else, so check before you reuse them.',
        ],
      },
      {
        heading: 'A worked example',
        paragraphs: [
          'A designer sent you a brochure PDF and you need its product photos for your website. Open Extract images, add the brochure and press Pull the images out. Each photo arrives with its size in pixels and its page. Save the ones you need. Because they are the originals, they are often much sharper than a screenshot of the page would be. Check first that you have the right to use them.',
        ],
      },
      {
        heading: 'Why a picture can look strange on its own',
        paragraphs: [
          'PDFs sometimes store a picture in pieces, with a separate mask that makes parts of it see-through, or stored the other way up with the page’s own instructions turning it. Taken out on its own, such a picture can look cut up, have black where the page showed white, or be flipped. A page saved with PDF to images always looks exactly as you see it.',
        ],
      },
      {
        heading: 'Common mistakes',
        paragraphs: [
          'Expecting logos and charts to come out: if they were drawn as shapes, there is no picture inside to take. Expecting the words in a scanned page to come out as text: you get the page as a picture, and need [Make searchable](/tools/ocr/) for the words. And forgetting Save all, which saves every image in one go.',
          'The images come out with names that say which page they came from, so they are easy to match to the document. A JPEG 2000 picture comes out as a .jp2 file, which some photo apps cannot open; for that page, PDF to images gives you an ordinary JPEG instead.',
        ],
      },
    ],
    faq: [
      { q: 'Are the images lower quality than the originals?', a: 'No. They are the bytes stored in the PDF, saved as they are.' },
      { q: 'Is my PDF uploaded?', a: 'No. The images are taken out in your browser.' },
      { q: 'Some images came out as .jp2 files. What are they?', a: 'JPEG 2000, a format some PDFs use. Many photo viewers cannot open it; [PDF to images](/tools/pdf-to-images/) gives you the page as an ordinary JPEG.' },
      { q: 'Can I take images from a locked PDF?', a: 'Yes. Type its password when asked.' },
      { q: 'Is there a limit on how many images?', a: 'No. Every picture the file holds comes out, however many there are.' },
      { q: 'Do I get the photos at full size?', a: 'Yes. They come out at the size stored in the file, which is often bigger than they appear on the page.' },
    ],
  },

  {
    slug: 'print-multiple-pages-per-sheet',
    title: 'Print several PDF pages per sheet: 2, 4 or more',
    h1: 'How to print several PDF pages on one sheet of paper',
    description: 'Put 2, 4, 6, 8, 9 or 16 PDF pages on each A4 sheet to save paper on notes, slides and handouts. Free, in your browser, with nothing uploaded.',
    tool: 'n-up',
    related: ['extract-pages', 'crop', 'merge'],
    intro: 'Open Pages per sheet, choose how many pages go on each sheet and A4 or Letter, and press Lay it out. You get a new PDF whose every page holds several of the old ones, ready to print at actual size.',
    steps: [
      'Open Pages per sheet and add the PDF.',
      'Choose 2, 4, 6, 8, 9 or 16 under Pages on each sheet.',
      'Choose A4 or Letter for the sheet size.',
      'Press Lay it out and look through the result.',
      'Print it at actual size, or 100%, rather than fit to page.',
    ],
    sections: [
      {
        heading: 'How many to a sheet',
        paragraphs: [
          'Two to a sheet halves the paper and stays easy to read: each A4 page prints at about two-thirds of its size, so ordinary 11-point text comes out a little over 7 points, small but readable for most people. Four to a sheet quarters the paper, with each page a little under half size, which suits slides, notes with large headings and handouts, but makes a dense contract hard going. Six, eight, nine and sixteen are for slide decks and for an overview of a long document, not for reading body text.',
        ],
      },
      {
        heading: 'Which way the sheet turns',
        paragraphs: [
          'The sheet is turned whichever way shows the pages biggest. Two upright pages go side by side on a sideways sheet; two wide slides go one above the other on an upright sheet. Pages run left to right, then down, and each is scaled to fit its place with its shape kept, so nothing is cut off or stretched. A file with mixed page sizes is laid out for the shape most of its pages have, and every page is fitted into its own place.',
        ],
      },
      {
        heading: 'The printer’s own setting, or this?',
        paragraphs: [
          'Many print dialogs, Chrome’s among them under More settings, can also print several pages per sheet. That is fine when you are printing it yourself, once. Laying it out here gives you a file instead: one you can send to a print shop, a classmate or a phone whose print screen has no such setting, and that prints the same everywhere. You also see every sheet before any paper is spent.',
        ],
      },
      {
        heading: 'Printing it right',
        paragraphs: [
          'In the print dialog, choose actual size, 100% or no scaling. Fit to page shrinks the layout a second time and leaves wide white edges. Print one sheet as a test before a long run. For double-sided printing, print as you normally would: each sheet of the new PDF is an ordinary page to the printer.',
          'Pages are laid out in plain reading order. This tool does not reorder pages for folding into a booklet; for a stapled handout, reading order is exactly what you want.',
        ],
      },
      {
        heading: 'Printing only what you need',
        paragraphs: [
          'Before laying out a long file, take out the pages you will not use with [Extract or remove pages](/tools/extract-pages/), such as blank pages or a deck’s section dividers. Wide white margins waste room on every sheet too: run [Crop pages](/tools/crop/) with Remove the white margins first, and each page fills more of its place. To print several files together, join them with [Merge](/tools/merge/) and lay out the merged file.',
        ],
      },
      {
        heading: 'A worked example',
        paragraphs: [
          'Rahul’s lecturer shares a 60-slide deck as a PDF before an exam. He opens Pages per sheet, adds it, chooses 6 and A4, and presses Lay it out. The wide slides fit best two across and three down on a sideways sheet, and the result line says 60 pages on 10 sheets of A4 turned sideways. He prints one sheet at actual size to check that the slides’ small text can be read, then prints the rest double-sided: five sheets of paper instead of sixty.',
        ],
      },
    ],
    faq: [
      { q: 'Is my file uploaded?', a: 'No. The sheets are laid out in your browser, and the file never leaves your device.' },
      { q: 'Will the text stay sharp?', a: 'Yes. Pages are placed on the sheet as they are, not turned into pictures, so text is as sharp as the printer allows at its smaller size.' },
      { q: 'Can I lay out several files at once?', a: 'Yes. Add them all; each comes back as its own laid-out PDF.' },
      { q: 'Why is there a white edge round the sheet?', a: 'A small margin is left round each sheet and between the pages, so nothing falls in the strip many printers cannot print.' },
      { q: 'Can I put both sides of an ID card on one sheet?', a: 'Yes, if they are two pages of one PDF. See [Aadhaar front and back on one page](/guides/aadhaar-front-and-back-on-one-page/).' },
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
        heading: 'Indian scripts, searchable too',
        paragraphs: [
          'Every word read goes into the invisible layer inside the PDF, in whatever script it is written: Malayalam, Hindi, Tamil, Bengali, Arabic. Search, select and copy work on them in any PDF reader, just as for English. Check names and numbers, as they were read from a picture. There are guides for [Malayalam scans](/guides/malayalam-ocr-scanned-pdf/) and [Hindi scans](/guides/hindi-ocr-scanned-pdf/).',
        ],
      },
      {
        heading: 'Better scans read better',
        paragraphs: [
          'Straight, sharp, high-contrast pages read best. [Scan](/tools/scan/) in Black and white gives the reader its easiest job. Pages that already have text are left alone. To get the words out as plain text afterwards, use [Extract text](/tools/extract-text/); for an editable document, [PDF to Word](/tools/pdf-to-word/).',
        ],
      },
      {
        heading: 'A worked example',
        paragraphs: [
          'You have a 30-page scanned property file in English and Malayalam and need to find every mention of a survey number. Open Make searchable, add the file, pick English and Malayalam, and press Make it searchable. Save the searchable copy. Your reader’s find now finds the survey number, the English words and the Malayalam ones too, all inside the PDF itself.',
        ],
      },
      {
        heading: 'Checking the result',
        paragraphs: [
          'Open the searchable PDF and use find for a word you can see on a page. If it is found and highlighted in the right place, the hidden layer lines up with the picture. Then select a sentence and paste it into a note: what pastes is what was read, which shows you how accurate the reading was for that page before you rely on it.',
          'For names, account numbers and amounts, do not trust the reading blindly: a 1 can be read as an l, or a 0 as an O. Search for one or two numbers you know are on the page to see whether they come out right.',
        ],
      },
      {
        heading: 'Common mistakes',
        paragraphs: [
          'Picking every language that might appear: each extra one slows the reading and makes mistakes more likely, so pick only what is really on the pages. Running it on a crooked phone photo, when straightening it with Scan first would read far better. And expecting handwriting to come out well; printed text is what the reader is made for.',
        ],
      },
    ],
    faq: [
      { q: 'Is my scan uploaded to be read?', a: 'No. The reading happens in your browser. Only the language model comes from this site, once; your document goes nowhere.' },
      { q: 'Will it change how my pages look?', a: 'No. The words go in as an invisible layer; the pictures are not touched.' },
      { q: 'How accurate is it?', a: 'Very good on clean printed text, weaker on handwriting, faint copies and unusual fonts. Check anything important.' },
      { q: 'Can I pick more than one language?', a: 'Yes, up to three. More than that makes the reading worse, not better.' },
      { q: 'Does it work on a phone?', a: 'Yes, though reading every page is real work for a phone, so a long scan takes a while. A computer is quicker for big files.' },
      { q: 'Can I make a searchable PDF from photos?', a: 'Yes. Turn the photos into a PDF with [Scan](/tools/scan/) first, then make that searchable.' },
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
          'For rent paid in cash over ₹5,000, receipts commonly carry a revenue stamp signed across by the owner. Choose Cash, and when the monthly rent is over ₹5,000 each receipt marks the place for one.',
        ],
      },
      {
        heading: 'Before you hand them in',
        paragraphs: [
          'The HRA exemption is claimed under the old tax regime; the new regime does not allow it. Receipts should match what you actually paid, and keeping bank or UPI records of the payments helps if you are asked. If your employer takes the receipts online, have them signed, photograph them with [Scan](/tools/scan/), and send one PDF; [Merge](/tools/merge/) joins it with your rent agreement if needed.',
        ],
      },
      {
        heading: 'A worked example',
        paragraphs: [
          'Anjali pays ₹18,000 a month for a flat in Kochi, by UPI, from April. That is ₹2,16,000 in the year, over ₹1,00,000, so her employer will want the owner’s PAN. She types her name, the owner’s name and the address, 18000 as the rent, April as the first month and 12 months, chooses UPI, types the owner’s PAN, and presses Make the receipts. Six A4 pages come out, two receipts on each, with the amount in figures and in words.',
        ],
      },
      {
        heading: 'What an employer usually checks',
        paragraphs: [
          'Employers commonly look for the tenant’s and owner’s names, the address, the period, the amount, the owner’s signature, and the owner’s PAN when the yearly rent is over the limit. Some also ask for a copy of the rent agreement or a declaration from the owner. Check your employer’s payroll instructions for the year, because they differ from company to company.',
        ],
      },
    ],
    faq: [
      { q: 'Is what I type stored or sent anywhere?', a: 'No. The receipts are made in your browser and nothing you type is kept or sent.' },
      { q: 'Can I sign them on screen?', a: 'The owner signs the receipts, not you. If your employer accepts a signature placed on the PDF, the owner can use [Sign](/tools/sign/); otherwise print them and sign in ink.' },
      { q: 'Can the names be in Malayalam or Hindi?', a: 'Yes. Words the PDF fonts cannot draw are drawn by your browser and placed as pictures, so they show correctly, and the same words are written invisibly underneath, so they can still be searched.' },
      { q: 'What if I moved house during the year?', a: 'Make two sets: one for the months at each address, with each owner’s name.' },
      { q: 'Can I make receipts for an earlier year?', a: 'Yes. Choose the first month you need, such as April of last year, and the number of months. The receipts should reflect rent you really paid in those months.' },
      { q: 'Can I correct the receipts after making them?', a: 'Make them again with the corrected details; it takes moments. Once the owner has signed, leave the PDF and the paper copies as they are.' },
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
      {
        heading: 'A worked example',
        paragraphs: [
          'Your landlord sends a revised rent agreement. Open Compare, add your copy of the old agreement first, then the revised one, and press Compare them. Open the marked copy: a new rent and a new notice period are highlighted in green, and comments mark where the old figures were. Step through them with the comments list in Read, and raise anything you did not agree to before you sign.',
          'Both files you added stay exactly as they were; the marked copy is a new file beside them, so nothing is overwritten.',
        ],
      },
      {
        heading: 'What it will not catch',
        paragraphs: [
          'Comparing words means some changes pass unmarked: a signature or stamp added as a picture, a changed logo, bold text made plain, or a table rearranged without changing its words. For those, look at the two versions side by side. If either version is a scan, its words must be read first, and any misreading will show up as a change that is not really there.',
          'Line breaks and page breaks do not count as changes either, so a paragraph that only flowed onto the next page is not marked. That keeps the marks to what someone actually rewrote.',
        ],
      },
      {
        heading: 'Common mistakes',
        paragraphs: [
          'Adding the files the wrong way round, so additions show up as removals: the older one always goes first. Comparing a scan with a typed version without making the scan searchable. And treating the marked copy as the new agreement: it is a working copy with marks on it, so sign the clean revised file, not the marked one.',
        ],
      },
    ],
    faq: [
      { q: 'Are my documents uploaded?', a: 'No. Both are read and compared in your browser.' },
      { q: 'Can I compare more than two files?', a: 'Two at a time: the older, then the newer.' },
      { q: 'Does it change the newer file?', a: 'No. You get a new, marked copy; both files you picked stay as they were.' },
      { q: 'Does it notice a changed number, like a rent amount?', a: 'Yes. Numbers are words too: the new amount is highlighted and a comment shows the old one.' },
      { q: 'Is the marked copy safe to send to the other side?', a: 'Yes. It is the newer file with highlights and comments added; nothing else on its pages changed. Say in your message that green means added and the comments show what was taken out.' },
      { q: 'Can I compare a Word file with a PDF?', a: 'Turn the Word file into a PDF first with [Word or Excel to PDF](/tools/office-to-pdf/), then compare the two PDFs.' },
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
      'If the PDF is a scan, choose Editable words under Scanned pages.',
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
          'Chapters start at each main heading, or at each section when the title is the only main heading, and photos come along in their places. Page numbers and running headers are dropped. The page layout gives way to plain flowing text, so it suits books, reports and notes much better than forms, slides or anything laid out in columns. Amazon’s Send to Kindle accepts EPUB files.',
        ],
      },
      {
        heading: 'Reading the PDF as it is',
        paragraphs: [
          'If the layout matters, [Read](/tools/read/) opens the PDF itself with zoom, find and a night mode. For a scan, Editable words reads the words first; for a better reading, [Make searchable](/tools/ocr/) offers more languages.',
        ],
      },
      {
        heading: 'A worked example',
        paragraphs: [
          'You have a 200-page novel as a PDF and want to read it on your phone on the train. Open PDF to EPUB or web page, add it, keep EPUB e-book and press Make the e-book. Open the file in Google Play Books or Apple Books, set the text size you like, and the lines wrap to your screen. The chapters appear in the app’s contents, taken from the book’s headings.',
        ],
      },
      {
        heading: 'EPUB or web page?',
        paragraphs: [
          'Choose EPUB for a reading app: most of them remember your place, let you change the font and size, and list the chapters. Choose a web page for something to open in a browser with no app at all, to send to someone, or to read with a screen reader. Both hold the same text, and both are made on your device.',
          'If you are not sure, make both. Each takes moments, the PDF you picked is never changed, and you can keep whichever reads better on your phone or e-reader.',
        ],
      },
      {
        heading: 'Common mistakes',
        paragraphs: [
          'Converting a form, a slide deck or a page of wide tables, which loses its layout; read those as PDFs. Converting a scan with Scanned pages left as pictures, which gives a book of page pictures with no text to reflow. And converting a picture book or a comic: its pictures come along, but cut from the pages and set between the words, so it reads better kept as a PDF.',
        ],
      },
    ],
    faq: [
      { q: 'Is my book uploaded?', a: 'No. It is converted in your browser.' },
      { q: 'Are pictures kept?', a: 'Yes. Photos and pictures come along in their places, cut from the page as it looks. For a picture-heavy PDF, reading it as a PDF may still suit better.' },
      { q: 'What is the web page option for?', a: 'One .html file that opens in any browser, with the text reflowing like an e-book. Handy for sharing or for screen readers.' },
      { q: 'Can I convert a book in Malayalam?', a: 'If the PDF holds real Malayalam text, it comes across as it is stored. Scanned pages are read in English only, so a scanned Malayalam book will not convert well.' },
      { q: 'Why did my book come out as one long chapter?', a: 'Chapters start at each main heading the converter finds. A book whose chapter titles look like ordinary text gives it nothing to cut at.' },
      { q: 'Can I read it on a Kindle?', a: 'Yes. Amazon’s Send to Kindle accepts EPUB files and delivers them to your Kindle and the Kindle app.' },
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
      {
        heading: 'A worked example',
        paragraphs: [
          'A court’s e-filing portal asks for petitions in PDF/A. Finish the petition, number its pages with [Page numbers](/tools/page-numbers/), and save it as PDF from your word processor with fonts embedded. Open Archive copy (PDF/A), add it and press Make the archive copy. If the result line mentions no missing fonts, sign it if the portal requires a signature, and upload it, running the portal’s own checker if it has one.',
        ],
      },
      {
        heading: 'The letters and numbers in PDF/A',
        paragraphs: [
          'PDF/A comes in parts, 1, 2 and 3, and in levels: b for basic, a for accessible, and u for text that can be copied reliably. Level b promises that the pages will look the same years from now; level a also needs the document’s structure tagged for screen readers. This tool makes PDF/A-2b. If a portal asks specifically for PDF/A-1 or for level a, check its instructions, or use the tool it recommends.',
          'If nobody tells you which kind to make, PDF/A-2b is a sensible choice: it is widely accepted, and it allows the compression that modern files use, so the archive copy does not have to be much bigger than the original.',
        ],
      },
      {
        heading: 'Common mistakes',
        paragraphs: [
          'Making an archive copy of a scan and expecting it to be searchable: PDF/A keeps what is there, so run [Make searchable](/tools/ocr/) first if search matters. Signing first and archiving afterwards, which breaks the signature. And expecting a locked PDF to stay locked: an archive must open for anyone, so the password comes off.',
        ],
      },
    ],
    faq: [
      { q: 'Which PDF/A version does it make?', a: 'PDF/A-2b, the level most portals that ask for PDF/A accept.' },
      { q: 'Is my document uploaded?', a: 'No. The archive copy is made in your browser.' },
      { q: 'Will it pass a validator?', a: 'If the file has its fonts inside it, it is built to. If not, the result tells you before you find out from the portal.' },
      { q: 'Does it change how my pages look?', a: 'No. The pages are kept exactly as they are; only what the file carries around them changes.' },
      { q: 'Can I make PDF/A from a Word file?', a: 'Yes. Make a PDF first, ideally with your word processor’s Save as PDF and fonts embedded, then make the archive copy from that.' },
      { q: 'Is my original kept?', a: 'Yes. The archive copy is a new file, and the PDF you picked is never changed, so you can keep both.' },
    ],
  },

  {
    slug: 'malayalam-ocr-scanned-pdf',
    title: 'Malayalam OCR: make a scanned PDF searchable, free',
    h1: 'How to make a scanned Malayalam PDF searchable',
    description: 'Read the Malayalam words in a scanned PDF so you can search, select and copy them in the PDF itself. Free, on your own device, and never uploaded.',
    tool: 'ocr',
    related: ['scan', 'extract-text', 'pdf-to-images', 'images-to-pdf'],
    intro: 'Open Make searchable, choose Malayalam as the language of the scan, add English if the pages mix the two, and press Make it searchable. The Malayalam words go into the PDF itself, invisibly over each page, so your reader’s find, select and copy work on them.',
    steps: [
      'Open Make searchable and add the scanned PDF.',
      'Choose Malayalam under Language of the scan.',
      'Choose English under Also in if the pages carry English words or names too.',
      'Press Make it searchable; the Malayalam reader comes from this site the first time only.',
      'Save the searchable copy and try your reader’s find on a word you can see.',
    ],
    sections: [
      {
        heading: 'What you get',
        paragraphs: [
          'A copy of your PDF, named with (searchable) at the end, that looks exactly like the scan. Over each scanned page lies an invisible layer of the words that were read, in Malayalam script, lined up with the picture. Search for a name and the reader jumps to it; select a line and copy it into a message, a note or a document. Pages that already had text of their own are left as they were.',
          'Every word read, Malayalam and English alike, goes into the PDF itself rather than into a separate text file, so the file you keep or send is the file that searches.',
        ],
      },
      {
        heading: 'A scan that reads well',
        paragraphs: [
          'The reader works from a picture of each page, so the picture decides how well it does. Print on clean paper reads far better than a faint photocopy, and a straight page better than a crooked photo. If you are starting from phone photos, put them through [Scan](/tools/scan/) first, with Black and white, which straightens the page, whitens the paper and makes the letters crisp. Keep the paper flat, keep your shadow off it, and let it fill the photo.',
          'Malayalam has many joined letters and small vowel signs, and those are the first details a blurred photo loses. If one letter keeps being read as another, a sharper photo of that page helps more than anything else. Handwriting and old typewritten pages read poorly whatever the language.',
        ],
      },
      {
        heading: 'Checking names and numbers',
        paragraphs: [
          'Everything in the layer was read from a picture, so treat it as a good draft. After saving, search for a name and a number you can see on the page; if they are found, the layer lines up. Then copy a sentence into a note and compare it with the page. That shows how well this scan was read before you rely on it for a survey number, an amount or a date.',
          'If a word you can see is not found, search for part of it. Malayalam letters can be stored inside a computer in more than one way, and a shorter piece of the word often finds it when the whole word does not.',
        ],
      },
      {
        heading: 'When it says every page already has text',
        paragraphs: [
          'Make searchable leaves alone any page that already has text of its own, which is usually right. But some Malayalam PDFs were typed years ago with older typing software whose letters copy out as a jumble of English letters and symbols, and those pages count as having text. If copying from your file gives nonsense and Make searchable says every page already has text, turn the pages into pictures first: save them with [PDF to images](/tools/pdf-to-images/) as PNG at Print sharpness, make them a PDF again with [Images to PDF](/tools/images-to-pdf/) on A4 with no margin, and make that searchable.',
        ],
      },
      {
        heading: 'A worked example',
        paragraphs: [
          'Lakshmi has a 12-page scanned bundle of land papers from the village office, partly in Malayalam and partly in English, and needs every mention of a survey number and her grandfather’s name. She opens Make searchable, adds the PDF, chooses Malayalam as the language of the scan and English under Also in, and presses Make it searchable. The first time, the Malayalam reader, about 2.8 MB, comes from this site; then each page is read on her own phone, one at a time. She saves the copy, searches for the survey number, then for her grandfather’s name typed in Malayalam, and checks each match against the page.',
        ],
      },
    ],
    faq: [
      { q: 'Is my document sent anywhere to be read?', a: 'No. The reading happens in your browser, on your device. Only the Malayalam reader itself comes from this site, the first time you pick it; your scan goes nowhere.' },
      { q: 'Can it read handwritten Malayalam?', a: 'Not well. It is made for printed text. Handwriting, and very old typewritten pages, come out with many mistakes.' },
      { q: 'How long does it take?', a: 'Each page is real work for your device, so a long scan takes a while, and longer on an older phone. A line shows which page it is reading.' },
      { q: 'Can I copy the Malayalam into WhatsApp or Word?', a: 'Yes. Select it in your reader and copy, or take the searchable copy to [Extract text](/tools/extract-text/) for all of it as plain text, Malayalam included.' },
      { q: 'Can I pick Malayalam, English and Tamil together?', a: 'Yes, up to three languages. Pick only those really on the pages: each extra one makes the reading slower and mistakes more likely.' },
      { q: 'What about Hindi and other Indian languages?', a: 'Twenty languages can be picked, among them Tamil, Kannada and Telugu. For Hindi, see [Hindi OCR for scanned PDFs](/guides/hindi-ocr-scanned-pdf/).' },
    ],
  },
  {
    slug: 'hindi-ocr-scanned-pdf',
    title: 'Hindi OCR: make a scanned Hindi PDF searchable, free',
    h1: 'How to make a scanned Hindi PDF searchable',
    description: 'Read Hindi (Devanagari) text in a scanned PDF so you can search and copy it, notices and forms included. Free, private, and nothing is uploaded.',
    tool: 'ocr',
    related: ['scan', 'summarise', 'remove-areas', 'pdf-to-word'],
    intro: 'Open Make searchable, choose Hindi as the language of the scan, add English if the document is in both, and press Make it searchable. The Devanagari words go into the PDF itself, so you can search, select and copy them like typed text.',
    steps: [
      'Open Make searchable and add the scanned PDF.',
      'Choose Hindi under Language of the scan.',
      'Choose English under Also in if the pages carry English as well.',
      'Press Make it searchable, and wait while each page is read on your device.',
      'Save the copy and search it for a word or number you can see.',
    ],
    sections: [
      {
        heading: 'Hindi and English on one page',
        paragraphs: [
          'Government circulars, notices, orders and many forms are printed in Hindi and English together, side by side or one after the other. Pick Hindi first and English second, and both go into the searchable layer, each in its own script, lined up with the page. A form with Hindi headings and answers filled in English letters works the same way.',
          'Hindi and Marathi share the Devanagari script but have separate readers in the list. For a Marathi document, pick Marathi, which knows Marathi words and spellings, even though the letters look the same.',
        ],
      },
      {
        heading: 'Old Hindi PDFs that copy out as nonsense',
        paragraphs: [
          'Many Hindi documents were typed in older fonts such as Kruti Dev and Chanakya, which store each Hindi letter under an English key. They look right on the page, but copying from them gives strings of English letters and symbols, and a search for a Hindi word finds nothing. Because such pages already have text, Make searchable leaves them alone and says every page already has text.',
          'The way round is to turn the pages into pictures first, which drops the broken text. Save the pages with [PDF to images](/tools/pdf-to-images/) as PNG at Print sharpness, make them a PDF again with [Images to PDF](/tools/images-to-pdf/) on A4 with no margin, and make that searchable with Hindi chosen. The new layer holds real Hindi, which searches and copies correctly.',
        ],
      },
      {
        heading: 'Numbers, dates and names',
        paragraphs: [
          'Hindi documents print numbers in two ways: the usual 0 to 9, or Devanagari digits such as १२३. What is read is stored as it is printed, so search for a number the way the page shows it. Dates, file numbers and amounts are where a misread matters most, so check them against the page before you quote them.',
          'Names deserve the same care. Hindi joins letters into one shape, and half-letters and the line along the top are the first things a poor scan blurs. Search for a name you know is there; if it is not found, try part of it.',
        ],
      },
      {
        heading: 'Once it is searchable',
        paragraphs: [
          'The words can now be found and copied like a typed PDF. [Remove areas](/tools/remove-areas/) can find an Aadhaar or phone number in it with Find and remove, which it cannot do on a bare picture; check every mark, as the numbers were read from a scan. Where your browser has a built-in translator, [Summarise and translate](/tools/summarise/) can turn it into English on your device.',
          'For an editable Word file in Hindi, take the searchable copy to [PDF to Word](/tools/pdf-to-word/) and choose Editable words under Scanned pages: the Hindi read here is used, rather than the page being read again in English. Check the layout and the words before you rely on it.',
        ],
      },
      {
        heading: 'A worked example',
        paragraphs: [
          'Ramesh has a 20-page scanned court order, in Hindi with a few English lines, and needs every place it mentions his plot number and a hearing date. He opens Make searchable, adds the PDF, chooses Hindi as the language of the scan and English under Also in, and presses Make it searchable. The Hindi reader, about 1.4 MB, comes from this site the first time; the reading itself happens on his computer, page by page. He saves the copy, searches for the plot number, then for the date as it is printed, and reads each match on the page itself before quoting it.',
        ],
      },
    ],
    faq: [
      { q: 'Is the document uploaded to be read?', a: 'No. Only the Hindi reader comes from this site, the first time you pick it. The scan is read in your browser and never leaves your device.' },
      { q: 'Does it read handwritten Hindi?', a: 'Poorly. It is made for printed text, so handwritten entries on a form are mostly missed or misread. Check those by eye.' },
      { q: 'Will the pages look different?', a: 'No. The words go in as an invisible layer; the scan you see is untouched.' },
      { q: 'Which other Indian languages can it read?', a: 'Malayalam, Tamil, Telugu, Kannada, Bengali, Marathi, Gujarati, Punjabi and Urdu, each fetched the first time it is picked. See also [Malayalam OCR](/guides/malayalam-ocr-scanned-pdf/).' },
      { q: 'How do I search in Hindi on my phone?', a: 'Switch your keyboard to Hindi in the reader’s search box and type the word, or search for a number or an English word on the same page.' },
    ],
  },
  {
    slug: 'copy-text-from-pdf',
    title: 'Copy text from a PDF, even a scan: free, no upload',
    h1: 'How to copy text from a PDF',
    description: 'Get the words out of a PDF as plain text to copy and paste, page by page, and what to do when the PDF is a scan. Free, and never uploaded.',
    tool: 'extract-text',
    related: ['ocr', 'pdf-to-word', 'pdf-to-excel', 'remove-password'],
    intro: 'For a line or two, select it in your PDF reader and copy. For the whole document, open Extract text, add the PDF and press Extract the text: you get a plain .txt file of every word, page by page, ready to copy from.',
    steps: [
      'Open Extract text and add the PDF, or several.',
      'If a file is locked, type its password in the box under it and tap Unlock.',
      'Press Extract the text.',
      'Save the .txt file, or open it, select what you need and copy.',
    ],
    sections: [
      {
        heading: 'Selecting in a reader, or extracting',
        paragraphs: [
          'Most readers let you select words and copy them: drag across with a mouse, or on a phone, press and hold a word and drag the handles. That is fine for a sentence. It is slow for a long document, fiddly across page breaks, and some phone viewers do not let you select at all. Extract text takes every word at once and gives you a plain text file that opens in any notes app, email or word processor.',
        ],
      },
      {
        heading: 'What the text file looks like',
        paragraphs: [
          'The words come in reading order, with a line such as --- Page 3 --- where each page starts, so a quote can be traced back to its page. Bold, sizes, columns and tables are not kept: it is the words alone, which is what you want for pasting into an email, a message or a search. Every PDF you add gets its own .txt, named after it, and the result line counts the words and pages.',
        ],
      },
      {
        heading: 'Why a scan gives no text',
        paragraphs: [
          'A scanned page, or a photo saved as a PDF, holds a picture of the words rather than the words themselves, so there is nothing to copy. Extract text says so instead of saving an empty file, and in a mixed file it names the pages that are only pictures. Run the file through [Make searchable](/tools/ocr/) first: it reads the words in English, Malayalam, Hindi and eighteen more languages, on your device, and puts them into the PDF. Then extract the text from the searchable copy.',
        ],
      },
      {
        heading: 'When the copied text is garbled',
        paragraphs: [
          'Sometimes a PDF that clearly has text copies out as nonsense: letters swapped for symbols, Hindi or Malayalam turned into English letters, words run together. That is in the file, not the tool: it was made with fonts that do not say which letter each shape stands for, as older Indian-language typing fonts do not. Copying from any reader gives the same result. For pages like that, treat them as a scan; [Hindi OCR for scanned PDFs](/guides/hindi-ocr-scanned-pdf/) shows the steps, and they work for any language.',
        ],
      },
      {
        heading: 'Keeping tables and layout',
        paragraphs: [
          'If you want the structure as well as the words, convert to a format that keeps it. [PDF to Word](/tools/pdf-to-word/) gives headings, paragraphs, lists and tables you can edit. [PDF to Excel](/tools/pdf-to-excel/) turns tables, such as a bank statement, into rows and columns with amounts as numbers. Plain text is best when you only need the words.',
        ],
      },
      {
        heading: 'A worked example',
        paragraphs: [
          'Asha needs to quote three clauses from a 40-page insurance policy in an email to her insurer, from her phone, and selecting across page breaks in her phone’s viewer keeps losing the selection. She opens Extract text, adds the PDF and presses Extract the text. She opens the .txt in a text app, finds the clause numbers with its search, copies the three clauses and pastes them into the email, each with its page number from the page markers.',
        ],
      },
    ],
    faq: [
      { q: 'Is my PDF uploaded to get the text?', a: 'No. The words are read out of the file in your browser, on your device, and the file never leaves it.' },
      { q: 'Can I copy text from a locked PDF?', a: 'Yes, if you know its password: type it when the file asks.' },
      { q: 'The PDF opens but will not let me copy. Why?', a: 'Whoever made it switched on a restriction. See [print or copy from a PDF that will not let you](/guides/remove-pdf-print-copy-restrictions/).' },
      { q: 'Does it work with Malayalam and Hindi text?', a: 'Yes, where the PDF holds real text in those scripts. Older files made with non-standard fonts copy out garbled; that is in the file itself.' },
      { q: 'Can I get the text from several PDFs at once?', a: 'Yes. Add them all; each gives its own .txt, and Save all saves them together.' },
      { q: 'Does it work offline?', a: 'Yes, once the page has loaded: nothing it does needs the internet.' },
    ],
  },
  {
    slug: 'summarise-pdf-free-on-device',
    title: 'Summarise a PDF free with on-device AI, no upload',
    h1: 'How to summarise or translate a PDF without uploading it',
    description: 'Get the key points of a PDF, or translate it, with the AI built into your browser, so the document never leaves your device. Free, and honest.',
    tool: 'summarise',
    related: ['ocr', 'extract-text', 'read'],
    intro: 'Open Summarise and translate, add the PDF and press Summarise it. The key points come from the AI built into your browser, on your own computer, and the document is never sent to an online AI. Where a browser has no such AI, the tool says so and does nothing.',
    steps: [
      'Open Summarise and translate in a recent Chrome on a laptop or desktop.',
      'Add the PDF; its words are read on your device.',
      'Press Summarise it for the key points.',
      'Or pick a language under Translate into and press Translate it.',
      'Tap Copy to take the result into an email, a note or a document.',
    ],
    sections: [
      {
        heading: 'Why on-device matters',
        paragraphs: [
          'Most online AI summarisers send your document to a server, where a large model reads it. For a contract, a medical report, a bank statement or a work file you have been told not to upload, that is the whole problem. Recent versions of Chrome can download a small AI model of their own that runs on the computer itself. This tool hands the PDF’s words to that model and to nothing else, so the summary is made where the document already is.',
        ],
      },
      {
        heading: 'Which browsers have it',
        paragraphs: [
          'So far the built-in AI is found mainly in Chrome 138 or later on a laptop or desktop, and Chrome switches it on only where the computer can run it. The first time, the browser may download its model, which can take a few minutes; a line shows how far it has got. Other browsers and most phones do not offer it yet. If yours does not, the tool tells you so, and your document stays exactly where it is: it never falls back to an online service.',
        ],
      },
      {
        heading: 'What a summary is good for',
        paragraphs: [
          'The summary is a list of key points, made a part at a time for a long document and then drawn together, from up to the first 300 pages. It is a quick way to see what a long report, a circular or a set of terms is about, and to decide what to read closely. It is not a substitute for reading what matters: a small model can miss a detail or blur it, so check any clause, date or amount in the document itself before you act on it.',
          'The summariser is made mainly for English. A document in another language may give a weak summary, or none.',
        ],
      },
      {
        heading: 'Translating',
        paragraphs: [
          'Pick a language under Translate into: English, Hindi, Malayalam, Tamil, Telugu, Kannada, Bengali, Marathi, Arabic, French, German, Spanish, Portuguese, Japanese or Chinese. The tool works out the document’s language where the browser can tell, treats it as English otherwise, and translates a part at a time, filling the box as it goes. Whether a pair such as English to Malayalam is offered depends on what your browser supports on your device; when it is not, the tool says so.',
        ],
      },
      {
        heading: 'Scans have no words to read',
        paragraphs: [
          'This tool reads the words stored in the PDF. A scan or a photo holds pictures of words instead, and the tool says it found none. Run it through [Make searchable](/tools/ocr/) first, which reads the words on your device too, then summarise the searchable copy. To keep the full text rather than a summary, [Extract text](/tools/extract-text/) gives it as a plain text file.',
        ],
      },
      {
        heading: 'A worked example',
        paragraphs: [
          'Vikram’s company sends round a 45-page revised travel and leave policy, and he wants the gist before a meeting. On his office laptop, in Chrome, he opens Summarise and translate, adds the PDF and presses Summarise it. The first time, a line shows Chrome getting its model ready; then the key points appear in the box. He copies them into his notes, and opens the policy itself in [Read](/tools/read/) to check the two points that affect him. The policy never left his laptop, which is what his company’s rules ask.',
        ],
      },
    ],
    faq: [
      { q: 'Is my document sent to an AI service?', a: 'No. The words are read in your browser and handed only to the AI built into the browser, on your device. Where there is none, nothing happens.' },
      { q: 'Why does it say this browser has no built-in AI?', a: 'Your browser does not offer it on this device. Try Chrome 138 or later on a laptop or desktop; your document stays put either way.' },
      { q: 'Does it work on my phone?', a: 'Mostly not yet: the built-in AI is found mainly in desktop Chrome so far. The tool tells you whether your phone’s browser has it.' },
      { q: 'Is the summary always right?', a: 'No. It is a small model’s reading and can miss or blur details. Check anything that matters against the document.' },
      { q: 'Does it make a new PDF?', a: 'No. The result is plain text in a box; copy it into an email, a note or a document of your own.' },
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
          'Most PDF sites upload your file to their server, do the work there, and send the result back. Many say they delete files after a while, and many probably do. But the copy has left your device, it passes through their systems, and you cannot check what happens to it. For a bank statement, an Aadhaar or a salary slip, that is a real question. For a side-by-side look at the best-known sites, see [PDF tools without uploading](/guides/pdf-tools-without-uploading-ilovepdf-smallpdf-alternative/).',
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
      {
        heading: 'Questions to ask any PDF site',
        paragraphs: [
          'Does it upload the file, or work in the browser? Does it need an account? Does it say how long it keeps files, and where? Does it keep working once the page has loaded and the internet is off? A site that works offline cannot be sending your file anywhere. One that needs a login, or sets a limit on file size or the number of tasks a day, is usually doing the work on a server.',
        ],
      },
      {
        heading: 'The documents that matter most',
        paragraphs: [
          'Identity documents such as Aadhaar, PAN and passports, bank statements, salary slips, medical reports, property papers and anything carrying a signature can do real harm if they leak. They are also exactly the documents people most often need to compress, merge or unlock for an upload. For them, a tool that never uploads is the safe default rather than a nice extra.',
        ],
      },
    ],
    faq: [
      { q: 'If nothing is uploaded, how does it work?', a: 'Your browser can do far more than show pages. The tools are programs that run inside it, using your device’s own processor and memory.' },
      { q: 'Do you keep any record of my files?', a: 'No. Not a file, not a name, not a page count. There is no server to keep them on.' },
      { q: 'Why is it free?', a: 'Because there is no server doing the work, each file costs us nothing to process. That is also why there are no limits.' },
      { q: 'Is an app safer than a website?', a: 'Not by itself: an app can upload files too. What matters is whether the work happens on your device, and you can check that the same way, by switching the internet off and seeing whether it still works.' },
      { q: 'What about files I have already uploaded elsewhere?', a: 'You cannot recall them, but you can limit the harm. For an ID or a bank document, keep an eye on unexpected messages and transactions, and use tools that work on your device from now on.' },
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
      {
        heading: 'Installing it as an app',
        paragraphs: [
          'On Android in Chrome, open the menu and choose Install app or Add to Home screen. On a computer in Chrome or Edge, look for the install icon at the end of the address bar, or the Install option in the menu. On an iPhone in Safari, tap Share, then Add to Home Screen. The app opens in its own window without an address bar, and works offline just as the site does.',
          'Installing is optional and changes nothing about privacy: the site and the app are the same pages, and both do all their work on your device.',
        ],
      },
      {
        heading: 'A worked example',
        paragraphs: [
          'You are on a flight with no Wi-Fi and need to merge two parts of a contract and sign it before landing. Because you opened the site at home, open it again in the browser or the installed app. Merge the two files, tap Then to take the result to Sign, place your signature, and save. When you land, the signed file is waiting to be sent.',
        ],
      },
      {
        heading: 'If a tool does not open offline',
        paragraphs: [
          'Pages are kept after your first visit only if the browser was allowed to keep them. A private or incognito window, a cleared browser cache, or data saver switched on can all mean nothing was stored. Open the site once more while online, with data saver off, and let the page finish loading before you go offline.',
        ],
      },
    ],
    faq: [
      { q: 'Do I have to install anything?', a: 'No. Installing is optional; the site works offline in the browser once you have visited it.' },
      { q: 'Does it work offline on a phone?', a: 'Yes, in any current phone browser.' },
      { q: 'Is it the same as the online version?', a: 'Yes. There is only one version: the tools always run on your device.' },
      { q: 'How much space does it take?', a: 'Some MB for the pages and tools, and more for each extra reading language you use in Make searchable. The browser manages the space and may clear it if the device runs low.' },
      { q: 'Can I use it on a computer that has never been online?', a: 'No. The first visit, while online, is what stores the tools. After that, the computer can be offline.' },
      { q: 'Are the results different offline?', a: 'No. The tools are the same programs either way; offline, they simply have no network to use, and they never needed one.' },
    ],
  },
  {
    slug: 'pdf-tools-without-uploading-ilovepdf-smallpdf-alternative',
    title: 'iLovePDF and Smallpdf alternative that never uploads',
    h1: 'PDF tools without uploading: how Foolscap compares',
    description: 'How upload-based PDF sites such as iLovePDF, Smallpdf and Adobe’s online tools differ from tools that work on your device, and when each makes sense.',
    tool: 'merge',
    related: ['compress', 'ocr', 'sign', 'remove-password'],
    intro: 'Most popular PDF sites, iLovePDF, Smallpdf and Adobe’s online tools among them, upload your file to their servers, do the work there and send the result back. Foolscap does the same everyday jobs inside your browser, so the file never leaves your device. Both have their place, and this page sets out the differences fairly.',
    steps: [
      'Note the job you usually do on an upload site, such as merging, compressing or unlocking.',
      'Open the same tool here, from the home page or by typing its name in the finder.',
      'Add your files: your browser reads them, and nothing is sent anywhere.',
      'Run the tool and save the result, as you would on any PDF site.',
      'To check, try it once with the internet switched off after the page has loaded.',
    ],
    sections: [
      {
        heading: 'How upload-based sites work',
        paragraphs: [
          'On an upload-based site, your file travels to the company’s servers, is processed there, and the result is sent back for you to download. That is how iLovePDF, Smallpdf and Adobe’s online Acrobat tools work for their web tools. They are established companies that publish privacy policies, protect files in transit and say how long they keep them before deleting them; read those policies for the details, which change from time to time.',
          'The point is not that they misuse files. It is that a copy of your document leaves your device, and you rely on their word for what happens to it next. For many documents that is fine. For some, it is exactly what you, or your employer, would rather avoid.',
        ],
      },
      {
        heading: 'How Foolscap works',
        paragraphs: [
          'Here every tool runs inside your browser, using your own device’s processor and memory. Once a tool page has loaded, it works with no connection at all, which you can check by switching the internet off. Every tool page also carries a security policy telling the browser it may connect only to this site, and this site is a folder of pages and scripts with no server program to receive a file. There is nothing to delete afterwards, because nothing was ever received.',
        ],
      },
      {
        heading: 'What is free, and why',
        paragraphs: [
          'Upload-based sites pay for the servers that do the work, so they typically limit free use, whether by file size, by the number of tasks, or by which tools are free, and offer paid plans for more. The limits change, so check each site’s own pricing page rather than any figure you read elsewhere.',
          'Here the work is done by your device, so each file costs nothing to process: every tool is free, with no sign-up, no watermark and no limits beyond what your device can handle. The site is paid for by adverts on its home page and guides, never on a tool page, and by people who choose to buy us a coffee.',
        ],
      },
      {
        heading: 'Where an upload site may suit you better',
        paragraphs: [
          'Working on your device has costs too. Reading a long scan with Make searchable is slower on a cheap phone than on a powerful server. Sending a document to several people to sign, with reminders and a record of who signed when, needs a service in the middle, which is what products such as Adobe Acrobat Sign exist for. Word to PDF here uses the PDF’s built-in fonts, so a document in a special font looks plainer than with a word processor that has the font. And a digital signature from a USB token needs the token’s own software.',
          'If a document is already public, such as a published report or a brochure, uploading it costs you little privacy. If your organisation has approved and pays for a particular service, use that. The case for on-device tools is strongest for the documents that matter most: identity papers, bank statements, salary slips, medical reports, contracts, and anything at work you have been told not to upload.',
        ],
      },
      {
        heading: 'The same jobs, done here',
        paragraphs: [
          'The everyday jobs are all here, more than forty of them: [Merge](/tools/merge/), [Compress](/tools/compress/) to a size such as 100 KB, Split, unlock with [Remove a password](/tools/remove-password/), [Sign](/tools/sign/), PDF to Word and Excel, JPG to PDF, page numbers, watermarks, and [Make searchable](/tools/ocr/) in English and twenty other languages, among them Malayalam, Hindi and Tamil. Each result hands straight to the next tool with Then, so merging, compressing and signing is one flow, with nothing saved in between.',
        ],
      },
      {
        heading: 'A worked example',
        paragraphs: [
          'Ravi’s company forbids uploading client documents to outside websites, and he needs to join three signed contracts and bring them under a client portal’s 5 MB limit. He used to do this on an upload site. Now, on his office laptop, he opens Merge here, adds the three PDFs, puts them in order and presses Merge into one file, then taps Then, chooses Compress, picks To a size, then Other, and types 5000. The files never leave his laptop, so the job stays within his company’s rule, and he gets the same kind of file an upload site would have returned.',
        ],
      },
    ],
    faq: [
      { q: 'Is Foolscap connected with iLovePDF, Smallpdf or Adobe?', a: 'No. Their names are used here only to describe their products, and they are trademarks of their owners.' },
      { q: 'Are upload-based PDF sites unsafe?', a: 'Not necessarily. The established ones publish privacy policies and say how long they keep files. The difference is that your file leaves your device and you rely on their word, while here it never leaves.' },
      { q: 'Is Foolscap really free, with no limits?', a: 'Yes. There is no server doing the work, so there is nothing to ration: no caps on file size or on the number of files or tasks, no sign-up, and no watermark.' },
      { q: 'Do I need to install anything?', a: 'No. It runs in the browser. You can install it from the browser’s menu to open it like an app, and it works offline once loaded.' },
      { q: 'How can I check that nothing is uploaded?', a: 'Switch the internet off once a tool page has loaded and run the tool. See [is it safe to upload PDFs online](/guides/is-it-safe-to-upload-pdf-online/) for more ways to check.' },
    ],
  },
  // ---- Photos and signatures for upload forms ----
  {
    slug: 'compress-photo-to-20kb-50kb-for-online-forms',
    title: 'Compress photo to 20 KB or 50 KB for online forms',
    h1: 'How to compress a photo or signature to 20 KB or 50 KB',
    description: 'Get a photo or signature under 20 KB, 50 KB or any size an online form asks for, on your phone. Free, no sign-up, and the picture never leaves your device.',
    tool: 'compress-image',
    related: ['scan', 'images-to-pdf', 'compress'],
    intro: 'Open Resize photo to KB, add the photo or the picture of your signature, pick 20 KB or 50 KB and press Resize it. It is made smaller in your browser, so your face and your signature never leave your phone.',
    steps: [
      'Open Resize photo to KB and add the photo, or the picture of your signature.',
      'Pick the size the form allows: 20 KB, 50 KB, or Other to type your own.',
      'Leave Keep its shape chosen, or type the width and height if the form gives them in pixels.',
      'Press Resize it and read the new size and pixels in the result line.',
      'Save the picture and upload that one, not the original.',
    ],
    sections: [
      {
        heading: 'What the form is asking for',
        paragraphs: [
          'Upload forms for exams, jobs, scholarships, banks and government services usually limit two things about a picture. The weight, in KB, is how much space the file takes. The size in pixels is how many dots wide and tall it is. Some forms give only the weight, some give both, and a few also ask for the JPG format by name.',
          'A photo straight from a phone camera weighs a few MB and is thousands of pixels across, so it is far over a 20 KB or 50 KB limit before you begin. The numbers you need are on the form itself, usually beside the upload button or in its instructions. Read them there: every form sets its own, and this tool simply meets whatever you choose.',
        ],
      },
      {
        heading: 'Why under 20 KB usually means fewer pixels',
        paragraphs: [
          'A JPEG gets lighter as its quality goes down, but only up to a point. Below a certain quality the picture breaks into square blocks and smudges, and a face or a signature stops looking right long before it gets small enough for 20 KB. A twelve-megapixel phone photo simply holds too many pixels to fit in 20 KB at any quality worth uploading.',
          'So the tool works in two steps. First it tries the best quality and steps down only as far as the limit needs. If even the lowest quality that still looks right is too heavy, it keeps that quality and takes away pixels instead, only as many as it must. The result line then says so, for example made smaller to fit, with the size the photo was before. A few hundred pixels across is still a clear face on screen, and a signature of that width reads cleanly.',
          'If the form also gives a size in pixels, choose Width × height and type it. The picture is cut from the middle to that shape and made exactly that size, and the quality is chosen to fit the KB. If those pixels cannot fit under the limit and stay clear, the result says so rather than quietly changing them.',
        ],
      },
      {
        heading: 'Scanning a signature on white paper',
        paragraphs: [
          'Sign on plain white paper with no lines, in black or dark blue ink, with a pen that writes a firm, even line. A ballpoint that skips or a pencil gives a faint, broken signature that gets worse as the picture gets smaller. Leave clear space around it, so nothing else from the page ends up in the photo.',
          'Photograph it in daylight, holding the phone straight above the paper so the signature is not slanted and your hand casts no shadow. Then crop the photo close around the signature in your phone’s gallery before you add it. Clean white paper costs almost nothing in KB, while a grey, shadowy background costs a great deal, so a tidy photo fits under 20 KB with far more detail to spare. For a whole page of paper rather than one signature, use [Scan](/tools/scan/), which straightens the sheet and cleans up the light.',
        ],
      },
      {
        heading: 'Check the result before you upload',
        paragraphs: [
          'Open the saved picture and zoom in. A face should be sharp around the eyes, and a signature’s lines should be unbroken. The new file’s name ends with the limit, such as (under 20 KB), which makes it easy to pick the right one in the form’s file picker rather than the original from the camera.',
          'Here 1 KB is 1,000 bytes, slightly smaller than counting in 1,024s, so a picture made under 20 KB here is also under 20 KB on a form that counts the other way. If a form still says the file is too big, check that you chose the new file; then make it again with Other and a slightly lower figure, such as 18. If it says the pixel size is wrong, type the exact width and height it gives.',
        ],
      },
      {
        heading: 'A worked example',
        paragraphs: [
          'An application asks for a recent photo under 50 KB and a signature under 20 KB, both as JPG. Open Resize photo to KB, add the photo, pick 50 KB, keep Keep its shape and press Resize it. The result line gives the old and new size and the pixels, perhaps saying the photo was made smaller to fit. Save it.',
          'Tap Start over, add the cropped photo of your signature, pick 20 KB and press Resize it again. Save that too, then upload each file to its own box on the form. Neither left your phone until you uploaded it yourself.',
        ],
      },
      {
        heading: 'What the phone hid in the photo',
        paragraphs: [
          'Phones store details inside every photo: the camera, the date and time, and often the exact place it was taken. A form does not need any of that. A picture made here is saved afresh and carries none of it, and the result line says what was taken out, such as location and camera details. That is one less thing about you sitting on somebody else’s server.',
        ],
      },
    ],
    faq: [
      { q: 'Why not just set the quality very low?', a: 'A very low quality turns a face into blocks and a signature into smudges, and an unclear photo is a common reason for an application to be sent back. The tool stops at a quality that still looks right and takes away pixels instead.' },
      { q: 'Is 1 KB 1,000 or 1,024 bytes here?', a: '1,000 bytes, the smaller of the two. So a picture made under 20 KB here is under 20 KB on any form, however it counts.' },
      { q: 'Can I do the photo and the signature together?', a: 'Yes, if both need the same limit: add both and each comes out on its own, under the size you chose. For different limits, make one, tap Start over, and make the other.' },
      { q: 'The form wants a PDF, not a JPG.', a: 'Make the JPG here first, then turn it into a PDF with [Images to PDF](/tools/images-to-pdf/). If a PDF is over its limit, [Compress](/tools/compress/) has a To a size setting; see [compress a PDF to 100 KB](/guides/compress-pdf-to-100kb/).' },
      { q: 'Does it work on an iPhone?', a: 'Yes, in Safari. Photos are usually handed over as JPEG. If one arrives in the HEIC format and this browser cannot read it, the tool says so; setting Camera, Formats to Most Compatible fixes it for future photos.' },
      { q: 'Is my photo uploaded anywhere?', a: 'No. It is made smaller in your browser, on your own device, and the tool keeps working with the internet switched off.' },
    ],
  },
  {
    slug: 'passport-size-photo-from-phone',
    title: 'Passport size photo from your phone, free and private',
    h1: 'How to make a passport size photo with your phone',
    description: 'Take a passport size photo against a plain wall with your phone and cut it to 3.5 × 4.5 cm in your browser. Free, no sign-up, and nothing is uploaded.',
    tool: 'compress-image',
    related: ['images-to-pdf', 'scan', 'compress'],
    intro: 'Stand in front of a plain, light wall and have someone take your photo at eye level. Then open Resize photo to KB, choose Passport photo, 3.5 × 4.5 cm, pick the size in KB the form allows, and press Resize it.',
    steps: [
      'Stand a step in front of a plain, light wall, facing a window or soft daylight.',
      'Have someone hold the phone at your eye level, an arm’s length or two away, and take a few photos.',
      'Open Resize photo to KB and add the best one.',
      'Choose Passport photo, 3.5 × 4.5 cm, and pick the size in KB the form allows.',
      'Press Resize it, check the face is centred and sharp, and save it.',
    ],
    sections: [
      {
        heading: 'The rules vary, and the form is the one to follow',
        paragraphs: [
          'Offices ask for different things in a photo: the colour of the background, how much of the head and shoulders shows, whether glasses are allowed, a plain expression, how recent it must be. Some want a printed photo, others an upload with a limit in KB and sometimes a size in pixels. Those rules belong to the form, and they change, so read them where you apply.',
          'This guide covers taking a clean, evenly lit photo that suits most of them, and making it the shape and weight you choose. The tool cannot check a photo against any office’s rules, and it does not claim to; it cuts, sizes and saves what you give it.',
        ],
      },
      {
        heading: 'Taking the photo',
        paragraphs: [
          'Find a plain wall in white, off-white or light grey, with nothing on it behind your head. Stand a step away from it, so your shadow does not fall on the wall behind you. Face a window or stand in open shade: soft daylight from the front lights the face evenly, while a bulb overhead leaves dark eyes and a shiny forehead.',
          'Turn the flash off; it flattens the face, leaves glare on skin and glasses, and can make eyes red. Have someone else take it with the phone’s main camera, held upright at your eye level and straight, not tilted up or down. Keep your face in the middle of the frame with space above your head and around your shoulders, because the tool cuts the passport shape from the middle. Take several and pick the one where you are sharpest and looking straight at the camera.',
        ],
      },
      {
        heading: 'What Passport photo does',
        paragraphs: [
          'It cuts the middle of your photo to the passport shape, 3.5 wide by 4.5 tall, and makes it 413 × 531 pixels, which is 3.5 × 4.5 cm at 300 dots per inch. A photo that has fewer pixels than that is never stretched to fit; it keeps its own, in the same shape, and the result line says so.',
          'Then it is saved as a JPEG at the best quality that fits under the KB you picked. If 413 × 531 pixels cannot fit under that limit and still look right, it is made a little smaller in pixels, and the result line says that too, with the size it ended up. Any details the phone hid in the photo, such as the place it was taken, are left out.',
          'Because the cut comes from the middle, a face near one edge of the photo can end up cut off. If that happens, crop the photo in your phone’s gallery first, roughly to a tall shape with your face in the centre, then add the cropped one.',
        ],
      },
      {
        heading: 'When the form gives pixels instead',
        paragraphs: [
          'Some forms state a width and height in pixels rather than centimetres. Choose Width × height in pixels and type the two numbers exactly as the form gives them. The photo is cut from the middle to that shape and made exactly that size. If those pixels cannot fit under the KB you chose and stay clear, the result says so rather than quietly changing the size: try the next size up in KB if the form allows it.',
        ],
      },
      {
        heading: 'A worked example',
        paragraphs: [
          'An online application asks for a recent colour photo with a light background, under 50 KB, as a JPG. Take three or four photos against a white wall by a window, and pick the sharpest. Open Resize photo to KB, add it, choose Passport photo, 3.5 × 4.5 cm, pick 50 KB and press Resize it.',
          'The result line reads something like passport shape, 413 × 531 px, under 50 KB. Open the saved picture to check your face is centred with a little space above the head, then upload the file whose name ends with (under 50 KB). If the same office also wants a PDF of your documents, [Images to PDF](/tools/images-to-pdf/) and [Scan](/tools/scan/) make those on the phone too.',
        ],
      },
    ],
    faq: [
      { q: 'Will this photo be accepted?', a: 'No tool can promise that. Offices set their own rules on background, size, framing and expression, and they differ. Follow the form’s instructions; the tool makes the shape and size you choose.' },
      { q: 'What colour should the background be?', a: 'Whatever the form says. When it says nothing, a plain white or light grey wall with no shadow is the usual choice.' },
      { q: 'Can the tool remove or change the background?', a: 'No. It cuts, resizes and saves the photo as it is, so take it against a plain wall in the first place.' },
      { q: 'Why is my photo smaller than 413 × 531 pixels?', a: 'Either the original had fewer pixels, and the tool never stretches a photo, or 413 × 531 could not fit under the KB you chose. The result line says which.' },
      { q: 'Can I get it printed?', a: 'Yes. The saved photo is 413 × 531 pixels, which is 3.5 × 4.5 cm at 300 dpi. Ask a photo shop to print it at 3.5 × 4.5 cm.' },
      { q: 'Is my photo uploaded anywhere?', a: 'No. It is cut and sized in your browser, on your phone. For photos and signatures under a size, see [compress a photo to 20 KB or 50 KB](/guides/compress-photo-to-20kb-50kb-for-online-forms/).' },
    ],
  },
];
