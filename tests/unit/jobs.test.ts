/**
 * The job runner's pure parts: the arity check that `run()` makes before a
 * job is posted, and the words the worker gives a thrown error.
 *
 * The worker itself — creation at load, the memory-backend MessagePort, cancel
 * as abort-then-terminate, JobCrashed on a worker that dies — exists only in
 * a browser; the e2e suite covers it.
 */
import { describe, expect, it } from 'vitest';
import { arityProblem, failureFor, TOO_LARGE, WENT_WRONG } from '../../app/src/jobs/protocol';
import { ArityError, OpCancelled } from '../../app/src/ops/op';
import { JobCrashed } from '../../app/src/jobs/types';
import { PdfError } from '../../app/src/pdf/types';

describe('arity', () => {
  it('one: exactly one input', () => {
    expect(arityProblem({ kind: 'one' }, 'Split', 1)).toBeNull();
    expect(arityProblem({ kind: 'one' }, 'Split', 0)).toBe('Pick a file first.');
    expect(arityProblem({ kind: 'one' }, 'Split', 2)).toBe('Split works on one file at a time. Pick just one.');
  });

  it('each: at least one input', () => {
    expect(arityProblem({ kind: 'each' }, 'Compress', 1)).toBeNull();
    expect(arityProblem({ kind: 'each' }, 'Compress', 40)).toBeNull();
    expect(arityProblem({ kind: 'each' }, 'Compress', 0)).toBe('Pick a file first.');
  });

  it('together: at least min inputs', () => {
    expect(arityProblem({ kind: 'together', min: 2 }, 'Merge', 2)).toBeNull();
    expect(arityProblem({ kind: 'together', min: 2 }, 'Merge', 5)).toBeNull();
    expect(arityProblem({ kind: 'together', min: 2 }, 'Merge', 1)).toBe('Merge needs at least 2 files. Add 1 more.');
    expect(arityProblem({ kind: 'together', min: 2 }, 'Merge', 0)).toBe('Merge needs at least 2 files. Add 2 more.');
    expect(arityProblem({ kind: 'together', min: 1 }, 'Stack', 0)).toBe('Pick a file first.');
  });

  it('is what ArityError carries', () => {
    const error = new ArityError(arityProblem({ kind: 'one' }, 'Split', 2) ?? '');
    expect(error.name).toBe('ArityError');
    expect(error.message).toBe('Split works on one file at a time. Pick just one.');
  });
});

describe('what the user is told when an op throws', () => {
  it('passes a PdfError through with its code', () => {
    const error = new PdfError('This file is locked with a password.', 'encrypted');
    expect(failureFor(error)).toEqual({ reason: 'This file is locked with a password.', code: 'encrypted' });
  });

  it('calls an allocation failure too large', () => {
    expect(failureFor(new RangeError('Array buffer allocation failed'))).toEqual({ reason: TOO_LARGE, code: 'too-large' });
  });

  it('gives any other error one plain sentence: no stack, no name, no library text', () => {
    const leaky = new TypeError("Cannot read properties of undefined (reading 'Lease agreement.pdf')");
    expect(failureFor(leaky)).toEqual({ reason: WENT_WRONG });
    expect(failureFor('a string')).toEqual({ reason: WENT_WRONG });
    expect(failureFor(undefined)).toEqual({ reason: WENT_WRONG });
    expect(WENT_WRONG).not.toMatch(/pdf-lib|Foolscap|Sheaf/);
  });
});

describe('the errors a job can reject with', () => {
  it('are told apart by name', () => {
    expect(new JobCrashed().name).toBe('JobCrashed');
    expect(new OpCancelled().name).toBe('OpCancelled');
    expect(new JobCrashed().message).toBe('The job stopped unexpectedly.');
  });
});
