# Soitax

A rhythm-notation reading trainer. It shows you a bar or four of rhythm, counts
you in, and you tap what you read — holding each note for its written length.
One self-contained HTML file, no build step, no dependencies at runtime.

**[ostax.app](https://ostax.app/)** — open it on your phone, add to home screen, works fully offline.

## What it trains

Reading notation, not metronome precision. The timing windows are deliberately
loose — a correct read with sloppy timing passes; a wrong read doesn't. What it
*does* insist on is **sustain**: a half note held like a staccato stab is marked
wrong, because note length is half of what the notation is telling you.

- **Eleven levels**, staged the way rhythm reading is usually taught: quarter notes
  → half notes → eighth notes and rests → dotted quarters → ties and
  syncopation → sixteenths → triplets.
- **Real notation**, engraved by [abcjs](https://abcjs.net): proper beam
  grouping by beat (pairs of eighths, fours of sixteenths), conventional rest
  glyphs, dotted notes, triplets, and ties — including ties across the bar line.
- **Feedback lane** under each staff showing, per note, how far off your onset
  was and how long you actually held it against the written value.
- **Latency self-calibration.** Phone audio output lags by ~100 ms and browsers
  mostly won't tell you by how much, which makes an accurate player look
  consistently late. It measures your median bias and corrects for it.
- **Silent practice.** The page flashes on each beat, accented on beat one, so
  you can practise with the sound off and still keep time.

## Controls

| | |
|---|---|
| Centre pad | tap to start, then tap the rhythm — **hold** for note length |
| ‹ › | previous / next pattern (swipe works too) |
| − BPM + | tempo, 34–168 |
| Show me | play the rhythm and run a cursor over it |
| Silent | mute everything; the beat flash carries the rhythm |

Your level, tempo, and latency calibration are saved on the device.

## Putting it on your phone

Open [ostax.app](https://ostax.app/) in **Safari** (not in another app's browser — iOS only offers
this from Safari itself), then **Share → Add to Home Screen**.

It launches full-screen with no browser chrome, and a service worker caches the
whole app on first visit, so afterwards it runs with no network at all. Useful if
you practise somewhere without signal.

## Publishing it

It's a single static file, so any host works.

**GitHub Pages** — after pushing this repo:

1. Settings → Pages
2. Source: *Deploy from a branch*, branch `main`, folder `/ (root)`
3. It appears at `https://<you>.github.io/<repo>/` within a minute or two

Because the app is `index.html` at the root, that URL serves it directly.

**Anything else** — drag the folder onto Netlify Drop, or `npx vercel`, or
Cloudflare Pages. No build command; the output directory is the repo root.

## Tests

```bash
cd tests
npm install
node all.js
```

13 suites covering grading behaviour, control states, pattern variety, and the
installable/offline contract. Notation is rendered by abcjs (not loaded under
jsdom), so the tests assert on the model and DOM state — see
[tests/README.md](tests/README.md).

## Licence

MIT
