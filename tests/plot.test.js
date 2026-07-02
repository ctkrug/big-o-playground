// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { CURVES } from '../src/core/curves.js';
import { computeDomain, createPlot, mapLog } from '../src/ui/plot.js';

describe('computeDomain', () => {
  it('spans the min and max n and ops across samples', () => {
    const samples = [
      { n: 10, ops: 5 },
      { n: 100, ops: 50 },
      { n: 1000, ops: 500 },
    ];
    const { nDomain, opsDomain } = computeDomain(samples, null);
    expect(nDomain).toEqual([10, 1000]);
    expect(opsDomain).toEqual([5, 500]);
  });

  it('widens the domain when every sample has the same value', () => {
    const samples = [{ n: 10, ops: 5 }, { n: 10, ops: 5 }];
    const { nDomain, opsDomain } = computeDomain(samples, null);
    expect(nDomain[0]).toBeLessThan(10);
    expect(nDomain[1]).toBeGreaterThan(10);
    expect(opsDomain[0]).toBeLessThan(5);
    expect(opsDomain[1]).toBeGreaterThan(5);
  });

  it('widens the ops domain to include the normalized reference curve', () => {
    const samples = [
      { n: 10, ops: 10 },
      { n: 1000, ops: 20 },
    ];
    // O(n) normalized to (10, 10) predicts 1000 at n=1000 — far above the
    // measured 20, so the domain must stretch to include it.
    const { opsDomain } = computeDomain(samples, CURVES['O(n)']);
    expect(opsDomain[1]).toBeGreaterThanOrEqual(1000);
  });

  it('falls back to a default domain for an empty sample list', () => {
    expect(computeDomain([], null)).toEqual({ nDomain: [1, 10], opsDomain: [1, 10] });
  });
});

describe('mapLog', () => {
  it('maps the domain minimum to the range start', () => {
    expect(mapLog(10, [10, 1000], [0, 100])).toBeCloseTo(0);
  });

  it('maps the domain maximum to the range end', () => {
    expect(mapLog(1000, [10, 1000], [0, 100])).toBeCloseTo(100);
  });

  it('maps the geometric midpoint to the range midpoint', () => {
    expect(mapLog(100, [10, 1000], [0, 100])).toBeCloseTo(50);
  });

  it('clamps values below the domain to the range start', () => {
    expect(mapLog(0, [10, 1000], [0, 100])).toBeCloseTo(0);
  });
});

function createFakeCanvas({ width = 800, height = 400 } = {}) {
  const ctx = {
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    arc: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 20 })),
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
  };
  const canvas = document.createElement('canvas');
  canvas.getContext = () => ctx;
  canvas.getBoundingClientRect = () => ({ width, height, top: 0, left: 0, right: width, bottom: height });
  return { canvas, ctx };
}

describe('createPlot', () => {
  it('draws an empty-state message when there are no samples', () => {
    const { canvas, ctx } = createFakeCanvas();
    const plot = createPlot(canvas);
    plot.render({ samples: [] });
    expect(ctx.fillText).toHaveBeenCalled();
    expect(ctx.arc).not.toHaveBeenCalled();
  });

  it('draws one point per revealed sample', () => {
    const { canvas, ctx } = createFakeCanvas();
    const plot = createPlot(canvas);
    const samples = [
      { n: 10, ops: 10 },
      { n: 100, ops: 100 },
      { n: 1000, ops: 1000 },
    ];
    plot.render({ samples, revealCount: 2 });
    expect(ctx.arc).toHaveBeenCalledTimes(2);
  });

  it('resize sets canvas backing-store size to CSS size times devicePixelRatio', () => {
    const { canvas, ctx } = createFakeCanvas({ width: 200, height: 100 });
    vi.stubGlobal('devicePixelRatio', 2);
    const plot = createPlot(canvas);
    plot.resize();
    expect(canvas.width).toBe(400);
    expect(canvas.height).toBe(200);
    expect(ctx.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
    vi.unstubAllGlobals();
  });

  it('does not throw when the canvas has no 2D context available', () => {
    const canvas = document.createElement('canvas');
    canvas.getContext = () => null;
    const plot = createPlot(canvas);
    expect(() => plot.resize()).not.toThrow();
    expect(() => plot.render({ samples: [{ n: 10, ops: 5 }] })).not.toThrow();
  });
});
