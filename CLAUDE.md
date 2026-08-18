# Pulse — working notes for Claude

A rhythm-notation reading trainer. One self-contained `index.html`: no build
step, no runtime dependencies, no framework. Everything is inline — CSS, SVG
notation rendering, Web Audio, and app logic.

## Commands

```bash
npm test                 # full suite (17 files, ~2 min)
npm run test:one flash   # a single suite
npm run serve            # http://localhost:8099 — needed to exercise the service worker
```

Tests need `jsdom` and `sharp` installed inside `tests/` (`cd tests && npm i`).

## Architecture, and why it's shaped this way

**One clock.** Everything time-related derives from `AudioContext.currentTime`
inside a single `requestAnimationFrame` loop (`tick`). The count-in digit, the
playhead, the beat flash, and the recording window all read that one clock.

An earlier version spread this across a dozen `setTimeout`s and was badly flaky:
the recording gate could wedge shut so no tap ever registered, and the countdown
label flickered as timers raced. **Do not reintroduce timers for anything that
must stay in sync with audio.** If something needs to happen at a musical time,
derive it from the clock in `tick`.

**Input is timestamps, not state.** There is no boolean "recording" gate. Every
press pushes `{down, up}` into `taps` and grading filters by time window
afterwards. This is deliberate — a gate is a thing that can get stuck.

**One source of truth for what sounds.** `soundingNotes()` merges tied notes into
single events with combined duration. Both playback and grading read it, so they
cannot disagree about a tie. If you touch tie logic, touch it there.

**Two gestures on one surface.** During an attempt, presses register on
`pointerdown` (timing matters). When idle, "begin" waits for `pointerup` and only
fires if the finger moved <12px, so a swipe can be told from a tap.

**One owner for control state.** `syncControls()` sets every button's `disabled`
and highlight. Don't set `disabled` anywhere else — an earlier bug had several
call sites disagreeing, and `syncControls()` ran before `run` was assigned so
nothing locked during a run. Order matters: set `run` first, then sync.

## Environment constraints — these caused real, shipped bugs

**`var()` does not work in SVG presentation attributes.** `fill="var(--ink)"`
resolves to nothing and the glyph is invisible. Only real CSS properties resolve
custom properties. All paint values in the SVG builders are literal hex
constants (`C_INK`, `C_STAFF`, …). Keep them that way. `tests/contrast.js`
audits every `fill`/`stroke` and fails on anything that isn't hex or `none`.

**The SVG needs explicit pixel dimensions.** iOS WKWebView will not derive
height from a `viewBox` alone with CSS `height:auto` — the element collapses to
zero height and the notation vanishes while remaining perfectly correct in the
DOM. `renderScore()` computes real px and pins them via attributes *and* inline
style. `tests/layout.js` asserts on this.

**Don't rely on the host page background.** The Claude iOS webview renders on a
light surface and ignored our page background, so white-on-dark notation was
invisible. The score SVG therefore paints **its own background panel** as its
first child. Keep that.

**Mobile audio output lags ~100ms and browsers under-report it.** iOS gives no
`outputLatency`, so an accurate player looks consistently late. `calMs` is a
learned offset: the median signed error, pooled across attempts (a sparse bar may
only have one or two notes, which must not stall calibration). Persisted.

## Notation rules worth not breaking

- Beams group **by beat** and never cross a beat boundary. Rests and notes of a
  beat or longer break a group. Mixed groups get a primary beam across all, with
  secondary beams under the sixteenths only.
- A tie must **cross a beat boundary** — two eighths tied inside one beat is just
  a quarter note badly spelled. Guarded in `makeBar`, asserted in `tests/ties.js`.
- Ties may cross the bar line, drawn as a broken tie (a half running past the
  barline, a half coming in from the left margin of the next row).
- Every pattern must contain at least 2 sounding notes; an all-rest bar gives the
  reader nothing to do.

## Grading philosophy

Reading is the skill, not millisecond precision. Onset windows are wide (75% of a
beat), capped at half the gap to the neighbouring note so a tap can't be credited
to the wrong note. **Sustain is required** but loose (40%–220% of written value) —
that's what makes note *length* part of the reading. Don't tighten these to make
scores look more discriminating; that's the opposite of the point.

## Testing: what the suite cannot see

The tests use **jsdom, which has no rendering engine**. It computes no layout and
paints nothing. Every bug that reached the user lived in exactly that gap:
invisible fills, zero-height SVG, and the light host background. Structural
assertions pass happily while the screen is blank.

If you have a real browser available, **use Playwright** — it would have caught
all three. It isn't installed here because the browser binaries come from a CDN
outside the sandbox's network allowlist.

Also: when a test fails, check whether the *harness* is wrong. Several
"failures" during development were the test holding notes through rests, firing
two taps 1ms apart (correctly debounced), or sampling flash timing more coarsely
than the thing it measured.

## Deploying

There is only ever one branch: `main`. Never create, check out, or push to any
other branch — work directly on `main`, always.

When the user says "deploy" (just that word, in response to changes you've made),
commit the current changes with a clear descriptive message and push to `origin
main`. Don't ask for confirmation first — "deploy" is the confirmation. If
there's nothing uncommitted and nothing unpushed, say so instead of creating an
empty commit.

## Conventions

- Plain readable JS over clever JS. No transpiling, no bundler.
- Comments explain **why**, especially where a constraint above forced the shape.
- `index.html` is the app; keep it self-contained. `manifest.webmanifest`,
  `sw.js`, and the icons are optional enhancements — service worker registration
  is gated on `location.protocol` so opening the bare file still works.
- Persisted state lives under one key (`pulse-v6`) via `window.storage`. Bump the
  key if the shape changes incompatibly.
- Add a test with any behaviour change. Prefer assertions that would fail for the
  *user-visible* reason, not the implementation detail.
