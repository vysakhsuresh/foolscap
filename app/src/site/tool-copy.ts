import type { ToolId } from '../ops/tools';

/** Below-the-fold help on each tool page: what it does, when to use it, and the questions people ask. Same link syntax as guides.ts. */
export interface ToolCopy {
  /** Two or three sentences, below the tool, saying what it does and anything honest about limits. */
  readonly about: string;
  /** Two to four questions with short true answers. */
  readonly faq: ReadonlyArray<{ readonly q: string; readonly a: string }>;
}

export const TOOL_COPY: Partial<Record<ToolId, ToolCopy>> = {
  // ---- Pages ----
  merge: {
    about: 'Merge joins two or more PDFs into one, in the order you set with the arrows. The files are joined in your browser, one at a time, so there is no limit on how many or how big. To move single pages afterwards, tap Then and choose [Organise pages](/tools/organise/).',
    faq: [
      { q: 'How many PDFs can I merge?', a: 'As many as your device can hold. There is no cap on count or size.' },
      { q: 'Can I merge locked PDFs?', a: 'Yes. Type each file’s password when asked.' },
      { q: 'Can I add photos too?', a: 'Make them a PDF first with [Images to PDF](/tools/images-to-pdf/), then merge. See [how to merge PDF files](/guides/merge-pdf-files/).' },
    ],
  },
  split: {
    about: 'Split breaks one PDF into several: every few pages, one page per file, by the ranges you type, or at each chapter bookmark. Each part is a new file; the original stays whole. Save all saves the parts as a folder or one ZIP.',
    faq: [
      { q: 'How do I type ranges?', a: 'Separate them with commas: 1-3, 4-9, 10-. A range ending in a dash runs to the last page.' },
      { q: 'What if I need parts under a size in MB?', a: 'Use [Split by size](/tools/split-by-size/), which works the parts out for you.' },
      { q: 'Why can it not split at chapters?', a: 'That needs bookmarks. Add them with [Bookmarks](/tools/bookmarks/), or split by ranges.' },
    ],
  },
  organise: {
    about: 'Organise shows every page as a picture so you can move pages earlier or later, turn them a quarter turn, or delete them, then save it all in one go. Rotation is saved into the file, so pages stay upright for everyone. A deleted page is not hidden: it is not in the new file at all.',
    faq: [
      { q: 'Can I rotate just one page?', a: 'Yes. Each page has its own turn button. See [rotate PDF pages](/guides/rotate-pdf-pages/).' },
      { q: 'Can I get a deleted page back?', a: 'Tap its button again before you save. After saving, your original file is still unchanged.' },
      { q: 'Can I organise two files together?', a: 'Join them with [Merge](/tools/merge/) first, then tap Then to bring the result here.' },
    ],
  },
  'extract-pages': {
    about: 'Type the pages, like 1-3, 7, 12-, and choose whether to keep only those or remove them. You get a new PDF built from the pages that stay, copied as they are, not redrawn. Removed pages are not in the new file at all.',
    faq: [
      { q: 'What does 12- mean?', a: 'Page 12 to the end.' },
      { q: 'Can I see the pages instead of typing numbers?', a: 'Yes, in [Organise pages](/tools/organise/), where you tap the bin under each page to drop.' },
      { q: 'Does it change my original?', a: 'No. The result is a new file. See [extract pages from a PDF](/guides/extract-pages-from-pdf/).' },
    ],
  },
  'insert-pages': {
    about: 'Put another PDF, or blank pages, into a PDF after any page, or in place of pages you name. Add the main PDF first, then the ones to put into it, in order. Blank pages take the size of the page before them.',
    faq: [
      { q: 'How do I put pages at the very start?', a: 'Choose After a page and type 0.' },
      { q: 'Can I replace a page with a corrected one?', a: 'Yes. Choose In place of pages and type the pages to swap out; the new ones go where they were.' },
      { q: 'How is this different from Merge?', a: '[Merge](/tools/merge/) puts whole files end to end. Insert puts pages into the middle of one.' },
    ],
  },
  crop: {
    about: 'Trim the same margin, in millimetres, off every edge of every page, or fit every page onto A4 or Letter. Cropping hides what falls outside the new edge; it does not remove it, and someone could undo it. To take something out for good, use [Remove areas](/tools/remove-areas/).',
    faq: [
      { q: 'Can I crop just one page?', a: 'Not yet. The same trim goes on every page.' },
      { q: 'What does fit to A4 do?', a: 'Each page is scaled to fit an A4 sheet and turned to match its own shape, so a mix of sizes prints evenly.' },
    ],
  },
  bookmarks: {
    about: 'Add, rename, reorder and remove the bookmarks a PDF reader shows as the document’s contents, each pointing at a page. Good bookmarks make a long PDF easy to move around, and [Split](/tools/split/) can cut a file at each one.',
    faq: [
      { q: 'Where do bookmarks show up?', a: 'In the contents or outline panel of most PDF readers, including [Read](/tools/read/).' },
      { q: 'Do bookmarks change the pages?', a: 'No. They only add a way to jump between them.' },
    ],
  },
  'page-labels': {
    about: 'Set what a PDF reader calls each page: i, ii, iii for the cover and contents, then 1, 2, 3 from where the real content starts. Labels change the reader’s page box, not what is printed. To print numbers on the pages, use [Page numbers](/tools/page-numbers/).',
    faq: [
      { q: 'Why would I want this?', a: 'So typing 1 in the reader’s page box goes to page 1 of the book, not the cover.' },
      { q: 'Can I put a prefix before the numbers?', a: 'Yes, such as A- for an appendix.' },
      { q: 'Can I undo labels?', a: 'Choose Remove the labels to go back to plain 1, 2, 3 from the cover.' },
    ],
  },
  'split-by-size': {
    about: 'Cut a big PDF into parts that each fit a limit: 5, 10 or 25 MB, or any size you type. Use it when an email or upload form takes several files but caps each one. If one smaller file would do, try [Compress](/tools/compress/) first.',
    faq: [
      { q: 'Which size should I choose?', a: '5 MB is safe for almost any email; Gmail allows 25 MB in one email; many work systems allow 10 MB.' },
      { q: 'Are the pages changed?', a: 'No. Pages are only shared out between the parts, in order.' },
      { q: 'More help?', a: 'See [reduce a PDF’s size for email](/guides/reduce-pdf-size-for-email/).' },
    ],
  },

  // ---- Convert and print ----
  compress: {
    about: 'Compress makes PDFs smaller by shrinking the photos inside them, dropping objects nothing uses and packing what was stored loosely. Text and drawings are never touched. To a size aims for a limit such as 100 KB, 200 KB, 500 KB or 1 MB; if a file cannot get smaller, it says so instead of handing back a copy.',
    faq: [
      { q: 'How do I get a PDF under 100 KB?', a: 'Choose To a size, then 100 KB. See [compress a PDF to 100 KB](/guides/compress-pdf-to-100kb/).' },
      { q: 'What does Let pages become pictures do?', a: 'When shrinking photos is not enough, each page is redrawn as one picture. It looks the same, but the words can no longer be selected.' },
      { q: 'Does a locked PDF stay locked?', a: 'Yes. A file that needed a password to open keeps the same password.' },
      { q: 'Is my file uploaded?', a: 'No. It is compressed in your browser, on your device.' },
    ],
  },
  'pdf-to-word': {
    about: 'Turns a PDF into an editable Word .docx, working out headings, paragraphs, lists and tables from where the words sit. Scanned pages can be read too, more slowly. Pictures stay in the PDF for now, and fonts become their nearest Word font.',
    faq: [
      { q: 'Will it look exactly like the PDF?', a: 'Close, not identical: Word flows text where a PDF fixes it. Complex layouts may need tidying.' },
      { q: 'Can it convert a scan?', a: 'Yes. Leave Read scanned pages too ticked; it reads English text in the scan.' },
      { q: 'Only need to fix a word or two?', a: '[Edit text](/tools/edit-text/) changes the PDF directly and keeps its layout.' },
    ],
  },
  'pdf-to-excel': {
    about: 'Turns tables in a PDF into a spreadsheet, with rows and columns worked out from where the words line up and amounts as real numbers. A bank statement comes out as one sheet across all its pages, with the account details and summary on a second sheet. Check the totals before you rely on them.',
    faq: [
      { q: 'Does it work with bank statements?', a: 'Yes. See [bank statement PDF to Excel](/guides/bank-statement-pdf-to-excel/).' },
      { q: 'My statement has a password. What do I do?', a: 'Type it when the file asks. The password is used in your browser and never sent anywhere.' },
      { q: 'Can I get a CSV?', a: 'It makes an .xlsx; any spreadsheet app saves that as CSV.' },
    ],
  },
  'pdf-to-powerpoint': {
    about: 'Makes a PowerPoint file with one slide per page, each looking exactly like the page, and the page’s words in the speaker notes. The slides are pictures, so editing means adding new text and shapes over them.',
    faq: [
      { q: 'Can I edit the text on the slides?', a: 'Not directly; each slide is a picture of its page. Copy the words from the speaker notes.' },
      { q: 'Is my file uploaded?', a: 'No. The slides are made in your browser.' },
    ],
  },
  'pdf-to-epub': {
    about: 'Turns a PDF into an EPUB e-book, or one web page, whose text reflows to fit a phone or e-reader screen. Chapters start at each heading. Page layout gives way to flowing text, so it suits books and reports better than forms or slides.',
    faq: [
      { q: 'Does it work with Kindle?', a: 'Amazon’s Send to Kindle accepts EPUB files.' },
      { q: 'Can it convert a scanned book?', a: 'Tick Read scanned pages too. It is slower, and works best on clean scans.' },
      { q: 'More help?', a: 'See [PDF to EPUB](/guides/pdf-to-epub/).' },
    ],
  },
  'office-to-pdf': {
    about: 'Lays out a Word .docx or Excel .xlsx as a PDF on A4, with headings, lists, tables, links and pictures, and the words kept as real text. Wide spreadsheets go on sideways pages. Fonts become the nearest of Helvetica, Times or Courier, and headers, footers and footnotes are left out for now.',
    faq: [
      { q: 'Does it read old .doc and .xls files?', a: 'No. Save them as .docx or .xlsx first.' },
      { q: 'Does Malayalam or Hindi text work?', a: 'Yes. Lines the PDF fonts cannot draw are drawn by your browser, so they show correctly.' },
      { q: 'More help?', a: 'See [Word to PDF](/guides/word-to-pdf/). To go the other way, use [PDF to Word](/tools/pdf-to-word/).' },
    ],
  },
  'pdf-a': {
    about: 'Makes a PDF/A-2b copy for keeping: a colour profile and archive details go inside, and scripts, attached files and any password come out, as the standard asks. The pages stay exactly as they are. If the file uses fonts that are not inside it, the result says so instead of claiming it passes.',
    faq: [
      { q: 'Who asks for PDF/A?', a: 'Some court e-filing systems, government offices and record keepers. See [convert PDF to PDF/A](/guides/convert-pdf-to-pdf-a/).' },
      { q: 'Should I sign before or after?', a: 'After. Any change breaks a [digital signature](/tools/digital-sign/), so make the archive copy first.' },
    ],
  },
  'rent-receipts': {
    about: 'Makes monthly rent receipts for an HRA claim from what you type: no file needed. Two receipts to a page, the amount in figures and words, the owner’s PAN if you give it, ready to print and sign. Nothing you type is stored or sent.',
    faq: [
      { q: 'When is the owner’s PAN needed?', a: 'When the rent comes to more than ₹1,00,000 in the year. See [HRA rent receipts](/guides/hra-rent-receipt-generator/).' },
      { q: 'How many months can I make at once?', a: 'Up to 24.' },
      { q: 'What about a revenue stamp?', a: 'Receipts for cash over ₹5,000 commonly carry one. Choose Cash and the receipts mark the place for it.' },
    ],
  },
  'images-to-pdf': {
    about: 'Turns photos and scans into one PDF, one picture per page, in the order you set. JPEG, PNG, WebP, GIF and BMP work, and photos taken sideways come out the right way up. iPhone HEIC photos work where the browser can read them.',
    faq: [
      { q: 'Which page size should I pick?', a: 'A4 for anything printed or uploaded to a form; Same as each image for screenshots.' },
      { q: 'How do I put the Aadhaar front and back together?', a: 'See [Aadhaar front and back on one page](/guides/aadhaar-front-and-back-on-one-page/).' },
      { q: 'Photos of paper look untidy?', a: '[Scan](/tools/scan/) straightens and cleans them up so they look scanned.' },
    ],
  },
  'pdf-to-images': {
    about: 'Saves pages as PNG or JPEG images at screen, sharing or print sharpness: every page, or only the ones you type. Each page becomes its own image. To get the photos stored inside the PDF instead, use [Extract images](/tools/extract-images/).',
    faq: [
      { q: 'JPEG or PNG?', a: 'JPEG for smaller files and pages with photos; PNG for crisp text and diagrams.' },
      { q: 'Which sharpness should I use?', a: 'Screen (72 dpi) for the smallest file, Sharing (150 dpi) for WhatsApp, Print (300 dpi) for paper.' },
      { q: 'More help?', a: 'See [PDF to JPG](/guides/pdf-to-jpg/).' },
    ],
  },
  'n-up': {
    about: 'Lays two or four pages on each sheet for printing: two side by side on a landscape sheet, or four in a grid on a portrait one, on A4 or Letter. It saves paper for handouts and notes, and puts two small pages, like the sides of an ID card, on one sheet.',
    faq: [
      { q: 'Does it shrink the pages?', a: 'Yes, each page is scaled to fit its place on the sheet.' },
      { q: 'Can I put an ID card’s two sides on one page?', a: 'Yes. See [Aadhaar front and back on one page](/guides/aadhaar-front-and-back-on-one-page/).' },
    ],
  },
  'extract-images': {
    about: 'Pulls out every photo and picture stored inside a PDF, exactly as it is stored: no re-compression, no loss. Each comes with its size and the page it came from. Drawings and text are not pictures, so they do not come out.',
    faq: [
      { q: 'Why did a scanned PDF give one image per page?', a: 'Scanners usually store each page as one picture.' },
      { q: 'What is a .jp2 file?', a: 'JPEG 2000, a format some PDFs use. If your viewer cannot open it, [PDF to images](/tools/pdf-to-images/) gives the page as a normal JPEG.' },
    ],
  },

  // ---- Mark up ----
  watermark: {
    about: 'Stamps your words, such as DRAFT, COPY or a name, across every page, once across the middle or repeated all over, light, medium or strong. A watermark discourages copying; it does not prevent it. The text takes English letters and numbers for now.',
    faq: [
      { q: 'Can I watermark an ID copy?', a: 'Yes. Something like FOR BANK KYC ONLY, repeated and light, is a common habit. See [add a watermark](/guides/add-watermark-to-pdf/).' },
      { q: 'Does this site add its own watermark?', a: 'Never. Only the one you type goes on.' },
    ],
  },
  'page-numbers': {
    about: 'Numbers the pages at the top or bottom, as 1, 1 of 12, Page 1 or Page 1 of 12, starting from any number and skipping a cover if you like. Bates numbering runs one sequence like ACME-000001 through every page of every file you add.',
    faq: [
      { q: 'Can I start from a number other than 1?', a: 'Yes. Set First number.' },
      { q: 'What is Bates numbering?', a: 'A legal numbering with a prefix and fixed digits, running through a whole set of documents in order.' },
      { q: 'More help?', a: 'See [add page numbers to a PDF](/guides/add-page-numbers-to-pdf/).' },
    ],
  },
  sign: {
    about: 'Draw your signature with a finger or mouse, or type your name, then tap the page where it goes; drag to move it and drag its corner to resize. Tap again on any page to place it again. A drawn signature is a picture on the page; for a certificate a reader can check, use [Digital signature](/tools/digital-sign/).',
    faq: [
      { q: 'Is my signature stored?', a: 'No. It is forgotten when you leave the page. Nothing is uploaded.' },
      { q: 'Can I use my real ink signature?', a: 'Photograph it on white paper and place it with [Add image](/tools/add-image/).' },
      { q: 'More help?', a: 'See [sign a PDF online for free](/guides/sign-pdf-online-free/).' },
    ],
  },
  'mark-up': {
    about: 'Highlight, underline, strike out, draw with a pen, ring things with boxes and circles, point with arrows, measure lengths in millimetres, and add sticky notes, text boxes, stamps and links. Notes are real comments a reader lists, and links open only web, email and phone addresses.',
    faq: [
      { q: 'Will others see my notes?', a: 'Yes. Notes are standard PDF comments, shown by most readers and listed in [Read](/tools/read/).' },
      { q: 'Which stamps are there?', a: 'Approved, Paid, Received, Draft, Confidential, Urgent, Copy and Void.' },
      { q: 'Can I undo a mark?', a: 'Lines and pen strokes undo; other marks can be moved or removed until you save.' },
    ],
  },
  'edit-text': {
    about: 'Tap words already on the page and change them, or find and replace a word everywhere. The old words are painted over in the page’s colour and the new ones written in the nearest built-in font; in a table, one cell at a time. The old words stay underneath, so to hide something for good, use [Remove areas](/tools/remove-areas/).',
    faq: [
      { q: 'Can I edit a scanned PDF?', a: 'No. A scan has no words in it, only a picture of them. Write over it with [Add text](/tools/add-text/).' },
      { q: 'Does find and replace change parts of words?', a: 'No. It matches whole words and numbers, so 5,000.00 is not found inside 15,000.00.' },
      { q: 'More help?', a: 'See [edit text in a PDF](/guides/edit-text-in-pdf/).' },
    ],
  },
  'add-text': {
    about: 'Tap a page and type: a name on a blank line, a date beside a signature, a note on a form with no fields. Tap the words again to change them, or drag to move them. Malayalam, Hindi and other scripts go in as a picture of the words, drawn by your browser, until real text in those scripts arrives.',
    faq: [
      { q: 'Can I fill in a form with this?', a: 'Yes, if it has no fields. If it does, [Fill in a form](/tools/fill-form/) is quicker.' },
      { q: 'Can I write in Malayalam?', a: 'Yes. The words show correctly, as a picture, so they cannot be selected or searched yet.' },
    ],
  },
  'edit-images': {
    about: 'Move, resize, take out or swap the pictures already on a page: a logo, a photo, a stamp. Each picture is outlined; drag it, drag its corner, tap its × to take it out, or choose a new picture to swap in. Nothing else on the page changes.',
    faq: [
      { q: 'Does a swapped picture get stretched?', a: 'No. It keeps its own shape inside the old picture’s box.' },
      { q: 'Want to save a picture instead?', a: 'Use [Extract images](/tools/extract-images/).' },
    ],
  },
  'add-image': {
    about: 'Put a photo, logo or picture of a stamp or signature on any page, then drag it into place and resize it. A PNG with a see-through background keeps it, so a logo or signature sits cleanly on the page.',
    faq: [
      { q: 'Can I add my signature this way?', a: 'Yes. Photograph it on white paper, or draw it in [Sign](/tools/sign/).' },
      { q: 'Which picture types work?', a: 'JPEG and PNG work everywhere; other types where your browser can read them.' },
    ],
  },
  'fill-form': {
    about: 'Type into a PDF form’s own fields, tick its boxes and pick from its lists, then save it still editable or sealed so the answers can no longer change. You can save your answers as a file and fill the same form from it next time; Acrobat .xfdf answers work too.',
    faq: [
      { q: 'It says the PDF has no fields. What now?', a: 'The form is just a printed page. Write on it with [Add text](/tools/add-text/).' },
      { q: 'What does Seal the answers do?', a: 'It flattens them into the page so they can no longer be changed. Leave it off to keep the form fillable.' },
      { q: 'More help?', a: 'See [fill a PDF form](/guides/fill-pdf-form/).' },
    ],
  },
  background: {
    about: 'Gives pages a soft paper colour, cream, grey, mint, sky, rose or your own, behind everything, so text and drawings stay on top. Choose all pages or type which. A scanned page is one solid picture, so the colour will not show through it.',
    faq: [
      { q: 'Will it cover my text?', a: 'No. The colour goes behind everything on the page.' },
      { q: 'Can I colour only some pages?', a: 'Yes. Type them, like 1-3, 7.' },
    ],
  },
  'create-form': {
    about: 'Turns a printed form into one people fill in on screen: text boxes, paragraph boxes, tick boxes and choice lists. Find the blanks for me turns lines of underscores and empty boxes into named fields; check each one. The fields are standard, so the form works in Acrobat, browsers and phone viewers.',
    faq: [
      { q: 'Does Find the blanks work on a scan?', a: 'No. It reads the page’s text, and a scan has none. Drag the fields on by hand.' },
      { q: 'More help?', a: 'See [make a PDF fillable](/guides/make-pdf-fillable/). To fill one in, use [Fill in a form](/tools/fill-form/).' },
    ],
  },
  'header-footer': {
    about: 'Adds a line along the top, the bottom, or both, of every page: a title, CONFIDENTIAL, a date or a reference. {page}, {total}, {date} and {name} are filled in for you. English letters and numbers for now.',
    faq: [
      { q: 'What does {name} put in?', a: 'The file’s name, without .pdf.' },
      { q: 'Only need page numbers?', a: '[Page numbers](/tools/page-numbers/) has more styles, and Bates.' },
    ],
  },

  // ---- Protect ----
  'add-password': {
    about: 'Locks a PDF with AES-256, so nobody can open it without the password, and chooses whether printing, copying and changes are allowed. Or only restrict those, with no password to open: readers that respect the settings obey them, but a determined person can switch them off. The password is never stored or sent, so write it down.',
    faq: [
      { q: 'What if I forget the password?', a: 'Nobody can open the file, us included. Keep the unlocked original safe.' },
      { q: 'Can I lock several files at once?', a: 'Yes, all with the password you type.' },
      { q: 'More help?', a: 'See [password protect a PDF](/guides/password-protect-pdf/).' },
    ],
  },
  'digital-sign': {
    about: 'Seals a PDF with your certificate, a .pfx or .p12 file, so a reader such as Acrobat can show who signed and that nothing has changed since. Shown as a box on the last page, or invisible in the reader’s signature panel. The certificate and its password stay on your device and are forgotten when you leave.',
    faq: [
      { q: 'Can I use my DSC on a USB token?', a: 'No. A web page cannot reach a token. Use the signing utility that came with it. See [digital signature with a DSC](/guides/digital-signature-pdf-dsc/).' },
      { q: 'Why was my certificate refused?', a: 'It may have expired: the tool shows the date rather than make a signature readers would mark invalid.' },
      { q: 'Can I sign a locked PDF?', a: 'Remove its password with [Remove a password](/tools/remove-password/) first.' },
    ],
  },
  'remove-password': {
    about: 'Unlocks a PDF whose password you know and saves a copy that opens without one. It does not guess or break passwords. Files that only block printing or copying open without a password, and come back with those blocks removed.',
    faq: [
      { q: 'What is the Aadhaar PDF password?', a: 'The first four letters of your name in capitals, then your year of birth. See [Aadhaar PDF password](/guides/aadhaar-pdf-password/).' },
      { q: 'What is my bank statement’s password?', a: 'It varies by bank: often your date of birth, customer ID, or part of your name with part of your birth date. Check the bank’s email. See [unlock a bank statement](/guides/remove-password-from-bank-statement-pdf/).' },
      { q: 'Can you find a password I have forgotten?', a: 'No. This tool only unlocks with the password you type.' },
    ],
  },
  'remove-areas': {
    about: 'Genuinely removes what you mark: each marked page is redrawn as a picture with those parts painted out, so the hidden words cannot be copied, searched or recovered. Find and remove marks every Aadhaar, PAN, phone number, email, card number or word you type. The cost: a marked page’s other words stop being selectable, and its form answers go.',
    faq: [
      { q: 'How do I make a masked Aadhaar?', a: 'Drag across the first eight digits wherever they appear. See [hide the Aadhaar number](/guides/hide-aadhaar-number-in-pdf/).' },
      { q: 'Does it find numbers in a scan?', a: 'No. A scan has no text to search; drag across those parts by hand.' },
      { q: 'Why not just draw a black box?', a: 'A box covers the words but leaves them in the file. See [redact a PDF properly](/guides/redact-pdf/).' },
    ],
  },
  'document-details': {
    about: 'Strips what a PDF carries besides its pages: the title, author, the program that made it, dates and hidden XMP data, and on request scripts, comments and attached files. Or set new details instead. The pages are not touched.',
    faq: [
      { q: 'What should I choose before sending a file outside?', a: 'Clean everything hidden. See [remove PDF metadata](/guides/remove-pdf-metadata/).' },
      { q: 'Does it remove names printed on the page?', a: 'No. Use [Remove areas](/tools/remove-areas/) for those.' },
    ],
  },
  attachments: {
    about: 'Puts files of any kind inside a PDF, such as a spreadsheet, photos or the source document, so they travel with it. Or takes out every file a PDF carries, byte for byte. Attached files are carried as they are, never opened or checked here.',
    faq: [
      { q: 'How do I attach files?', a: 'Add the PDF first, then the files to put inside it.' },
      { q: 'Where do attachments show?', a: 'In the attachments panel of most PDF readers.' },
      { q: 'How do I remove all attachments?', a: '[Clean hidden data](/tools/document-details/) takes them out.' },
    ],
  },

  // ---- Read and capture ----
  compare: {
    about: 'Shows what changed between two versions, word by word. Add the older one first, then the newer; the newer comes back marked, with new words in green and a comment wherever words were taken out. Words are compared, not pictures or layout.',
    faq: [
      { q: 'Can I compare scans?', a: 'Make each one searchable with [Make searchable](/tools/ocr/) first; a scan has no words to compare.' },
      { q: 'More help?', a: 'See [compare two PDFs](/guides/compare-two-pdfs/).' },
    ],
  },
  read: {
    about: 'Opens a PDF to read, with zoom that redraws sharply, find, the document’s own contents, night mode, a list of its comments, print and read aloud. Read aloud uses only voices on your device, so the words are never sent away. Then hands the document to any tool.',
    faq: [
      { q: 'Why does read aloud not work?', a: 'It uses only voices installed on your device. Where there are none, it says so rather than use an online voice.' },
      { q: 'Does it work offline?', a: 'Yes, once the site has loaded. See [PDF tools that work offline](/guides/pdf-tools-that-work-offline/).' },
    ],
  },
  summarise: {
    about: 'Gives a PDF’s key points, or translates it, using only the AI built into your browser, on your device. So far that is found mainly in recent Chrome on a desktop or laptop. Where a browser has none, the tool says so and does nothing, rather than send your document to an online AI.',
    faq: [
      { q: 'Why does it say it is not available?', a: 'Your browser has no built-in AI. Your document is never sent anywhere else to make up for it.' },
      { q: 'Which languages can it translate into?', a: 'English, Hindi, Malayalam, Tamil, Telugu, Kannada, Bengali, Marathi, Arabic, French, German, Spanish, Portuguese, Japanese and Chinese, where the browser supports them.' },
      { q: 'Why is the first run slow?', a: 'The browser may download its own model once. After that it runs on your device.' },
    ],
  },
  scan: {
    about: 'Photograph pages and get a PDF that looks scanned: each sheet is found in its photo, straightened, cropped and cleaned up. Drag the round handles if a corner is off. Choose colour, grey, or black and white, which survives a shadow and makes the smallest file.',
    faq: [
      { q: 'Which look should I choose?', a: 'Black and white for text and forms, grey with photos, colour where stamps or ink colours matter.' },
      { q: 'Can I search the words afterwards?', a: 'Run the scan through [Make searchable](/tools/ocr/).' },
      { q: 'More help?', a: 'See [scan a document with your phone](/guides/scan-document-to-pdf-with-phone/).' },
    ],
  },
  ocr: {
    about: 'Reads the words in scanned pages and lays them invisibly over the pictures, so you can search, select and copy them; the pages look exactly the same. English is ready at once; Malayalam, Hindi, Tamil and seventeen more are fetched from this site the first time you pick them. Words in scripts other than English letters also come out as a .txt beside the PDF for now.',
    faq: [
      { q: 'How many languages can I pick?', a: 'Up to three. More makes the reading worse, not better.' },
      { q: 'Is my scan sent anywhere?', a: 'No. Only the language model comes from this site; your document stays on your device.' },
      { q: 'More help?', a: 'See [make a scanned PDF searchable](/guides/make-scanned-pdf-searchable/).' },
    ],
  },
  'extract-text': {
    about: 'Pulls the words out of a PDF as plain text, page by page, ready to copy or search. A scan has pictures of words, not words, so make it searchable first with [Make searchable](/tools/ocr/).',
    faq: [
      { q: 'Why is the text empty?', a: 'The PDF is probably a scan. Run [Make searchable](/tools/ocr/) on it first.' },
      { q: 'Want headings and tables kept?', a: 'Use [PDF to Word](/tools/pdf-to-word/) instead.' },
    ],
  },
};
