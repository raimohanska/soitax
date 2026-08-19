# Soitax — test suite

These are the checks I ran against `rhythm-trainer.html`. They are plain Node
scripts, **not Playwright**.

## Running them

```bash
cd tests
npm install jsdom sharp     # must be installed in THIS directory
node all.js                 # everything
node flash.js               # or one at a time
```

Each script reads the app from `../rhythm-trainer.html`, so keep the folder next
to the HTML file (or edit the path at the top of each script).

Each script boots the real HTML in **jsdom** with a stubbed `AudioContext` whose
clock I can advance manually, so a four-bar attempt at 58 BPM runs instantly and
deterministically. Several also rasterise the SVG with **sharp** and count
pixels, which is how the notation gets checked visually rather than structurally.

## What each file covers

| File | What it protects |
|---|---|
| `run.js` | Attempt lifecycle: count-in → play → idle, result panel, feedback lane |
| `buttons.js` | Every control's state in every app state; level-up suggestion |
| `flash.js` | Beat flash maps to the right beat; silent mode schedules zero audio |
| `tempo.js` | Tempo control changes the actual click spacing, persists, respects limits |
| `slack.js` | A correct read with sloppy timing passes; a wrong read still fails |
| `require-sustain.js` | Sustain is genuinely required — same onsets, stabbed holds score 0% |
| `calibrate.js` | Latency self-calibration converges on a hidden 95 ms output delay |
| `ties.js` | A tie is ONE sound; every tie crosses a beat boundary |
| `beamfreq.js` | Beams absent at levels 1–2, near-universal at level 3 |
| `variety.js` | Every level yields ≥8 distinct patterns (caught level 1 repeating) |
| `swipe.js` | Swipe ≠ tap: neither gesture triggers the other |
| `behaviour.js` | Attempt mode plays no reference notes; Show me does |
| `contrast.js` | Notation legible on its own panel over a hostile host background |
| `layout.js` | SVG has real pixel dimensions and survives resize |
| `vlevels.js` | All ten levels render visible ink, verbatim |
| `sustain.js` | Feedback lane renders with correct colours, nothing clipped |
| `crossbar.js`, `preview.js` | Render PNGs for visual inspection |

## Known blind spots — read this part

jsdom has **no rendering engine**. It computes no layout and paints nothing.
Two bugs reached the user through exactly this gap:

1. **`fill="var(--ink)"`** — `var()` doesn't resolve in SVG *presentation
   attributes*. Every glyph had an invalid fill and drew nothing. My rasteriser
   had been substituting the variables for hex before rendering, so I was
   testing output the browser never receives. `contrast.js` now audits paint
   values and renders verbatim.
2. **SVG collapsed to zero height** — no `width`/`height` attributes plus CSS
   `height:auto`, which iOS WKWebView won't resolve from a `viewBox` alone. The
   markup was correct; it simply occupied no space. `layout.js` now asserts on
   rendered geometry.

A third class was invisible to the tests entirely: the Claude iOS webview
renders on a **light** surface and ignored the page background, so white
notation sat on white. Nothing in jsdom models a host page. The fix was to stop
depending on it — the notation carries its own background panel — and the app is
now black-on-white regardless.

**A real browser would catch all three.** Playwright's browser binaries download
from a CDN outside this container's network allowlist, so I couldn't install it.
If you run these yourself, `npx playwright test` against a real Chromium would
be a strict improvement over jsdom for anything visual.

## Caveat on the harness itself

Several "failures" during development were bugs in the *tests*, not the app —
holding notes through rests, firing two taps 1 ms apart (correctly debounced),
counting a cross-bar tie's two arc halves as two ties, and measuring flash
timing with a sampler coarser than the thing it measured. Each is now either
fixed or asserted a different way. Worth knowing if a test fails on you: check
whether the harness or the app is wrong.
