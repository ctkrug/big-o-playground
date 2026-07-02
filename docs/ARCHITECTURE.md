# Architecture

A concise map of the codebase for anyone (including a future session) picking this up cold.

## Data flow

```
pasted source ─┬─> instrumentSource() ──> instrumented source string
               │         (src/core/dynamic-instrument.js)
               │
sizes[] ───────┼─> measure() runs the instrumented fn once per size,
generator(n) ──┘   generating a fresh input each time
                          │
                          v
                  samples: [{ n, ops }, ...]
                          │
                          v
              bestFitCurve() + detectRegression()
                  (src/core/curves.js, src/core/measure.js)
                          │
                          v
                  UI plot + fit label + regression flag
```

## Core modules (`src/core/`)

- **`instrument.js`** — static op-site counter (`countStaticOps`). Walks a
  parsed function's AST once and counts how many op-sites *exist* in the
  source. Kept as-is from SCOPE; not used by the measurement pipeline
  directly, but `parseFunction` (shared parse-and-wrap-in-parens helper) is
  reused by `dynamic-instrument.js`.

- **`dynamic-instrument.js`** — the core differentiator. Counts how many
  operations *execute*, not just exist, by source-splicing counter
  increments into the original function text:
  - `countNodeOps(node)` — static op count of a single AST subtree,
    stopping at nested function boundaries (those are counted separately,
    only when actually invoked).
  - `applyEdits(text, edits)` — insert-only text splicing at AST character
    offsets; since edits never remove or shift text, they can be collected
    in any order.
  - `instrumentSource(source)` — walks every statement in the function
    body (recursing into if/for/while/switch/try and into nested function
    expressions found in callbacks or variable bindings) and inserts
    `__ops += N` before each one, sized to that statement's own op count.
    Loop bodies also get an iteration-cap guard
    (`if (++__iter > __iterCap) throw ...`) so a runaway loop throws
    instead of hanging the tab — this is the safety net in place of a Web
    Worker sandbox (still on the backlog as a stretch item).
  - `compileInstrumented` / `runInstrumented` — compile the instrumented
    source with `new Function` and run it, normalizing parse/compile/
    runtime failures into `InstrumentationError` with a `kind` field so
    the UI can render a designed error state instead of a console
    exception.

  **Known limitation:** because the transform only splices into statements
  in the *pasted* source, calls into native built-ins (`.sort()`,
  `.includes()`, `.map()`'s own iteration machinery) count as a single
  `CallExpression` op regardless of receiver length — their internals
  aren't instrumented. A callback passed to a native method (e.g.
  `arr.map(x => ...)`) *is* instrumented and counted per invocation, since
  it's pasted code. This is why the "secretly O(n²)" sample uses an
  explicit nested loop rather than `.includes()` — see
  `src/samples/library.js`.

- **`curves.js`** — reference Big-O curves (`O(1)` … `O(2^n)`), each
  normalized to a measured series' first sample so shape (not raw
  magnitude) is what's compared. `bestFitCurve` picks the least-squared-
  error match.

- **`generators.js`** — input generators (`randomArray`, `sortedArray`,
  `reverseSortedArray`, `randomString`, `nestedArray`, `scalarN`), each
  parameterized by `n`, exposed via the `GENERATORS` registry keyed by
  display name for the size-picker UI.

- **`measure.js`** — wires instrumentation + generators into a full run:
  - `measure(source, sizes, generate)` → ordered `{ n, ops }` samples.
  - `detectRegression(samples)` → compares the curve that best fits the
    early half of the samples against the curve for the full series;
    flags when the later samples have grown into a worse complexity
    class, and reports the size at which that divergence starts.
  - `analyzeRun(...)` → samples + best-fit curve + regression verdict in
    one call — the function the UI calls per "Measure" click.

## Samples (`src/samples/`)

- **`library.js`** — one-click presets (`SAMPLES` array), each pairing a
  real function's source with the generator and size range that makes its
  measured curve legible on first load.

## UI modules (`src/ui/`)

Each is a small `create*(container, options)` factory that renders its own
markup into a passed-in container and returns a plain object API (no
framework, per VISION — see D2 in the design standard). `main.js` is the
only module that wires them together.

- **`editor.js`** — the function paste textarea; `setError(message)` shows
  an inline parse/runtime error and reddens the border.
- **`size-picker.js`** — chip/tag input for the `n` values to test;
  `parseSize` is the pure validation function (positive integers only).
- **`generator-select.js`** — themed `<select>` over `GENERATORS`.
- **`sample-library.js`** — one button per `SAMPLES` entry.
- **`plot.js`** — the canvas renderer:
  - `computeDomain(samples, curveFn)` / `mapLog(value, domain, range)` are
    pure and unit-tested directly; the log-log axis math lives here, not
    inside canvas drawing calls.
  - `createPlot(canvas)` returns `{ resize, render }`. `render({ samples,
    curveFn, revealCount, regression })` draws the grid, the curve
    (normalized to the first sample), and points up to `revealCount` —
    the staggered-reveal animation is just `main.js` calling `render`
    repeatedly with an increasing count, not internal canvas animation.
  - Both `resize`/`render` no-op if `canvas.getContext('2d')` returns
    null (jsdom in tests; real browsers always have a context).
- **`sound.js`** — WebAudio-synthesized SFX (`tick`, `matchChime`,
  `regressionBlip`) plus mute state persisted to `localStorage`. The
  AudioContext is created lazily inside `playTone`, but **`main.js` is
  responsible for never calling these before a real user gesture** (a
  `userHasInteracted` flag gates the automatic first render on page load)
  — the module itself doesn't know whether a call is gesture-triggered.
- **`wordmark.js`** — the animated "Big-O Playground" heading; the trace
  animation is a `<circle>` overlay driven by a CSS keyframe, not JS.

## `main.js` — orchestration

Builds the app shell once, wires each UI module's callbacks into a small
`state` object (`source`, `generator`, `sizes`), and on "Measure" (or a
sample-library click): runs `measure()` → `bestFitCurve()` +
`detectRegression()` → a staggered `revealSamples()` loop
(`setTimeout`-chained `plot.render` calls) → a match chime or regression
blip. A resize listener (debounced) re-renders the last result via
`plot.resize()` + `plot.render(lastRender)` rather than re-measuring.

## Tests (`tests/`)

Mirrors `src/` one file per module, plus `main.test.js` (jsdom smoke test
for the wired-up entrypoint). Run with `npm test` (vitest). UI tests use
`// @vitest-environment jsdom`; canvas-drawing tests inject a fake 2D
context (`vi.fn()` stubs) rather than relying on jsdom's unimplemented
`getContext('2d')`.

## Running locally

- `npm run dev` — Vite dev server.
- `npm test` — vitest run (all suites).
- `npm run lint` — ESLint flat config.
- `npm run build` — production build to `dist/`, relative-path base (see
  `vite.config.js`) so it works when served from a subpath.
