# Backlog

Epic/story breakdown for the build phases. High-level on purpose — each story gets scoped
further when it's picked up. All start unchecked.

## Epic 1 — Dynamic instrumentation engine

The core differentiator: actually running pasted code and counting real operations, not
guessing from source text.

- [ ] Build a dynamic op-counting interpreter shim: walk the AST and execute it directly
      (or transform + `Function()` with injected counters) so operations are counted as the
      function actually runs against a given input — covering loops, recursion, and closures,
      the cases where static counting (current `countStaticOps`) diverges most from real cost.
- [ ] Sandbox execution against runaway loops/infinite recursion (iteration cap + timeout via
      a Web Worker, so a bad paste can't hang the tab).
- [ ] Surface parse/runtime errors from the pasted function as a designed error state, not a
      console exception.

## Epic 2 — Input generation and measurement runs

- [ ] Build input generators: random array, sorted array, reverse-sorted array, random string,
      nested array — parameterized by size `n`.
- [ ] Let the user pick a custom set of input sizes (e.g. `[10, 100, 1000, 10000]`) and run the
      instrumented function once per size, wiring the resulting `{ n, ops }` samples into
      `bestFitCurve` (already in `src/core/curves.js`) to surface the matched curve + fit error.
- [ ] Detect and flag regression: when late samples diverge from the curve the early samples
      suggested (the "secretly O(n²)" case named in the README).

## Epic 3 — UI: function input, plot, and library

- [ ] Build the function paste box (syntax-aware textarea or lightweight CodeMirror) with
      inline parse-error display.
- [ ] Build the live canvas plot: log-scaled axes, gridlines, measured series + reference curve
      overlay, `devicePixelRatio`-aware sizing per `docs/DESIGN.md`.
- [ ] Build the size picker control (chip/tag input for the `n` values to test) and the sample
      function library (binary search, bubble sort, memoized Fibonacci, a "looks O(n), secretly
      O(n²)" trap) as one-click loadable presets.
- [ ] **Design polish**: implement the full `docs/DESIGN.md` direction — blueprint tokens,
      JetBrains Mono/Inter type, the animated wordmark, plot-reveal and fit-match motion, synth
      SFX with persisted mute — across desktop and phone breakpoints.

## Epic 4 — Sharing and deployment

- [ ] Encode a run (function source + sizes + resulting samples) into a compact URL-safe string
      and decode it back into an already-measured run on page load, so a result is linkable
      directly in a PR review comment.
- [ ] Verify the static `dist/` build works correctly when served from a non-root subpath
      (matches the relative-path convention already set in `vite.config.js`).
- [ ] **Design polish**: build the `site/` landing page in the same blueprint direction as the
      app itself, so the marketing page and the tool read as one brand per the design standard.
