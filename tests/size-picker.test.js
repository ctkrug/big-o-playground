// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createSizePicker, parseSize } from '../src/ui/size-picker.js';

describe('parseSize', () => {
  it('parses a positive integer string', () => {
    expect(parseSize('100')).toBe(100);
  });

  it('rejects zero, negatives, decimals, and non-numeric input', () => {
    expect(parseSize('0')).toBeNull();
    expect(parseSize('-5')).toBeNull();
    expect(parseSize('1.5')).toBeNull();
    expect(parseSize('abc')).toBeNull();
    expect(parseSize('')).toBeNull();
  });
});

function setUp(opts) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const picker = createSizePicker(container, opts);
  return { container, picker };
}

describe('createSizePicker', () => {
  it('renders initial sizes sorted and deduplicated', () => {
    const { picker } = setUp({ initialSizes: [100, 10, 10, 1000] });
    expect(picker.getSizes()).toEqual([10, 100, 1000]);
  });

  it('renders one chip per size', () => {
    const { container } = setUp({ initialSizes: [10, 100] });
    expect(container.querySelectorAll('.chip')).toHaveLength(2);
  });

  it('adds a size when Enter is pressed in the input', () => {
    const onChange = vi.fn();
    const { container, picker } = setUp({ initialSizes: [10], onChange });
    const input = container.querySelector('#size-input');
    input.value = '50';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(picker.getSizes()).toEqual([10, 50]);
    expect(onChange).toHaveBeenCalledWith([10, 50]);
  });

  it('clears the input field after adding', () => {
    const { container } = setUp({});
    const input = container.querySelector('#size-input');
    input.value = '25';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(input.value).toBe('');
  });

  it('shows an error and does not add an invalid size', () => {
    const { container, picker } = setUp({ initialSizes: [10] });
    const input = container.querySelector('#size-input');
    input.value = 'nope';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(picker.getSizes()).toEqual([10]);
    expect(container.querySelector('.size-picker-error').hidden).toBe(false);
  });

  it('removes a size when its chip remove button is clicked', () => {
    const { container, picker } = setUp({ initialSizes: [10, 100] });
    container.querySelector('.chip__remove[data-size="10"]').click();
    expect(picker.getSizes()).toEqual([100]);
  });

  it('setSizes replaces the set and re-renders chips', () => {
    const { container, picker } = setUp({ initialSizes: [10] });
    picker.setSizes([1, 2, 3]);
    expect(picker.getSizes()).toEqual([1, 2, 3]);
    expect(container.querySelectorAll('.chip')).toHaveLength(3);
  });
});
