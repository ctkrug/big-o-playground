// The hero: a devicePixelRatio-aware canvas plotting measured op-count vs.
// input size on log-log axes, gridlined like graph paper, with the
// best-fit reference curve overlaid and a staggered point-reveal per
// docs/DESIGN.md's juice plan.

import { normalizeCurve, pickAnchor } from '../core/curves.js';

const PADDING = { top: 24, right: 28, bottom: 40, left: 64 };

/** The [min, max] domain for a log-scaled axis, widened to a visible span when all values are equal. */
function logAxisDomain(values) {
  const positive = values.filter((v) => Number.isFinite(v) && v > 0);
  if (positive.length === 0) return [1, 10];
  const min = Math.min(...positive);
  const max = Math.max(...positive);
  return min === max ? [min * 0.5, max * 2] : [min, max];
}

/**
 * Computes the n-axis and ops-axis domains for a plot: the n range spans
 * the samples' sizes; the ops range spans both the measured samples and
 * the reference curve (normalized to the first sample) so the overlay
 * never clips outside the viewport.
 */
export function computeDomain(samples, curveFn) {
  if (!samples || samples.length === 0) {
    return { nDomain: [1, 10], opsDomain: [1, 10] };
  }
  const ns = samples.map((s) => s.n);
  const opsValues = samples.map((s) => s.ops);
  let curveValues = [];
  if (curveFn) {
    const anchor = pickAnchor(curveFn, samples);
    const normalized = normalizeCurve(curveFn, anchor.n, Math.max(anchor.ops, 1));
    curveValues = samples.map((s) => normalized(s.n));
  }
  return {
    nDomain: logAxisDomain(ns),
    opsDomain: logAxisDomain([...opsValues, ...curveValues]),
  };
}

/** Maps a value onto a pixel range using a log10 scale over `domain`. Values below the domain floor to it. */
export function mapLog(value, domain, range) {
  const [domainMin, domainMax] = domain;
  const [rangeStart, rangeEnd] = range;
  const safeMin = Math.max(domainMin, 1e-6);
  const safeMax = Math.max(domainMax, safeMin * 10);
  const logMin = Math.log10(safeMin);
  const logMax = Math.log10(safeMax);
  const clamped = Math.max(value, safeMin);
  const t = logMax === logMin ? 0 : (Math.log10(clamped) - logMin) / (logMax - logMin);
  return rangeStart + t * (rangeEnd - rangeStart);
}

function plotArea(width, height) {
  return {
    x: PADDING.left,
    y: PADDING.top,
    width: Math.max(1, width - PADDING.left - PADDING.right),
    height: Math.max(1, height - PADDING.top - PADDING.bottom),
  };
}

function niceLogTicks([min, max]) {
  const start = Math.floor(Math.log10(Math.max(min, 1e-6)));
  const end = Math.ceil(Math.log10(Math.max(max, min * 10)));
  const ticks = [];
  for (let exp = start; exp <= end; exp += 1) ticks.push(10 ** exp);
  return ticks;
}

function drawGrid(ctx, area, nDomain, opsDomain, canvasWidth) {
  ctx.strokeStyle = 'rgba(30, 74, 115, 0.6)';
  ctx.lineWidth = 1;
  ctx.font = '11px "JetBrains Mono", monospace';
  ctx.fillStyle = '#8fb0d1';

  for (const tick of niceLogTicks(nDomain)) {
    const x = mapLog(tick, nDomain, [area.x, area.x + area.width]);
    ctx.beginPath();
    ctx.moveTo(x, area.y);
    ctx.lineTo(x, area.y + area.height);
    ctx.stroke();
    const label = formatTick(tick);
    const labelX = Math.min(x + 4, canvasWidth - ctx.measureText(label).width - 2);
    ctx.fillText(label, labelX, area.y + area.height + 16);
  }

  for (const tick of niceLogTicks(opsDomain)) {
    const y = mapLog(tick, opsDomain, [area.y + area.height, area.y]);
    ctx.beginPath();
    ctx.moveTo(area.x, y);
    ctx.lineTo(area.x + area.width, y);
    ctx.stroke();
    ctx.fillText(formatTick(tick), 4, y - 4);
  }
}

export function formatTick(value) {
  if (value >= 1_000_000_000_000) return `${value / 1_000_000_000_000}T`;
  if (value >= 1_000_000_000) return `${value / 1_000_000_000}B`;
  if (value >= 1_000_000) return `${value / 1_000_000}M`;
  if (value >= 1_000) return `${value / 1_000}k`;
  return String(value);
}

function drawCurve(ctx, area, nDomain, opsDomain, normalizedCurveFn, samples) {
  ctx.save();
  ctx.strokeStyle = '#5ec8f2';
  ctx.lineWidth = 1.5;
  ctx.shadowColor = 'rgba(94, 200, 242, 0.35)';
  ctx.shadowBlur = 6;
  ctx.beginPath();
  const nMin = samples[0].n;
  const nMax = samples[samples.length - 1].n;
  const STEPS = 40;
  for (let i = 0; i <= STEPS; i += 1) {
    const logN = Math.log10(nMin) + (i / STEPS) * (Math.log10(nMax) - Math.log10(nMin));
    const n = 10 ** logN;
    const x = mapLog(n, nDomain, [area.x, area.x + area.width]);
    const y = mapLog(normalizedCurveFn(n), opsDomain, [area.y + area.height, area.y]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawPoint(ctx, area, nDomain, opsDomain, sample, isRegressed) {
  const x = mapLog(sample.n, nDomain, [area.x, area.x + area.width]);
  const y = mapLog(Math.max(sample.ops, 1), opsDomain, [area.y + area.height, area.y]);
  ctx.save();
  ctx.fillStyle = isRegressed ? '#ff6b6b' : '#ffb454';
  if (!isRegressed) {
    ctx.shadowColor = 'rgba(255, 180, 84, 0.4)';
    ctx.shadowBlur = 8;
  }
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawEmptyState(ctx, width, height) {
  ctx.save();
  ctx.fillStyle = '#8fb0d1';
  ctx.font = '14px "Inter", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Paste a function and press Measure to plot its growth.', width / 2, height / 2);
  ctx.restore();
}

/**
 * Creates a plot bound to a canvas element. `resize()` should be called on
 * mount and on container resize (devicePixelRatio-aware); `render(state)`
 * redraws the grid, curve overlay, and revealed points.
 */
export function createPlot(canvas) {
  const ctx = canvas.getContext && canvas.getContext('2d');

  function resize() {
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function render({ samples = [], curveFn = null, revealCount = samples.length, regression = null } = {}) {
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    ctx.clearRect(0, 0, width, height);

    if (samples.length === 0) {
      drawEmptyState(ctx, width, height);
      return;
    }

    const area = plotArea(width, height);
    const { nDomain, opsDomain } = computeDomain(samples, curveFn);
    drawGrid(ctx, area, nDomain, opsDomain, width);

    if (curveFn && samples.length > 0) {
      const anchor = pickAnchor(curveFn, samples);
      const normalized = normalizeCurve(curveFn, anchor.n, Math.max(anchor.ops, 1));
      drawCurve(ctx, area, nDomain, opsDomain, normalized, samples);
    }

    samples.slice(0, revealCount).forEach((sample) => {
      const isRegressed = !!regression?.regressed && sample.n >= regression.divergesAfter;
      drawPoint(ctx, area, nDomain, opsDomain, sample, isRegressed);
    });
  }

  return { resize, render };
}
