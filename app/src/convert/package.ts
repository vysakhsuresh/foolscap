/**
 * The zip around every Office and EPUB file, and the plumbing the three Office
 * formats share: content types, relationships, core properties.
 *
 * What goes in is only what the document needs. There is no docProps/app.xml
 * (it exists to name the application that wrote the file, and these files
 * carry no such name), and core.xml is written only when there is a title to
 * put in it, so nothing records who or what made the file.
 */
import { unzipSync, zipSync, type Zippable } from 'fflate';
import { escapeAttr, escapeText, parseXml, XML_DECLARATION, type XmlElement, attr, elements } from './xml';

/** A part of the package: its path inside the zip and its content. */
export type Entry = readonly [path: string, content: string | Uint8Array];

const encoder = new TextEncoder();

/**
 * Zips the entries in the order given. Pictures are stored, not deflated:
 * PNG and JPEG are compressed already, and squeezing them again only costs
 * time on a slow phone. `stored` names other entries to leave uncompressed
 * (EPUB needs its mimetype that way).
 */
export function zip(entries: readonly Entry[], stored: ReadonlySet<string> = new Set()): Uint8Array {
  const files: Zippable = {};
  for (const [path, content] of entries) {
    const bytes = typeof content === 'string' ? encoder.encode(content) : content;
    const level = stored.has(path) || /\.(png|jpe?g)$/i.test(path) ? 0 : 6;
    files[path] = [bytes, { level }];
  }
  return zipSync(files);
}

/**
 * A package opened for reading. Part names in OOXML are case-insensitive and
 * may be written with or without a leading slash, so lookups forgive both.
 */
export class Package {
  private readonly parts = new Map<string, Uint8Array>();

  constructor(bytes: Uint8Array) {
    const files = unzipSync(bytes);
    for (const [name, data] of Object.entries(files)) this.parts.set(normalise(name), data);
  }

  bytes(path: string): Uint8Array | undefined {
    return this.parts.get(normalise(path));
  }

  /** A part parsed leniently; undefined when it is missing. */
  xml(path: string): XmlElement | undefined {
    const data = this.bytes(path);
    return data ? parseXml(decodeText(data)) : undefined;
  }

  /**
   * The relationships of a part, keyed by id, with targets resolved to part
   * paths (external targets are kept as written).
   */
  rels(partPath: string): Map<string, Relationship> {
    const slash = partPath.lastIndexOf('/');
    const dir = slash === -1 ? '' : partPath.slice(0, slash);
    const file = partPath.slice(slash + 1);
    const root = this.xml(`${dir ? `${dir}/` : ''}_rels/${file}.rels`);
    const out = new Map<string, Relationship>();
    for (const rel of elements(root, 'Relationship')) {
      const id = attr(rel, 'Id');
      const target = attr(rel, 'Target');
      if (id === undefined || target === undefined) continue;
      const external = attr(rel, 'TargetMode') === 'External';
      out.set(id, { type: attr(rel, 'Type') ?? '', target: external ? target : resolveTarget(dir, target), external });
    }
    return out;
  }

  /** The part the package-level relationship of this type points at. */
  main(typeSuffix: string): string | undefined {
    for (const rel of this.rels('').values()) if (rel.type.endsWith(typeSuffix) && !rel.external) return rel.target;
    return undefined;
  }
}

export interface Relationship {
  readonly type: string;
  /** A part path for an internal target, or the URL as written for an external one. */
  readonly target: string;
  readonly external: boolean;
}

function normalise(name: string): string {
  return name.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
}

/** Resolves a relationship target against the directory of the part that holds it. */
export function resolveTarget(dir: string, target: string): string {
  const decoded = safeDecode(target.split('#')[0] ?? '');
  const parts = decoded.startsWith('/') ? [] : dir.split('/').filter((p) => p.length > 0);
  for (const piece of decoded.split('/')) {
    if (piece === '' || piece === '.') continue;
    if (piece === '..') parts.pop();
    else parts.push(piece);
  }
  return parts.join('/');
}

function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/** XML parts are UTF-8 nearly always; a UTF-16 byte-order mark is honoured. */
export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  return new TextDecoder('utf-8').decode(bytes);
}

// ---- Writing OOXML plumbing ----

const RELS_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
export const REL = {
  officeDocument: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument',
  core: 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties',
  styles: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles',
  numbering: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering',
  settings: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings',
  image: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
  hyperlink: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink',
  worksheet: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet',
  sharedStrings: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings',
  theme: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme',
  slide: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide',
  slideLayout: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout',
  slideMaster: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster',
  notesSlide: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide',
  notesMaster: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster',
  presProps: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/presProps',
  tableStyles: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/tableStyles',
} as const;

export interface RelSpec {
  readonly id: string;
  readonly type: string;
  readonly target: string;
  readonly external?: boolean;
}

export function relationships(rels: readonly RelSpec[]): string {
  const body = rels
    .map((r) => `<Relationship Id="${escapeAttr(r.id)}" Type="${r.type}" Target="${escapeAttr(r.target)}"${r.external ? ' TargetMode="External"' : ''}/>`)
    .join('');
  return `${XML_DECLARATION}<Relationships xmlns="${RELS_NS}">${body}</Relationships>`;
}

/** [Content_Types].xml: defaults by extension, overrides by part name (with a leading slash). */
export function contentTypes(overrides: ReadonlyArray<readonly [part: string, type: string]>): string {
  const defaults =
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Default Extension="png" ContentType="image/png"/>' +
    '<Default Extension="jpeg" ContentType="image/jpeg"/>';
  const over = overrides.map(([part, type]) => `<Override PartName="${escapeAttr(part)}" ContentType="${type}"/>`).join('');
  return `${XML_DECLARATION}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${defaults}${over}</Types>`;
}

export const CORE_TYPE = 'application/vnd.openxmlformats-package.core-properties+xml';

/** docProps/core.xml holding the title and nothing else, or undefined when there is no title. */
export function coreProperties(title: string | undefined): string | undefined {
  if (title === undefined || title.trim() === '') return undefined;
  return (
    `${XML_DECLARATION}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ` +
    `xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${escapeText(title)}</dc:title></cp:coreProperties>`
  );
}

/** Sniffs the bytes rather than trusting a file name. */
export function imageFormat(bytes: Uint8Array): 'png' | 'jpeg' | undefined {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  return undefined;
}

/** Points to English Metric Units, which DrawingML measures in. */
export const EMU_PER_POINT = 12700;
