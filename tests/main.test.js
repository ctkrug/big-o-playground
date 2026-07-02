// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('main entrypoint', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    vi.resetModules();
    // Every import triggers an initial staggered-reveal animation on real
    // timers; without fake timers + a full drain here, that chain keeps
    // firing into later tests and pollutes their timer counts.
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('renders the wordmark into #app', async () => {
    await import('../src/main.js');
    const app = document.getElementById('app');
    const h1 = app.querySelector('h1');
    expect(h1.textContent.trim().replace(/\s+/g, ' ')).toBe('Big-O Playground');
  });

  it('renders the function editor, size picker, and sample library', async () => {
    await import('../src/main.js');
    const app = document.getElementById('app');
    expect(app.querySelector('#fn-source')).not.toBeNull();
    expect(app.querySelector('#size-input')).not.toBeNull();
    expect(app.querySelectorAll('.sample-button').length).toBeGreaterThan(0);
  });

  it('runs an initial measurement and reports a fit label', async () => {
    await import('../src/main.js');
    const app = document.getElementById('app');
    expect(app.querySelector('.fit-label').textContent).not.toBe('');
  });

  it('cancels a still-animating reveal when a new sample is picked mid-animation', async () => {
    await import('../src/main.js');
    const app = document.getElementById('app');

    // Kick off the initial-load reveal, then interrupt it partway through by
    // loading a different sample — without a cancellation guard this would
    // leave two staggered-reveal timer chains scheduled at once.
    vi.advanceTimersByTime(40);
    app.querySelectorAll('.sample-button')[1].click(); // Bubble sort

    expect(vi.getTimerCount()).toBeLessThanOrEqual(1);

    vi.runAllTimers();
    expect(app.querySelector('.fit-label').textContent).toContain('O(n^2)');
  });

  it('runs a measurement on Ctrl+Enter from the editor', async () => {
    await import('../src/main.js');
    const app = document.getElementById('app');
    vi.runAllTimers();

    app.querySelector('.fit-label').textContent = '';
    const textarea = app.querySelector('#fn-source');
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
    vi.runAllTimers();

    expect(app.querySelector('.fit-label').textContent).not.toBe('');
  });

  it('does not run a measurement on a plain Enter without a modifier key', async () => {
    await import('../src/main.js');
    const app = document.getElementById('app');
    vi.runAllTimers();

    const fitLabel = app.querySelector('.fit-label');
    const before = fitLabel.textContent;
    const textarea = app.querySelector('#fn-source');
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    vi.runAllTimers();

    // A plain Enter is a normal newline keystroke in the textarea — it
    // must not double as the measure shortcut, or every multi-line paste
    // would keep re-triggering a run mid-edit.
    expect(fitLabel.textContent).toBe(before);
  });

  it('shows a friendly prompt instead of "closest match: null" when every size is removed', async () => {
    await import('../src/main.js');
    const app = document.getElementById('app');

    let removeButton;
    while ((removeButton = app.querySelector('.chip__remove'))) {
      removeButton.click();
    }
    app.querySelector('.measure-button').click();

    const label = app.querySelector('.fit-label').textContent;
    expect(label).not.toContain('null');
    expect(label).toBe('Add at least one input size to measure.');
  });

  it('does not claim a curve fit from a single measured size', async () => {
    await import('../src/main.js');
    const app = document.getElementById('app');

    // Removing all but one chip leaves a single sample, which normalizes
    // exactly onto every reference curve — a false-confidence trap. The
    // label should ask for more data instead of naming a curve.
    let removeButtons = app.querySelectorAll('.chip__remove');
    while (removeButtons.length > 1) {
      removeButtons[0].click();
      removeButtons = app.querySelectorAll('.chip__remove');
    }
    app.querySelector('.measure-button').click();
    vi.runAllTimers();

    const label = app.querySelector('.fit-label').textContent;
    expect(label).toBe('Add another input size to see which curve this fits.');
    expect(label).not.toContain('O(');
  });
});
