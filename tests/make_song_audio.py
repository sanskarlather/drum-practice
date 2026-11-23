"""Writes tests/out/drums_100bpm.wav: 8 bars of an 8th-note rock beat (kick 1 & 3, snare 2 & 4,
closed hi-hat 8ths, open hi-hat on the & of 4 in bar 4 and 8) at 100 BPM, starting 1.30 s in,
plus a version with a quiet "bass and chords" layer mixed in. Expected notes in tests/out/drums_100bpm.json.
"""
import json, os, wave
import numpy as np
OUT = os.path.join(os.path.dirname(__file__), "out"); os.makedirs(OUT, exist_ok=True)
fs = 44100; rng = np.random.default_rng(7)
def kick():
    t = np.arange(int(.35*fs))/fs; f = 50 + 70*np.exp(-t*30); return np.sin(2*np.pi*np.cumsum(f)/fs)*np.exp(-t*9)*0.8
def snare():
    t = np.arange(int(.25*fs))/fs; n = rng.standard_normal(len(t)); n = np.diff(np.concatenate([[0], n]))*0.5 + n*0.3
    return n*np.exp(-t*18)*0.45 + np.sin(2*np.pi*200*t)*np.exp(-t*30)*0.4
def hat(open_=False):
    t = np.arange(int((.35 if open_ else .08)*fs))/fs; n = rng.standard_normal(len(t)); n = np.diff(np.concatenate([[0], np.diff(np.concatenate([[0], n]))]))
    return n*np.exp(-t*(9 if open_ else 60))*0.12
def write(name, x):
    x = np.clip(x, -1, 1)
    with wave.open(os.path.join(OUT, name), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(fs); w.writeframes((x*32767).astype("<i2").tobytes())
bpm, start, bars = 100, 1.30, 8
q = 60/bpm/4; dur = start + bars*16*q + 1.5
x = rng.standard_normal(int(dur*fs))*0.001
notes = []
def put(s, y):
    a = int((start + s*q)*fs); x[a:a+len(y)] += y*rng.uniform(0.85, 1.1)
for b in range(bars):
    for i in range(16):
        s = b*16 + i
        if i % 2 == 0:
            op = (b % 4 == 3 and i == 14)
            put(s, hat(op)); notes.append({"s": s, "d": "hihat", "a": "open" if op else None})
        if i in (0, 8): put(s, kick()); notes.append({"s": s, "d": "kick"})
        if i in (4, 12): put(s, snare()); notes.append({"s": s, "d": "snare"})
write("drums_100bpm.wav", x)
# with other instruments: a bass line and sustained chords
t = np.arange(len(x))/fs
band = 0.08*np.sin(2*np.pi*55*t)*(0.6+0.4*np.sin(2*np.pi*t*bpm/60/2)) + 0.03*(np.sin(2*np.pi*220*t)+np.sin(2*np.pi*277*t)+np.sin(2*np.pi*330*t))
write("song_100bpm.wav", x + band)
json.dump({"bpm": bpm, "start": start, "bars": bars, "notes": notes}, open(os.path.join(OUT, "drums_100bpm.json"), "w"))
print("wrote", len(notes), "notes")
