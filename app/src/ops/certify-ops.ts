/**
 * Digital signature: a certificate the person already has (a .pfx or .p12
 * from their bank, their employer, or a government signing service) seals
 * the PDF the way Acrobat checks. The certificate and its password reach the
 * worker in this run's params, in memory only, and are gone when it ends.
 */
import { PdfError } from '../pdf/types';
import { CertificateError } from '../sign/errors';
import { baseName, failed, passwordFor, readInput, refused, store } from './common';
import type { DigitalSignParams, Op } from './op';

const day = (d: Date): string => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export const digitalSignOp: Op<DigitalSignParams> = {
  tool: 'digital-sign',
  arity: { kind: 'one' },
  title: () => 'Digital signature',
  async run(inputs, params, ctx) {
    const input = inputs[0];
    if (input === undefined || inputs.length !== 1) return [refused(inputs, 'Sign one PDF at a time.')];
    if (!(params.certificate instanceof Uint8Array) || params.certificate.length === 0) return [refused(inputs, 'Choose your certificate file (.pfx or .p12).')];
    try {
      let bytes = await readInput(ctx, input);
      // A signature is sealed into the file's bytes as they are, and a lock
      // would have to be redone around it, which breaks it. So a locked file
      // (its password typed on the page) or one that only restricts what may
      // be done is signed unlocked, and the result says so.
      let unlocked: 'password' | 'restrictions' | null = null;
      const probe = await ctx.surgeon.open(bytes.slice(), passwordFor(ctx, input));
      try {
        if (probe.wasEncrypted) {
          unlocked = ctx.passwords.has(input.id) ? 'password' : 'restrictions';
          bytes = await probe.save();
        }
      } finally {
        probe.close();
      }
      ctx.progress({ done: 0, total: 0, label: 'Signing…' });
      const location = params.location?.trim() ?? '';
      const result = await ctx.surgeon.signWithCertificate(bytes, params.certificate, params.password, {
        visible: params.visible,
        page: params.page === 'first' ? 'first' : 'last',
        ...(params.reason.trim() ? { reason: params.reason } : {}),
        ...(location ? { location } : {}),
      });
      if (!result.ok) {
        return [refused(inputs, `This certificate ran out on ${day(result.expired)}. A reader would mark the signature as not valid, so it was not used. Renew it with whoever issued it.`)];
      }
      const page = params.page === 'first' ? 'first' : 'last';
      const where = params.visible ? `shown at the foot of the ${page} page` : 'invisible on the page, listed in any reader’s signature panel';
      const lock =
        unlocked === 'password'
          ? '. The signed copy opens without the password: locking it again would break the signature'
          : unlocked === 'restrictions'
            ? '. Its printing and copying restrictions are gone: setting them again would break the signature'
            : '';
      return [await store(ctx, 'digital-sign', [input], `${baseName(input.name)} (signed).pdf`, result.bytes, `Signed by ${result.subject}, certificate from ${result.issuer}; ${where}${lock}`)];
    } catch (error) {
      if (error instanceof CertificateError) return [refused(inputs, error.message)];
      if (error instanceof PdfError && (error.code === 'encrypted' || error.code === 'wrong-password')) {
        return [refused(inputs, 'This PDF is locked with a password. Type it on the file above and tap Unlock, then sign it.')];
      }
      return [failed(error, inputs)];
    }
  },
};
