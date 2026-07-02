import { describe, expect, it } from 'vitest';
import { CURVES, bestFitCurve, fitError, normalizeCurve, pickAnchor } from '../src/core/curves.js';

describe('normalizeCurve', () => {
  it('scales a curve to pass through the given anchor point', () => {
    const linear = normalizeCurve(CURVES['O(n)'], 10, 50);
    expect(linear(10)).toBeCloseTo(50);
    expect(linear(20)).toBeCloseTo(100);
  });
});

describe('pickAnchor', () => {
  it('anchors to the first sample when the curve is non-zero there', () => {
    const samples = [{ n: 10, ops: 100 }, { n: 20, ops: 400 }];
    expect(pickAnchor(CURVES['O(n^2)'], samples)).toBe(samples[0]);
  });

  it('skips a sample where the curve evaluates to zero, e.g. O(log n) at n=1', () => {
    const samples = [{ n: 1, ops: 1 }, { n: 100, ops: 10 }, { n: 10000, ops: 20 }];
    expect(pickAnchor(CURVES['O(log n)'], samples)).toBe(samples[1]);
    expect(pickAnchor(CURVES['O(n log n)'], samples)).toBe(samples[1]);
  });

  it('falls back to the first sample if the curve is zero everywhere measured', () => {
    const samples = [{ n: 1, ops: 1 }];
    expect(pickAnchor(CURVES['O(log n)'], samples)).toBe(samples[0]);
  });
});

describe('fitError', () => {
  it('is near zero for a series that matches its curve exactly', () => {
    const samples = [10, 20, 40, 80].map((n) => ({ n, ops: n * n }));
    const error = fitError(CURVES['O(n^2)'], samples);
    expect(error).toBeCloseTo(0, 5);
  });

  it('is large for a series that does not match the curve', () => {
    const samples = [10, 20, 40, 80].map((n) => ({ n, ops: n ** 3 }));
    const error = fitError(CURVES['O(n)'], samples);
    expect(error).toBeGreaterThan(0);
  });
});

describe('bestFitCurve', () => {
  it('picks O(n^2) for a quadratic series', () => {
    const samples = [10, 20, 40, 80].map((n) => ({ n, ops: 3 * n * n }));
    const { name } = bestFitCurve(samples);
    expect(name).toBe('O(n^2)');
  });

  it('picks O(n log n) for a linearithmic series', () => {
    const samples = [16, 32, 64, 128, 256].map((n) => ({ n, ops: n * Math.log2(n) }));
    const { name } = bestFitCurve(samples);
    expect(name).toBe('O(n log n)');
  });

  it('picks O(1) for a constant series', () => {
    const samples = [10, 20, 40, 80].map((n) => ({ n, ops: 5 }));
    const { name } = bestFitCurve(samples);
    expect(name).toBe('O(1)');
  });

  it('returns no winner and an infinite error for an empty sample list', () => {
    expect(bestFitCurve([])).toEqual({ name: null, error: Infinity });
  });

  it('still picks O(log n) when the smallest measured size is 1', () => {
    // n=1 is a valid, ordinary size choice (the size picker allows it), but
    // log2(1) === 0 — normalizing to that point alone would collapse the
    // whole O(log n) curve to a flat zero line and corrupt the fit.
    const samples = [1, 100, 1000, 10000, 100000].map((n) => ({
      n,
      ops: Math.max(1, Math.log2(n) * 5),
    }));
    expect(bestFitCurve(samples).name).toBe('O(log n)');
  });

  it('still picks O(n log n) when the smallest measured size is 1', () => {
    const samples = [1, 100, 1000, 10000].map((n) => ({
      n,
      ops: Math.max(1, n * Math.log2(Math.max(n, 2))),
    }));
    expect(bestFitCurve(samples).name).toBe('O(n log n)');
  });
});
