# Soitax — test suite

Plain Node scripts, **not Playwright**. They boot the real `../index.html` in
**jsdom** with a stubbed `AudioContext` whose clock can be advanced manually, so
a four-bar attempt at 58 BPM runs instantly and deterministically.

## Running them

```bash
cd tests
npm install                 # jsdom (only dependency)
node all.js                 # everything
node flash.js               # or one at a time
```

## What the suite covers

Notation is rendered by **abcjs**, which loads from its own `<script>` that jsdom
does not fetch — so the suite cannot see the drawn notation at all. It tests
**behaviour and the model** instead, asserting on DOM state and the model hooks
`window.__onsets` (sounding onsets in units) and `window.__abc` (the pattern's
ABC, a stable fingerprint) that `showPattern` publishes.

| File | What it protects |
|---|---|
| `run.js` | Attempt lifecycle: count-in → play → idle; result panel; clean pattern generation across levels |
| `buttons.js` | Every control's state in every app state; level-up suggestion |
| `flash.js` | Beat flash maps to the right beat; silent mode schedules zero audio |
| `tempo.js` | Tempo control changes click spacing, persists, respects limits |
| `slack.js` | A correct read with sloppy timing passes; a wrong read still fails |
| `reading.js` | An ordinary tap on a correct read scores green; mashing does not |
| `require-sustain.js` | Sustain is genuinely required — same onsets, stabbed holds |
| `calibrate.js` | Latency self-calibration converges on a hidden output delay |
| `variety.js` | Every level yields ≥8 distinct patterns; none empty |
| `swipe.js` | Swipe ≠ tap: neither gesture triggers the other |
| `behaviour.js` | Attempt mode plays no reference notes; Show me does |
| `persist.js` | Settings survive a relaunch; works without `window.storage` |
| `pwa.js` | Installable; no required off-origin assets; abcjs vendored locally |

The pure-rendering suites (contrast, layout, vlevels, sustain, preview, crossbar,
ties, beamfreq, rests) were removed when the renderer moved to abcjs — jsdom
paints nothing, so there was nothing left for them to assert. If you have a real
browser, use Playwright for anything visual.

## Caveat on the harness itself

Several "failures" during development were bugs in the *tests*, not the app —
holding notes through rests, or firing two taps 1 ms apart (correctly debounced).
If a test fails on you, check whether the harness or the app is wrong. Several
suites are also **flaky by construction**: they generate unseeded random bars, so
run a suite a few times before believing a single red run.
