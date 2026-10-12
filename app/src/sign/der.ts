/**
 * A few small readers over asn1js, so the PKCS#12 and CMS code can say "the
 * second element, as an OID" instead of repeating instanceof checks. Every
 * reader throws on a shape it did not expect; the callers turn that into a
 * plain sentence for the person.
 */
import * as asn1js from 'asn1js';

export type Node = asn1js.BaseBlock;

/** WebCrypto wants bytes backed by a plain ArrayBuffer; copy when they are not. */
export function plain(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return bytes.buffer instanceof ArrayBuffer ? (bytes as Uint8Array<ArrayBuffer>) : new Uint8Array(bytes);
}

export function parseDer(bytes: Uint8Array): Node {
  const parsed = asn1js.fromBER(plain(bytes));
  if (parsed.offset === -1) throw new Error('Not ASN.1');
  return parsed.result;
}

export function children(node: Node | undefined): Node[] {
  if (node instanceof asn1js.Constructed) return node.valueBlock.value;
  throw new Error('Expected a constructed value');
}

export function child(node: Node | undefined, index: number): Node {
  const found = children(node)[index];
  if (found === undefined) throw new Error('Missing element');
  return found;
}

export function oid(node: Node | undefined): string {
  if (node instanceof asn1js.ObjectIdentifier) return node.valueBlock.toString();
  throw new Error('Expected an OID');
}

export function integer(node: Node | undefined): number {
  if (node instanceof asn1js.Integer) return Number(node.toBigInt());
  throw new Error('Expected an integer');
}

/** An OCTET STRING's bytes, joining the pieces when BER split it up (Java and some Windows exports do). */
export function octets(node: Node | undefined): Uint8Array {
  if (node instanceof asn1js.OctetString) return new Uint8Array(node.getValue());
  throw new Error('Expected an octet string');
}

/** The bytes of an IMPLICIT-tagged OCTET STRING, primitive or split into pieces. */
export function implicitOctets(node: Node | undefined): Uint8Array {
  if (node instanceof asn1js.Constructed) {
    const parts = node.valueBlock.value.map((part) => implicitOctets(part));
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) {
      out.set(p, at);
      at += p.length;
    }
    return out;
  }
  if (node instanceof asn1js.OctetString) return new Uint8Array(node.getValue());
  if (node instanceof asn1js.Primitive) return node.valueBlock.valueHexView.slice();
  throw new Error('Expected octets');
}

/** The value inside an EXPLICIT context tag [n]. */
export function explicit(node: Node | undefined, tag: number): Node {
  if (node instanceof asn1js.Constructed && node.idBlock.tagClass === 3 && node.idBlock.tagNumber === tag) {
    const inner = node.valueBlock.value[0];
    if (inner !== undefined) return inner;
  }
  throw new Error(`Expected [${tag}]`);
}

/** The exact bytes a node was read from. */
export function rawBytes(node: Node): Uint8Array {
  return node.valueBeforeDecodeView.slice();
}

export function isContextTag(node: Node | undefined, tag: number): boolean {
  return node !== undefined && node.idBlock.tagClass === 3 && node.idBlock.tagNumber === tag;
}

export function concat(...parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}
