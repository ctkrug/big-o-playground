// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createGeneratorSelect } from '../src/ui/generator-select.js';
import { GENERATORS } from '../src/core/generators.js';

describe('createGeneratorSelect', () => {
  it('renders one option per generator', () => {
    const container = document.createElement('div');
    createGeneratorSelect(container);
    expect(container.querySelectorAll('option')).toHaveLength(Object.keys(GENERATORS).length);
  });

  it('defaults to the first generator when no initial value is given', () => {
    const container = document.createElement('div');
    const picker = createGeneratorSelect(container);
    expect(picker.getValue()).toBe(Object.keys(GENERATORS)[0]);
  });

  it('honors a valid initial value', () => {
    const container = document.createElement('div');
    const picker = createGeneratorSelect(container, { initialValue: 'sorted array' });
    expect(picker.getValue()).toBe('sorted array');
  });

  it('falls back to the first generator for an invalid initial value', () => {
    const container = document.createElement('div');
    const picker = createGeneratorSelect(container, { initialValue: 'not-a-generator' });
    expect(picker.getValue()).toBe(Object.keys(GENERATORS)[0]);
  });

  it('calls onChange when the selection changes', () => {
    const onChange = vi.fn();
    const container = document.createElement('div');
    createGeneratorSelect(container, { onChange });
    const select = container.querySelector('#generator-select');
    select.value = 'random string';
    select.dispatchEvent(new Event('change'));
    expect(onChange).toHaveBeenCalledWith('random string');
  });

  it('setValue updates the select and notifies onChange', () => {
    const onChange = vi.fn();
    const container = document.createElement('div');
    const picker = createGeneratorSelect(container, { onChange });
    picker.setValue('nested array');
    expect(picker.getValue()).toBe('nested array');
    expect(onChange).toHaveBeenCalledWith('nested array');
  });

  it('setValue ignores an unknown generator name', () => {
    const onChange = vi.fn();
    const container = document.createElement('div');
    const picker = createGeneratorSelect(container, { initialValue: 'sorted array', onChange });
    picker.setValue('not-a-generator');
    expect(picker.getValue()).toBe('sorted array');
    expect(onChange).not.toHaveBeenCalled();
  });
});
