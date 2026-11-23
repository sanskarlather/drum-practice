"""Writes tests/out/mic.wav: synthesised kick, snare and hi-hat hits for the microphone test.

First 18 hits (6 of each drum, 0.9 s apart) are used to "teach" the drums.
Then a 3-times-repeated rock pattern with hits 0.45 s apart, including
kick+hi-hat and snare+hi-hat together and soft hi-hats right after loud hits.
Hit times are saved to tests/out/events.json.
"""
import json, os, wave
import numpy as np

OUT = os.path.join(os.path.dirname(__file__), "out")
os.makedirs(OUT, exist_ok=True)
fs = 48000
rng = np.random.default_rng(1)

def kick():
    t = np.arange(int(.35 * fs)) / fs
    f = 50 + 70 * np.exp(-t * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / fs) * np.exp(-t * 9) * 0.8

def snare():
    t = np.arange(int(.25 * fs)) / fs
    n = rng.standard_normal(len(t))
    n = np.diff(np.concatenate([[0], n])) * 0.5 + n * 0.3
    return n * np.exp(-t * 18) * 0.45 + np.sin(2 * np.pi * 200 * t) * np.exp(-t * 30) * 0.4

def hihat():
    t = np.arange(int(.08 * fs)) / fs
    n = rng.standard_normal(len(t))
    n = np.diff(np.concatenate([[0], np.diff(np.concatenate([[0], n]))]))
    return n * np.exp(-t * 60) * 0.12

SOUNDS = {"kick": kick, "snare": snare, "hihat": hihat}

def main():
    x = rng.standard_normal(fs * 34) * 0.002  # quiet background noise
    events = [(1 + i * 0.9, [d]) for i, d in enumerate(["kick"] * 6 + ["snare"] * 6 + ["hihat"] * 6)]
    pattern = [["kick"], ["hihat"], ["snare"], ["hihat"], ["kick", "hihat"], ["hihat"], ["snare", "hihat"], ["hihat"]] * 3
    events += [(18 + i * 0.45, ds) for i, ds in enumerate(pattern)]
    for t0, ds in events:
        a = int(t0 * fs)
        for d in ds:
            y = SOUNDS[d]() * rng.uniform(0.8, 1.2)
            x[a:a + len(y)] += y
    x = np.clip(x, -1, 1)
    with wave.open(os.path.join(OUT, "mic.wav"), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(fs)
        w.writeframes((x * 32767).astype("<i2").tobytes())
    json.dump(events, open(os.path.join(OUT, "events.json"), "w"))
    print(f"wrote {len(events)} hits to {OUT}/mic.wav")

if __name__ == "__main__":
    main()
