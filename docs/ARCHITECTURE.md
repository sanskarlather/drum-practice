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
- [Articulations](#articulations)
- [Kits](#kits)
- [Sheet reader](#sheet-reader)
- [Importers](#importers)
- [Storage](#storage)
- [Offline support](#offline-support)
- [Making common changes](#making-common-changes)

## Principles

- **No build step.** Plain HTML, CSS and JavaScript. Open `index.html` and it runs. The only third-party code is PDF.js in `vendor/`.
- **Works from disk and from GitHub Pages.** Scripts are classic `<script>` tags rather than ES modules, because browsers block modules on `file://` pages. Top-level `const`, `let` and `function` declarations are shared across files.
- **Everything stays on the device** unless you use the AI sheet reader, which sends page images to the provider you chose, with your own key. Otherwise the only network request is Google Fonts, and the app works without them.
- **One clock.** All timing uses the Web Audio clock (`AudioContext.currentTime`), so the metronome, the visuals, MIDI hits and microphone hits line up.

## Files and load order

Order matters only for code that runs at load time (later files may call functions from any file once the page has loaded).

| File | Responsibility |
|---|---|
| `data.js` | `PIECE_TYPES` (how each kind of piece is drawn, notated and grouped), piece ids and names, `FALLBACK` between pieces, `DEFAULT_MAP` (Alesis Nitro Mesh + General MIDI notes), `GM` for importers. `DRUMS`/`D` hold the active kit. |
| `storage.js` | `store` (localStorage with an in-memory fallback), `settings`, `bests`. |
| `lessons.js` | `pat()` builds a lesson from text rows such as `"x...x...x...x..."`; `LESSONS`; the user's `songs`. |
| `util.js` | `$`, `el` (SVG), `h` (HTML), `esc`, `toast`, `uid`. |
| `kits.js` | Kits and presets, `applyKit()` (fills `DRUMS`/`D`), `resolveDrum()`, adding/removing/dragging pieces, the kit editor. |
| `audio.js` | Lazily creates the `AudioContext`; synthesised drum sounds `playDrum()` and `click()`. |
| `song.js` | `compile(song)` turns a song into timed events with hand assignments. |
| `kit.js` | Builds the kit SVG once; helpers to set hand tags, flash a drum and float feedback text. |
| `engine.js` | `E` (engine state), start/pause/stop, tempo, the animation loop, sound scheduling, wait mode, `judge()`, `onHit()`, `updateFrame()`. |
| `sheet.js` | Draws the simplified notation strip and moves its playhead. |
| `midi.js` | Web MIDI connection, note-to-drum mapping, Learn, header status pill, keyboard input. |
| `mic.js` | Microphone hit detection, drum teaching, delay measurement, `judgeOnset()`. |
| `importers.js` | `parseMidi()` and `parseMusicXML()`. |
| `library.js` | Library lists, imports, saving songs. |
| `sheetreader.js` | PDF/photo → pages (PDF.js), the AI reader, the offline reader, the reading dialog and API key settings. |
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
  notes: [ { s: 0, d: "kick" }, { s: 0, d: "hihat", a: "open" }, { s: 4, d: "snare", a: "accent" } ],
  source: "MIDI file",      // optional, shown in the library
  builtin: false
}
```

- `s` is the position in **16th-note steps** from the start (a 4/4 bar has 16 steps).
- `a` (optional) is the articulation: `accent`, `ghost`, `open`, `rim`, `xstick`, `bell`, `flam` or `choke` (see `artic.js`). Absent = a normal hit.
- `d` is a piece id: `crash`, `ride`, `hihat`, `tom1`, `tom2`, `snare`, `floor`, `kick`, `hhp` (hi-hat pedal), plus extra pieces such as `tom3`, `floor2`, `crash2`, `splash`, `china`, `ride2`, `kick2`. Ids not in the active kit are mapped with `resolveDrum()`.

### Kit (saved as `drumapp.kits`)

```js
{ id: "K…", name: "My kit",
  pieces: [ { id: "tom3", type: "tom", name: "Tom 3", cx: 560, cy: 190, r: 48 } ],
  map: { tom3: [47] },          // MIDI notes per piece
  cal: { tom3: { p:[…], tot, dr, n } } }   // microphone fingerprints per piece
```

### Settings (saved as `drumapp.settings`)

`metro`, `demo`, `hitSnd`, `vol`, `loop`, `wait`, `view`, `offset` (ms, USB/tap timing adjustment), `lastSong`, `kit` (active kit id), `mic`: `{sens, offset, check}`, and `ai`: `{provider, keys:{provider: key}, models:{provider: model}, baseUrl, remember, method}`. At runtime `settings.map` and `settings.mic.cal` point at the active kit's `map` and `cal`; they're saved with the kits, not in settings.

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

## Articulations

`artic.js` defines each articulation: its label, the short text shown on the kit, its notation sign, its drum-tab character (`X` accent, `g` ghost, `o` open, `r` rimshot, `c` cross-stick, `b` bell, `f` flam, `k` choke), which piece types it fits, and whether e-kits send a separate MIDI note for it (`variant`).

- **Data:** notes carry `a`. `compile()` keeps it on each note and in `event.art[pieceId]`. `resolveNotes()` and `resolveDrum()` keep it if it still fits the piece.
- **Input:** `noteToDrum()` returns `{d, a}`. Variant notes live in the kit's map under keys like `hihat:open`, `snare:rim`, `snare:xstick` and `ride:bell`, defaulting to the Nitro Mesh / General MIDI notes 46, 40, 37 and 53 (moved off the main piece when an older kit is loaded). Keyboard: Shift + key = the piece's first variant.
- **Judging:** `articProblem(note, {a, vel, src})` compares how it was played with what's written. Variant mismatch (open vs closed, rim vs head, bell vs bow) applies to MIDI input and to microphone input when both versions were taught. Velocity applies to accents (≥ `settings.vel.accent`/127) and ghost notes (≤ `settings.vel.ghost`/127). A problem makes the note `j = "art"`: not good, streak reset, tip shown. In wait mode the engine keeps waiting. `settings.artic` turns checking off.
- **Microphone:** variants can be taught as separate fingerprints (`cal["hihat:open"]`). `micArticProblem()` decides which version an onset is closer to, and estimates loudness as amplitude relative to the taught hits (a hit as loud as the taught ones ≈ velocity 76).
- **Display:** the kit's centre text shows `ARTICS[a].short`; the instruction and *Coming up* chips name it. The notation draws `>`, `o`, `( )`, diamonds, slashed heads, circled x, grace notes and `+`.
- **Sound:** `playDrum(id, t, vel, a)` has separate synthesis for open hi-hat, rimshot, cross-stick, bell, choke and flam, and scales ghost/accent velocity.
- **Import:** MIDI uses notes 46/26 (open), 37 (cross-stick), 53 (bell), and velocity relative to each drum's median for accents and ghost notes. MusicXML uses instrument names ("Open Hi-Hat", "Side Stick", "Ride Bell"), `<accent>`, parenthesised noteheads, `<open>`, and grace notes (= flam). The AI reader's prompt asks for these characters explicitly. The offline reader doesn't detect articulations.

## Kits

- `PIECE_TYPES` defines each kind of piece: how it's drawn (`kind`: cym, drum, kick, pedal), its default size and colours, its staff position for the 1st, 2nd, 3rd… piece of that type, whether it's played by hand, and its `group` (toms, cymbals) for forgiving microphone checking.
- `applyKit(kit)` builds `DRUMS`/`D` from the kit's pieces, assigning colours, staff positions, keyboard keys (the classic keys for the standard pieces, then spare letters) and feet (first kick = right foot, others and the hi-hat pedal = left foot).
- `resolveDrum(id)` returns the piece to play for a song's id: the piece itself, else the first available entry in `FALLBACK[id]`, else any piece of the same type. `compile()`, the editor and live MIDI input all go through it, so lessons written for a 5-piece kit play on any kit.
- `kitChanged()` re-applies the kit and redraws everything (practice kit, sheet, editor grid, pad mapping, mic rows).
- New pieces are placed in the emptiest spot of a zone that suits their type, away from other pieces, the bass drum and the seat. Dragging uses pointer events on the editor's SVG with `getScreenCTM()` to convert to drawing coordinates.
- A MIDI note can only belong to one piece: `dedupeMap()` gives notes listed in `EXTRA_MAP` to the extra piece (e.g. 57 to Crash 2 rather than Crash).

## Sheet reader

`sheetreader.js` turns a PDF or image into page canvases. PDF pages are rendered with **PDF.js** (`vendor/pdfjs`) at ~2200 px on the long edge. On `file://` pages the PDF.js worker runs on the main thread, because browsers won't start workers there. Up to 8 pages are read.

### AI reader
- Pages are downscaled to 1568 px on the long edge, JPEG-encoded, and sent in one request, straight from the browser, to the provider chosen in `settings.ai.provider`. `AI_PROVIDERS` lists the providers; `AI_CALL` has one function per provider:

| Provider | Endpoint | Key header | Notes |
|---|---|---|---|
| `gemini` | `generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` | `x-goog-api-key` | `thinkingConfig.thinkingLevel: low` |
| `anthropic` | `api.anthropic.com/v1/messages` (+ `anthropic-dangerous-direct-browser-access`) | `x-api-key` | |
| `groq` | `api.groq.com/openai/v1/chat/completions` | `Authorization: Bearer` | |
| `openrouter` | `openrouter.ai/api/v1/chat/completions` (+ `reasoning: {effort: "low", exclude: true}`) | `Authorization: Bearer` | |
| `custom` | `{base URL}/chat/completions` (OpenAI-compatible) | `Authorization: Bearer` (if a key is set) | |

- **One page per request**, and the answer is **compact drum tab**, not JSON: `BAR n` lines followed by one line per drum, e.g. `HH x.x.x.x.x.x.x.x.` (a code, then one character per 16th note). A full page is a few hundred tokens instead of thousands, which fits free models' output limits. `srParseTab()` tolerates small slips: dashes for rests, `|` bar marks, missing `BAR` lines, and lines with 4 or 8 characters (stretched to the bar).
- "Thinking" shares the output budget on many providers, so it's kept low (`thinkingLevel: low` on Gemini, `reasoning.effort: low` on OpenRouter). If a model rejects that option, the request is retried without it. If an answer is cut off, the bars read so far are kept and the user is told to check the end. If nothing was written, the message explains that the model spent its budget thinking.
- On 429 (rate limit) the app waits 20 s and retries once; on 500/503 it waits 5 s and retries once.
- Keys always go in headers, never in the URL. A key pasted under the wrong provider is recognised by its prefix (`AIza`, `gsk_`, `sk-or-`, `sk-ant-`) and the provider is switched.
- **Keys are the user's own**, kept per provider in `settings.ai.keys` (localStorage) or in memory for the session only (`SR.sessionKeys`). No key exists in the code.
- `srListModels()` calls each provider's model-list endpoint. It backs **Test key** and **Load models** and costs nothing.
- The prompt asks for every bar written out on a 16th-note grid (repeats expanded), with standard drum-notation positions and any legend on the page taking priority.
- Errors are translated into plain messages (bad key, free-tier limit, rate limit, no credit, unknown model, busy, too long).

### Offline reader (optical music recognition)
Per page:
1. **Binarise** with an adaptive (Bradley) threshold, so uneven light in photos doesn't matter.
2. **Deskew:** try angles from −5° to +5° and keep the one whose row histogram is sharpest; rotate if it's more than 0.25°.
3. **Find staves:** rows that are mostly dark become line candidates; five with equal spacing make a staff. The spacing `sp` sets the scale for everything else.
4. **Erase staff and ledger lines**, keeping pixels where a symbol crosses them.
5. **Vertical strokes** longer than 2.2·sp: those spanning exactly from top line to bottom line are **barlines**; the rest are stems. All are removed.
6. **Filled noteheads:** erode the image *with the staff lines still in* (lines vanish, heads touching a line stay whole), then keep blobs of notehead size and fill. Two heads touching vertically are split.
7. **Cymbal x-heads:** cymbals sit at known heights, so those rows are scanned with an x-shaped template (both diagonals dark, centre-edges light).
8. **Pitch → piece:** staff position (half-spaces above the bottom line) and head shape map to pieces (filled F4 = kick, C5 = snare, x on G5 = hi-hat, x on A5 = crash…).
9. **Rhythm:** within each bar, notes at the same x form a column. Assuming roughly proportional spacing, the reader fits quarter, 8th or 16th grids and picks the best fit, with a small preference for simpler grids. Leading rests are detected from the usual gap after a barline.

An overlay image shows what was found. Measured on sheets drawn by the app: 198/198 notes on clean pages, 197/198 on a rotated, blurred, unevenly lit "photo" (see TESTING.md). Real engraved music varies more, which is why the result always opens in the editor for checking.

## Importers

- **MIDI** (`parseMidi`): reads standard MIDI files (format 0/1, PPQ timing). It uses note-ons on channel 10 (falling back to any note with a General MIDI drum number), the first tempo and the time signature. Ticks are rounded to 16th notes.
- **MusicXML** (`parseMusicXML`): partwise, uncompressed. Picks the part containing `<unpitched>` notes. Positions follow `<duration>`, `<chord>`, `<backup>` and `<forward>`. Drums are identified first by instrument name ("Acoustic Snare", "Closed Hi-Hat"…), then by staff position (F4 kick, C5 snare, G5 hi-hat, A5 crash…). Grace notes are skipped.

## Storage

`localStorage` keys: `drumapp.settings`, `drumapp.songs`, `drumapp.bests`. If storage is unavailable (private mode, blocked), the app keeps working in memory for the session.

## Offline support

`sw.js` caches the app's files and serves them **network first**: online, you always get the latest version from GitHub Pages; offline, the cached copy. It's registered only on `https:` pages. When adding files, add them to `FILES` and bump `CACHE`.

## Making common changes

- **Add a piece type:** add it to `PIECE_TYPES`, `BASE_IDS`, `BASE_NAMES` and `FALLBACK` in `data.js` (and to `AI_DRUMS`/`AI_TO_ID` in `sheetreader.js` if the AI should know it).
- **Add a kit preset:** add an entry to `KIT_PRESETS` in `kits.js`: `[type, x, y, radius]` per piece.
- **Add a lesson:** add a `pat(...)` line in `lessons.js`. Each row string is one bar of 16 characters, `x` for a hit; an array gives one string per bar.
- **Change the default kit layout:** edit the `standard` preset in `kits.js`. The drawing is 880 × 610 units.
- **Support another e-kit:** add its note numbers to `DEFAULT_MAP`, or just use *Learn* in Kit setup.
- **Change grading windows:** the 45 / 100 / 160 ms values are in `judge()` (`engine.js`) and `judgeOnset()` (`mic.js`).
- **Tune the microphone:** detection constants are in `OnsetCore`; the strictness factors (1.0 / 1.25 / 1.1) are in `micDrumCheck`.
