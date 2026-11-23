# Architecture

How the app works, for anyone (including future me) changing the code.

- [Principles](#principles)
- [Files and load order](#files-and-load-order)
- [Data formats](#data-formats)
- [From song to events](#from-song-to-events)
- [The playback engine](#the-playback-engine)
- [Judging hits](#judging-hits)
- [Inputs](#inputs)
- [Microphone mode](#microphone-mode)
- [Sound](#sound)
- [Importers](#importers)
- [Storage](#storage)
- [Offline support](#offline-support)
- [Making common changes](#making-common-changes)

## Principles

- **No build step and no dependencies.** Plain HTML, CSS and JavaScript. Open `index.html` and it runs.
- **Works from disk and from GitHub Pages.** Scripts are classic `<script>` tags rather than ES modules, because browsers block modules on `file://` pages. Top-level `const`, `let` and `function` declarations are shared across files.
- **Everything stays on the device.** No network requests except Google Fonts (the app still works without them).
- **One clock.** All timing uses the Web Audio clock (`AudioContext.currentTime`), so the metronome, the visuals, MIDI hits and microphone hits line up.

## Files and load order

Order matters only for code that runs at load time (later files may call functions from any file once the page has loaded).

| File | Responsibility |
|---|---|
| `data.js` | `DRUMS`: id, name, colour, position and size on the kit drawing, position on the staff, keyboard key, hand/foot. `DEFAULT_MAP`: MIDI notes per drum (Alesis Nitro Mesh plus General MIDI). |
| `storage.js` | `store` (localStorage with an in-memory fallback), `settings`, `bests`. |
| `lessons.js` | `pat()` builds a lesson from text rows such as `"x...x...x...x..."`; `LESSONS`; the user's `songs`. |
| `util.js` | `$`, `el` (SVG), `h` (HTML), `esc`, `toast`, `uid`. |
| `audio.js` | Lazily creates the `AudioContext`; synthesised drum sounds `playDrum()` and `click()`. |
| `song.js` | `compile(song)` turns a song into timed events with hand assignments. |
| `kit.js` | Builds the kit SVG once; helpers to set hand tags, flash a drum and float feedback text. |
| `engine.js` | `E` (engine state), start/pause/stop, tempo, the animation loop, sound scheduling, wait mode, `judge()`, `onHit()`, `updateFrame()`. |
| `sheet.js` | Draws the simplified notation strip and moves its playhead. |
| `midi.js` | Web MIDI connection, note-to-drum mapping, Learn, header status pill, keyboard input. |
| `mic.js` | Microphone hit detection, drum teaching, delay measurement, `judgeOnset()`. |
| `importers.js` | `parseMidi()` and `parseMusicXML()`. |
| `library.js` | Library lists, imports, saving songs. |
| `editor.js` | Note grid, record from kit, listen, sheet tracing. |
| `app.js` | Navigation between screens, control wiring, start-up. |

## Data formats

### Song

```js
{
  id: "S…",                 // "L1".."L10" for built-in lessons
  title: "My groove",
  bpm: 80,
  bars: 2,
  beats: 4,                 // beats per bar: 4 (4/4) or 3 (3/4)
  notes: [ { s: 0, d: "kick" }, { s: 0, d: "hihat" }, { s: 4, d: "snare" } ],
  source: "MIDI file",      // optional, shown in the library
  builtin: false
}
```

- `s` is the position in **16th-note steps** from the start (a 4/4 bar has 16 steps).
- `d` is a drum id: `crash`, `ride`, `hihat`, `tom1`, `tom2`, `snare`, `floor`, `kick`, `hhp` (hi-hat pedal).

### Settings (saved as `drumapp.settings`)

`metro`, `demo`, `hitSnd`, `vol`, `loop`, `wait`, `view`, `offset` (ms, USB/tap timing adjustment), `map` (`{drumId: [midiNote, …]}`), `lastSong`, and `mic`: `{sens, offset, check, cal}`, where `cal` holds the taught drum fingerprints.

## From song to events

`compile()` groups notes that share a step into **events** (one moment, possibly several drums) and assigns hands:

- One cymbal plus one drum: cymbal **right**, drum **left** (standard hi-hat or ride groove).
- Two drums, no cymbal: snare left, the other right.
- A single cymbal: right hand.
- A run of single drums (a fill): alternate right, left, right… starting with the right hand, restarting after any cymbal.
- Kick: right foot. Hi-hat pedal: left foot.

These rules suit beginner material; they aren't a full sticking system.

## The playback engine

The position `E.pos` is measured in steps. While playing:

```
pos = posBase + (audioTime - clockBase) / stepSeconds
```

`rebase(pos)` resets `posBase`/`clockBase`; it's used on start, tempo changes and loop wrap, so changing tempo mid-song doesn't jump.

- **Count-in:** playback starts at `-stepsPerBar` (one bar of clicks before step 0).
- **Wait mode:** when `pos` reaches the first event with unjudged notes, the engine freezes `pos` (`E.blocked`) until those notes are hit, then rebases and continues.
- **Loop:** at the end, judgements reset and `pos` wraps by the song length.
- **Sound scheduling:** each frame, sounds for steps up to 120 ms ahead are scheduled on the audio clock (a look-ahead scheduler), so clicks are sample-accurate even though frames arrive every ~16 ms. In wait mode, the horizon stops at the blocking event.
- **Rendering** (`updateFrame`): the current event is the first one with unjudged notes that isn't more than 160 ms in the past. Its drums are lit when they're less than about one beat away. Each drum's ring radius is `r × (1 + 0.85 × timeLeft/lead)`. The following event gets the dashed "NEXT" ring.

## Judging hits

`onHit(drum, velocity, timestamp, source)` is the single entry point for USB, tap and keyboard hits. It converts the hit time to a song position (subtracting MIDI delivery lag and the user's timing adjustment) and calls `judge()`:

- Find the nearest unjudged note **of that drum** within ±160 ms.
- Grade by distance: ≤45 ms *perfect*, ≤100 ms *good*, else *ok* (shown as too early/late, and breaks the streak).
- Notes more than 160 ms in the past with no hit become *miss* (not in wait mode).

Microphone hits go through `judgeOnset()` instead (see below), because a microphone hears one combined sound for simultaneous drums.

## Inputs

- **USB MIDI** (`midi.js`): `navigator.requestMIDIAccess()`. Note-on messages with velocity > 0 are mapped with `settings.map`, falling back to General MIDI. *Learn* moves a note number to the chosen drum. Hot-plugging is handled with `onstatechange`.
- **Tap:** `pointerdown` on a kit piece.
- **Keyboard:** see `DRUMS[].key`. Space and Enter are ignored when a button has focus, to avoid double actions.

## Microphone mode

`mic.js` works in three stages.

### 1. Hit detection (`OnsetCore`)
Audio arrives in blocks of 128 samples (~2.7 ms). For each block:
- Five band-pass energies are computed with biquad filters: <110 Hz (kick), ~250 Hz (toms), ~900 Hz (snare body), ~3.5 kHz (snare wires / stick), >7 kHz (cymbals).
- A **hit** starts when the block's loudness is above the sensitivity threshold **and** more than 5× the average of the last few milliseconds. The short comparison window lets a soft hi-hat right after a loud kick still register (an earlier version used a ~0.7 s average and missed those).
- The **attack** fingerprint is the band energies over the first 32 ms. The **decay** is the energy from 32 to 90 ms (cymbals ring, closed hi-hats don't).
- After 90 ms the hit is reported with its start time on the audio clock. One hit per 90 ms is the limit (about 16th notes at 160 BPM).

`OnsetCore` runs in an **AudioWorklet** (audio thread) when the page is served over http(s). Browsers refuse to load worklets on `file://` pages, so there it falls back to a `ScriptProcessorNode` running the same function on the main thread. Its timestamps are slightly less exact, which **Measure delay** corrects.

### 2. Fingerprints and teaching
A fingerprint is the log of each band's share of the attack energy (so it doesn't depend on how hard you hit) plus a weighted log decay ratio. **Teach** averages 6 hits per drum and stores the band shares, typical loudness and decay ratio in `settings.mic.cal`.

To compare against **several drums at once** (e.g. kick + hi-hat), the taught band energies are added together (`micCalFeat(ids)`) and turned into a fingerprint. That gives an "expected sound" for any combination without having to teach combinations.

### 3. Judging (`judgeOnset`)
- Find the nearest event with unjudged notes within ±160 ms (or the waiting event in wait mode).
- **Drum check** (`micDrumCheck`): compare the hit's distance to the expected combination (or any single expected drum) with its distance to the closest taught drum that *isn't* expected. It passes if the expected sound is closer (strict), or within 1.25× and ignoring same-group drums (forgiving: toms are one group, crash and ride another). Untaught drums can't be checked, so they pass on timing alone.
- Timing is graded as for USB, and all notes of the event are judged together.

**Delay measurement:** 8 clicks are scheduled through the speakers; the median gap between each scheduled click and the hit the mic detects becomes `settings.mic.offset`.

**Known weaknesses:** room echo, a metronome leaking into the mic, very fast rolls (under 90 ms apart), and drums that sound alike. With synthesised test sounds, detection and identification were near perfect (see TESTING.md); real kits in real rooms will be noisier.

## Sound

`audio.js` synthesises every sound, so there are no audio files: kick (sine pitch drop), snare (filtered noise plus tone), hi-hats and cymbals (filtered noise), toms (pitched sines), metronome (short square wave). Everything goes through one master gain (the Volume slider).

## Importers

- **MIDI** (`parseMidi`): reads standard MIDI files (format 0/1, PPQ timing). It uses note-ons on channel 10 (falling back to any note with a General MIDI drum number), the first tempo and the time signature. Ticks are rounded to 16th notes.
- **MusicXML** (`parseMusicXML`): partwise, uncompressed. Picks the part containing `<unpitched>` notes. Positions follow `<duration>`, `<chord>`, `<backup>` and `<forward>`. Drums are identified first by instrument name ("Acoustic Snare", "Closed Hi-Hat"…), then by staff position (F4 kick, C5 snare, G5 hi-hat, A5 crash…). Grace notes are skipped.

## Storage

`localStorage` keys: `drumapp.settings`, `drumapp.songs`, `drumapp.bests`. If storage is unavailable (private mode, blocked), the app keeps working in memory for the session.

## Offline support

`sw.js` caches the app's files and serves them **network first**: online, you always get the latest version from GitHub Pages; offline, the cached copy. It's registered only on `https:` pages. When adding files, add them to `FILES` and bump `CACHE`.

## Making common changes

- **Add a lesson:** add a `pat(...)` line in `lessons.js`. Each row string is one bar of 16 characters, `x` for a hit; an array gives one string per bar.
- **Change the kit layout:** edit `cx`, `cy`, `r` in `DRUMS` (`data.js`). The drawing is 880 × 610 units.
- **Support another e-kit:** add its note numbers to `DEFAULT_MAP`, or just use *Learn* in Kit setup.
- **Change grading windows:** the 45 / 100 / 160 ms values are in `judge()` (`engine.js`) and `judgeOnset()` (`mic.js`).
- **Tune the microphone:** detection constants are in `OnsetCore`; the strictness factors (1.0 / 1.25 / 1.1) are in `micDrumCheck`.
