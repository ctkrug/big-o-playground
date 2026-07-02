# Vision

## The problem

Big-O notation is supposed to be a measurement, but in practice it's almost always a guess.
An engineer reads a function, mentally traces the loops, and declares "that's O(n log n)" —
without ever running it. That guess is usually right for the happy path and quietly wrong for
the case that matters: the nested lookup inside a "sorted merge," the `.includes()` call
buried in what looks like a linear scan, the memoization that isn't actually keyed correctly.
Nobody re-derives complexity by hand for every PR, and profilers measure wall-clock time, which
is noisy, machine-dependent, and doesn't distinguish "this is O(n²) with a small constant" from
"this is O(n) with a large constant."

## Who it's for

- **Interview prep** — you wrote what you believe is an O(n log n) solution; prove it before
  you say so out loud in the room.
- **Code review** — a PR claims a performance improvement ("switched to a hash-based lookup,
  now O(n)"); check the claim against actual measured growth instead of trusting the commit
  message.
- **Learning** — students and self-taught engineers building intuition for how different
  algorithm shapes actually grow, with a visual instead of a proof.

## The core idea

Replace "what complexity does this look like" with "what complexity does this measurably have."
Big-O Playground takes a pasted JS function, generates inputs at a range of sizes the user
picks, and **instruments** the function — walking its parsed AST and counting primitive
operations (comparisons, arithmetic, array/object access, calls) as it actually runs against
each input — rather than timing it. Op-counts are deterministic and machine-independent, so the
same function produces the same measured curve on a laptop and a CI runner. Those counts get
plotted against the standard reference curves (O(1) through O(2ⁿ)), each normalized to the
measured series so the *shape* of growth is what's being compared, not an arbitrary scale.

The differentiator from a generic "run this code" sandbox: the counting is real instrumentation
of execution, not a static heuristic on the source text and not a timing-based benchmark. A
function that's O(n) in its best case and O(n²) in its worst case will show that divergence
across the chosen input sizes, because the op-count is measured per run, not inferred once.

## Key design decisions

- **Client-side only, no server-side code execution.** Pasted functions run in the user's own
  browser tab. This avoids the entire "arbitrary remote code execution as a service" security
  problem and keeps the tool free to host as a static site.
- **Instrumentation over timing.** Wall-clock benchmarking is sensitive to JIT warm-up, GC
  pauses, and machine load. Counting operations via AST-walking gives a deterministic,
  reproducible number instead.
- **Curves are shape-matched, not magnitude-matched.** A measured series is compared to each
  reference curve after normalizing the curve to the series' first data point, so "O(n) with a
  constant of 1,000,000" still correctly matches O(n) rather than getting rejected for being
  "too high" against an un-normalized curve.
- **No framework for the UI.** The app is a function-input box, a size picker, and a canvas
  plot — not enough surface area to justify a framework's overhead and build complexity.
- **Static, single-directory build.** Ships as one `dist/` folder with relative asset paths so
  it can be hosted at a domain root or under a subpath without modification.

## What "v1 done" looks like

- Paste any pure-ish JS function (single expression body or full function/arrow), pick a set of
  input sizes, and get back a live-updating plot of measured op-count vs. input size.
- The plot overlays the best-fit reference curve and names it (e.g. "closest match: O(n log n)").
- A small library of sample functions (binary search, bubble sort, memoized Fibonacci, a
  deliberately misleading "looks linear, isn't" trap) is available to try with one click.
- Input generators cover the common shapes: random array, sorted array, reverse-sorted array,
  string, nested array — plus a way to plug in a custom generator.
- A run (function source + chosen sizes + resulting measurements) can be encoded into a URL and
  reloaded, so a result is shareable in a review comment without a screenshot.
- The page is a polished, intentional design per `docs/DESIGN.md` — not a functional-but-bare
  developer tool page.
