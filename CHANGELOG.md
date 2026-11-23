# Changelog

All notable changes to this project. Dates are YYYY-MM-DD.

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
