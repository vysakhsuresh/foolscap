/**
 * What can go wrong opening a certificate file, as a name the page can switch
 * on and a sentence it can show as it is. The sentence never carries the file
 * name or anything read from inside the file: an Error can end up in places a
 * name must never go (CLAUDE.md, promise 8).
 */
export type CertificateProblem =
  /** The password did not open the file. */
  | 'WrongPassword'
  /** The bytes are not a certificate file, or one damaged beyond reading. */
  | 'NotACertificate'
  /** A certificate file, but locked or keyed in a way this site cannot handle. */
  | 'Unsupported'
  /** A certificate with no private key beside it: it can be checked against, not signed with. */
  | 'NoPrivateKey';

export class CertificateError extends Error {
  override readonly name: CertificateProblem;

  constructor(name: CertificateProblem, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = name;
  }
}

export const wrongPassword = (): CertificateError => new CertificateError('WrongPassword', "That password didn't open the certificate.");

export const notACertificate = (cause?: unknown): CertificateError =>
  new CertificateError(
    'NotACertificate',
    "This doesn't look like a certificate file. Choose the .pfx or .p12 file you exported with your private key.",
    cause === undefined ? undefined : { cause },
  );

export const unsupported = (what: string): CertificateError => new CertificateError('Unsupported', what);
