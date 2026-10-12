/**
 * PowerPoint: a Deck written as a .pptx, one picture per slide.
 *
 * A PDF page has no slide structure to recover (no title placeholder, no
 * bullet levels, just positioned glyphs), so the honest conversion is the
 * page as a picture that fills the slide, which always looks right. The
 * page's text goes in the slide's notes, so it can still be searched, copied
 * and read aloud.
 *
 * PowerPoint is far stricter than LibreOffice about what a package must hold,
 * so everything it insists on is here even though nothing uses it: a slide
 * master with one blank layout, a theme for it, a notes master with its own
 * theme, presentation properties and an empty table-style list.
 */
import type { Deck, Picture } from './model';
import { contentTypes, CORE_TYPE, coreProperties, EMU_PER_POINT, REL, relationships, type Entry, type RelSpec, zip } from './package';
import { escapeAttr, escapeText, XML_DECLARATION } from './xml';

const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const P_NS = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const PML = 'application/vnd.openxmlformats-officedocument.presentationml';
const NS = `xmlns:a="${A_NS}" xmlns:r="${R_NS}" xmlns:p="${P_NS}"`;

/** PowerPoint accepts slides from one inch to 56 inches a side. */
const MIN_SIDE = 914_400;
const MAX_SIDE = 51_206_400;
const NOTES_SIZE = { cx: 6_858_000, cy: 9_144_000 };

/** Writes the deck as a .pptx. */
export function toPptx(deck: Deck, options: { title?: string } = {}): Uint8Array {
  const size = slideSize(deck.width, deck.height);
  const entries: Entry[] = [];
  const overrides: Array<[string, string]> = [
    ['/ppt/presentation.xml', `${PML}.presentation.main+xml`],
    ['/ppt/slideMasters/slideMaster1.xml', `${PML}.slideMaster+xml`],
    ['/ppt/slideLayouts/slideLayout1.xml', `${PML}.slideLayout+xml`],
    ['/ppt/notesMasters/notesMaster1.xml', `${PML}.notesMaster+xml`],
    ['/ppt/theme/theme1.xml', 'application/vnd.openxmlformats-officedocument.theme+xml'],
    ['/ppt/theme/theme2.xml', 'application/vnd.openxmlformats-officedocument.theme+xml'],
    ['/ppt/presProps.xml', `${PML}.presProps+xml`],
    ['/ppt/tableStyles.xml', `${PML}.tableStyles+xml`],
  ];
  const presentationRels: RelSpec[] = [
    { id: 'rId1', type: REL.slideMaster, target: 'slideMasters/slideMaster1.xml' },
    { id: 'rId2', type: REL.notesMaster, target: 'notesMasters/notesMaster1.xml' },
    { id: 'rId3', type: REL.theme, target: 'theme/theme1.xml' },
    { id: 'rId4', type: REL.presProps, target: 'presProps.xml' },
    { id: 'rId5', type: REL.tableStyles, target: 'tableStyles.xml' },
  ];
  let slideIds = '';

  deck.slides.forEach((slide, i) => {
    const n = i + 1;
    const ext = slide.picture.format === 'png' ? 'png' : 'jpeg';
    const media = `image${n}.${ext}`;
    entries.push([`ppt/media/${media}`, slide.picture.bytes]);
    entries.push([`ppt/slides/slide${n}.xml`, slideXml(slide.picture, size)]);
    entries.push([
      `ppt/slides/_rels/slide${n}.xml.rels`,
      relationships([
        { id: 'rId1', type: REL.slideLayout, target: '../slideLayouts/slideLayout1.xml' },
        { id: 'rId2', type: REL.image, target: `../media/${media}` },
        { id: 'rId3', type: REL.notesSlide, target: `../notesSlides/notesSlide${n}.xml` },
      ]),
    ]);
    entries.push([`ppt/notesSlides/notesSlide${n}.xml`, notesXml(slide.text ?? '')]);
    entries.push([
      `ppt/notesSlides/_rels/notesSlide${n}.xml.rels`,
      relationships([
        { id: 'rId1', type: REL.notesMaster, target: '../notesMasters/notesMaster1.xml' },
        { id: 'rId2', type: REL.slide, target: `../slides/slide${n}.xml` },
      ]),
    ]);
    overrides.push([`/ppt/slides/slide${n}.xml`, `${PML}.slide+xml`], [`/ppt/notesSlides/notesSlide${n}.xml`, `${PML}.notesSlide+xml`]);
    const relId = `rId${presentationRels.length + 1}`;
    presentationRels.push({ id: relId, type: REL.slide, target: `slides/slide${n}.xml` });
    slideIds += `<p:sldId id="${255 + n}" r:id="${relId}"/>`;
  });

  const presentation =
    `${XML_DECLARATION}<p:presentation ${NS} saveSubsetFonts="1">` +
    `<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>` +
    `<p:notesMasterIdLst><p:notesMasterId r:id="rId2"/></p:notesMasterIdLst>` +
    (slideIds ? `<p:sldIdLst>${slideIds}</p:sldIdLst>` : '') +
    `<p:sldSz cx="${size.cx}" cy="${size.cy}"/><p:notesSz cx="${NOTES_SIZE.cx}" cy="${NOTES_SIZE.cy}"/>` +
    `<p:defaultTextStyle><a:defPPr><a:defRPr lang="en-US"/></a:defPPr></p:defaultTextStyle></p:presentation>`;

  const core = coreProperties(options.title);
  const packageRels: RelSpec[] = [{ id: 'rId1', type: REL.officeDocument, target: 'ppt/presentation.xml' }];
  if (core) {
    packageRels.push({ id: 'rId2', type: REL.core, target: 'docProps/core.xml' });
    overrides.push(['/docProps/core.xml', CORE_TYPE]);
  }

  const all: Entry[] = [
    ['[Content_Types].xml', contentTypes(overrides)],
    ['_rels/.rels', relationships(packageRels)],
    ['ppt/presentation.xml', presentation],
    ['ppt/_rels/presentation.xml.rels', relationships(presentationRels)],
    ['ppt/slideMasters/slideMaster1.xml', MASTER],
    [
      'ppt/slideMasters/_rels/slideMaster1.xml.rels',
      relationships([
        { id: 'rId1', type: REL.slideLayout, target: '../slideLayouts/slideLayout1.xml' },
        { id: 'rId2', type: REL.theme, target: '../theme/theme1.xml' },
      ]),
    ],
    ['ppt/slideLayouts/slideLayout1.xml', LAYOUT],
    ['ppt/slideLayouts/_rels/slideLayout1.xml.rels', relationships([{ id: 'rId1', type: REL.slideMaster, target: '../slideMasters/slideMaster1.xml' }])],
    ['ppt/notesMasters/notesMaster1.xml', NOTES_MASTER],
    ['ppt/notesMasters/_rels/notesMaster1.xml.rels', relationships([{ id: 'rId1', type: REL.theme, target: '../theme/theme2.xml' }])],
    ['ppt/theme/theme1.xml', THEME],
    ['ppt/theme/theme2.xml', THEME],
    ['ppt/presProps.xml', `${XML_DECLARATION}<p:presentationPr ${NS}/>`],
    ['ppt/tableStyles.xml', `${XML_DECLARATION}<a:tblStyleLst xmlns:a="${A_NS}" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`],
    ...entries,
  ];
  if (core) all.push(['docProps/core.xml', core]);
  return zip(all);
}

/** The deck's size in EMU, scaled as a whole into the range PowerPoint accepts. */
function slideSize(width: number, height: number): { cx: number; cy: number } {
  let cx = Math.max(1, width) * EMU_PER_POINT;
  let cy = Math.max(1, height) * EMU_PER_POINT;
  const up = Math.max(1, MIN_SIDE / Math.min(cx, cy));
  cx *= up;
  cy *= up;
  const down = Math.min(1, MAX_SIDE / Math.max(cx, cy));
  cx *= down;
  cy *= down;
  return { cx: clampSide(cx), cy: clampSide(cy) };
}

function clampSide(n: number): number {
  return Math.min(MAX_SIDE, Math.max(MIN_SIDE, Math.round(n)));
}

/**
 * The picture filling the slide. When its shape differs from the slide's (a
 * landscape page in a portrait deck) it is fitted inside and centred rather
 * than stretched.
 */
function slideXml(picture: Picture, size: { cx: number; cy: number }): string {
  const aspect = picture.width > 0 && picture.height > 0 ? picture.width / picture.height : size.cx / size.cy;
  let cx = size.cx;
  let cy = size.cy;
  if (Math.abs(aspect / (size.cx / size.cy) - 1) > 0.01) {
    if (aspect > size.cx / size.cy) cy = Math.round(size.cx / aspect);
    else cx = Math.round(size.cy * aspect);
  }
  const x = Math.round((size.cx - cx) / 2);
  const y = Math.round((size.cy - cy) / 2);
  return (
    `${XML_DECLARATION}<p:sld ${NS}><p:cSld><p:spTree>${GROUP}` +
    `<p:pic><p:nvPicPr><p:cNvPr id="2" name="Page"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>` +
    `<p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
    `<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>` +
    `</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`
  );
}

/** A notes page: the slide's picture placeholder and the text, one paragraph per line. */
function notesXml(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const paragraphs = lines
    .map((line) => (line.trim() === '' ? '<a:p><a:endParaRPr lang="en-US"/></a:p>' : `<a:p><a:r><a:rPr lang="en-US" dirty="0"/><a:t>${escapeText(line)}</a:t></a:r></a:p>`))
    .join('');
  return (
    `${XML_DECLARATION}<p:notes ${NS}><p:cSld><p:spTree>${GROUP}` +
    `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr>` +
    `<p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp>` +
    `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>` +
    `<p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/>` +
    `<p:txBody><a:bodyPr/><a:lstStyle/>${paragraphs}</p:txBody></p:sp>` +
    `</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`
  );
}

const GROUP =
  '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
  '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';

const CLR_MAP = 'bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"';

const LEVEL = (tag: string, size: number) => `<a:${tag}><a:defRPr sz="${size}"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:${tag}>`;

const MASTER =
  `${XML_DECLARATION}<p:sldMaster ${NS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${GROUP}</p:spTree></p:cSld>` +
  `<p:clrMap ${CLR_MAP}/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>` +
  `<p:txStyles><p:titleStyle>${LEVEL('lvl1pPr', 4400)}</p:titleStyle><p:bodyStyle>${LEVEL('lvl1pPr', 2800)}</p:bodyStyle>` +
  `<p:otherStyle>${LEVEL('lvl1pPr', 1800)}</p:otherStyle></p:txStyles></p:sldMaster>`;

const LAYOUT =
  `${XML_DECLARATION}<p:sldLayout ${NS} type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${GROUP}</p:spTree></p:cSld>` +
  `<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;

const NOTES_MASTER =
  `${XML_DECLARATION}<p:notesMaster ${NS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${GROUP}` +
  `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr>` +
  `<p:nvPr><p:ph type="sldImg" idx="2"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="1143000"/><a:ext cx="5486400" cy="3086100"/></a:xfrm>` +
  `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln w="12700"><a:solidFill><a:prstClr val="black"/></a:solidFill></a:ln></p:spPr></p:sp>` +
  `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" sz="quarter" idx="3"/></p:nvPr></p:nvSpPr>` +
  `<p:spPr><a:xfrm><a:off x="685800" y="4400550"/><a:ext cx="5486400" cy="3600450"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>` +
  `<p:txBody><a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0"/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>` +
  `</p:spTree></p:cSld><p:clrMap ${CLR_MAP}/><p:notesStyle>${LEVEL('lvl1pPr', 1200)}</p:notesStyle></p:notesMaster>`;

const SCHEME_COLORS: ReadonlyArray<readonly [string, string]> = [
  ['accent1', '4472C4'],
  ['accent2', 'ED7D31'],
  ['accent3', 'A5A5A5'],
  ['accent4', 'FFC000'],
  ['accent5', '5B9BD5'],
  ['accent6', '70AD47'],
  ['hlink', '0563C1'],
  ['folHlink', '954F72'],
];

const FILL = (alpha = '') => `<a:solidFill><a:schemeClr val="phClr">${alpha}</a:schemeClr></a:solidFill>`;
const LINE = (w: number) => `<a:ln w="${w}" cap="flat" cmpd="sng" algn="ctr">${FILL()}<a:prstDash val="solid"/><a:miter lim="800000"/></a:ln>`;
const FONTS = (face: string) => `<a:latin typeface="${escapeAttr(face)}"/><a:ea typeface=""/><a:cs typeface=""/>`;

const THEME =
  `${XML_DECLARATION}<a:theme xmlns:a="${A_NS}" name="Office Theme"><a:themeElements>` +
  `<a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>` +
  `<a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>` +
  SCHEME_COLORS.map(([name, rgb]) => `<a:${name}><a:srgbClr val="${rgb}"/></a:${name}>`).join('') +
  `</a:clrScheme><a:fontScheme name="Office"><a:majorFont>${FONTS('Calibri Light')}</a:majorFont><a:minorFont>${FONTS('Calibri')}</a:minorFont></a:fontScheme>` +
  `<a:fmtScheme name="Office"><a:fillStyleLst>${FILL()}${FILL()}${FILL()}</a:fillStyleLst>` +
  `<a:lnStyleLst>${LINE(6350)}${LINE(12700)}${LINE(19050)}</a:lnStyleLst>` +
  `<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>` +
  `<a:bgFillStyleLst>${FILL()}${FILL()}${FILL()}</a:bgFillStyleLst></a:fmtScheme></a:themeElements>` +
  `<a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`;
