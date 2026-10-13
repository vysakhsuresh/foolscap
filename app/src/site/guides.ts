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
          'Tap Then to take them to [Merge](/tools/merge/), put them in month order with the arrows, and press Merge into one file, so the lender gets one tidy PDF instead of twelve.',
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
      { q: 'Can I split a PDF on my phone?', a: 'Yes. It runs in the phone’s browser. Share all sends the parts to another app, or Save all keeps them.' },
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
      { q: 'Can I watermark in Malayalam or Hindi?', a: 'Yes. Words in those scripts are drawn by your browser and go on as a picture of the words, in the same place a typed watermark would sit, so they cannot be selected.' },
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
      { q: 'Will the new text match the old font?', a: 'It uses the nearest of the built-in fonts, so it is close but not always identical, especially with decorative fonts.' },
      { q: 'Does find and replace match parts of words?', a: 'No. It matches whole words and whole numbers, so 5,000.00 does not change 15,000.00.' },
      { q: 'Can I edit a scanned PDF?', a: 'Not with this tool; a scan has no text in it. Add new words over it with [Add text](/tools/add-text/).' },
      { q: 'Can I change Malayalam or Hindi text?', a: 'Yes. The old words are covered and the new ones go in as a picture of the words, drawn by your browser, so they read correctly but cannot be selected. Words in English letters go in as real text.' },
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
          'Leave Seal the answers off and the form stays fillable, so it can be corrected later. Turn it on and the answers become part of the page, which is what you want before sending a final copy.',
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
      { q: 'Can I fill the form on my phone?', a: 'Yes. The fields are listed as ordinary boxes, so typing on a phone keyboard is easy, and the result can be shared straight from the phone.' },
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
          'Headings, paragraphs, lists and tables are worked out from where the words sit on each page, so a tidy PDF comes out tidy, and bold stays bold. Photos and pictures come along in their places. Page numbers and headers repeated on every page are left out, and a paragraph split by a page break is joined again. Fonts become their nearest Word font.',
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
          'Converting a scan with Read scanned pages too unticked, which gives an empty document: tick it and run it again. Expecting exact fonts: Word gets the nearest match, so check the headings and spacing. And converting just to fix a typo, when Edit text changes the PDF itself and keeps every font and position as it was.',
        ],
      },
    ],
    faq: [
      { q: 'Is my PDF uploaded to convert it?', a: 'No. It is read and converted in your browser, on your device.' },
      { q: 'Will it look exactly like the PDF?', a: 'Close, not identical. A PDF fixes every word’s position; a Word file flows text. Complex layouts may need tidying.' },
      { q: 'Can I convert a scanned PDF to Word?', a: 'Yes. Leave Read scanned pages too ticked; it reads English text in the scan.' },
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
          'Headings, lists, tables, links and pictures are laid out on the Word file’s own page size, with the words kept as real text you can select and search. Headers and footers go on every page with their page numbers worked out, and footnotes are gathered under Notes at the end. Wide spreadsheets go on sideways pages. Lines in Malayalam, Hindi and other scripts are drawn by your browser and placed as pictures, so they show correctly but cannot be selected or searched.',
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
      { q: 'Will the PDF be searchable?', a: 'Yes, for words in English letters: they are real text you can search and copy. Lines in other scripts are placed as pictures, so search will not find them.' },
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
          'Sending a page as a picture lets the person see it straight away in the chat, without opening a file. Sharing sharpness, 150 dpi, is plenty for a phone screen. WhatsApp shrinks pictures sent as photos, so for a page with small print, send the image as a document instead, which keeps it sharp. Share all sends every page in one go.',
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
          'The invisible layer inside the PDF can hold Latin letters only for now: the ones English, French, German, Spanish, Portuguese and Italian use. When you pick Malayalam, Hindi or another language written in a different script, everything read also comes out as a .txt file beside the PDF, so you can copy and search it there. The result says which file holds what.',
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
          'You have a 30-page scanned property file in English and Malayalam and need to find every mention of a survey number. Open Make searchable, add the file, pick English and Malayalam, and press Make it searchable. Save both results. The searchable PDF finds the English words and the numbers with your reader’s find, and the .txt file holds every word that was read, Malayalam included, to search in any text app.',
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
      { q: 'Can the names be in Malayalam or Hindi?', a: 'Yes. Words the PDF fonts cannot draw are drawn by your browser and placed as pictures, so they show correctly but cannot be searched.' },
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
          'Chapters start at each main heading, or at each section when the title is the only main heading, and photos come along in their places. Page numbers and running headers are dropped. The page layout gives way to plain flowing text, so it suits books, reports and notes much better than forms, slides or anything laid out in columns. Amazon’s Send to Kindle accepts EPUB files.',
        ],
      },
      {
        heading: 'Reading the PDF as it is',
        paragraphs: [
          'If the layout matters, [Read](/tools/read/) opens the PDF itself with zoom, find and a night mode. For a scan, Read scanned pages too reads the words first; for a better reading, [Make searchable](/tools/ocr/) offers more languages.',
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
          'Converting a form, a slide deck or a page of wide tables, which loses its layout; read those as PDFs. Converting a scan without ticking Read scanned pages too, which gives an empty book. And converting a picture book or a comic: its pictures come along, but cut from the pages and set between the words, so it reads better kept as a PDF.',
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
];
