# Soitax — working notes for Claude

A rhythm-notation reading trainer. One self-contained `index.html`: no build
step, no runtime dependencies, no framework. Everything is inline — CSS, SVG
notation rendering, Web Audio, and app logic.

## Commands

```bash
npm test                 # full behaviour/model suite (13 files)
npm run test:one flash   # a single suite
npm run serve            # http://localhost:8099 — needed to exercise the service worker
```

Tests need `jsdom` installed inside `tests/` (`cd tests && npm i`).

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

**Notation is rendered by abcjs (vendored, `abcjs-basic-min.js`), not hand-rolled
SVG.** `renderScore()` translates the cell model to ABC (`barsToAbc`), lets abcjs
lay it out, then measures each drawn glyph and builds a musical-time→pixel-x
anchor map (`timeToX`). The timing-feedback lane and playhead are drawn in a
separate overlay `<svg>` keyed off those measured positions — abcjs spaces notes
non-linearly, so nothing may assume a constant width per duration. Beaming is
driven from `beamGroups()` via ABC whitespace (flush = beamed, space = broken),
because abcjs's own auto-beaming crosses the bar midpoint. abcjs loads from its
own `<script>` and is cached by the service worker; `renderScore` no-ops
gracefully if it (or `getBBox`) is unavailable, so the app logic still runs.

The old hand-rolled SVG builder code (`renderBar`, `notehead`, rest glyphs, the
`VW`/`BASE`/`xAt` layout constants) has been removed. Only the paint colours
(`C_INK`, `C_STAFF`, …) survive, reused by the feedback overlay and abcjs styling.

## Environment constraints — these caused real, shipped bugs

**`var()` does not work in SVG presentation attributes.** `fill="var(--ink)"`
resolves to nothing and the glyph is invisible. Only real CSS properties resolve
custom properties. The feedback overlay's paint values are therefore literal hex
constants (`C_INK`, `C_STAFF`, …); abcjs itself paints its glyphs via the CSS
`color` property (`styleAbc`), which does resolve. Keep both literal.

**The notation SVG needs explicit pixel dimensions.** iOS WKWebView will not
derive height from a `viewBox` alone with CSS `height:auto` — the element
collapses to zero height and the notation vanishes while remaining perfectly
correct in the DOM. `renderScore()` reads abcjs's rendered height and pins it via
attribute *and* inline style; the overlay `<svg>` is sized to match.

**Don't rely on the host page background.** The Claude iOS webview renders on a
light surface and ignored our page background, so white-on-dark notation was
invisible. `#score` therefore carries **its own opaque background panel** (set in
`styleAbc`). Keep that.

**Mobile audio output lags ~100ms and browsers under-report it.** iOS gives no
`outputLatency`, so an accurate player looks consistently late. `calMs` is a
learned offset: the median signed error, pooled across attempts (a sparse bar may
only have one or two notes, which must not stall calibration). Persisted.

## Notation rules worth not breaking

- Beams group **by beat** and never cross a beat boundary. Rests and notes of a
  beat or longer break a group. Mixed groups get a primary beam across all, with
  secondary beams under the sixteenths only.
- A tie must **cross a beat boundary** — two eighths tied inside one beat is just
  a quarter note badly spelled. Guarded in `makeBar` (the dedicated tie render
  tests went away with the hand-rolled SVG; the rule now lives in the model).
- Ties may cross the bar line, drawn as a broken tie (a half running past the
  barline, a half coming in from the left margin of the next row).
- Every pattern must contain at least 2 sounding notes; an all-rest bar gives the
  reader nothing to do.

## Grading philosophy

Reading is the skill, not millisecond precision. Every knob lives in one block of
named constants above `grade()` — change them there, not inline.

Onset windows are wide (90% of a beat), capped at half the gap to the
neighbouring note so a tap can't be credited to the wrong note.

**There is no sustain floor any more.** Anything up to a half note counts as a
click (`tg.units <= U*2`), and since the longest value `CELLS` can produce *is* a
half note, that branch is currently true for every note in the app — the floor is
effectively dead code. Keep that in mind before "fixing" it: it reads like a
special case for short notes, but it applies to everything.

This was the fix for a real complaint. The old floor was 40% of the written
value, so a quarter at 58bpm demanded a 414ms hold while a natural finger tap is
~150ms. A player who read the bar perfectly and tapped it normally scored **0%** —
every onset landing, every note failing sustain. Onsets were never the strict
part; ±600ms of jitter still scores 100%.

What survives is the **ceiling** (220% of value): smearing a note across the next
one, or holding through a rest, is still a misread. That is the only thing hold
length can now cost you.

Stray taps that match no note each dilute the score (`clean/(total+extra)`) and
draw a red mark in the feedback lane. Without that, tapping a steady stream and
ignoring the page scores 100%, because the windows are wide enough that some tap
lands on every note.

Green is 75%, not 100%: a four-note bar can only score 0/25/50/75/100, so any
higher threshold makes green mean "flawless". `passed` is the same constant, so
the colour is not decorative — green means you cleared it and the streak grew.

Don't tighten any of this to make scores look more discriminating; that's the
opposite of the point. `tests/reading.js` guards both directions: an ordinary tap
on a correct read must be green, and mashing a steady stream must not be.

Grading tests must tap **what is actually on the page**, but abcjs owns layout
now and jsdom doesn't load it, so they read the sounding onsets from the model
hook `window.__onsets` (units) that `showPattern` publishes — not notehead `cx`
out of the SVG. `window.__abc` exposes the pattern's ABC as a stable fingerprint
for variety/history tests. When two runs are compared, seed `Math.random` so both
get the same bar. Blindly tapping four quarters used to be a fine approximation;
now every tap that lands on a rest counts as an extra and the "perfect player"
silently scores 60%.

## Testing: what the suite cannot see

The tests use **jsdom, which has no rendering engine** and does not load abcjs
(its `<script src>` isn't fetched). It computes no layout and paints nothing, so
the suite cannot see the notation at all — the pure-rendering suites (contrast,
layout, vlevels, sustain, preview, crossbar, ties, beamfreq, rests) were removed
when the renderer moved to abcjs. What remains tests **behaviour and the model**:
lifecycle, grading, controls, variety, persistence, the PWA contract. Assert on
model hooks and DOM state, never on drawn glyphs.

If you have a real browser available, **use Playwright** — it would have caught
all three. It isn't installed here because the browser binaries come from a CDN
outside the sandbox's network allowlist.

Also: when a test fails, check whether the *harness* is wrong. Several
"failures" during development were the test holding notes through rests, firing
two taps 1ms apart (correctly debounced), or sampling flash timing more coarsely
than the thing it measured.

Several suites are **flaky by construction**: they generate unseeded random bars
and grade them, so a single red run proves nothing. Run a suite three times
before believing it, and compare against the same three runs of the old code.

**Never mutate the working tree to get that baseline.** No `git stash`, no
`git checkout -- `, no branch switching, no reverting files — other agents may be
editing the same tree at the same time and their work would vanish. Get the old
version out of git without touching the tree instead:

```bash
git show HEAD:index.html > /tmp/base/index.html   # then run the suite against the copy
```

## Task list

`TODO.md` is the running backlog. When something worth doing surfaces mid-task —
a follow-up, a deferred cleanup, an idea that's out of scope right now — add it
there as a `- [ ]` item rather than losing it. Check items off (`- [x]`) as you
complete them.

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
- Persisted state lives under one key (`soitax-v1`) via `store`, which prefers the
  Claude webview's `window.storage` and falls back to `localStorage` everywhere
  else. That fallback is not optional: `window.storage` does not exist in Safari,
  and without it every get/set threw into a silent catch, so nothing at all was
  remembered on the device people actually practise on. Bump the key if the shape
  changes incompatibly.
- Add a test with any behaviour change. Prefer assertions that would fail for the
  *user-visible* reason, not the implementation detail.
