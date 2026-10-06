# Nazlı Studio

A Turkish, touch-friendly virtual acoustic guitar. Static HTML/CSS/ES modules, no build dependencies, external assets, tracking or accounts.

## Play

- Tap or drag across six strings; keyboard **1–6** plays low E through high e.
- **Q W E R T Y U I** chooses Em, Am, C, G, D, Dm, F, A.
- **Space / Down** strums down, **Up** strums up; **Escape** stops playback.
- Steel, nylon and warm timbres are synthesized with a fractional-delay Karplus–Strong string model. These are synthesized instruments, not recorded guitar samples.
- Simple, folk and arpeggio accompaniment, adjustable 50–160 BPM, optional metronome.
- Record up to 60 seconds, replay, loop or export stereo PCM WAV. The last successful take and preferences stay in this browser. An empty replacement take preserves the prior recording.

Recording captures the guitar note performance, including accompaniment, without requesting microphone permission. WAV export includes the guitar and room effect; metronome clicks are not recorded. An inactive tab stops transport and finishes a recording to avoid delayed bursts of notes. Audio begins only after interaction.

## Run locally

```sh
python3 -m http.server 8080
```

Open http://localhost:8080. ES modules require an HTTP(S) server; GitHub Pages can serve the repository root directly.

## Check and update

```sh
node --test tests/*.test.mjs
python3 scripts/version-assets.py
```

Run asset versioning after edits. It updates the import graph and HTML asset URLs together to avoid mixing old and new scripts/styles from a browser cache. No dependency installation is needed for the state/DSP tests or site.

The automated tests check chord notes, muted strings, pattern timing, synthesis bounds and pitch at multiple sample rates, recording validation, WAV encoding, and application recording/playback/loop state. Application tests use a DOM/audio stand-in; they are not a substitute for real browser and listening checks.

## Layout

Desktop uses an illustrated guitar with an adjacent chord/rhythm panel. Phones have six enlarged touch rows and a stacked layout. Controls support keyboard focus and reduced-motion preferences. Finger strumming captures touches only within the string area so the rest of the page can scroll normally.

## Browser verification

Verified in headless Chromium at 320, 390, 560, 768, 1024, 1440 and 1920 CSS-pixel widths with no horizontal page overflow. Exercised chord selection, recording and persistence across reload, loop playback and stop, accompaniment, help, and a real OfflineAudioContext WAV download with nonzero PCM samples. Desktop and phone screenshots were inspected. These checks do not replace physical-device listening or Safari testing.
