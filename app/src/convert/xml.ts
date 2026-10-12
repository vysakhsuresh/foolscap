/**
 * A small XML reader, and the escaping every writer shares.
 *
 * The converters run in the op worker, where there is no DOMParser, so Word,
 * Excel and EPUB files are read with this instead. It is built for the files
 * people actually have, which are not always tidy: by default it never
 * throws, it recovers from a stray closing tag or an unknown entity the way a
 * browser would, and the reader on top of it skips what it does not know.
 * `strict: true` turns every one of those recoveries into an XmlError, which
 * is how the tests prove that what the writers produce is well-formed.
 *
 * Namespaces are resolved, so a reader can tell `r:id` (a relationship) from
 * `w:id` (a bookmark) by what the prefix means rather than how it is spelled.
 * Most lookups go by local name alone, because the same element arrives under
 * the transitional and the strict OOXML namespaces and means the same thing.
 */

export interface XmlAttr {
  /** As written, prefix and all. */
  readonly name: string;
  readonly local: string;
  /** The namespace the prefix is bound to; '' for an unprefixed attribute. */
  readonly uri: string;
  readonly value: string;
}

export interface XmlElement {
  readonly name: string;
  readonly local: string;
  readonly uri: string;
  readonly attrs: readonly XmlAttr[];
  readonly children: XmlNode[];
}

/** An element, or a piece of text with entities already decoded. */
export type XmlNode = XmlElement | string;

export class XmlError extends Error {
  constructor(message: string, readonly offset: number) {
    super(`${message} at offset ${offset}`);
    this.name = 'XmlError';
  }
}

const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const XMLNS_NS = 'http://www.w3.org/2000/xmlns/';
const NAME = /[^\s/>=<"'!?]+/y;
const VALID_NAME = /^[A-Za-z_À-￿][\w.\-·-￿]*(?::[A-Za-z_À-￿][\w.\-·-￿]*)?$/;
const ENTITIES: Readonly<Record<string, string>> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

interface Open {
  readonly element: XmlElement;
  readonly scope: ReadonlyMap<string, string>;
}

/**
 * Parses a document and returns its root element. Lenient by default: a
 * document with no root at all comes back as an empty element named ''.
 */
export function parseXml(text: string, options: { strict?: boolean } = {}): XmlElement {
  const strict = options.strict === true;
  const fail = (message: string, at: number): void => {
    if (strict) throw new XmlError(message, at);
  };
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const n = src.length;
  const stack: Open[] = [];
  let root: XmlElement | undefined;
  const rootScope: ReadonlyMap<string, string> = new Map([['xml', XML_NS]]);
  let i = 0;

  const append = (node: XmlNode, at: number): void => {
    const top = stack[stack.length - 1];
    if (top) {
      top.element.children.push(node);
      return;
    }
    if (typeof node === 'string') {
      if (/\S/.test(node)) fail('Text outside the root element', at);
      return;
    }
    if (root) fail('A second root element', at);
    else root = node;
  };

  while (i < n) {
    const lt = src.indexOf('<', i);
    const end = lt === -1 ? n : lt;
    if (end > i) append(decodeEntities(src.slice(i, end), strict, i), i);
    if (lt === -1) break;
    i = lt;

    if (src.startsWith('<?', i)) {
      const close = src.indexOf('?>', i + 2);
      if (close === -1) {
        fail('An unterminated processing instruction', i);
        break;
      }
      i = close + 2;
      continue;
    }
    if (src.startsWith('<!--', i)) {
      const close = src.indexOf('-->', i + 4);
      if (close === -1) {
        fail('An unterminated comment', i);
        break;
      }
      i = close + 3;
      continue;
    }
    if (src.startsWith('<![CDATA[', i)) {
      const close = src.indexOf(']]>', i + 9);
      if (close === -1) {
        fail('An unterminated CDATA section', i);
        break;
      }
      if (stack.length === 0) fail('CDATA outside the root element', i);
      else append(src.slice(i + 9, close), i);
      i = close + 3;
      continue;
    }
    if (src.startsWith('<!', i)) {
      // A DOCTYPE, perhaps with an internal subset in brackets. Skipped whole.
      let depth = 0;
      let j = i + 2;
      for (; j < n; j++) {
        const c = src[j];
        if (c === '[') depth++;
        else if (c === ']') depth--;
        else if (c === '>' && depth <= 0) break;
      }
      if (j >= n) {
        fail('An unterminated declaration', i);
        break;
      }
      i = j + 1;
      continue;
    }
    if (src.startsWith('</', i)) {
      const close = src.indexOf('>', i + 2);
      if (close === -1) {
        fail('An unterminated closing tag', i);
        break;
      }
      const name = src.slice(i + 2, close).trim();
      const top = stack[stack.length - 1];
      if (top && top.element.name === name) {
        stack.pop();
      } else {
        fail(`A closing tag </${name}> that matches no open element`, i);
        // Recover the way a browser would: close up to the nearest match, or ignore it.
        let k = stack.length - 1;
        while (k >= 0 && stack[k]?.element.name !== name) k--;
        if (k >= 0) stack.length = k;
      }
      i = close + 1;
      continue;
    }

    // A start tag.
    const start = i;
    NAME.lastIndex = i + 1;
    const nameMatch = NAME.exec(src);
    if (!nameMatch) {
      fail('A "<" that starts no tag', i);
      append('<', i);
      i += 1;
      continue;
    }
    const tagName = nameMatch[0];
    if (!VALID_NAME.test(tagName)) fail(`An invalid element name "${tagName}"`, i);
    i = NAME.lastIndex;
    const raw: Array<[string, string]> = [];
    let selfClosing = false;
    let closed = false;
    while (i < n) {
      while (i < n && isSpace(src.charCodeAt(i))) i++;
      if (src[i] === '>') {
        i++;
        closed = true;
        break;
      }
      if (src.startsWith('/>', i)) {
        i += 2;
        selfClosing = true;
        closed = true;
        break;
      }
      NAME.lastIndex = i;
      const attrMatch = NAME.exec(src);
      if (!attrMatch) {
        fail('Unexpected character in a tag', i);
        i++;
        continue;
      }
      const attrName = attrMatch[0];
      if (!VALID_NAME.test(attrName)) fail(`An invalid attribute name "${attrName}"`, i);
      i = NAME.lastIndex;
      while (i < n && isSpace(src.charCodeAt(i))) i++;
      if (src[i] !== '=') {
        fail(`An attribute "${attrName}" with no value`, i);
        raw.push([attrName, '']);
        continue;
      }
      i++;
      while (i < n && isSpace(src.charCodeAt(i))) i++;
      const quote = src[i];
      let value: string;
      if (quote === '"' || quote === "'") {
        const close = src.indexOf(quote, i + 1);
        if (close === -1) {
          fail('An unterminated attribute value', i);
          value = src.slice(i + 1);
          i = n;
        } else {
          value = src.slice(i + 1, close);
          i = close + 1;
        }
        if (value.includes('<')) fail('A "<" inside an attribute value', i);
      } else {
        fail(`An unquoted value for "${attrName}"`, i);
        const m = /[^\s>]*/y;
        m.lastIndex = i;
        value = m.exec(src)?.[0] ?? '';
        i = m.lastIndex;
      }
      if (raw.some(([existing]) => existing === attrName)) fail(`A repeated attribute "${attrName}"`, i);
      raw.push([attrName, normaliseAttribute(decodeEntities(value, strict, i))]);
    }
    if (!closed) {
      fail('An unterminated start tag', start);
      break;
    }

    const parentScope = stack[stack.length - 1]?.scope ?? rootScope;
    let scope = parentScope;
    for (const [name, value] of raw) {
      if (name === 'xmlns' || name.startsWith('xmlns:')) {
        if (scope === parentScope) scope = new Map(parentScope);
        (scope as Map<string, string>).set(name === 'xmlns' ? '' : name.slice(6), value);
      }
    }
    const resolve = (name: string, isAttribute: boolean): { local: string; uri: string } => {
      const colon = name.indexOf(':');
      if (colon === -1) return { local: name, uri: isAttribute ? '' : (scope.get('') ?? '') };
      const prefix = name.slice(0, colon);
      const local = name.slice(colon + 1);
      if (prefix === 'xmlns') return { local, uri: XMLNS_NS };
      const uri = scope.get(prefix);
      if (uri === undefined) {
        fail(`An unbound namespace prefix "${prefix}"`, start);
        return { local, uri: '' };
      }
      return { local, uri };
    };
    const attrs: XmlAttr[] = raw.map(([name, value]) => ({ name, value, ...(name === 'xmlns' ? { local: 'xmlns', uri: XMLNS_NS } : resolve(name, true)) }));
    const element: XmlElement = { name: tagName, ...resolve(tagName, false), attrs, children: [] };
    append(element, start);
    // A second root in lenient mode is still read, so its end tag is found, but it stays out of the tree.
    if (!selfClosing) stack.push({ element, scope });
  }

  if (stack.length > 0) fail(`An unclosed element <${stack[stack.length - 1]?.element.name ?? ''}>`, n);
  if (!root) {
    fail('No root element', 0);
    return { name: '', local: '', uri: '', attrs: [], children: [] };
  }
  return root;
}

function isSpace(code: number): boolean {
  return code === 0x20 || code === 0x0a || code === 0x09 || code === 0x0d;
}

/** Attribute values have their literal whitespace turned into spaces, as the spec says. */
function normaliseAttribute(value: string): string {
  return value.replace(/[\t\n\r]/g, ' ');
}

/** Replaces entity and character references. An unknown one is kept as written (or refused in strict mode). */
function decodeEntities(text: string, strict: boolean, offset: number): string {
  if (!text.includes('&')) return text;
  return text.replace(/&([^;&\s<]{0,32});?/g, (whole, body: string) => {
    if (!whole.endsWith(';')) {
      if (strict) throw new XmlError('A bare "&"', offset);
      return whole;
    }
    if (body.startsWith('#')) {
      const code = body[1] === 'x' || body[1] === 'X' ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
      if (Number.isFinite(code) && code > 0 && code <= 0x10ffff) return String.fromCodePoint(code);
      if (strict) throw new XmlError(`A bad character reference "${whole}"`, offset);
      return whole;
    }
    const named = ENTITIES[body];
    if (named !== undefined) return named;
    if (strict) throw new XmlError(`An unknown entity "${whole}"`, offset);
    return whole;
  });
}

// ---- Reading helpers ----

/** The child elements, optionally only those with this local name. */
export function elements(el: XmlElement | undefined, local?: string): XmlElement[] {
  if (!el) return [];
  const out: XmlElement[] = [];
  for (const c of el.children) if (typeof c !== 'string' && (local === undefined || c.local === local)) out.push(c);
  return out;
}

/** The first child element with this local name. */
export function child(el: XmlElement | undefined, local: string): XmlElement | undefined {
  if (!el) return undefined;
  for (const c of el.children) if (typeof c !== 'string' && c.local === local) return c;
  return undefined;
}

/** Follows a path of local names, first match at each step. */
export function path(el: XmlElement | undefined, ...locals: string[]): XmlElement | undefined {
  let at = el;
  for (const local of locals) at = child(at, local);
  return at;
}

/** Every descendant element with this local name, in document order. */
export function descendants(el: XmlElement | undefined, local: string, out: XmlElement[] = []): XmlElement[] {
  if (!el) return out;
  for (const c of el.children) {
    if (typeof c === 'string') continue;
    if (c.local === local) out.push(c);
    descendants(c, local, out);
  }
  return out;
}

/**
 * An attribute by local name. With `uriPart`, only an attribute whose
 * namespace contains it: `attr(el, 'id', 'relationships')` is r:id and never
 * w:id.
 */
export function attr(el: XmlElement | undefined, local: string, uriPart?: string): string | undefined {
  if (!el) return undefined;
  for (const a of el.attrs) {
    if (a.local !== local) continue;
    if (uriPart === undefined || a.uri.includes(uriPart)) return a.value;
  }
  return undefined;
}

/** All the text inside an element, entities decoded. */
export function textOf(el: XmlElement | undefined): string {
  if (!el) return '';
  let out = '';
  for (const c of el.children) out += typeof c === 'string' ? c : textOf(c);
  return out;
}

// ---- Writing helpers ----

/**
 * Characters XML 1.0 cannot carry at all, not even as a reference, and lone
 * halves of a surrogate pair. Dropped rather than refused: a stray control
 * character in a PDF's text is noise, and the rest of the document matters.
 */
const NOT_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/** Text content, escaped. Every script stays as it is; the files are UTF-8. */
export function escapeText(text: string): string {
  return text.replace(NOT_XML, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** An attribute value, escaped for double quotes, with line breaks kept as references. */
export function escapeAttr(text: string): string {
  return escapeText(text).replace(/"/g, '&quot;').replace(/\n/g, '&#10;').replace(/\r/g, '&#13;').replace(/\t/g, '&#9;');
}

export const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
