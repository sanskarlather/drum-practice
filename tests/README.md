# Tests

Automated browser tests (Python + Playwright). See [docs/TESTING.md](../docs/TESTING.md) for what they cover, how to run them, and the manual checklist for real drums.

| File | Purpose |
|---|---|
| `smoke_test.py` | Playback, judging, misses, wait mode, importers, editor, mic judging, phone layout |
| `make_test_audio.py` | Generates `out/mic.wav`, synthesised drum hits for the microphone test |
| `mic_detection_test.py` | Feeds `out/mic.wav` to Chrome as a fake microphone and checks detection and drum identification |
| `sheet_reader_test.py` | Offline reader on generated sheets, PDF import, AI reader with a stand-in API |
| `kits_test.py` | Kit presets, adding/removing/dragging pieces, per-kit mapping, fallback |
