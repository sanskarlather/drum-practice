# Tests

Automated browser tests (Python + Playwright). See [docs/TESTING.md](../docs/TESTING.md) for what they cover, how to run them, and the manual checklist for real drums.

| File | Purpose |
|---|---|
| `smoke_test.py` | Playback, judging, misses, wait mode, importers, editor, mic judging, phone layout |
| `make_test_audio.py` | Generates `out/mic.wav`, synthesised drum hits for the microphone test |
| `mic_detection_test.py` | Feeds `out/mic.wav` to Chrome as a fake microphone and checks detection and drum identification |
| `sheet_reader_test.py` | Offline reader on generated sheets, PDF import, AI reader with a stand-in API |
| `kits_test.py` | Kit presets, adding/removing/dragging pieces, per-kit mapping, fallback |
| `make_song_audio.py` | Generates `out/drums_100bpm.wav` (drums only), `out/song_100bpm.wav` (drums + bass + chords) and the expected notes |
| `audio_fullscore_test.py` | Offline drum reader on a recording, play-along sync, AI listening (stand-in API), full scores |
| `practice_test.py` | Rudiments, daily basics, triplet grids, scoring, speed builder, routine, Today, layouts (screenshots in `out/`) |
