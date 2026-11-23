# Changelog

All notable changes to this project. Dates are YYYY-MM-DD.

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
