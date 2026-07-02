import { describe, expect, it } from 'vitest';
import {
  InstrumentationError,
  compileInstrumented,
  runInstrumented,
} from '../src/core/dynamic-instrument.js';
import { MAX_SIZE } from '../src/ui/size-picker.js';

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

  it('only counts the branch actually taken by a ternary expression', () => {
    // A ternary embedded in a single statement (as opposed to an if/else,
    // which already instruments each branch separately) used to be summed
    // statically for both arms regardless of which one ran.
    const src = '(x) => x > 0 ? (x + 1) : (x - 1 + x - 1 + x - 1)';
    const truthy = runInstrumented(src, 5);
    const falsy = runInstrumented(src, -5);
    expect(truthy.ops).toBeLessThan(falsy.ops);
  });

  it('correctly counts a ternary nested inside another ternary branch', () => {
    const src = 'function f(x) { return x > 10 ? (x + 1) : (x > 0 ? (x + x) : (x - 1 - 1 - 1 - 1)); }';
    const outerTrue = runInstrumented(src, 20);
    const innerTrue = runInstrumented(src, 5);
    const bothFalse = runInstrumented(src, -5);
    expect(outerTrue.ops).toBeLessThan(innerTrue.ops);
    expect(innerTrue.ops).toBeLessThan(bothFalse.ops);
  });

  it('counts exactly the comparisons actually evaluated in a chained ternary ladder', () => {
    // A common real-world pattern (a threshold/priority ladder). Each rung
    // only evaluates as many comparisons as it takes to land on the taken
    // branch, so the op count should match that exactly rather than
    // including every rung's comparison regardless of which one is hit.
    const src = 'function f(x) { return x > 10 ? 1 : x > 5 ? 2 : x > 0 ? 3 : 4; }';
    // x=7 evaluates `x > 10` (false) then `x > 5` (true): 2 comparisons.
    expect(runInstrumented(src, 7)).toMatchObject({ result: 2, ops: 2 });
    // x=-1 evaluates all three comparisons before landing on the final else.
    expect(runInstrumented(src, -1)).toMatchObject({ result: 4, ops: 3 });
  });

  it('does not yet account for optional chaining short-circuiting the rest of a chain', () => {
    // Documents a known gap (see docs/ARCHITECTURE.md): unlike ternaries and
    // &&/||/??, each `?.` link in a chain is counted unconditionally, so a
    // chain that short-circuits early still reports the same op count as
    // one that evaluates in full. If this ever starts failing because the
    // counts diverge, this limitation has been fixed — update the docs and
    // loosen/replace this test rather than treating the failure as a
    // regression.
    const src = 'function f(o) { return o?.a?.b?.c?.d; }';
    const shortCircuited = runInstrumented(src, null);
    const fullyEvaluated = runInstrumented(src, { a: { b: { c: { d: 5 } } } });
    expect(shortCircuited.ops).toBe(fullyEvaluated.ops);
  });

  it('does not count a short-circuited operand of && or ||', () => {
    const src = `function f({ flag, arr }) {
      return flag && (arr[0] + arr[0] + arr[0] + arr[0]);
    }`;
    const shortCircuited = runInstrumented(src, { flag: false, arr: [] });
    const evaluated = runInstrumented(src, { flag: true, arr: [1] });
    expect(shortCircuited.ops).toBeLessThan(evaluated.ops);
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

  it('only instruments the case actually taken in a switch statement', () => {
    const src = `function f(x) {
      let r = 0;
      switch (x) {
        case 1: r = x + 1; break;
        case 2: r = x * 2 + 1; break;
        default: r = x - 1;
      }
      return r;
    }`;
    const caseOne = runInstrumented(src, 1);
    const caseTwo = runInstrumented(src, 2);
    expect(caseOne.result).toBe(2);
    expect(caseTwo.result).toBe(5);
    expect(caseTwo.ops).toBeGreaterThan(caseOne.ops);
  });

  it('counts ops in the try block, the taken catch, and the finalizer', () => {
    const src = `function f(x) {
      let r = 0;
      try {
        r = x + 1;
        if (x < 0) throw new Error('neg');
      } catch (e) {
        r = x - 1;
      } finally {
        r = r + 1;
      }
      return r;
    }`;
    const noThrow = runInstrumented(src, 5);
    const threw = runInstrumented(src, -5);
    expect(noThrow.result).toBe(7);
    expect(threw.result).toBe(-5);
  });

  it('scales ops with iterations of a for-of loop', () => {
    const src = 'function f(arr) { let sum = 0; for (const x of arr) { sum += x; } return sum; }';
    const small = runInstrumented(src, [1, 2]);
    const large = runInstrumented(src, [1, 2, 3, 4, 5]);
    expect(small.result).toBe(3);
    expect(large.result).toBe(15);
    expect(large.ops).toBeGreaterThan(small.ops);
  });

  it('scales ops with the number of enumerable keys in a for-in loop', () => {
    const src = 'function f(obj) { let count = 0; for (const k in obj) { count += 1; } return count; }';
    const { result, ops } = runInstrumented(src, { a: 1, b: 2, c: 3 });
    expect(result).toBe(3);
    expect(ops).toBe(3);
  });

  it('honors a labeled continue across nested loops', () => {
    const src = `function f(n) {
      let count = 0;
      outer: for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (j > 2) continue outer;
          count += 1;
        }
      }
      return count;
    }`;
    const { result } = runInstrumented(src, 5);
    expect(result).toBe(15);
  });

  it('rejects source that shadows the instrumentation engine\'s own __ops counter', () => {
    // Without this guard, a local `let __ops = ...` shadows the injected
    // counter for the rest of that scope: the reported op count silently
    // reads back as 0, and the pasted function's own return value is
    // corrupted too, since every injected `__ops += N` mutates the user's
    // variable instead of the real counter.
    try {
      runInstrumented('function f(n) { let __ops = 100; return __ops + n; }', 6);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(InstrumentationError);
      expect(err.kind).toBe('parse');
      expect(err.message).toMatch(/__ops/);
    }
  });

  it('rejects source that shadows the __iter or __iterCap iteration-cap variables', () => {
    expect(() => runInstrumented('function f(n) { let __iter = 0; return n; }', 6)).toThrow(
      InstrumentationError
    );
    expect(() => runInstrumented('function f(n) { let __iterCap = 0; return n; }', 6)).toThrow(
      InstrumentationError
    );
  });

  it('rejects a destructured parameter that binds a reserved name', () => {
    try {
      runInstrumented('function f({ __ops }) { return __ops; }', { __ops: 1 });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(InstrumentationError);
      expect(err.kind).toBe('parse');
      expect(err.message).toMatch(/__ops/);
    }
  });

  it('rejects a catch clause parameter that binds a reserved name', () => {
    expect(() =>
      runInstrumented('function f(n) { try { return n; } catch (__iter) { return 0; } }', 6)
    ).toThrow(InstrumentationError);
  });

  it('rejects a nested function parameter that binds a reserved name', () => {
    // A callback's own __ops parameter would shadow the shared counter only
    // within that callback's body, silently zeroing out its contribution.
    expect(() =>
      runInstrumented('function f(arr) { return arr.map(function (__ops) { return __ops + 1; }); }', [1, 2])
    ).toThrow(InstrumentationError);
  });

  it('does not reject a reserved name that only appears in a string literal or as a property', () => {
    // Only actual variable/parameter *bindings* can shadow the injected
    // counters; text that merely mentions "__ops" elsewhere is harmless.
    const src = 'function f(n) { const label = "__ops total"; return { __ops: n }.__ops; }';
    const { result, ops } = runInstrumented(src, 6);
    expect(result).toBe(6);
    expect(ops).toBeGreaterThan(0);
  });

  it('does not false-positive on ordinary names that merely contain "ops"', () => {
    const { result, ops } = runInstrumented('function f(n) { let opsCounter = 5; return opsCounter + n; }', 6);
    expect(result).toBe(11);
    expect(ops).toBeGreaterThan(0);
  });

  it('rejects a generator function instead of silently measuring zero ops', () => {
    try {
      runInstrumented('function* f(arr) { for (const x of arr) yield x; }', [1, 2, 3]);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(InstrumentationError);
      expect(err.kind).toBe('parse');
      expect(err.message).toMatch(/generator/i);
    }
  });

  it('rejects an async function instead of measuring only its pre-await ops', () => {
    try {
      runInstrumented('async function f(x) { return x + 1; }', 5);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(InstrumentationError);
      expect(err.kind).toBe('parse');
      expect(err.message).toMatch(/async/i);
    }
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

  it('does not misclassify an ordinary O(n) loop at the largest allowed size as a runaway loop', () => {
    // The size picker's MAX_SIZE and the default iteration cap are two
    // independent safety limits — they need to stay compatible, or a
    // perfectly correct linear scan at a UI-legal size gets rejected as
    // "likely an infinite loop."
    const src = 'function sum(arr) { let t = 0; for (let i = 0; i < arr.length; i++) { t += arr[i]; } return t; }';
    const arr = new Array(MAX_SIZE).fill(1);
    const { result } = runInstrumented(src, arr);
    expect(result).toBe(MAX_SIZE);
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
