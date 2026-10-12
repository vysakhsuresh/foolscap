/**
 * Digital signature: a certificate the person already has (a .pfx or .p12
 * from their bank, their employer, or a government signing service) seals
 * the PDF the way Acrobat checks. The certificate and its password reach the
 * worker in this run's params, in memory only, and are gone when it ends.
 */
import { PdfError } from '../pdf/types';
import { signPdf } from '../pdf/sign-pdf';
import { signDetached } from '../sign/cms';
import { CertificateError } from '../sign/errors';
import { readIdentity } from '../sign/identity';
import { baseName, failed, readInput, refused, store } from './common';
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
    let identity;
    try {
      ctx.progress({ done: 0, total: 0, label: 'Opening the certificate…' });
      identity = await readIdentity(params.certificate, params.password);
    } catch (error) {
      if (error instanceof CertificateError) return [refused(inputs, error.message)];
      return [refused(inputs, "This certificate couldn't be opened. Choose the .pfx or .p12 file you exported with your private key.")];
    }
    if (identity.expired) {
      return [refused(inputs, `This certificate ran out on ${day(identity.notAfter)}. A reader would mark the signature as not valid, so it was not used. Renew it with whoever issued it.`)];
    }
    try {
      const bytes = await readInput(ctx, input);
      let pages = 1;
      try {
        const doc = await ctx.surgeon.open(bytes.slice());
        pages = doc.pageCount;
        doc.close();
      } catch (error) {
        if (error instanceof PdfError && (error.code === 'encrypted' || error.code === 'wrong-password')) {
          return [refused(inputs, 'This PDF is locked with a password. Remove the password first, then sign it.')];
        }
        throw error;
      }
      ctx.progress({ done: 0, total: 0, label: 'Signing…' });
      const date = new Date();
      const reason = params.reason.trim();
      const signed = await signPdf(
        bytes,
        {
          page: pages - 1,
          name: identity.subject,
          date,
          ...(reason ? { reason } : {}),
          // Bottom right of the last page, where a signature is looked for.
          ...(params.visible ? { area: { x: 0.52, y: 0.84, w: 0.42, h: 0.1 } } : {}),
        },
        (data) => signDetached(identity, data, date),
      );
      const where = params.visible ? 'shown at the foot of the last page' : 'invisible on the page, listed in any reader’s signature panel';
      return [
        await store(ctx, 'digital-sign', [input], `${baseName(input.name)} (signed).pdf`, signed, `Signed by ${identity.subject}, certificate from ${identity.issuer}; ${where}`),
      ];
    } catch (error) {
      return [failed(error, inputs)];
    }
  },
};
