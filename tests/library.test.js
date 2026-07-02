import { describe, expect, it } from 'vitest';
import { GENERATORS } from '../src/core/generators.js';
import { analyzeRun } from '../src/core/measure.js';
import { SAMPLES, getSample } from '../src/samples/library.js';

describe('SAMPLES', () => {
  it('references a generator that exists in GENERATORS for every sample', () => {
    for (const sample of SAMPLES) {
      expect(GENERATORS).toHaveProperty(sample.generator);
    }
  });

  it('each sample measures to its intended complexity class', () => {
    for (const sample of SAMPLES) {
      const generate = GENERATORS[sample.generator];
      const { curveName } = analyzeRun(sample.source, sample.sizes, generate);
      expect(curveName, `${sample.name} -> ${curveName}`).toBe(sample.expectedCurve);
    }
  });

  it('has a unique name per sample', () => {
    // sample-library.js looks a sample up by `data-name` on click
    // (SAMPLES.find(s => s.name === button.dataset.name)) — a duplicate
    // name would make the second sample's button silently select the
    // first one instead.
    const names = SAMPLES.map((sample) => sample.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('has at least one sample that actually triggers detectRegression', () => {
    // The product's headline feature is catching a function whose growth
    // looks fine for small n and only reveals a worse complexity class
    // later — the library should prove that path works, not just the
    // steady-state curve fit.
    const generate = GENERATORS[getSample('Fast, until a fallback kicks in').generator];
    const { regression } = analyzeRun(
      getSample('Fast, until a fallback kicks in').source,
      getSample('Fast, until a fallback kicks in').sizes,
      generate
    );
    expect(regression.regressed).toBe(true);
    expect(regression.earlyCurve).toBe('O(n)');
    expect(regression.overallCurve).toBe('O(n^2)');
  });
});

describe('getSample', () => {
  it('finds a sample by exact name', () => {
    expect(getSample('Bubble sort')?.name).toBe('Bubble sort');
  });

  it('returns null for an unknown name', () => {
    expect(getSample('nonexistent')).toBeNull();
  });
});
