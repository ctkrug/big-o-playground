import { bestFitCurve, CURVES } from './core/curves.js';
import { GENERATORS } from './core/generators.js';
import { InstrumentationError } from './core/dynamic-instrument.js';
import { detectRegression, measure } from './core/measure.js';
import { SAMPLES } from './samples/library.js';
import { createEditor } from './ui/editor.js';
import { createSizePicker } from './ui/size-picker.js';
import { createSampleLibrary } from './ui/sample-library.js';
import { createGeneratorSelect } from './ui/generator-select.js';
import { createPlot } from './ui/plot.js';
import { createSoundController } from './ui/sound.js';
import { renderWordmark } from './ui/wordmark.js';

const DEFAULT_SAMPLE = SAMPLES[0];
const REVEAL_STAGGER_MS = 40;

const app = document.getElementById('app');

app.innerHTML = `
  <header class="app__header">
    ${renderWordmark()}
    <div class="app__header-right">
      <p class="app__tagline">Measure it. Don't guess it.</p>
      <button type="button" class="mute-toggle" aria-pressed="false" aria-label="Mute sound">🔊</button>
    </div>
  </header>
  <main class="layout">
    <section class="plot-section" aria-label="Measured operation count plot">
      <div class="plot-canvas-wrap">
        <canvas class="plot-canvas"></canvas>
      </div>
      <p class="fit-label" aria-live="polite"></p>
    </section>
    <section class="rail" aria-label="Function input and controls">
      <div class="panel editor-panel"></div>
      <div class="panel generator-panel"></div>
      <div class="panel size-picker-panel"></div>
      <button type="button" class="measure-button">Measure</button>
      <div class="panel sample-library-panel"></div>
    </section>
  </main>
`;

const canvas = app.querySelector('.plot-canvas');
const fitLabel = app.querySelector('.fit-label');
const muteToggle = app.querySelector('.mute-toggle');
const measureButton = app.querySelector('.measure-button');

const sound = createSoundController();
const plot = createPlot(canvas);
// The AudioContext must only ever be created in response to a user
// gesture (browser autoplay policy, and docs/DESIGN.md's own rule) — the
// very first render on page load is automatic, not user-initiated, so it
// stays silent until the user actually clicks something.
let userHasInteracted = false;

const state = {
  source: DEFAULT_SAMPLE.source,
  generator: DEFAULT_SAMPLE.generator,
  sizes: DEFAULT_SAMPLE.sizes,
};

const editor = createEditor(app.querySelector('.editor-panel'), {
  initialSource: state.source,
  onChange: (value) => {
    state.source = value;
    editor.setError(null);
  },
});

const generatorSelect = createGeneratorSelect(app.querySelector('.generator-panel'), {
  initialValue: state.generator,
  onChange: (value) => {
    state.generator = value;
  },
});

const sizePicker = createSizePicker(app.querySelector('.size-picker-panel'), {
  initialSizes: state.sizes,
  onChange: (sizes) => {
    state.sizes = sizes;
  },
});

createSampleLibrary(app.querySelector('.sample-library-panel'), {
  onSelect: (sample) => {
    state.source = sample.source;
    state.generator = sample.generator;
    state.sizes = sample.sizes;
    editor.setValue(sample.source);
    editor.setError(null);
    generatorSelect.setValue(sample.generator);
    sizePicker.setSizes(sample.sizes);
    userHasInteracted = true;
    runMeasurement();
  },
});

function updateMuteButton() {
  const muted = sound.isMuted();
  muteToggle.setAttribute('aria-pressed', String(muted));
  muteToggle.textContent = muted ? '🔇' : '🔊';
  muteToggle.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
}

muteToggle.addEventListener('click', () => {
  userHasInteracted = true;
  sound.toggleMuted();
  updateMuteButton();
});
updateMuteButton();

function setFitLabel(text, { tone = 'neutral', shake = false } = {}) {
  fitLabel.textContent = text;
  fitLabel.classList.remove('fit-label--danger', 'fit-label--success', 'fit-label--shake');
  if (tone === 'danger') fitLabel.classList.add('fit-label--danger');
  if (tone === 'success') fitLabel.classList.add('fit-label--success');
  if (shake) {
    // Force a reflow so the animation re-triggers on repeated regressions.
    void fitLabel.offsetWidth;
    fitLabel.classList.add('fit-label--shake');
  }
}

let lastRender = { samples: [], curveFn: null, regression: null };
let revealTimer = null;

// Selecting a new sample or re-clicking Measure while a previous reveal is
// still staggering in would otherwise let both animations run at once,
// double-ticking the sound and racing to render two different point counts.
function revealSamples(samples, curveFn, regression) {
  clearTimeout(revealTimer);
  revealTimer = null;

  let revealCount = 0;
  function step() {
    revealCount += 1;
    lastRender = { samples, curveFn, revealCount, regression };
    plot.render(lastRender);
    if (userHasInteracted) sound.tick();
    if (revealCount < samples.length) {
      revealTimer = setTimeout(step, REVEAL_STAGGER_MS);
    } else {
      revealTimer = null;
      onRevealComplete(regression);
    }
  }
  step();
}

function onRevealComplete(regression) {
  if (!userHasInteracted) return;
  if (regression.regressed) {
    sound.regressionBlip();
  } else {
    sound.matchChime();
  }
}

function runMeasurement() {
  const generate = GENERATORS[state.generator];
  editor.setError(null);

  if (state.sizes.length === 0) {
    setFitLabel('Add at least one input size to measure.', { tone: 'neutral' });
    plot.render({ samples: [] });
    return;
  }

  let samples;
  try {
    samples = measure(state.source, state.sizes, generate);
  } catch (err) {
    if (err instanceof InstrumentationError) {
      editor.setError(err.message);
      setFitLabel('Fix the error above to measure this function.', { tone: 'danger' });
      plot.render({ samples: [] });
    } else {
      throw err;
    }
    return;
  }

  if (samples.length === 1) {
    // A single measurement normalizes exactly onto every reference curve
    // (there's only one point to match), so bestFitCurve would always
    // report "O(1)" by tie-break order regardless of the function's real
    // complexity — a confident-looking but meaningless verdict. Show the
    // point without claiming a fit instead.
    setFitLabel('Add another input size to see which curve this fits.', { tone: 'neutral' });
    revealSamples(samples, null, detectRegression(samples));
    return;
  }

  const { name: curveName } = bestFitCurve(samples);
  const regression = detectRegression(samples);
  const curveFn = curveName ? CURVES[curveName] : null;

  if (regression.regressed) {
    setFitLabel(
      `looks ${regression.earlyCurve}, diverges to ${regression.overallCurve} starting at n=${regression.divergesAfter}`,
      { tone: 'danger', shake: true }
    );
  } else {
    setFitLabel(`closest match: ${curveName}`, { tone: 'success' });
  }

  revealSamples(samples, curveFn, regression);
}

measureButton.addEventListener('click', () => {
  userHasInteracted = true;
  runMeasurement();
});

// Cmd/Ctrl+Enter runs the measurement without leaving the editor — the
// fast-iteration shortcut a paste-and-tweak tool like this needs.
app.querySelector('#fn-source').addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault();
    userHasInteracted = true;
    runMeasurement();
  }
});

let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    plot.resize();
    plot.render(lastRender);
  }, 100);
});

plot.resize();
runMeasurement();
