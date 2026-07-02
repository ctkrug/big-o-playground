// The function paste box: a themed textarea with inline parse-error
// display. Kept as a plain textarea (not a CodeMirror instance) per
// VISION's "no framework, not enough surface area to justify it" call —
// but still styled and stateful, not a naked native control.

export function createEditor(container, { initialSource = '', onChange } = {}) {
  container.innerHTML = `
    <label class="panel__label" for="fn-source">Function source</label>
    <textarea
      id="fn-source"
      class="code-editor"
      spellcheck="false"
      autocapitalize="off"
      autocorrect="off"
      rows="10"
    ></textarea>
    <p class="editor-hint">⌘/Ctrl + Enter to measure</p>
    <p class="editor-error" role="alert" hidden></p>
  `;

  const textarea = container.querySelector('#fn-source');
  const errorEl = container.querySelector('.editor-error');
  textarea.value = initialSource;

  textarea.addEventListener('input', () => {
    onChange?.(textarea.value);
  });

  function setError(message) {
    if (message) {
      errorEl.textContent = message;
      errorEl.hidden = false;
      textarea.classList.add('has-error');
    } else {
      errorEl.textContent = '';
      errorEl.hidden = true;
      textarea.classList.remove('has-error');
    }
  }

  return {
    getValue: () => textarea.value,
    setValue(value) {
      textarea.value = value;
      onChange?.(value);
    },
    setError,
  };
}
