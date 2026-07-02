// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createEditor } from '../src/ui/editor.js';

function setUp(opts) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const editor = createEditor(container, opts);
  return { container, editor };
}

describe('createEditor', () => {
  it('renders the initial source into the textarea', () => {
    const { container } = setUp({ initialSource: 'x => x' });
    expect(container.querySelector('#fn-source').value).toBe('x => x');
  });

  it('calls onChange when the user types', () => {
    const onChange = vi.fn();
    const { container } = setUp({ onChange });
    const textarea = container.querySelector('#fn-source');
    textarea.value = 'x => x * 2';
    textarea.dispatchEvent(new Event('input'));
    expect(onChange).toHaveBeenCalledWith('x => x * 2');
  });

  it('setValue updates the textarea and notifies onChange', () => {
    const onChange = vi.fn();
    const { editor, container } = setUp({ onChange });
    editor.setValue('x => x + 1');
    expect(container.querySelector('#fn-source').value).toBe('x => x + 1');
    expect(onChange).toHaveBeenCalledWith('x => x + 1');
  });

  it('renders the Cmd/Ctrl+Enter measure hint', () => {
    const { container } = setUp();
    expect(container.querySelector('.editor-hint').textContent).toMatch(/Enter/);
  });

  it('setError shows the error message and marks the textarea', () => {
    const { editor, container } = setUp();
    editor.setError('Unexpected token');
    const errorEl = container.querySelector('.editor-error');
    expect(errorEl.hidden).toBe(false);
    expect(errorEl.textContent).toBe('Unexpected token');
    expect(container.querySelector('#fn-source').classList.contains('has-error')).toBe(true);
  });

  it('setError(null) clears a previously shown error', () => {
    const { editor, container } = setUp();
    editor.setError('boom');
    editor.setError(null);
    const errorEl = container.querySelector('.editor-error');
    expect(errorEl.hidden).toBe(true);
    expect(container.querySelector('#fn-source').classList.contains('has-error')).toBe(false);
  });
});
