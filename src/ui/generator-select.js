// Themed <select> for choosing which input generator produces the value
// passed to the pasted function at each size.

import { GENERATORS } from '../core/generators.js';

export function createGeneratorSelect(container, { initialValue, onChange } = {}) {
  const names = Object.keys(GENERATORS);
  const selected = names.includes(initialValue) ? initialValue : names[0];

  container.innerHTML = `
    <label class="panel__label" for="generator-select">Input generator</label>
    <select id="generator-select" class="generator-select">
      ${names.map((name) => `<option value="${name}"${name === selected ? ' selected' : ''}>${name}</option>`).join('')}
    </select>
  `;

  const select = container.querySelector('#generator-select');
  select.addEventListener('change', () => onChange?.(select.value));

  return {
    getValue: () => select.value,
    setValue(name) {
      if (!names.includes(name)) return;
      select.value = name;
      onChange?.(name);
    },
  };
}
