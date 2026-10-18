import type { ToolId } from '../ops/tools';

/**
 * Below-the-fold help on each tool page: what it does, how to use it, what to
 * know, and the questions people ask. Same link syntax as guides.ts. Every
 * claim here is checked against the tool's own code: when a tool changes,
 * this changes with it.
 */
export interface ToolCopy {
  /** Two or three sentences, below the tool, saying what it does and anything honest about limits. */
  readonly about: string;
  /** Three to five steps, each one sentence starting with a verb: how to use this tool on this page. */
  readonly steps: readonly string[];
  /** Two or three short paragraphs of "Good to know": when to use it, what to watch for, a tip, an honest limit. */
  readonly notes: readonly string[];
  /** Three to five questions with short true answers. */
  readonly faq: ReadonlyArray<{ readonly q: string; readonly a: string }>;
}

export const TOOL_COPY: Partial<Record<ToolId, ToolCopy>> = {
  // ---- Pages ----
  merge: {
    about: 'Merge joins two or more PDFs into one, in the order you set: drag a file by its handle, or use its arrows. The files are joined in your browser, one at a time, so there is no limit on how many or how big. To move single pages afterwards, tap Then and choose [Organise pages](/tools/organise/).',
    steps: [
      'Add two or more PDFs, from your files or by dropping them anywhere on the page.',
      'Put them in order: drag a file up or down (on a phone, hold it a moment first), or use its arrows.',
      'Type the password of any locked file in the box under it and tap Unlock.',
      'Press Merge into one file, then Save the result or tap Then to keep working on it.',
    ],
    notes: [
      'The merged file is named after the first file, with “+ 2 more” or however many follow, so it is easy to tell apart from the originals. Every file you picked stays exactly as it was: a merge always makes a new PDF beside them.',
      'If one file cannot be read, the others are still joined and the result says which one was left out. A merge needs at least two readable files, so when only one opens, nothing is made and you are told why, rather than being handed a copy that looks like work was done.',
      'Locked files can go in, but the merged file comes out with no password, because several files may carry several different ones, and the result says so. If the merged file needs protecting, tap Then and choose [Add a password](/tools/add-password/) before you send it anywhere.',
    ],
    faq: [
      { q: 'How many PDFs can I merge?', a: 'As many as your device can hold. There is no cap on count or size.' },
      { q: 'Can I merge locked PDFs?', a: 'Yes. Type each file’s password when asked. The merged file has no password.' },
      { q: 'Can I add photos too?', a: 'Make them a PDF first with [Images to PDF](/tools/images-to-pdf/), then merge. See [how to merge PDF files](/guides/merge-pdf-files/).' },
      { q: 'Will the pages lose quality?', a: 'No. Pages are copied across as they are, not redrawn, so text stays sharp and selectable and photos are untouched.' },
    ],
  },
  split: {
    about: 'Split breaks one PDF into several: every few pages, one page per file, by the ranges you type, or at each chapter bookmark. Each part is a new file; the original stays whole. Save all saves the parts as a folder or one ZIP.',
    steps: [
      'Add the PDF you want to break up, typing its password if it has one.',
      'Choose Every few pages, One page per file, By page ranges or At each chapter.',
      'Type how many pages go in each part, or the ranges, if your choice needs them.',
      'Press Split it up, then Save each part or use Save all.',
    ],
    notes: [
      'Parts are named so they sort in order: “part 1 of 4” for even splits, the page numbers for ranges, and the bookmark’s own title when you split at chapters. Pages that come before the first bookmark become a part called Opening pages, so nothing is dropped along the way.',
      'Each range you type becomes its own file, in the order you typed it, and ranges may overlap: 1-5, 3-8 gives two files that share pages 3 to 5. If your choice would put every page into one file, the tool says so instead of making a copy of the original.',
      'A locked PDF gives locked parts, each opening with the same password as the original. If the people receiving them should not need it, unlock the original first with [Remove a password](/tools/remove-password/), then split the unlocked copy.',
    ],
    faq: [
      { q: 'How do I type ranges?', a: 'Separate them with commas: 1-3, 4-9, 10-. A range ending in a dash runs to the last page.' },
      { q: 'What if I need parts under a size in MB?', a: 'Use [Split by size](/tools/split-by-size/), which works the parts out for you.' },
      { q: 'Why can it not split at chapters?', a: 'That needs bookmarks. Add them with [Bookmarks](/tools/bookmarks/), or split by ranges.' },
      { q: 'Can I split several PDFs in one go?', a: 'No, one at a time. Split works on a single PDF; when it is done, tap Start over and add the next.' },
    ],
  },
  organise: {
    about: 'Organise shows every page as a picture so you can move pages earlier or later, turn them a quarter turn, or delete them, then save it all in one go. Rotation is saved into the file, so pages stay upright for everyone. A deleted page is not hidden: it is not in the new file at all.',
    steps: [
      'Add the PDF; every page appears as a small picture with its number.',
      'Drag a page to where it belongs (on a phone, hold it a moment first), or tap Move earlier or Move later under it to shift it one place.',
      'Tap the rotate button to turn a page a quarter turn clockwise, as often as it needs.',
      'Tap the bin to delete a page, or tap it again to bring the page back.',
      'Press Save the new order and save the new file.',
    ],
    notes: [
      'A page held near the top or bottom of the screen while you drag it scrolls a long document along with it. For many pages at once, tap Select pages, tap each one you want, then turn them, delete them, or send them to the start or the end in one tap. Turn every page fixes a whole scan that came out sideways. With a keyboard, Alt (Option on a Mac) and an arrow key moves the page you are on, and Home or End sends it to the front or the back.',
      'When you only reorder and rotate, the pages are moved rather than copied, so nothing about them changes. When you delete pages, a fresh file is built from the pages you kept, which means a deleted page’s text and pictures are not left behind anywhere inside it.',
      'Nothing is saved until you press the button, so try things freely. The result line then says what changed, such as “Same 7 pages, reordered, 2 rotated”, which is a quick check before you send it. A locked PDF comes back locked with the same password.',
    ],
    faq: [
      { q: 'Can I rotate just one page?', a: 'Yes. Each page has its own rotate button. See [rotate PDF pages](/guides/rotate-pdf-pages/).' },
      { q: 'Can I get a deleted page back?', a: 'Tap its bin again before you save. After saving, your original file is still unchanged.' },
      { q: 'Can I organise two files together?', a: 'Join them with [Merge](/tools/merge/) first, then tap Then to bring the result here.' },
      { q: 'Can I rotate every page at once?', a: 'Yes. Tap Turn every page; each tap turns them all a quarter turn. To turn only some, tap Select pages, pick them, then Turn.' },
    ],
  },
  'extract-pages': {
    about: 'Type the pages, like 1-3, 7, 12-, and choose whether to keep only those or remove them. You get a new PDF built from the pages that stay, copied as they are, not redrawn. Removed pages are not in the new file at all.',
    steps: [
      'Add the PDF, typing its password if it asks for one.',
      'Type the pages in the Pages box, such as 1-3, 7, 12-.',
      'Choose Keep these pages for a file of only those, or Remove these pages for everything else.',
      'Press Make the new file and save it.',
    ],
    notes: [
      'Ranges are forgiving. A backwards range such as 9-3 is read as 3 to 9, a page number past the end is simply left out, and -5 means the first five pages. The pages always come out in the order of the original, whatever order you type them in.',
      'The new file’s name says which pages it holds, or which were taken out, so it never gets mixed up with the original. The result line counts the pages kept and removed, a quick check that you typed what you meant before the file goes to a portal or an office.',
      'If Keep would give back every page, or Remove names no page that exists, nothing is made and the tool says why. At least one page must always stay. To put the kept pages in a different order as well, tap Then and choose Organise pages.',
    ],
    faq: [
      { q: 'What does 12- mean?', a: 'Page 12 to the end.' },
      { q: 'Can I see the pages instead of typing numbers?', a: 'Yes, in [Organise pages](/tools/organise/), where you tap the bin under each page to drop.' },
      { q: 'Does it change my original?', a: 'No. The result is a new file. See [extract pages from a PDF](/guides/extract-pages-from-pdf/).' },
      { q: 'Does a locked PDF stay locked?', a: 'Yes. Type its password when asked; the new file opens with the same password.' },
    ],
  },
  'insert-pages': {
    about: 'Put another PDF, or blank pages, into a PDF after any page, or in place of pages you name. Add the main PDF first, then the ones to put into it, in order. Blank pages take the size of the page before them.',
    steps: [
      'Add the main PDF first: the one that gets the new pages.',
      'Add the PDFs to put into it, in order, or choose Blank pages and say how many.',
      'Choose After a page and type its number, or In place of pages and type the pages to swap out.',
      'Press Insert them and save the new file.',
    ],
    notes: [
      'Order matters. The first file you add always receives the pages, and every file after it goes in whole, one after another, at the place you chose. If you need only part of another PDF, cut it down first with [Extract or remove pages](/tools/extract-pages/), then bring the smaller file here.',
      'Replacing is the quick way to swap a corrected or signed page into a long document. Type 3 to replace page 3, or 3-4 for two pages: they come out, and the new pages go in where the first of them was. The number of new pages does not have to match the number taken out.',
      'Blank pages, from 1 to 500 at a time, take the size and direction of the page just before them, so a blank inserted into a landscape section is landscape too. They are useful as a page for handwritten notes, or to keep double-sided printing in step.',
    ],
    faq: [
      { q: 'How do I put pages at the very start?', a: 'Choose After a page and type 0.' },
      { q: 'Can I replace a page with a corrected one?', a: 'Yes. Choose In place of pages and type the pages to swap out; the new ones go where they were.' },
      { q: 'How is this different from Merge?', a: '[Merge](/tools/merge/) puts whole files end to end. Insert puts pages into the middle of one.' },
      { q: 'Does the main PDF keep its password?', a: 'Yes. If it was locked, the new file is locked with the same password.' },
    ],
  },
  crop: {
    about: 'Trim the margins off a PDF’s pages: the same amount from every edge, a different amount from each edge, or just the white space around the words, found for you. Or fit every page onto A4 or Letter. Cropping hides what falls outside the new edge; it does not remove it, and someone could undo it. To take something out for good, use [Remove areas](/tools/remove-areas/).',
    steps: [
      'Add one or more PDFs.',
      'Choose Trim the margins and type the millimetres to take off every edge, or Trim each edge separately, or Remove the white margins.',
      'Or choose Fit every page on A4, or on Letter, to put each page on a standard sheet.',
      'Press Crop it and save the result.',
    ],
    notes: [
      'Trimming sets a new visible edge for each page; it does not cut anything out of the file. Whatever lies beyond the edge is still inside, and any PDF editor could widen the page again to show it. That makes trimming right for tidying wide scanner borders, and wrong for hiding a name or a number.',
      'Fit to A4 suits a document put together from pages of many sizes, such as a phone screenshot, a US Letter form and a scanned receipt. Each page is scaled to fit the sheet, kept in proportion and centred, and the sheet turns sideways for a page wider than it is tall, so the whole file prints at one size.',
      'Edges are measured as you see the page, so the top is the top even on a page that was scanned sideways. Type pages in Which pages to crop only those, and leave it empty for all of them. If the margin you ask for would leave almost nothing of a page, the tool refuses and names the page rather than producing a sliver. For printing an ID card or a receipt on A4, tick Leave smaller pages at their real size so it is not blown up to fill the sheet.',
    ],
    faq: [
      { q: 'Can I crop just one page?', a: 'Yes. Type its number in Which pages; the other pages stay as they are.' },
      { q: 'Can it find the margins for me?', a: 'Yes. Remove the white margins trims each page to just outside its words and pictures, leaving a thin border.' },
      { q: 'What does fit to A4 do?', a: 'Each page is scaled to fit an A4 sheet and turned to match its own shape, so a mix of sizes prints evenly.' },
      { q: 'Does cropping make the file smaller?', a: 'Hardly. The hidden parts are still in the file. To make it smaller, use [Compress](/tools/compress/).' },
    ],
  },
  bookmarks: {
    about: 'Add, rename, reorder and remove the bookmarks a PDF reader shows as the document’s contents, each pointing at a page. Good bookmarks make a long PDF easy to move around, and [Split](/tools/split/) can cut a file at each one.',
    steps: [
      'Add the PDF; any bookmarks it already has appear as a list.',
      'Tap Add a bookmark, then type its title and the page it should open.',
      'Use the arrows to move a bookmark up or down the list, or in a level so it sits under the one above.',
      'Press Save the bookmarks and save the new file.',
    ],
    notes: [
      'A bookmark is a title and a page. Readers list them in a side panel, often called Contents, Outline or Bookmarks, and tapping one jumps straight to its page. Putting sections inside chapters keeps a long contents list short and easy to scan.',
      'Short titles that match the headings printed in the document work best: Chapter 3, Annexure B, Salary slips. Top-level bookmarks are also what Split uses at each chapter, so a well bookmarked file can be cut into one file per chapter in a single step.',
      'Saving an empty list removes every bookmark, which helps when a file arrives with a messy outline left by the program that made it. The pages, their text and their look are never touched, and a locked PDF stays locked with the same password.',
    ],
    faq: [
      { q: 'Where do bookmarks show up?', a: 'In the contents or outline panel of most PDF readers, including [Read](/tools/read/).' },
      { q: 'Do bookmarks change the pages?', a: 'No. They only add a way to jump between them.' },
      { q: 'Can I make sections inside chapters?', a: 'Yes. Move a bookmark in a level and it sits under the one above it, as a section of that chapter.' },
      { q: 'Is my file uploaded?', a: 'No. The bookmarks are written into the file in your browser, on your device.' },
    ],
  },
  'page-labels': {
    about: 'Set what a PDF reader calls each page: i, ii, iii for the cover and contents, then 1, 2, 3 from where the real content starts. Labels change the reader’s page box, not what is printed. To print numbers on the pages, use [Page numbers](/tools/page-numbers/).',
    steps: [
      'Add one or more PDFs.',
      'Type how many front pages to number i, ii, iii, such as 4 for a cover, a title page and two pages of contents.',
      'Type the number the main content starts from, usually 1, and a prefix if you want one.',
      'Press Set the labels and save the result.',
    ],
    notes: [
      'Labels are what a reader shows in its page box and under its thumbnails. Nothing is printed on the page: a book whose pages already carry printed numbers keeps them, and the labels simply make the reader agree with what is printed.',
      'This matters most for long documents people cite by page: a thesis, a court bundle, a report with an index. When someone says “see page 12”, typing 12 in the reader then lands on the page that says 12, not on the twelfth sheet counted from the cover.',
      'A prefix goes before every number in the main part, such as A- for an appendix that runs A-1, A-2. The front pages can be i, ii, iii or I, II, III, and the rest can count in numbers, Roman numerals or letters. Remove the labels takes them all away, and readers go back to counting from the cover.',
    ],
    faq: [
      { q: 'Why would I want this?', a: 'So typing 1 in the reader’s page box goes to page 1 of the book, not the cover.' },
      { q: 'Can I put a prefix before the numbers?', a: 'Yes, such as A- for an appendix.' },
      { q: 'Can I undo labels?', a: 'Choose Remove the labels to go back to plain 1, 2, 3 from the cover.' },
      { q: 'Do all readers show labels?', a: 'Most full PDF readers do. Some simple phone viewers ignore them and keep counting from the cover; the file is still correct.' },
    ],
  },
  'split-by-size': {
    about: 'Cut a big PDF into parts that each fit a limit: 5, 10 or 25 MB, or any size you type. Use it when an email or upload form takes several files but caps each one. If one smaller file would do, try [Compress](/tools/compress/) first.',
    steps: [
      'Add the big PDF.',
      'Choose the most each part may be: 5 MB, 10 MB, 25 MB, or Another size in MB.',
      'Press Split into parts that fit.',
      'Save the parts, or use Save all, and send them one per email or upload.',
    ],
    notes: [
      'Each part is made as big as it can be while staying under your limit, so you get as few parts as possible. The tool saves every candidate part to measure it rather than guessing, because pictures and fonts shared between pages are copied into each part that uses them, so ten pages of a 50 MB file are rarely a fifth of it.',
      'Here 1 MB means 1,000,000 bytes, a little less than some programs count, so a part made under 10 MB is under 10 MB everywhere. A single page that is bigger than the limit on its own becomes a part by itself, and the result says so; compress that part to bring it under.',
      'Parts are named part 1, part 2 and so on, in page order, and the result gives each part’s size and pages. If the file is already under the limit, nothing is split and you are told so. A locked file gives locked parts with the same password.',
    ],
    faq: [
      { q: 'Which size should I choose?', a: '5 MB is safe for almost any email; Gmail allows 25 MB in one email; many work systems allow 10 MB.' },
      { q: 'Are the pages changed?', a: 'No. Pages are only shared out between the parts, in order.' },
      { q: 'Can I choose the number of parts instead?', a: 'Not here. For a set number of pages in each part, use [Split](/tools/split/) with Every few pages.' },
      { q: 'More help?', a: 'See [reduce a PDF’s size for email](/guides/reduce-pdf-size-for-email/).' },
    ],
  },

  // ---- Convert and print ----
  compress: {
    about: 'Compress makes PDFs smaller by shrinking the photos inside them, dropping objects nothing uses and packing what was stored loosely. Text and drawings are never touched. To a size aims for a limit such as 100 KB, 200 KB, 500 KB or 1 MB; if a file cannot get smaller, it says so instead of handing back a copy.',
    steps: [
      'Add one or more PDFs, typing the password of any that are locked.',
      'Choose To a size for an upload limit, or Light, Balanced or Strong for a general squeeze.',
      'Pick 100 KB, 200 KB, 500 KB or 1 MB, or choose Other and type the size in KB.',
      'Press Compress it and read the result line, which gives the old and new size.',
      'Save the smaller file, or tap Send to send it on.',
    ],
    notes: [
      'Nearly all of a big PDF’s weight is usually its photos and scanned pages, so that is where Compress works. Typed text, lines and drawings are left exactly as they were and stay sharp at any zoom. A file that is mostly text is often small already, and the tool tells you so rather than give back a copy that is barely different.',
      'To a size tries settings from gentle to strong and keeps the gentlest one that fits, so photos stay as sharp as the limit allows. Here 1 KB is 1,000 bytes, so a file made under 100 KB is also under it on a portal that counts 1,024. If photos alone cannot reach the size, tick Let pages become pictures and run it again: the pages look the same, but their words can no longer be selected.',
      'Balanced suits most files. Light keeps photos print-sharp for a smaller saving; Strong is for email limits, with softer photos. Each attempt starts from your original, so nothing is squeezed twice, and very small pictures such as logos are left alone because they have little to give.',
    ],
    faq: [
      { q: 'How do I get a PDF under 100 KB?', a: 'Choose To a size, then 100 KB. See [compress a PDF to 100 KB](/guides/compress-pdf-to-100kb/).' },
      { q: 'What does Let pages become pictures do?', a: 'When shrinking photos is not enough, each page is redrawn as one picture. It looks the same, and its words are kept invisibly underneath, so search and copy still work.' },
      { q: 'Does a locked PDF stay locked?', a: 'Yes. A file that needed a password to open keeps the same password.' },
      { q: 'Why did my file hardly shrink?', a: 'It probably has few photos, or they are already well compressed. Try Strong, or To a size with Let pages become pictures if the words need not be selectable.' },
      { q: 'Is my file uploaded?', a: 'No. It is compressed in your browser, on your device.' },
    ],
  },
  'pdf-to-word': {
    about: 'Turns a PDF into an editable Word .docx, working out headings, paragraphs, lists and tables from where the words sit. Scanned pages can be read too, more slowly. Photos come along where they stood, page numbers and running headers are left out, and fonts become their nearest Word font.',
    steps: [
      'Add the PDFs to convert; if one is locked, type its password in the box under it and tap Unlock.',
      'If some pages are scans or photos of paper, choose under Scanned pages: keep them as a picture of the page, turn them into editable words, or both.',
      'Press Make a Word file.',
      'Save the .docx and open it in Word, Google Docs, LibreOffice or WPS Office.',
    ],
    notes: [
      'The converter reads where each word sits on the page and works the structure out from that: large or bold lines become headings, lines with bullets or numbers become lists, and words lined up in columns become a real Word table. A clean, typed PDF comes out close to the original; one built from columns, text boxes and overlapping shapes may need tidying.',
      'Photos, logos and other pictures come along in their place, cut from the page as it looks. Page numbers and a header repeated at the top of each page are left out, so they do not land in the middle of your text, and a sentence the page break cut in two becomes one paragraph again. For a photo at its full stored quality, take it out with [Extract images](/tools/extract-images/).',
      'Scanned pages are read by a text reader that comes from this site the first time it is needed and then runs on your device. It reads English only, works best on straight, sharp pages, and is much slower than a typed PDF. Check names and figures it read before you rely on them.',
    ],
    faq: [
      { q: 'Will it look exactly like the PDF?', a: 'Close, not identical: Word flows text where a PDF fixes it. Complex layouts may need tidying.' },
      { q: 'Can it convert a scan?', a: 'Yes. By default each scanned page goes in as a picture, exactly as it looks, which suits a passport or a certificate. Choose Editable words to get its text instead: the words a scanner already hid in the file are used, otherwise the English text is read from the picture. Check names and numbers either way.' },
      { q: 'Only need to fix a word or two?', a: '[Edit text](/tools/edit-text/) changes the PDF directly and keeps its layout.' },
      { q: 'How do I get a PDF back after editing?', a: 'Use your word processor’s Save as PDF, or [Word or Excel to PDF](/tools/office-to-pdf/).' },
    ],
  },
  'pdf-to-excel': {
    about: 'Turns tables in a PDF into a spreadsheet, with rows and columns worked out from where the words line up and amounts as real numbers. A bank statement comes out as one sheet across all its pages, with the account details and summary on a second sheet. Check the totals before you rely on them.',
    steps: [
      'Add the PDF, or several, and type the password of any locked one.',
      'Leave Read scanned pages too ticked if the file is a scan or a photo.',
      'Press Make a spreadsheet.',
      'Open the .xlsx and check the totals against the PDF before you use them.',
    ],
    notes: [
      'What you get depends on the document. A table that runs on from page to page with the same columns, such as a statement, becomes one sheet called Table, with its column headings once at the top. Separate tables on separate pages each get a sheet named after their page, with the lines outside them (a payslip’s Net Pay, an invoice’s amount in words) on a last sheet called Text, so nothing on the pages is lost; a PDF with no tables at all comes out as its lines of text, one per row.',
      'Amounts arrive as numbers, so sums, filters and sorting work at once. Details printed above a statement, the summary box at its end and any other lines go on a sheet called Other details, rather than being mixed in among the transactions.',
      'Columns are worked out from where the words line up. On a tidy layout that is exact; on a crowded one, a value can land one column over, or a long description can split across two rows. Checking the closing balance catches either. Each PDF becomes its own spreadsheet; to get one, [Merge](/tools/merge/) the PDFs first.',
    ],
    faq: [
      { q: 'Does it work with bank statements?', a: 'Yes. See [bank statement PDF to Excel](/guides/bank-statement-pdf-to-excel/).' },
      { q: 'My statement has a password. What do I do?', a: 'Type it when the file asks. The password is used in your browser and never sent anywhere.' },
      { q: 'Can I get a CSV?', a: 'It makes an .xlsx; any spreadsheet app saves that as CSV.' },
      { q: 'Does it read a scanned statement?', a: 'Yes, with Read scanned pages too ticked. It reads English text and is slower; check every figure it read.' },
    ],
  },
  'pdf-to-powerpoint': {
    about: 'Makes a PowerPoint file with one slide per page. With Text you can edit ticked, the words become text boxes in their own size and colour, over a background of the page’s own pictures, shapes and colours; untick it to get each page as one picture that looks exactly like it. The words also go in the speaker notes.',
    steps: [
      'Add one or more PDFs.',
      'Leave Text you can edit ticked to change the words on the slides, or untick it for exact pictures of the pages.',
      'Press Make the slides.',
      'Save the .pptx and open it in PowerPoint, Google Slides, Keynote or LibreOffice Impress.',
    ],
    notes: [
      'With Text you can edit, each line or paragraph becomes a text box where it stood, in its own size, weight and colour, and the background is the page drawn without its words, so charts, photos and coloured bars stay exactly as they were. Fonts become Arial, Times New Roman or Courier New, so a line may run a little longer or shorter than on the page. The slide shape follows the first page, so a landscape PDF gives wide slides.',
      'Untick Text you can edit and each slide is a sharp picture of its page, exactly as the PDF looks on any screen or projector. Either way the words go into the speaker notes. A scanned page has no words of its own, so it stays a picture and its notes stay empty; run it through [Make searchable](/tools/ocr/) first if you want them filled. A page with words set at an angle also stays a picture, so nothing goes missing.',
      'This is the right tool when you need to show a PDF in a meeting, or hand it to someone who works in slides. To rewrite the words themselves, [PDF to Word](/tools/pdf-to-word/) gives you editable text instead.',
    ],
    faq: [
      { q: 'Can I edit the text on the slides?', a: 'Yes, with Text you can edit ticked: the words are ordinary PowerPoint text boxes. Untick it for slides that are exact pictures.' },
      { q: 'Why is the PowerPoint file large?', a: 'Every slide carries a sharp picture of its page, often a few hundred KB. Convert only the pages you will show: cut them out first with [Extract or remove pages](/tools/extract-pages/).' },
      { q: 'Is my file uploaded?', a: 'No. The slides are made in your browser.' },
      { q: 'Does it work with a scanned PDF?', a: 'Yes, the slides look just like the pages, as pictures. The speaker notes stay empty unless you run the PDF through Make searchable first.' },
    ],
  },
  'pdf-to-epub': {
    about: 'Turns a PDF into an EPUB e-book, or one web page, whose text reflows to fit a phone or e-reader screen, with its photos. Chapters start at each main heading. Page layout gives way to flowing text, so it suits books and reports better than forms or slides.',
    steps: [
      'Add the PDF, or several.',
      'Choose EPUB e-book, or A web page for a single .html file.',
      'If the pages are scans, choose Editable words under Scanned pages to get their text; otherwise they come in as pictures.',
      'Press Make the e-book, then open the file in your reading app or browser.',
    ],
    notes: [
      'The book is cut into chapters at its main headings, or at its sections when the only main heading is the title, and a contents list is built from them, so a reading app can jump straight to a chapter. Page breaks, page numbers and running headers are dropped, so the text runs on from one printed page to the next as one continuous read, with the photos in their places.',
      'It works best on documents that are mostly running text: novels, reports, notes and manuals. Forms, slides, wide tables and anything laid out in boxes lose their shape once the text is set free, and are better read as PDFs in [Read](/tools/read/).',
      'A web page is one .html file that opens in any browser with no app. It suits sending a long document to someone on a phone, or reading with a screen reader, because the words come in order and wrap to the screen. Save it and it opens again later with no connection at all.',
    ],
    faq: [
      { q: 'Does it work with Kindle?', a: 'Amazon’s Send to Kindle accepts EPUB files.' },
      { q: 'Can it convert a scanned book?', a: 'Choose Editable words under Scanned pages. Reading a scan is slower and works best on clean, straight pages.' },
      { q: 'Which apps open the EPUB?', a: 'Apple Books, Google Play Books and most e-book apps open it directly.' },
      { q: 'Is my file uploaded?', a: 'No. The e-book is put together in your browser, and the PDF never leaves your device.' },
      { q: 'More help?', a: 'See [PDF to EPUB](/guides/pdf-to-epub/).' },
    ],
  },
  'office-to-pdf': {
    about: 'Lays out a Word .docx or Excel .xlsx as a PDF, with headings, lists, tables, links and pictures, and the words kept as real text. A Word file keeps its page size, its headers and footers with their page numbers, and its footnotes. Spreadsheets repeat their heading row on every page. Fonts become the nearest of Helvetica, Times or Courier.',
    steps: [
      'Add one or more .docx or .xlsx files.',
      'Press Make the PDF.',
      'Look through the result, especially tables and any lines in Malayalam, Hindi or other scripts.',
      'Save the PDF, or tap Then to merge it with others or compress it.',
    ],
    notes: [
      'A Word document keeps its own page size and its headings, paragraphs, lists, tables, links and pictures; its header and footer go on every page, with Page 3 of 9 worked out for real, and its footnotes are gathered under Notes at the end. An Excel workbook comes out on A4, one sheet after another, each as a table whose heading row comes back at the top of every page. Columns empty all the way down are left out, a sheet too wide for an upright page goes on sideways pages, and a very wide one is set in smaller type so every column fits.',
      'The PDF uses its three built-in faces, Helvetica, Times and Courier, so the words stay real, selectable text and the file stays small; a document set in a special font will look plainer. Lines those faces cannot draw, such as Malayalam or Hindi, are drawn by your browser and placed as pictures. Dates and amounts in a spreadsheet appear as their cells show them, so 09/04/2026 stays 09/04/2026.',
      'If Word, Google Docs or LibreOffice is to hand, its own Save as PDF keeps your exact fonts and spacing. This tool is for a phone, a borrowed computer, or a work machine where documents must not be uploaded to a converter site. Old .doc and .xls files need saving as .docx or .xlsx first.',
    ],
    faq: [
      { q: 'Does it read old .doc and .xls files?', a: 'No. Save them as .docx or .xlsx first.' },
      { q: 'Does Malayalam or Hindi text work?', a: 'Yes. Lines the PDF fonts cannot draw are drawn by your browser, so they look exactly right, and the same words are written invisibly underneath, so they can still be searched, selected and copied.' },
      { q: 'Can I convert several files at once?', a: 'Yes. Each becomes its own PDF; join them with [Merge](/tools/merge/) afterwards if you need one file.' },
      { q: 'More help?', a: 'See [Word to PDF](/guides/word-to-pdf/). To go the other way, use [PDF to Word](/tools/pdf-to-word/).' },
    ],
  },
  'pdf-a': {
    about: 'Makes a PDF/A-2b copy for keeping: a colour profile and archive details go inside, and scripts, attached files and any password come out, as the standard asks. The pages stay exactly as they are. If the file uses fonts that are not inside it, the result says so instead of claiming it passes.',
    steps: [
      'Add the PDFs to archive, unlocking any locked one with its password.',
      'Press Make the archive copy.',
      'Read the result line: it lists what was taken out and warns about any font missing from the file.',
      'Save the copy, and check it with the portal’s own validator if it offers one.',
    ],
    notes: [
      'PDF/A is meant to look the same when it is opened years from now, in whatever program exists then. To keep that promise, the copy carries a colour profile and its details in the standard’s own form, and drops anything that depends on the world outside the file: scripts, attached files and a password.',
      'Fonts are the one thing that cannot be mended afterwards. If the file uses a font it does not carry inside it, the copy cannot include it either, so the result says how many are missing rather than pretending the copy passes. Save the document again from the program that made it, with fonts embedded, and make the archive copy from that.',
      'Make the archive copy after every other change and before any signature, because signing afterwards keeps the signature intact. If the copy is too big for the upload, compress the original first and then make the archive copy, rather than the other way round.',
    ],
    faq: [
      { q: 'Who asks for PDF/A?', a: 'Some court e-filing systems, government offices and record keepers. See [convert PDF to PDF/A](/guides/convert-pdf-to-pdf-a/).' },
      { q: 'Should I sign before or after?', a: 'After. Any change breaks a [digital signature](/tools/digital-sign/), so make the archive copy first.' },
      { q: 'What happens to a password?', a: 'It is removed, because an archive must open for anyone. The result says so; keep the copy somewhere safe.' },
    ],
  },
  'rent-receipts': {
    about: 'Makes monthly rent receipts for an HRA claim from what you type: no file needed. Two receipts to a page, the amount in figures and words, the owner’s PAN if you give it, ready to print and sign. Nothing you type is stored or sent.',
    steps: [
      'Type your name as the tenant, the owner’s name and the address of the rented home.',
      'Type the monthly rent, the first month, and how many months, up to 24.',
      'Choose how you paid: bank transfer, UPI, cheque or cash.',
      'Type the owner’s PAN if the rent comes to more than ₹1,00,000 in the year.',
      'Press Make the receipts, print them, and have the owner sign each one.',
    ],
    notes: [
      'Each receipt says who paid, the amount in figures with Indian commas and in words, the month, the address, how it was paid and the owner’s name, with lines for the owner’s signature and the date. The first month is set to April, the start of the financial year, so twelve months covers one tax year.',
      'Receipts should match what you really paid. If the rent changed during the year, make one set for the months at the old rent and another at the new; if you moved, one set for each address and owner. Keep your bank or UPI records of the payments too, in case your employer asks for proof.',
      'This page keeps nothing you type, so have the details ready each time. The PDF is A4 with two receipts to a page, which prints cleanly at home or in a shop. If your employer takes receipts online, photograph the signed copies with [Scan](/tools/scan/) and send one PDF.',
    ],
    faq: [
      { q: 'When is the owner’s PAN needed?', a: 'When the rent comes to more than ₹1,00,000 in the year. See [HRA rent receipts](/guides/hra-rent-receipt-generator/).' },
      { q: 'How many months can I make at once?', a: 'Up to 24.' },
      { q: 'What about a revenue stamp?', a: 'Receipts for cash over ₹5,000 commonly carry one. Choose Cash, and when the monthly rent is over ₹5,000 each receipt marks the place for it.' },
      { q: 'Does HRA count under the new tax regime?', a: 'No. The HRA exemption is claimed under the old regime, so check which regime you have chosen with your employer first.' },
    ],
  },
  'images-to-pdf': {
    about: 'Turns photos and scans into one PDF, one picture per page, in the order you set, or into a separate PDF for each picture. JPEG, PNG, WebP, GIF and BMP work, and photos taken sideways come out the right way up. iPhone HEIC photos work where the browser can read them.',
    steps: [
      'Add the pictures from your gallery or files, as many as you need.',
      'Put them in order by dragging, or with the arrows: each picture becomes one page.',
      'Choose the page size, A4, Letter or Same as each image, and a margin of None, Small or Large.',
      'Tick A separate PDF for each image if each picture should be its own file.',
      'Press Make a PDF, then Save it or tap Send.',
    ],
    notes: [
      'JPEG and PNG pictures go into the PDF exactly as they are, with no loss. WebP, BMP and HEIC pictures, and phone photos that need turning upright, are saved again as high-quality JPEGs, and GIFs as PNGs. A photo taken sideways comes out the right way up because the tool reads the direction the phone recorded.',
      'With A4 or Letter, each picture is fitted onto its page, kept in proportion and centred inside the margin you chose, so a mix of photos and screenshots prints at one size; a landscape photo gets a landscape page. Same as each image makes every page exactly the shape of its picture, with no border, which suits screenshots, posters and slides.',
      'The PDF is about as big as the pictures in it, so a dozen full-size phone photos can make a file of many MB. For an upload limit, tap Then and choose [Compress](/tools/compress/). For photos of paper, [Scan](/tools/scan/) straightens and cleans each page, and usually starts much smaller.',
    ],
    faq: [
      { q: 'Which page size should I pick?', a: 'A4 for anything printed or uploaded to a form; Same as each image for screenshots.' },
      { q: 'How do I put the Aadhaar front and back together?', a: 'See [Aadhaar front and back on one page](/guides/aadhaar-front-and-back-on-one-page/).' },
      { q: 'Photos of paper look untidy?', a: '[Scan](/tools/scan/) straightens and cleans them up so they look scanned.' },
      { q: 'Can I mix screenshots and camera photos?', a: 'Yes. Any mix of types works, in any order you set.' },
    ],
  },
  'pdf-to-images': {
    about: 'Saves pages as PNG or JPEG images at screen, sharing or print sharpness: every page, or only the ones you type. Each page becomes its own image. To get the photos stored inside the PDF instead, use [Extract images](/tools/extract-images/).',
    steps: [
      'Add the PDF, typing its password if it has one.',
      'Choose PNG or JPEG.',
      'Choose Screen, Sharing or Print sharpness.',
      'Type the pages you want, or leave Pages empty for every page.',
      'Press Save as images, then Save them one by one or with Save all.',
    ],
    notes: [
      'Each page is drawn the way a PDF reader shows it, text and pictures together, and saved as one image named with its page number. Screen is 72 dpi, Sharing 150 dpi and Print 300 dpi: an A4 page at Print is about 2,480 pixels across, enough to print it again at full size.',
      'PNG is chosen at first because it keeps small print and thin lines perfectly crisp, but its files are bigger, especially for photos. JPEG is better for pages full of photos and for the smallest file, so a portal that wants a page as a JPG under a size limit is best served by JPEG at Screen or Sharing.',
      'Many pages arrive as many files. On a computer, Save all puts them in a folder you pick, or makes one ZIP where the browser cannot save to a folder. On a phone that can share files, Send all sends them to WhatsApp, Gmail or any app that takes pictures.',
    ],
    faq: [
      { q: 'JPEG or PNG?', a: 'JPEG for smaller files and pages with photos; PNG for crisp text and diagrams.' },
      { q: 'Which sharpness should I use?', a: 'Screen (72 dpi) for the smallest file, Sharing (150 dpi) for WhatsApp, Print (300 dpi) for paper.' },
      { q: 'Can I turn the images back into a PDF?', a: 'Yes, with [Images to PDF](/tools/images-to-pdf/), though the words will then be part of a picture, not selectable text.' },
      { q: 'More help?', a: 'See [PDF to JPG](/guides/pdf-to-jpg/).' },
    ],
  },
  'n-up': {
    about: 'Lays 2, 4, 6, 8, 9 or 16 pages on each sheet for printing, on A4 or Letter, with the sheet turned whichever way shows the pages biggest. It saves paper for handouts and notes, and puts two small pages, like the sides of an ID card, on one sheet.',
    steps: [
      'Add one or more PDFs.',
      'Choose how many pages go on each sheet: 2, 4, 6, 8, 9 or 16.',
      'Choose A4 or Letter for the sheet.',
      'Press Lay it out, then print the result at actual size.',
    ],
    notes: [
      'The sheet is turned to suit the pages: two upright pages go side by side on a landscape sheet, while two wide slides go one above the other on a portrait sheet, so they print larger. Pages run left to right and then down, in a grid of two by two, three by two, four by two, three by three or four by four. Each page is scaled to fit its place with its shape kept, so nothing is cut off or stretched.',
      'Smaller pages mean smaller print. A4 pages two to a sheet stay easy to read; at 4, ordinary body text gets small, which is fine for slides and handouts but hard going for a dense contract, and 9 or 16 suit a quick overview of a long deck. Print one sheet as a test before printing a whole bundle.',
      'In the print dialog, choose actual size or 100% rather than fit to page, so the layout is not shrunk a second time. Pages are laid out in plain reading order: this tool does not reorder them for folding into a booklet.',
    ],
    faq: [
      { q: 'Does it shrink the pages?', a: 'Yes, each page is scaled to fit its place on the sheet.' },
      { q: 'Can I put an ID card’s two sides on one page?', a: 'Yes. See [Aadhaar front and back on one page](/guides/aadhaar-front-and-back-on-one-page/).' },
      { q: 'Does it work with a mix of page sizes?', a: 'Yes. Each page is fitted into its own place on the sheet, whatever its size or direction.' },
      { q: 'Is my file uploaded?', a: 'No. The sheets are laid out in your browser, and the file stays on your device.' },
    ],
  },
  'extract-images': {
    about: 'Pulls out every photo and picture stored inside a PDF, exactly as it is stored where that can be done: no re-compression, no loss. Each comes with its size and the page it came from. Drawings and text are not pictures, so they do not come out.',
    steps: [
      'Add the PDF, typing its password if it asks.',
      'Press Pull the images out.',
      'Look through the list: each image gives its size in pixels, its type and the page it came from.',
      'Save the ones you want, or use Save all for a folder or one ZIP.',
    ],
    notes: [
      'This takes out the picture files that were put into the PDF, byte for byte. A JPEG photo comes out as the very same JPEG, often far larger in pixels than it looks on the page, because PDFs commonly shrink a big photo to fit a column. Nothing is redrawn, so nothing is lost.',
      'Only real pictures come out. Charts, logos and diagrams drawn from lines and shapes are not pictures inside the file, and neither is text. A scanner normally stores each page as one picture, so a scanned PDF gives one image per page. Pictures stored in forms an ordinary image file cannot hold as they are, such as a colour palette, print CMYK, or black-and-white fax and JBIG2 scans, are decoded the way a PDF reader shows them and saved as PNG; the result line says which.',
      'Pictures in a document someone sent you may belong to them or to someone else, so check before reusing them. To capture a page exactly as it looks, drawings and words included, use [PDF to images](/tools/pdf-to-images/) instead.',
    ],
    faq: [
      { q: 'Why did a scanned PDF give one image per page?', a: 'Scanners usually store each page as one picture.' },
      { q: 'What is a .jp2 file?', a: 'JPEG 2000, a format some PDFs use. If your viewer cannot open it, [PDF to images](/tools/pdf-to-images/) gives the page as a normal JPEG.' },
      { q: 'Why does an image look different from the page?', a: 'The page may show only part of the picture, or a smaller copy of it. You get the whole picture as it was stored.' },
    ],
  },

  // ---- Mark up ----
  watermark: {
    about: 'Stamps your words, such as DRAFT, COPY or a name, across every page, once across the middle or repeated all over, light, medium or strong. A watermark discourages copying; it does not prevent it. The text takes English letters and numbers for now.',
    steps: [
      'Add one or more PDFs.',
      'Type the watermark text, such as DRAFT, COPY or FOR BANK KYC ONLY.',
      'Choose Light, Medium or Strong.',
      'Choose Once, across the middle, or Repeated all over.',
      'Press Add the watermark and save the files.',
    ],
    notes: [
      'The words go on in bold grey, set at an angle. Once, across the middle is sized to the page and to your words, so DRAFT and a long line such as FOR OFFICE USE ONLY both cross the page without running off it. Repeated all over sets smaller copies in rows across the whole page, which is much harder to crop out or cover up.',
      'Light lets the page read almost as normal, Medium is clearly visible without getting in the way, and Strong is for when the mark matters more than easy reading. The watermark is laid over the page, so it shows on scanned pages and photos as well as on typed text.',
      'Words in English letters go on as real text. Malayalam, Hindi, Tamil and other scripts go on too, drawn by your browser in the same place, with the words written invisibly underneath so they can still be searched. Every file you add gets the same mark, and a locked file comes back locked with its own password.',
    ],
    faq: [
      { q: 'Can I watermark an ID copy?', a: 'Yes. Something like FOR BANK KYC ONLY, repeated and light, is a common habit. See [add a watermark](/guides/add-watermark-to-pdf/).' },
      { q: 'Does this site add its own watermark?', a: 'Never. Only the one you type goes on.' },
      { q: 'Can someone remove a watermark?', a: 'Someone with a PDF editor and some patience can. For real protection, add a password with [Add a password](/tools/add-password/) as well.' },
    ],
  },
  'page-numbers': {
    about: 'Numbers the pages at the top or bottom, as 1, 1 of 12, Page 1 or Page 1 of 12, starting from any number and skipping a cover if you like. Bates numbering runs one sequence like ACME-000001 through every page of every file you add.',
    steps: [
      'Add one or more PDFs.',
      'Choose where the numbers go: top or bottom, left, centre or right.',
      'Choose a style and set First number if counting should not start at 1.',
      'Tick Leave the first page unnumbered if the document has a cover.',
      'Press Add the numbers and save the result.',
    ],
    notes: [
      'With the cover left unnumbered, counting starts on the second page at your first number, so a report with a cover reads 1, 2, 3 from its first real page. Starting from another number carries on from an earlier volume: a file that follows 40 pages starts at 41.',
      'The numbers are small and plain, set a short way in from the edge, where most layouts leave room. If a page already has something printed in that corner, such as a footer or a logo, choose a different place. Each file you add is numbered on its own, from the first number.',
      'Bates works differently: one running sequence through every page of every file, in the order you added them, with a prefix and a fixed number of digits. Courts and law offices use it so any page in a bundle can be cited by its number alone. The prefix takes English letters, numbers and punctuation.',
    ],
    faq: [
      { q: 'Can I start from a number other than 1?', a: 'Yes. Set First number.' },
      { q: 'What is Bates numbering?', a: 'A legal numbering with a prefix and fixed digits, running through a whole set of documents in order.' },
      { q: 'Can I number the front pages i, ii, iii?', a: 'Printed numbers here are 1, 2, 3. To have a reader call the front pages i, ii, iii, use [Page labels](/tools/page-labels/).' },
      { q: 'More help?', a: 'See [add page numbers to a PDF](/guides/add-page-numbers-to-pdf/).' },
    ],
  },
  sign: {
    about: 'Draw your signature with a finger or mouse, or type your name, then tap the page where it goes; drag to move it and drag its corner to resize. Tap again on any page to place it again. A drawn signature is a picture on the page; for a certificate a reader can check, use [Digital signature](/tools/digital-sign/).',
    steps: [
      'Add the PDF, typing its password if it has one.',
      'Draw your signature in the box, or type your name, and choose blue or black ink.',
      'Tap the page where it goes, then drag it into place and drag its corner to size it.',
      'Go to any other page that needs it and tap again.',
      'Press Place the signature and save the signed PDF.',
    ],
    notes: [
      'On a phone, write slowly: a signature dashed off with a fingertip tends to come out jagged. If it does not look right, tap Clear and draw it again before placing it. A typed name is set in a handwriting-style font your device already has, so it looks a little different on each device.',
      'The signature becomes part of the page, as ink on paper would. That suits most everyday paperwork: rental agreements, consent forms, declarations and office forms returned by email. It does not prove who placed it, and anyone holding the file could copy the picture, so send signed copies only to people who need them.',
      'Where a document must show who signed and that nothing changed afterwards, as some filings and company documents require, a certificate is needed. Many forms also want a date beside the signature: write it with [Add text](/tools/add-text/) after signing.',
    ],
    faq: [
      { q: 'Is my signature stored?', a: 'No. It is forgotten when you leave the page. Nothing is uploaded.' },
      { q: 'Can I use my real ink signature?', a: 'Photograph it on white paper and place it with [Add image](/tools/add-image/).' },
      { q: 'Can I sign every page in one go?', a: 'Tap each page that needs it; the same signature goes down each time. There is no button that signs every page at once.' },
      { q: 'More help?', a: 'See [sign a PDF online for free](/guides/sign-pdf-online-free/).' },
    ],
  },
  'mark-up': {
    about: 'Highlight, underline, strike out, draw with a pen, ring things with boxes and circles, point with arrows, measure lengths in millimetres, and add sticky notes, text boxes, stamps and links. Notes are real comments a reader lists, and links open only web, email and phone addresses.',
    steps: [
      'Add the PDF and pick a tool, such as Highlight, Pen, Box, Arrow, Note or Stamp.',
      'Drag across words to highlight, underline or strike them, or drag on the page for a shape, line or arrow.',
      'Type the words first for a note or a text box, then tap the page where it goes.',
      'Step between pages with the arrows and mark as many as you like.',
      'Press Save the marks and save the marked-up copy.',
    ],
    notes: [
      'Highlights come in yellow, green or pink; the pen, shapes and lines in black, blue or red. Highlights, shapes, stamps and pen strokes are drawn into the page itself, so they look the same in every reader and on paper. Notes and links are different: they are real PDF comments and links that a reader lists and opens.',
      'Measure draws a line between two points and writes its length on paper, in millimetres, beside it: handy for checking a plan, a label or a margin. It measures the page at its full printed size, so it is only as true to life as the drawing it is laid on.',
      'Links open only web addresses, email and phone numbers, so a link you add can never be made to run anything. Stamps are Approved, Paid, Received, Draft, Confidential, Urgent, Copy and Void. To put a picture or logo on the page, use [Add image](/tools/add-image/).',
    ],
    faq: [
      { q: 'Will others see my notes?', a: 'Yes. Notes are standard PDF comments, shown by most readers and listed in [Read](/tools/read/).' },
      { q: 'Which stamps are there?', a: 'Approved, Paid, Received, Draft, Confidential, Urgent, Copy and Void, or your own words in any script, such as a name or Verified.' },
      { q: 'Can I undo a mark?', a: 'Lines and pen strokes undo; other marks can be moved or removed until you save.' },
      { q: 'Do the marks print?', a: 'Highlights, shapes, pen strokes and stamps print with the page. How a note prints depends on the reader; many show only its small icon.' },
    ],
  },
  'edit-text': {
    about: 'Tap words already on the page and change them, or find and replace a word everywhere. The old words are painted over in the page’s colour and the new ones written in the document’s own font where it can be; in a table, one cell at a time, kept inside its lines. Scanned pages work too: their words are read first. The old words stay underneath, so to hide something for good, use [Remove areas](/tools/remove-areas/).',
    steps: [
      'Add the PDF, typing its password if it asks.',
      'Tap any outlined words on the page; tables are outlined cell by cell. On a scanned page, tap Read the words on this page first.',
      'Change the words in the box above the page.',
      'Open Find and replace to change a word or number everywhere at once.',
      'Press Save the changes and save the new copy.',
    ],
    notes: [
      'Each change paints over the old words in the colour behind them and writes the new words in the same place and size, in the font the document already uses when it can draw every letter, and otherwise in the closest built-in one. Longer words are squeezed a little, then made smaller, so a changed cell never runs into the next. Amounts and dates keep their right edge, so a changed figure still lines up in its column, and the ink colour is read from the print, so black stays black.',
      'The old words are not deleted. They sit under the paint, and anyone who copies or searches the text can find them. That is fine for correcting a typo or updating a date, and wrong for hiding anything: for that, Remove areas takes the words out of the file.',
      'A scanned page is a picture, so its words are read first, on this device, by the same reader as [Make searchable](/tools/ocr/) (fetched from this site the first time). Then only the words you change are painted over and written again, bold where they were bold, and the rest stays exactly as scanned; check names and numbers, as they were read from a picture. Words in Malayalam, Hindi or another script are drawn by your browser, with the words written invisibly underneath so they can still be searched and copied. For a long rewrite, [PDF to Word](/tools/pdf-to-word/) is the better route.',
    ],
    faq: [
      { q: 'Can I edit a scanned PDF?', a: 'Yes. Tap Read the words on this page, then tap a line. Only the words you change are repainted, in a plain font close to the original; the rest stays as scanned.' },
      { q: 'Why does a longer word look a little narrower?', a: 'So it stays inside its table cell. It is squeezed by up to 15% first, which the eye barely sees, and only made smaller if it still does not fit.' },
      { q: 'Does find and replace change parts of words?', a: 'No. It matches whole words and numbers, so 5,000.00 is not found inside 15,000.00.' },
      { q: 'Can people tell it was edited?', a: 'Often not at a glance, but a close look at the font, or copying the text, can show it. Edit only documents you have the right to change.' },
      { q: 'More help?', a: 'See [edit text in a PDF](/guides/edit-text-in-pdf/).' },
    ],
  },
  'add-text': {
    about: 'Tap a page and type: a name on a blank line, a date beside a signature, a note on a form with no fields. Tap the words again to change them, or drag to move them. Malayalam, Hindi and other scripts are drawn by your browser, so they look right, and written invisibly underneath, so they can be searched and copied.',
    steps: [
      'Add the PDF, typing its password if it asks.',
      'Type what to write in the box: a name, a date or an answer.',
      'Choose Small, Medium or Large, and black, blue or red.',
      'Tap the page where the words go, then drag them into place.',
      'Press Write it on and save the new copy.',
    ],
    notes: [
      'Add text is for forms that are only printed pages: a blank line for your name, a box for a date, a space marked Office use. On a phone, zoom in before placing small words, and sit them just above the printed line rather than on it. Put as many pieces of text as you need on any page.',
      'English letters and numbers go in as real text, which can be selected and searched. Malayalam, Hindi, Tamil and other scripts are drawn by your browser so they look right, and the same words go in invisibly underneath, so they can be searched, selected and copied too.',
      'The words become part of the page when you save. If the PDF has real fields, [Fill in a form](/tools/fill-form/) is neater and keeps answers editable; to change words that are already printed, use [Edit text](/tools/edit-text/).',
    ],
    faq: [
      { q: 'Can I fill in a form with this?', a: 'Yes, if it has no fields. If it does, Fill in a form is quicker.' },
      { q: 'Can I write in Malayalam?', a: 'Yes. The words show correctly, drawn by your browser, and they are written invisibly underneath too, so search and copy find them.' },
      { q: 'Can I change the words after placing them?', a: 'Yes, until you save: tap them to change them, or drag to move them. After saving, start again from your original.' },
    ],
  },
  'edit-images': {
    about: 'Move, resize, take out or swap the pictures already on a page: a logo, a photo, a stamp. Each picture is outlined; drag it, drag its corner, tap its × to take it out, or choose a new picture to swap in. Nothing else on the page changes.',
    steps: [
      'Add the PDF and go to the page with the picture.',
      'Tap a picture to select it; every picture on the page is outlined.',
      'Drag it to move it, drag its corner to resize it, or tap its × to take it out.',
      'To swap it, keep it selected and choose a new picture.',
      'Press Save the changes and save the new copy.',
    ],
    notes: [
      'Only the picture you work on changes. Text, lines and other pictures on the page stay exactly where they were, because the tool changes the one instruction that draws that picture and nothing else. Tapping × a second time keeps a picture you had marked to take out.',
      'A swapped-in picture keeps its own shape inside the old one’s box, so a square logo replacing a wide one sits centred rather than stretched. A PNG with a see-through background suits logos and stamps, because the page shows around them.',
      'Some things that look like pictures are not: a chart or logo drawn from lines and shapes cannot be selected, and a picture tucked inside a larger drawing may not be editable on its own. The result says how many changes could not be made, so nothing fails quietly.',
    ],
    faq: [
      { q: 'Does a swapped picture get stretched?', a: 'No. It keeps its own shape inside the old picture’s box.' },
      { q: 'Want to save a picture instead?', a: 'Use [Extract images](/tools/extract-images/).' },
      { q: 'Is a taken-out picture gone from the file?', a: 'It is no longer drawn, so nobody sees it, but its data may still be stored inside. For something private, use [Remove areas](/tools/remove-areas/) on that part of the page instead.' },
    ],
  },
  'add-image': {
    about: 'Put a photo, logo or picture of a stamp or signature on any page, then drag it into place and resize it. A PNG with a see-through background keeps it, so a logo or signature sits cleanly on the page.',
    steps: [
      'Add the PDF, typing its password if it asks.',
      'Tap Choose a photo, a logo or a stamp, and pick the picture.',
      'Tap the page where it goes.',
      'Drag it into place, and drag its corner to make it bigger or smaller.',
      'Press Place it and save the new copy.',
    ],
    notes: [
      'The picture keeps its own shape as you resize it, so a logo never ends up squashed. Photos are kept sharp but light, so a phone photo does not swell the PDF by several MB. To change the picture, choose again before you tap the page. A photo taken sideways is turned the right way up first.',
      'For a company stamp or an ink signature, photograph it on plain white paper in good light, then cut away the background in your phone’s photo editor or any app that saves PNG with a see-through background. A JPEG always carries a white box behind it, which shows on coloured or lined paper.',
      'The picture becomes part of the page when you save. To move or replace a picture that was already in the PDF, use [Edit pictures](/tools/edit-images/) instead, which works on what is there rather than adding something new.',
    ],
    faq: [
      { q: 'Can I add my signature this way?', a: 'Yes. Photograph it on white paper, or draw it in [Sign](/tools/sign/).' },
      { q: 'Which picture types work?', a: 'JPEG and PNG work everywhere; other types where your browser can read them.' },
      { q: 'Will a phone photo make the PDF huge?', a: 'No. A big photo is shrunk to a sensible size before it goes on, so the file stays light.' },
      { q: 'Is my picture uploaded?', a: 'No. It is placed on the page in your browser and stays on your device.' },
    ],
  },
  'fill-form': {
    about: 'Type into a PDF form’s own fields, tick its boxes and pick from its lists, then save it still editable or sealed so the answers can no longer change. You can save your answers as a file and fill the same form from it next time; Acrobat .xfdf answers work too.',
    steps: [
      'Add the PDF form; its fields appear as a list of boxes, each with its name.',
      'Type your answers, tick the boxes that apply, and pick from any lists.',
      'Or choose Fill it from saved answers to load a .json or .xfdf file from last time.',
      'Tick Seal the answers, or Also save my answers as a file, if you want either.',
      'Press Fill it in and save the filled form.',
    ],
    notes: [
      'The answers go into the form’s own fields, so they sit exactly where the form’s maker put the boxes and print neatly. Some fields have a set length, and the box says how many characters it takes. Answers saved from a different form fill nothing, and the tool says so rather than pretend.',
      'Seal the answers when you send a final copy, so nobody can change them after you. Leave it off while a form is still being completed, or when the office asks for an editable form. The answers file is small and holds only what you typed; keep it private if the form is.',
      'Answers are written with the form’s own font where it can draw them. An answer in Malayalam, Hindi or another script the font cannot draw is kept as real words in the field and shown with a picture of the words drawn inside the box, so it reads correctly in any reader and when sealed. For words outside the boxes, use [Add text](/tools/add-text/).',
    ],
    faq: [
      { q: 'It says the PDF has no fields. What now?', a: 'The form is just a printed page. Write on it with [Add text](/tools/add-text/).' },
      { q: 'What does Seal the answers do?', a: 'It flattens them into the page so they can no longer be changed. Leave it off to keep the form fillable.' },
      { q: 'Does a locked form stay locked?', a: 'Yes. Type its password when asked; the filled copy keeps the same password.' },
      { q: 'More help?', a: 'See [fill a PDF form](/guides/fill-pdf-form/).' },
    ],
  },
  background: {
    about: 'Gives pages a soft paper colour, cream, grey, mint, sky, rose or your own, behind everything, so text and drawings stay on top. Choose all pages or type which. A scanned page is one solid picture, so the colour will not show through it.',
    steps: [
      'Add one or more PDFs.',
      'Pick Cream, Soft grey, Mint, Sky or Rose, or choose Your own and pick a colour.',
      'Leave Pages empty for every page, or type the ones to colour, such as 1-3, 7.',
      'Press Colour the pages and save the result.',
    ],
    notes: [
      'A tinted page can be easier on the eyes for long reading on screen, and helps sections stand out: a cream cover, mint for the appendix, rose for the pages a client must sign. The colours offered are pale on purpose, so black text keeps strong contrast against them.',
      'The colour goes behind everything, so it never covers words or drawings. A page that is a scan or a full-page photo already has its own solid background, which sits on top of the new colour and hides it; this tool cannot tint those pages.',
      'A coloured page uses ink when printed, and a home printer may show it as a faint grey. Keep an uncoloured copy for printing. Every file you add gets the same colour, and a locked file stays locked with the same password.',
    ],
    faq: [
      { q: 'Will it cover my text?', a: 'No. The colour goes behind everything on the page.' },
      { q: 'Can I colour only some pages?', a: 'Yes. Type them, like 1-3, 7.' },
      { q: 'Can I colour several files at once?', a: 'Yes. Every file you add gets the same colour, on the pages you typed.' },
      { q: 'Is my file uploaded?', a: 'No. The pages are coloured in your browser, on your device.' },
      { q: 'Can I take the colour off later?', a: 'Not with this tool. Keep your original, which is never changed, and start again from it.' },
    ],
  },
  'create-form': {
    about: 'Turns a printed form into one people fill in on screen: text boxes, paragraph boxes, tick boxes and choice lists. Find the blanks for me turns lines of underscores and empty boxes into named fields; check each one. The fields are standard, so the form works in Acrobat, browsers and phone viewers.',
    steps: [
      'Add the PDF of the printed form.',
      'Tap Find the blanks for me to put a field on each line of underscores and each empty tick box.',
      'Choose Text, Paragraph, Tick box or Choice list, and drag across any other space where an answer goes.',
      'Tap a field to rename it, or to type the choices for a list, separated by commas.',
      'Press Make it fillable and save the form.',
    ],
    notes: [
      'Find the blanks reads the page’s text, looking for runs of underscores and ☐ boxes typed into the document. It does not see lines drawn as graphics, boxes in a table or anything in a scan, so on many forms you will add some fields by hand. Every field it adds is named after the words beside it; check the names, since they are what a reader shows.',
      'Good names make the form easier to fill and the answers easier to use: Full name, Date of birth, Mobile number. Use Paragraph for an address or a reason, Tick box for yes or no questions, and Choice list where only certain answers are allowed, so answers come back consistent.',
      'The fields sit over the page, so the printed form underneath is not touched and still prints the same. Anyone can fill the result with [Fill in a form](/tools/fill-form/), Acrobat, or a phone’s PDF viewer, and a locked PDF stays locked with the same password.',
    ],
    faq: [
      { q: 'Does Find the blanks work on a scan?', a: 'No. It reads the page’s text, and a scan has none. Drag the fields on by hand.' },
      { q: 'What kinds of field are there?', a: 'Text, Paragraph for longer answers, Tick box, and Choice list.' },
      { q: 'More help?', a: 'See [make a PDF fillable](/guides/make-pdf-fillable/).' },
    ],
  },
  'header-footer': {
    about: 'Adds a line along the top, the bottom, or both, of every page: a title, CONFIDENTIAL, a date or a reference. {page}, {total}, {date} and {name} are filled in for you. Any language works.',
    steps: [
      'Add one or more PDFs.',
      'Type a header, a footer, or both, using {page}, {total}, {date} or {name} where you want them filled in.',
      'Choose Left, Centre or Right to line them up.',
      'Press Add them and save the result.',
    ],
    notes: [
      '{page} becomes each page’s number, {total} the number of pages, {date} today’s date written like 12 Oct 2026, and {name} the file’s name without .pdf. So a footer of {name}, page {page} of {total} gives every page its own line, which helps when printed pages get shuffled or a single page is photocopied on its own.',
      'The line is small and plain, set a short way in from the edge of every page. If a page already has something printed there, such as a letterhead, try the other edge, or line it up on the other side. Every file you add gets the same header and footer, each filled in with its own name and page count.',
      'Words in English letters go on as real text; Malayalam, Hindi and other scripts, including a file name in them used through {name}, are drawn by your browser in the same place, with the words written invisibly underneath so they can be searched. For page numbers alone, with more styles and Bates numbering, use [Page numbers](/tools/page-numbers/).',
    ],
    faq: [
      { q: 'What does {name} put in?', a: 'The file’s name, without .pdf.' },
      { q: 'Can the header and footer differ?', a: 'Yes. Type each one in its own box; leave either empty to add only the other.' },
      { q: 'Can I put it on some pages only?', a: 'Not yet. The header and footer go on every page.' },
      { q: 'Is my file uploaded?', a: 'No. The lines are added in your browser, and the file stays on your device.' },
    ],
  },

  // ---- Protect ----
  'add-password': {
    about: 'Locks a PDF with AES-256, so nobody can open it without the password, and chooses whether printing, copying and changes are allowed. Or only restrict those, with no password to open: readers that respect the settings obey them, but a determined person can switch them off. The password is never stored or sent, so write it down.',
    steps: [
      'Add one or more PDFs.',
      'Leave Lock it with a password chosen, then type the password and type it again.',
      'Tick or untick Allow printing, Allow copying text, and Allow changes and comments.',
      'Press Lock it and save the locked copy.',
    ],
    notes: [
      'AES-256 is the strongest lock a PDF can carry, but a password anyone can guess undoes it. A date of birth or a phone number alone is easy for anyone who knows you. Several words strung together are both strong and easy to remember. Send the password by a different route from the file: a call, or a separate message.',
      'Printing is allowed at first, while copying and changes are not. These settings ride along with the password and are obeyed by Acrobat, Chrome and most readers, so a locked contract can still be printed but not edited. Only restrict printing, copying and editing makes a file anyone can open, with those settings as a polite request.',
      'Every file you add is locked with the same password. Nobody can open a locked file without it, this site included, and there is no reset: keep the unlocked original somewhere safe. To take the lock off later, use [Remove a password](/tools/remove-password/).',
    ],
    faq: [
      { q: 'What if I forget the password?', a: 'Nobody can open the file, us included. Keep the unlocked original safe.' },
      { q: 'Can I lock several files at once?', a: 'Yes, all with the password you type.' },
      { q: 'Will it open on a phone?', a: 'Yes. Any PDF reader that supports AES-256, which is nearly all of them, asks for the password and opens it.' },
      { q: 'More help?', a: 'See [password protect a PDF](/guides/password-protect-pdf/).' },
    ],
  },
  'digital-sign': {
    about: 'Seals a PDF with your certificate, a .pfx or .p12 file, so a reader such as Acrobat can show who signed and that nothing has changed since. Shown as a box on the last page, or invisible in the reader’s signature panel. The certificate and its password stay on your device and are forgotten when you leave.',
    steps: [
      'Add the PDF you want to sign.',
      'Tap Choose your certificate and pick your .pfx or .p12 file.',
      'Type the certificate’s password.',
      'Leave Show the signature on the page ticked for a visible box, choose the first or last page, and add a reason and a place if you like.',
      'Press Sign it digitally and save the signed PDF.',
    ],
    notes: [
      'A digital signature is worked out from the document’s exact contents with a key only the certificate holder has. A reader such as Acrobat then shows who signed, which authority issued their certificate, and whether anything has changed since. The visible box carries your name and the date; switch it off and the signature still sits in the reader’s signature panel.',
      'Finish the document before signing. Any later change to the file, even adding a page number, shows as a change after signing. A locked PDF must be unlocked first with [Remove a password](/tools/remove-password/). A signature someone else added earlier stays valid when you add yours, because yours is appended rather than rewritten.',
      'An expired certificate is refused, with the date it ran out, because readers would mark the signature as not valid. Whether a reader also shows your identity as trusted depends on whether it trusts the authority that issued the certificate, not on this tool.',
    ],
    faq: [
      { q: 'Can I use my DSC on a USB token?', a: 'No. A web page cannot reach a token. Use the signing utility that came with it. See [digital signature with a DSC](/guides/digital-signature-pdf-dsc/).' },
      { q: 'Why was my certificate refused?', a: 'It may have expired: the tool shows the date rather than make a signature readers would mark invalid.' },
      { q: 'Can I sign a locked PDF?', a: 'Remove its password with Remove a password first.' },
      { q: 'Is my certificate uploaded?', a: 'No. The file and its password are read in your browser, used once, and forgotten when you leave the page.' },
    ],
  },
  'remove-password': {
    about: 'Unlocks a PDF whose password you know and saves a copy that opens without one. It does not guess or break passwords. Files that only block printing or copying open without a password, and come back with those blocks removed.',
    steps: [
      'Add the locked PDF, or several.',
      'Type each file’s password in the box under it and tap Unlock to open it.',
      'Press Unlock it to make copies that open without a password.',
      'Save the unlocked copies, and keep the originals too.',
    ],
    notes: [
      'A password typed wrongly just asks again, so check capitals and the exact format your bank or the office gave you. The password is used in your browser to open the file and then forgotten; it is never stored, and never sent anywhere.',
      'An unlocked copy opens for anyone who gets hold of it, so unlock only when a portal refuses locked files or someone needs a copy without the password. Documents with a digital signature, such as the e-Aadhaar, no longer pass that signature check once unlocked; where an office verifies it, send the original and the password instead.',
      'A file that opens without a password but blocks printing or copying comes back with those blocks gone. A file that was not locked at all is skipped, and the result says there was nothing to remove.',
    ],
    faq: [
      { q: 'What is the Aadhaar PDF password?', a: 'The first four letters of your name in capitals, then your year of birth. See [Aadhaar PDF password](/guides/aadhaar-pdf-password/).' },
      { q: 'What is my bank statement’s password?', a: 'It varies by bank: often your date of birth, customer ID, or part of your name with part of your birth date. Check the bank’s email. See [unlock a bank statement](/guides/remove-password-from-bank-statement-pdf/).' },
      { q: 'Can you find a password I have forgotten?', a: 'No. This tool only unlocks with the password you type.' },
      { q: 'Is my file or password sent anywhere?', a: 'No. The file is unlocked in your browser, and the password is forgotten as soon as it has been used.' },
    ],
  },
  'remove-areas': {
    about: 'Genuinely removes what you mark: each marked page is redrawn as a picture with those parts painted out, so the hidden words cannot be copied, searched or recovered. Find and remove marks every Aadhaar, PAN, phone number, email, card number or word you type. The cost: a marked page’s other words stop being selectable, and its form answers go.',
    steps: [
      'Add the PDF, typing its password if it asks.',
      'Drag across each name, number, signature or photo that should go, on every page where it appears.',
      'Open Find and remove, tick what to look for or type words, and tap Find and mark them.',
      'Check every mark: tap one and its × takes it back.',
      'Press Remove them and save the redacted copy.',
    ],
    notes: [
      'Each page you mark is drawn as a picture at 200 dpi with the marked parts painted solid black, and that picture replaces the page. The words, pictures and comments that were on it are gone from the file, not hidden. Pages you do not mark stay exactly as they were, text and all.',
      'Find and remove searches the real text of every page and marks each match for you to check before anything goes. It cannot see into a scan, which has no text: run [Make searchable](/tools/ocr/) first and search the result, checking each mark, since the reading can miss a digit, or drag across those parts by hand.',
      'Look through every page before you press the button, including small print, headers and the photo of an ID. Keep your original private: it still has everything in it. A redacted page is a picture, so its size grows a little and its words cannot be selected afterwards.',
    ],
    faq: [
      { q: 'How do I make a masked Aadhaar?', a: 'Drag across the first eight digits wherever they appear. See [hide the Aadhaar number](/guides/hide-aadhaar-number-in-pdf/).' },
      { q: 'Does it find numbers in a scan?', a: 'Not as it is: a scan has no text to search. Make it searchable first, then search, or drag across those parts by hand.' },
      { q: 'Why not just draw a black box?', a: 'A box covers the words but leaves them in the file. See [redact a PDF properly](/guides/redact-pdf/).' },
    ],
  },
  'document-details': {
    about: 'Strips what a PDF carries besides its pages: the title, author, the program that made it, dates and hidden XMP data, and on request scripts, comments and attached files. Or set new details instead. The pages are not touched.',
    steps: [
      'Add one or more PDFs.',
      'Choose Clean everything hidden, Remove the hidden details, or Set new details.',
      'Untick Comments and notes too, or Attached files too, if you want to keep them.',
      'Press Clean it and save the cleaned copy, then send that one.',
    ],
    notes: [
      'A PDF often records the name set on the computer that made it, the program and its version, and when it was made and changed, sometimes twice over in hidden XMP data. Comments from earlier drafts and files attached inside can travel along too, unseen by anyone who only reads the pages.',
      'Clean everything hidden is the one to use before a file leaves your hands: it removes the details and XMP data, any scripts and actions that run when the file opens, and by default comments and attached files. The result lists what it found and removed, so you know what the file was carrying.',
      'Set new details writes a proper title, author, subject and keywords instead, which some portals and libraries show; leave a box empty to remove that detail. The pages, their words and their look stay as they are, and a locked PDF stays locked with the same password.',
    ],
    faq: [
      { q: 'What should I choose before sending a file outside?', a: 'Clean everything hidden. See [remove PDF metadata](/guides/remove-pdf-metadata/).' },
      { q: 'Does it remove names printed on the page?', a: 'No. Use [Remove areas](/tools/remove-areas/) for those.' },
      { q: 'Does it change the file name?', a: 'No. The name is not inside the file; rename the saved copy yourself if it gives something away.' },
      { q: 'Is my file uploaded?', a: 'No. It is cleaned in your browser, so the details you are removing are never sent anywhere either.' },
    ],
  },
  attachments: {
    about: 'Puts files of any kind inside a PDF, such as a spreadsheet, photos or the source document, so they travel with it. Or takes out every file a PDF carries, byte for byte. Attached files are carried as they are, never opened or checked here.',
    steps: [
      'Choose Put files inside the PDF, or Take out the attached files.',
      'Add the PDF first, then, to attach, the files to put inside it.',
      'Press Attach or take out.',
      'Save the PDF with its attachments, or save each file that came out.',
    ],
    notes: [
      'Attaching keeps a set together: an invoice PDF with the spreadsheet behind it, a report with its raw photos, a signed form with the scan of the ID it refers to. The receiver opens the attachments panel in their reader and saves each file from there. The PDF grows by about the size of what you attach.',
      'Taking out saves every file a PDF carries, exactly as it went in, with its own name. A PDF that comes out can go straight into another tool. Files attached to a PDF from someone you do not know deserve the care you would give an unexpected email attachment, because nothing here checks them.',
      'Attachments are easy to forget, and they leave with the PDF every time it is sent. To drop them all before sharing, use [Clean hidden data](/tools/document-details/). A locked PDF stays locked with the same password when files are added.',
    ],
    faq: [
      { q: 'How do I attach files?', a: 'Add the PDF first, then the files to put inside it.' },
      { q: 'Where do attachments show?', a: 'In the attachments panel of most PDF readers.' },
      { q: 'Is there a size limit on attachments?', a: 'None is set here; your device’s memory is the only limit. The person receiving it may have an email limit, though.' },
      { q: 'Are the files uploaded or scanned?', a: 'No. They are put inside the PDF in your browser, as they are, and never opened or checked.' },
      { q: 'How do I remove all attachments?', a: 'Clean hidden data takes them out.' },
    ],
  },

  // ---- Read and capture ----
  compare: {
    about: 'Shows what changed between two versions, word by word. Add the older one first, then the newer; the newer comes back marked, with new words in green and a comment wherever words were taken out. Words are compared, not pictures or layout.',
    steps: [
      'Add the older version first.',
      'Add the newer version second.',
      'Press Compare them.',
      'Open the marked copy and step through the green words and the comments.',
    ],
    notes: [
      'Words that are new in the later version are highlighted in green, joined into one mark where they run on together. Where words were taken out, a comment sits at that place saying what they were. A paragraph that only moved does not make everything after it look changed. Because the older file always goes first, green always means added since then, and a comment always means taken out.',
      'Only words are compared. A change of font, spacing, colour or picture is not reported, and neither is a page that was reordered but left the same. Numbers are words here, so a changed rent, date or figure in a table shows up clearly.',
      'The marked copy is a new file, and both files you added stay as they were. Read it in any PDF reader, or in [Read](/tools/read/), whose comments list lets you step through every removal. Scans have no words to compare until they are run through [Make searchable](/tools/ocr/).',
    ],
    faq: [
      { q: 'Can I compare scans?', a: 'Make each one searchable with Make searchable first; a scan has no words to compare.' },
      { q: 'Can I compare more than two files?', a: 'Two at a time: the older one, then the newer one.' },
      { q: 'Does it notice a changed amount?', a: 'Yes. Numbers count as words, so a new figure is highlighted in green and a comment gives the old one.' },
      { q: 'Are my documents uploaded?', a: 'No. Both are read and compared in your browser, and neither leaves your device.' },
      { q: 'More help?', a: 'See [compare two PDFs](/guides/compare-two-pdfs/).' },
    ],
  },
  read: {
    about: 'Opens a PDF to read, with zoom that redraws sharply, find, the document’s own contents, night mode, a list of its comments, print and read aloud. Read aloud uses only voices on your device, so the words are never sent away. Then hands the document to any tool.',
    steps: [
      'Add the PDF; it opens straight away, after its password if it has one.',
      'Use + and − to zoom, Contents to jump to a chapter, and find to search the words.',
      'Tap Night for a dark page, or Read aloud to hear it from where you are.',
      'Tap Then to hand the document to another tool, such as Compress or Sign.',
    ],
    notes: [
      'Zooming redraws the page at the new size, so small print stays sharp instead of blurring. Contents shows the document’s own bookmarks, if it has any, and Comments lists the notes, highlights and other marks people have left, so a reviewed draft can be read point by point.',
      'Print draws each page as a picture on a sheet only the printer sees, which works the same on any browser. Read aloud uses only the voices installed on your device; where there are none, it says so rather than send the words to an online voice service.',
      'Night turns the page dark with light text, easier late at night. A scanned page has no words to find or read aloud until it has been through [Make searchable](/tools/ocr/).',
    ],
    faq: [
      { q: 'Why does read aloud not work?', a: 'It uses only voices installed on your device. Where there are none, it says so rather than use an online voice.' },
      { q: 'Does it work offline?', a: 'Yes, once the site has loaded. See [PDF tools that work offline](/guides/pdf-tools-that-work-offline/).' },
      { q: 'Is my document uploaded to be shown?', a: 'No. It is opened and drawn by your browser, on your device.' },
      { q: 'Can I send the document to another tool?', a: 'Yes. Tap Then and pick the tool; in most browsers the document goes straight to it, without saving in between.' },
    ],
  },
  summarise: {
    about: 'Gives a PDF’s key points, or translates it, using only the AI built into your browser, on your device. So far that is found mainly in recent Chrome on a desktop or laptop. Where a browser has none, the tool says so and does nothing, rather than send your document to an online AI.',
    steps: [
      'Add the PDF; its words are read on your device.',
      'Press Summarise it for the key points.',
      'Or pick a language under Translate into and press Translate it.',
      'Copy the result from the box when it is done.',
    ],
    notes: [
      'A long document is summarised a part at a time, and then the parts together, so even a long report comes down to one list of points. The summary is the browser’s own reading, and can miss or blur a detail: for anything that matters, such as a clause or an amount, check the document itself.',
      'Translation works in parts too, and the text fills in as each part is done. The tool works out the document’s language where the browser can tell, and otherwise treats it as English. Whether a pair such as English to Malayalam is offered depends on what your browser supports on your device, and it says so when one is not.',
      'This tool reads words, so a scanned PDF needs [Make searchable](/tools/ocr/) first. The result is plain text in a box, not a new PDF; paste it into an email, a note or a document of your own.',
    ],
    faq: [
      { q: 'Why does it say it is not available?', a: 'Your browser has no built-in AI. Your document is never sent anywhere else to make up for it.' },
      { q: 'Which languages can it translate into?', a: 'English, Hindi, Malayalam, Tamil, Telugu, Kannada, Bengali, Marathi, Arabic, French, German, Spanish, Portuguese, Japanese and Chinese, where the browser supports them.' },
      { q: 'Why is the first run slow?', a: 'The browser may download its own model once. After that it runs on your device.' },
    ],
  },
  scan: {
    about: 'Photograph pages and get a PDF that looks scanned: each sheet is found in its photo, straightened, cropped and cleaned up. Drag the round handles if a corner is off. Choose colour, grey, or black and white, which survives a shadow and usually makes the smallest file.',
    steps: [
      'Take a photo of each page, or choose photos you already took.',
      'Check that the round handles sit on the paper’s corners, and drag any that do not.',
      'Turn any page that is the wrong way up with its turn button.',
      'Choose Colour, Grey or Black and white, and A4, Letter or As photographed.',
      'Press Make the PDF, then Save it or tap Send.',
    ],
    notes: [
      'For the best scan, lay the paper on a darker surface so its edges stand out, hold the phone straight above it, and use daylight rather than the flash, which leaves a bright patch. Each photo is worked on at about 250 dots per inch for an A4 page, sharp enough to read small print and to print again.',
      'Black and white makes the paper white and the writing crisp, and is the best choice for letters, forms and printed pages. Grey keeps photos and pencil marks readable. Colour keeps stamps, signatures in blue ink and coloured forms as they are, at the cost of a bigger file.',
      'Every photo becomes one page, in the order listed. The photos are straightened and cleaned in your browser and never sent anywhere, which matters for an ID card or a medical report. To search or copy the words afterwards, take the PDF to [Make searchable](/tools/ocr/).',
    ],
    faq: [
      { q: 'Which look should I choose?', a: 'Black and white for text and forms, grey with photos, colour where stamps or ink colours matter.' },
      { q: 'Can I search the words afterwards?', a: 'Run the scan through Make searchable.' },
      { q: 'More help?', a: 'See [scan a document with your phone](/guides/scan-document-to-pdf-with-phone/).' },
    ],
  },
  ocr: {
    about: 'Reads the words in scanned pages and lays them invisibly over the pictures, so you can search, select and copy them; the pages look exactly the same. English is ready at once; Malayalam, Hindi, Tamil and seventeen more are fetched from this site the first time you pick them. Every script goes into the PDF itself, so a Malayalam or Hindi scan becomes searchable like an English one.',
    steps: [
      'Add one or more scanned PDFs.',
      'Pick the main language of the scan, and up to two more if the pages mix languages.',
      'Press Make it searchable.',
      'Save the searchable PDF, and the .txt file too if one comes out.',
    ],
    notes: [
      'Each page with no text of its own is drawn at 300 dpi and read; pages that already have text are left alone. The words go back in as an invisible layer lined up with the picture, so the reader’s find, select and copy work on them while the page looks exactly as before.',
      'Every script goes into the invisible layer: Malayalam, Hindi, Tamil, Arabic and the rest are searched, selected and copied in the PDF exactly as English is.',
      'Clean, straight, printed pages read best. Handwriting, faint photocopies and unusual fonts read worse, so check names and numbers before relying on them. If a page is a crooked photo, run it through [Scan](/tools/scan/) first for a straighter, sharper page.',
    ],
    faq: [
      { q: 'How many languages can I pick?', a: 'Up to three. More makes the reading worse, not better.' },
      { q: 'Is my scan sent anywhere?', a: 'No. Only the language model comes from this site; your document stays on your device.' },
      { q: 'How long does it take?', a: 'Each page is real work for your device, so a long scan on an older phone takes a while. A progress line shows which page it is reading.' },
      { q: 'More help?', a: 'See [make a scanned PDF searchable](/guides/make-scanned-pdf-searchable/).' },
    ],
  },
  'extract-text': {
    about: 'Pulls the words out of a PDF as plain text, page by page, ready to copy or search. A scan has pictures of words, not words, so make it searchable first with [Make searchable](/tools/ocr/).',
    steps: [
      'Add one PDF or several, and unlock any that ask for a password.',
      'Press Extract the text.',
      'Save the .txt file, or open it and copy what you need.',
    ],
    notes: [
      'The text file holds the words in reading order, with a line marking where each page starts, so a quote can be traced back to its page. Bold, sizes, columns and tables are not kept: this is the words alone, which is what you want for pasting into an email, a message or a search.',
      'Plain text opens anywhere, on any phone or computer, and is tiny compared with the PDF. It is also the easiest form for a screen reader, or for pasting a long document into a translator of your choice.',
      'If a file gives no words, it is almost certainly a scan or a photo, and the tool says so instead of saving an empty file. Make it searchable first, then extract. Every PDF you add gets its own .txt file, named after it.',
    ],
    faq: [
      { q: 'Why is the text empty?', a: 'The PDF is probably a scan. Run Make searchable on it first.' },
      { q: 'Want headings and tables kept?', a: 'Use [PDF to Word](/tools/pdf-to-word/) instead.' },
      { q: 'Can I extract several files at once?', a: 'Yes. Add them all; each gives its own .txt, and Save all saves them together.' },
      { q: 'Is my PDF uploaded?', a: 'No. The words are read out of the file in your browser, on your device.' },
      { q: 'Does it work with Malayalam or Hindi text?', a: 'Yes, where the PDF holds real text in those scripts. Some older PDFs store such text in ways that copy out garbled; that is the file, not the tool.' },
    ],
  },
};
