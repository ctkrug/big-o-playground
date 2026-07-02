import { describe, expect, it } from 'vitest';
import {
  InstrumentationError,
  compileInstrumented,
  runInstrumented,
} from '../src/core/dynamic-instrument.js';

describe('runInstrumented', () => {
  it('returns the function result alongside its measured op count', () => {
    const { result, ops } = runInstrumented('(a) => a + 1', 2);
    expect(result).toBe(3);
    expect(ops).toBeGreaterThan(0);
  });

  it('scales measured ops with loop iterations', () => {
    const src = 'function sumTo(n) { let t = 0; for (let i = 0; i < n; i++) { t += i; } return t; }';
    const small = runInstrumented(src, 10).ops;
    const large = runInstrumented(src, 1000).ops;
    expect(large).toBeGreaterThan(small * 50);
  });

  it('accumulates ops across recursive calls', () => {
    const src = 'function fib(n) { if (n < 2) return n; return fib(n - 1) + fib(n - 2); }';
    const { result, ops } = runInstrumented(src, 10);
    expect(result).toBe(55);
    expect(ops).toBeGreaterThan(50);
  });

  it('only counts the branch actually taken', () => {
    const src = `(x) => {
      if (x > 0) { return x + 1; }
      return x - 1 - 1 - 1;
    }`;
    const positive = runInstrumented(src, 5);
    const negative = runInstrumented(src, -5);
    expect(positive.ops).toBeLessThan(negative.ops);
  });

  it('counts operations inside an inline callback when invoked', () => {
    const src = '(arr) => arr.map((x) => x * 2).reduce((a, b) => a + b, 0)';
    const { result, ops } = runInstrumented(src, [1, 2, 3, 4, 5]);
    expect(result).toBe(30);
    expect(ops).toBeGreaterThan(5);
  });

  it('resets the op counter between separate calls of a compiled function', () => {
    const run = compileInstrumented('(n) => { let t = 0; for (let i = 0; i < n; i++) t += i; return t; }');
    const first = run(100);
    const second = run(10);
    expect(second.ops).toBeLessThan(first.ops);
  });

  it('surfaces a parse failure as an InstrumentationError of kind parse', () => {
    expect(() => runInstrumented('function( {{{', 1)).toThrow(InstrumentationError);
    try {
      runInstrumented('function( {{{', 1);
    } catch (err) {
      expect(err.kind).toBe('parse');
    }
  });

  it('surfaces a thrown error from the pasted function as a runtime InstrumentationError', () => {
    try {
      runInstrumented('() => { throw new Error("boom"); }', null);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(InstrumentationError);
      expect(err.kind).toBe('runtime');
      expect(err.message).toContain('boom');
    }
  });

  it('surfaces a non-Error thrown value with a readable message', () => {
    try {
      runInstrumented('() => { throw "boom"; }', null);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(InstrumentationError);
      expect(err.kind).toBe('runtime');
      expect(err.message).toBe('boom');
    }
  });

  it('falls back to a generic message when an Error is thrown with none', () => {
    try {
      runInstrumented('() => { throw new Error(); }', null);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(InstrumentationError);
      expect(err.kind).toBe('runtime');
      expect(err.message).not.toBe('');
    }
  });

  it('trips the iteration cap on a runaway loop instead of hanging', () => {
    try {
      runInstrumented('() => { let i = 0; while (true) { i++; } }', null, { maxIterations: 1000 });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(InstrumentationError);
      expect(err.kind).toBe('runtime');
      expect(err.message).toMatch(/operation limit/i);
    }
  });
});
