// A chip/tag input for the set of input sizes (n values) to measure at.
// Typing a number and pressing Enter or "," adds a chip; each chip has its
// own remove control. Kept sorted ascending and deduplicated.

/** Parses one size entry. Returns a positive integer, or null if invalid. */
export function parseSize(raw) {
  const trimmed = String(raw).trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value) || value <= 0) return null;
  return value;
}

function normalizeSizes(sizes) {
  return [...new Set(sizes)].sort((a, b) => a - b);
}

export function createSizePicker(container, { initialSizes = [], onChange } = {}) {
  let sizes = normalizeSizes(initialSizes);

  container.innerHTML = `
    <label class="panel__label" for="size-input">Input sizes</label>
    <div class="chip-list" role="list"></div>
    <input
      id="size-input"
      class="size-input"
      type="text"
      inputmode="numeric"
      placeholder="add a size and press Enter"
      autocomplete="off"
    />
    <p class="size-picker-error" role="alert" hidden></p>
  `;

  const chipList = container.querySelector('.chip-list');
  const input = container.querySelector('#size-input');
  const errorEl = container.querySelector('.size-picker-error');

  function showError(message) {
    if (message) {
      errorEl.textContent = message;
      errorEl.hidden = false;
    } else {
      errorEl.hidden = true;
    }
  }

  function render() {
    chipList.innerHTML = sizes
      .map(
        (n) => `
        <span class="chip" role="listitem">
          <span class="chip__value">${n}</span>
          <button type="button" class="chip__remove" data-size="${n}" aria-label="Remove size ${n}">×</button>
        </span>
      `
      )
      .join('');
  }

  function setSizes(next) {
    sizes = normalizeSizes(next);
    render();
    onChange?.(sizes);
  }

  function addFromInput() {
    const value = parseSize(input.value);
    if (value === null) {
      if (input.value.trim() !== '') showError('Sizes must be positive whole numbers.');
      return;
    }
    showError(null);
    setSizes([...sizes, value]);
    input.value = '';
  }

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      addFromInput();
    }
  });

  input.addEventListener('blur', () => {
    if (input.value.trim() !== '') addFromInput();
  });

  chipList.addEventListener('click', (event) => {
    const button = event.target.closest('.chip__remove');
    if (!button) return;
    const value = Number(button.dataset.size);
    setSizes(sizes.filter((n) => n !== value));
  });

  render();

  return {
    getSizes: () => sizes,
    setSizes,
  };
}
