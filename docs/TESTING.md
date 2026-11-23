# Testing

Two kinds of testing apply to this project:

1. **Automated tests**, run in a headless browser. The AI assistant wrote and ran these during development. They check that the logic works.
2. **Human testing on real drums**, which only a person with a kit can do. It checks that the app is actually usable: latency, real sounds, real rooms, real phones.

Both matter. Passing automated tests does **not** mean the app works well with your kit.

## 1. Automated tests

### What they cover

| Test | What it checks | Result during development |
|---|---|---|
| Practice playback | Count-in, events judged when hit on time, accuracy and streak counted | Passed: hits within ~15 ms graded Good/Perfect, streak counted |
| Misses | Notes with no hit become misses | Passed |
| Wait mode | Playback stops at the next note and waits | Passed |
| MIDI import | A 2-bar rock beat MIDI file → 24 notes, 120 BPM, 2 bars, correct drums | Passed |
| MusicXML import | Hi-hat, snare and kick with `<chord>` and `<backup>` → 12 notes, 96 BPM | Passed |
| Note editor | Opening a lesson, Listen, Save | Passed |
| Mic judging | Right sound on time → Perfect; wrong drum → "wrong" | Passed (4/4) |
| Mic detection | 42 synthesised kick/snare/hi-hat hits, including hi-hats right after kicks, fed in as a fake microphone | Passed: 42/42 detected, 0 false hits, 18/18 single drums identified, 24/24 combinations accepted, 3/3 wrong drums rejected, timing within ~1 ms (AudioWorklet) and ~10 ms (file:// fallback) |
| Offline sheet reader | All 10 lessons drawn as printed notation on one page, read back and compared note by note | Clean page: 198/198 notes, 0 wrong. Rotated 1.5°, blurred, unevenly lit: 197/198, 0 wrong. Smaller print (1000 px page): 198/198 |
| PDF import | `samples/rock-beat-sheet.pdf` through the Library with PDF.js and the offline reader | Passed: 48/48 notes, 4 bars |
| AI sheet reader | With **stand-ins** for the Gemini, Groq, OpenRouter, Alibaba, Mistral, Hugging Face, Claude and OpenAI-compatible APIs, plus a user-added service (name, address, key, image-format retry, removal) and Alibaba's region address: endpoint, key in a header (never the URL), image sent, low reasoning on OpenRouter; drum-tab answers → notes (incl. dashes, bar marks, short lines, 3/4, no BAR line, unreadable); cut-off answer, retry without reasoning, wrong-provider key, Gemini model filtering, free-tier wait-and-retry, rejected key, model drop-down | Passed (54 checks). **Not tested against any real API** (no keys during development) |
| Kits | Presets; add tom/crash/kick; MIDI note moves to the new crash; second kick = left foot; drag a piece; per-kit pad mapping; fallback (tom2 → tom1 on a small kit); survives reload; remove a piece; big kit practice | Passed (14 checks) |
| Articulations | Lessons; judging with simulated MIDI (open played closed and vice versa, soft accents, ghost notes, checking switched off, Wait for me); kit label; notation marks; editor tools; recording; MIDI/MusicXML/AI-tab import; pad-mapping rows and note numbers; microphone loudness | Passed (26 checks) |
| Layout | Desktop (1440 px) and phone (390 px) screenshots checked by eye | Passed |
| Console | No JavaScript errors on any screen | Passed |

The mic detection test uses **synthesised** drum sounds in a quiet signal, so it's a best case. Real drums, room echo and a phone mic will do worse. Likewise, the offline sheet reader was tested on notation drawn by this app; sheet music from books, MuseScore or other engravers looks different and will read less reliably.

### Running them yourself

You need Python 3 and Playwright.

```bash
pip install playwright numpy
python -m playwright install chromium

# from the repository folder: serve the app locally
python -m http.server 8000

# in a second terminal
python tests/smoke_test.py              # playback, judging, importers, editor, mic judging
python tests/make_test_audio.py         # writes tests/out/mic.wav
python tests/mic_detection_test.py      # fake microphone detection test
python tests/sheet_reader_test.py       # offline reader, PDF import, AI reader with a stand-in API
python tests/kits_test.py               # kit customisation
python tests/articulations_test.py      # open hi-hat, accents, ghost notes, rimshots…
```

Each script prints its results and exits with an error if a check fails. Screenshots are saved in `tests/out/`.

## 2. Human testing checklist

Work through this on your own hardware, then tick each item (edit this file on GitHub and change `[ ]` to `[x]`). Note anything odd in the log at the bottom, and update the *Testing status* table in the README.

### Laptop + Alesis Nitro Mesh (USB)
- [ ] Kit setup → Connect finds the module by name
- [ ] Every pad lights the right drum: kick, snare (head and rim), 3 toms, hi-hat open and closed, hi-hat pedal, crash, ride
- [ ] *Learn* remaps a pad, and the change survives a page reload
- [ ] Lesson 1 at 70 BPM: hits that feel on time are graded Perfect/Good
- [ ] If hits read consistently late or early, the timing adjustment fixes it (note the value: ____ ms)
- [ ] Wait for me pauses and continues correctly
- [ ] Loop repeats without a gap or double click
- [ ] Tempo change while playing doesn't jump or lose sync
- [ ] Metronome is audible over the module's sound in headphones (adjust Volume)
- [ ] Record from kit puts notes in the right grid columns
- [ ] Unplugging and replugging the USB cable reconnects

### Microphone mode (acoustic kit, or e-kit through a speaker)
- [ ] Turn on microphone: the level bar reacts to hits and not much to talking
- [ ] Taught kick, snare and hi-hat are identified correctly most of the time (estimate: ___ %)
- [ ] Toms and cymbals: note how often they're mixed up in strict mode: ____
- [ ] Measure delay gives a stable value when repeated (values: ____, ____)
- [ ] With headphones, lesson 4 grades on-time hits as Perfect/Good
- [ ] Without headphones, the metronome does cause false hits (expected; confirms the warning is needed)
- [ ] Fast 16th notes (lesson 9 fill) at 70 BPM are all detected

### Android phone
- [ ] GitHub Pages link opens and the layout fits the screen
- [ ] Add to Home screen works, and the app opens from the icon
- [ ] Opens offline after the first visit (airplane mode)
- [ ] Nitro Mesh over a USB-OTG adapter connects and lights the pads
- [ ] Microphone mode works with the phone's own mic
- [ ] Tapping drums on screen plays sounds with acceptable delay

### Imports
- [ ] `samples/rock-beat.mid` imports as a 2-bar rock beat
- [ ] `samples/rock-beat.musicxml` imports as a 1-bar beat
- [ ] A MIDI file from the internet or another app imports sensibly (which one: ______)
- [ ] A MusicXML export from MuseScore imports sensibly
- [ ] A photo of a drum book page shows above the note grid

### Sheet reading
- [ ] Offline reader: a clean PDF of a simple groove (e.g. exported from MuseScore) reads correctly (score: ___ / ___ notes)
- [ ] Offline reader: a phone photo of a drum book page (score: ___ / ___ notes)
- [ ] The overlay on the sheet shows what was read, and mistakes are easy to spot
- [ ] Gemini (free): Save key → Test key says it works
- [ ] Gemini: the same PDF and photo (score: ___ / ___ notes)
- [ ] Groq (free): the same PDF (score: ___ / ___ notes)
- [ ] OpenRouter with a free vision model: the same PDF (score: ___ / ___ notes; model used: ______)
- [ ] Load models shows a sensible list for each provider you tried
- [ ] AI reader: a page with repeat signs is written out in full
- [ ] With **Remember** unticked, the key is gone after closing the browser
- [ ] Removing the key switches back to the offline reader

### Articulations (Nitro Mesh)
- [ ] Pad mapping: hitting the hi-hat with the pedal up lights *Hi-hat: open* (note 46); with it down, *Hi-hat* (42)
- [ ] Snare rim lights *Snare: rimshot* (40); does the Nitro Mesh send a cross-stick note? (note: ____)
- [ ] Lesson 12 (open hi-hat): playing it closed is flagged; playing it open is accepted
- [ ] Lessons 11 and 13: find accent / ghost levels that feel fair (accent ≥ ___, ghost ≤ ___)
- [ ] Lesson 15: rimshots are recognised
- [ ] Record from kit keeps open hi-hats, rimshots, accents and ghost notes
- [ ] Microphone (acoustic): teach open hi-hat; is open vs closed told apart? (__ / 10)

### Kits
- [ ] Create a kit that matches your real kit (pieces, names, positions)
- [ ] Add a piece your e-kit has an extra pad for, then **Learn** its pad
- [ ] Switch between two kits: pad mapping and mic training stay separate
- [ ] A lesson written for 2 toms plays sensibly on your kit
- [ ] Dragging pieces works on the phone (touch)

### General
- [ ] Songs and best scores are still there after closing and reopening the browser
- [ ] Nothing breaks if the browser window is resized while playing

## Test log

| Date | Device / browser | What I tested | Result / notes |
|---|---|---|---|
| | | | |
