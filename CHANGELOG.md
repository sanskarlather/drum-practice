# Changelog

All notable changes to this project. Dates are YYYY-MM-DD.

## [0.6.0] - 2026-11-23
### Added
- **Rudiments:** all 40 international drum rudiments in the library, grouped into six families, with sticking (R/L under the notes and on the kit), accents, flams, drags and buzz strokes.
- **Daily basics:** 22 everyday exercises for time, counting, hands, feet and coordination, including timing drills where the click drops out or plays only on 2 and 4.
- **Today screen** with a daily **routine** (warm-up basics, a new rudiment, a review, a groove, your song), minutes against a daily goal, day streak, XP and levels, a week chart, 18 badges and your fastest clean tempos. The app opens on Today once you've practised.
- **Scoring:** points per hit with a combo multiplier up to ×4, 1-3 stars per pass, right- and left-hand accuracy, personal bests, and a richer end screen.
- **Speed builder:** +5 BPM after two clean loops, up to each pattern's goal tempo; -5 BPM when struggling; remembers your fastest clean tempo.
- **Three play-screen layouts:** Arena (score HUD and beat lane), Coach (big Now/Next cards with how-to), Hands (sticking row, hand pads, per-hand scores, speed ladder). A **full-screen kit on a phone held sideways**.
- Grids other than 16ths: 8ths, 8th-note triplets, 16th-note triplets and 32nds, in songs, the sheet (beams and tuplet numbers), the counter (*1 trip let*) and the note editor (**Grid**).
- Drag and buzz-stroke articulations; songs can set the hand for each note.
### Fixed
- With Loop on, a hit on beat 1 that arrived a moment before the screen wrapped round was judged against the last note of the previous loop.
- Flam grace notes from an e-kit could count as an extra early hit and use up the next note.

## [0.5.0] - 2026-11-23
### Added
- **Drum notes from a song recording:** AI listening (Google Gemini or another audio-capable service, your own key) for full songs, or the free offline reader for drums-only recordings (tempo, bar 1, kick, snare, toms, closed and open hi-hat, crash).
- **Play along with the recording:** kept in sync with the practice clock, follows the tempo slider with pitch kept, pauses and waits with you. Recordings are kept in the browser (IndexedDB); a recording can be added to any song in the editor, with bar-1 offset and tempo.
- **Full scores:** PDF/photo sheet reading and MusicXML import take only the drum part from scores with every instrument.

## [0.4.2] - 2026-11-23
### Fixed
- After an update, browsers could keep showing the previous version for a while. Files now carry a version number, the offline copy always checks GitHub for newer files, and the app reloads itself once when a new version is installed.
### Added
- The app version is shown in the header.

## [0.4.1] - 2026-11-23
### Added
- AI reader providers: **Alibaba Cloud Model Studio** (Qwen, region address editable), **Mistral** and **Hugging Face**.
- **Add another service**: any number of your own OpenAI-compatible services, each with a name, base URL, key and model.
- Retry with the plain-string image format for services that require it; Hugging Face tokens are recognised automatically.

## [0.4.0] - 2026-11-23
### Added
- **Articulations everywhere**: open vs closed hi-hat, accents, ghost notes, rimshots, cross-stick, ride bell, flams and chokes.
  - Shown on the practice kit (OPEN, ACCENT, GHOST…), in the instruction and *Coming up*, and in proper notation (`>`, `o`, `( )`, diamonds, slashed heads, grace notes).
  - Checked while you play: open/closed hi-hat, rim and bell from the e-kit's notes; accents and ghost notes from velocity (adjustable levels); "Right time, wrong touch" feedback with a tip; Wait for me waits until it's right; can be switched off.
  - Pad mapping rows for the special strokes (Nitro Mesh defaults: open hi-hat 46, rimshot 40, cross-stick 37, bell 53); Shift + key on the keyboard.
  - Microphone mode can be taught the special strokes and judges accents/ghost notes by loudness.
  - Note editor articulation tools; Record from kit keeps them.
  - Kept by MIDI and MusicXML import and by the AI sheet reader (drum-tab characters).
  - Distinct sounds for each.
- Lessons 11 to 15: accents, open hi-hat, ghost notes, cross-stick and ride bell, flams and rimshots.
### Fixed
- The Model box only showed the already-chosen model after **Load models**. It's now a drop-down listing every loaded model (remembered per provider), with an option to type a name.

## [0.3.2] - 2026-11-23
### Fixed
- AI reader answers were too long for free models ("answer was cut off"). The AI now answers in compact drum-tab lines, one page per request, with "thinking" kept low; partial answers are kept instead of failing.
### Added
- **Groq** (free plan) as a provider, with its vision models suggested.
- Automatic wait-and-retry when a provider is busy or at its free per-minute limit.
- A key pasted under the wrong provider switches to the right provider.
- **Load models** on OpenRouter lists free vision models first, and those that don't require reasoning before those that do.

## [0.3.1] - 2026-11-23
### Added
- AI sheet reader works with **Google Gemini** (free tier, now the default), **OpenRouter** (free models), **Anthropic Claude**, or any **OpenAI-compatible** service (OpenAI, Groq, Mistral, local LM Studio/Ollama). Each uses the user's own key, stored per provider in their browser.
- **Load models** lists the models your key can use; **Test key** no longer costs anything.
### Fixed
- Password fields now match the dark theme.

## [0.3.0] - 2026-11-23
### Added
- Automatic reading of PDF and photo sheet music:
  - AI reader using each user's **own** Anthropic API key (stored only in their browser, never in the app), with model choice, key test, and remember-or-session-only storage.
  - Free offline reader (optical music recognition in the browser) with an overlay showing what was found.
  - Reading dialog with page previews; results open in the note editor next to the sheet.
- Customisable kits: several kits, add/remove/rename/resize/drag pieces (extra toms, floor toms, crashes, splash, china, second kick), presets, per-kit pad mapping and microphone training, and automatic fallback for songs that use pieces your kit doesn't have.
- PDF.js (Mozilla, Apache 2.0) in `vendor/pdfjs`.
- Tests for the sheet reader and kits; a sample PDF.
### Changed
- PDFs shown above the note editor are now drawn as page images, which also works on phones.

## [0.2.0] - 2026-11-23
### Added
- Microphone mode for acoustic kits or when the e-kit can't connect: hit detection, "Teach it your drums", forgiving/strict/timing-only drum checking, and automatic delay measurement.
- "Listen with microphone" button on the practice screen.
- Install to home screen and offline use (web app manifest and service worker) when hosted on GitHub Pages.
- Documentation: README, user guide, hosting guide, architecture notes and testing checklist.
- Sample MIDI and MusicXML files, and automated browser tests.
### Changed
- Code split from one HTML file into `css/` and `js/` files (still no build step).

## [0.1.0] - 2026-11-23
### Added
- First working version: practice screen with a lit-up kit, approach rings, hand and foot tags, "Coming up" list, feedback, stats, wait mode, loop, tempo and count-in.
- USB MIDI input with Alesis Nitro Mesh mapping and Learn; tap and keyboard input.
- Synthesised drum sounds, metronome and "play the pattern for me".
- 10 beginner lessons; MIDI and MusicXML import; PDF/photo tracing; note editor with record from kit.
- Simplified scrolling notation.
