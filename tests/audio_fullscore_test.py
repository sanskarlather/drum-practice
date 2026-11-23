"""Recordings and full scores.

1. Offline drum transcription of a synthesised drums-only recording (100 BPM, bar 1 at 1.30 s).
2. AI listening with a stand-in for the Gemini API (request shape, answer -> notes, START/TEMPO -> sync).
3. Play-along: the attached recording follows the practice clock, the tempo slider and Wait for me.
4. Full scores: the offline sheet reader skips staves without a percussion clef; MusicXML merges
   all percussion parts and ignores the others; the AI prompt asks for the drum part only.

Run `python -m http.server 8000` in the repo folder and `python tests/make_song_audio.py` first.
Usage: python tests/audio_fullscore_test.py [url]
"""
import asyncio, json, os, sys
from playwright.async_api import async_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, "out")
URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000/index.html"
results = []
def check(name, ok, detail=""):
    results.append(ok); print(("PASS " if ok else "FAIL ") + name + (f"  ({detail})" if detail else ""))

async def main():
    exp = json.load(open(os.path.join(OUT, "drums_100bpm.json")))
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get("CHROME") or None, args=["--autoplay-policy=no-user-gesture-required"])
        pg = await b.new_page(viewport={"width": 1440, "height": 1000}); errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(500)

        # ---- 1. offline transcription of a drums-only recording
        await pg.set_input_files("#fileIn", os.path.join(OUT, "drums_100bpm.wav"))
        await pg.wait_for_function("!document.querySelector('#arGo').disabled", timeout=20000)
        await pg.select_option("#arMethod", "offline"); await pg.click("#arGo")
        await pg.wait_for_function("document.querySelector('#arDialog').hidden", timeout=60000)
        r = await pg.evaluate("({bpm: ED.audio.bpm, offset: ED.audio.offset, bars: ED.bars, notes: ED.notes})")
        check("offline: tempo found", abs(r["bpm"] - 100) < 1.0, f"{r['bpm']:.2f} BPM")
        check("offline: bar 1 found at 1.30 s", abs(r["offset"] - 1.30) < 0.04, f"{r['offset']:.3f} s")
        got = {(n["s"], n["d"]) for n in r["notes"]}
        want = {(n["s"], n["d"]) for n in exp["notes"]}
        right = len(got & want); wrong = len(got - want)
        check("offline: drum notes found (kick, snare, hi-hat)", right / len(want) >= 0.9, f"{right}/{len(want)} right, {wrong} extra")
        check("offline: few wrong notes", wrong <= 0.1 * len(want), f"{wrong} extra")
        opens = [n for n in r["notes"] if n.get("a") == "open"]
        check("offline: open hi-hats recognised", len(opens) >= 1, f"{len(opens)} open (2 in the recording)")
        await pg.screenshot(path=os.path.join(OUT, "audio_editor.png"))

        # ---- 3. play-along follows the clock
        await pg.click("#edPractise"); await pg.wait_for_timeout(500)
        await pg.evaluate("settings.metro=false; settings.songOn=true; settings.loop=false; start(0)")
        await pg.wait_for_timeout(int(4*60000/100) + 2500)
        r = await pg.evaluate("({paused: TRACK.el.paused, t: TRACK.el.currentTime, want: TRACK.info.offset + E.pos*(60/TRACK.info.bpm/4), rate: TRACK.el.playbackRate})")
        check("play-along: the recording plays in sync", not r["paused"] and abs(r["t"] - r["want"]) < 0.12, f"{r['t']:.3f} vs {r['want']:.3f} s")
        await pg.evaluate("setTempo(80)"); await pg.wait_for_timeout(1500)
        r = await pg.evaluate("({t: TRACK.el.currentTime, want: TRACK.info.offset + E.pos*(60/TRACK.info.bpm/4), rate: TRACK.el.playbackRate, pitch: TRACK.el.preservesPitch})")
        check("play-along: slower tempo slows the recording, pitch kept", abs(r["rate"] - 0.8) < 0.05 and r["pitch"] and abs(r["t"] - r["want"]) < 0.15, json.dumps(r))
        await pg.evaluate("pause()"); await pg.wait_for_timeout(200)
        check("play-along: pausing pauses the recording", await pg.evaluate("TRACK.el.paused"))
        await pg.evaluate("settings.wait=true; start()"); await pg.wait_for_function("E.blocked", timeout=10000)
        await pg.wait_for_timeout(300)
        check("play-along: Wait for me pauses the recording while waiting", await pg.evaluate("TRACK.el.paused"))
        await pg.evaluate("stop(); settings.wait=false")
        check("the recording is kept in this browser (IndexedDB)", await pg.evaluate("audioGet(settings.lastSong).then(b => !!b && b.size > 1000)"))

        # ---- 2. AI listening with a stand-in Gemini
        await pg.evaluate("""()=>{ settings.ai.provider='gemini'; settings.ai.keys.gemini='test-key'; window.__req=null;
          const tab = "TEMPO: 100.0\\nTIME: 4/4\\nSTART: 1.30\\nBAR 1\\nHH x.x.x.x.x.x.x.x.\\nSD ....x.......x...\\nBD x.......x.......\\nBAR 2\\nHH x.x.x.x.x.x.x.o.\\nSD ....x.......x...\\nBD x.......x.......\\nNOTES:";
          window.fetch = async (u, o) => { window.__req = {u, body: JSON.parse(o.body)}; return new Response(JSON.stringify({candidates:[{content:{parts:[{text:tab}]},finishReason:"STOP"}]}),{status:200}); }; }""")
        await pg.set_input_files("#fileIn", os.path.join(OUT, "song_100bpm.wav"))
        await pg.wait_for_function("!document.querySelector('#arGo').disabled", timeout=20000)
        await pg.select_option("#arMethod", "ai"); await pg.click("#arGo")
        await pg.wait_for_function("document.querySelector('#arDialog').hidden", timeout=60000)
        r = await pg.evaluate("""()=>{ const part = __req.body.contents[0].parts[0];
          return {mime: part.inlineData && part.inlineData.mimeType, size: part.inlineData ? part.inlineData.data.length : 0, url: __req.u,
                  offset: ED.audio.offset, bpm: ED.audio.bpm, bars: ED.bars, open: ED.notes.filter(n=>n.a==='open').length, n: ED.notes.length}; }""")
        check("AI listening: sends the audio to Gemini as WAV", r["mime"] == "audio/wav" and r["size"] > 10000 and "generateContent" in r["url"], json.dumps({k: r[k] for k in ("mime", "size")}))
        check("AI listening: notes, tempo and bar-1 time are used", r["n"] == 24 and r["offset"] == 1.3 and r["bpm"] == 100 and r["bars"] == 2 and r["open"] == 1, json.dumps(r))
        await pg.evaluate("settings.ai.provider='anthropic'; settings.ai.keys.anthropic='k'")
        await pg.set_input_files("#fileIn", os.path.join(OUT, "drums_100bpm.wav"))
        await pg.wait_for_function("!document.querySelector('#arGo').disabled", timeout=20000)
        await pg.select_option("#arMethod", "ai"); await pg.click("#arGo"); await pg.wait_for_timeout(600)
        msg = await pg.inner_text("#arErr"); check("AI listening: Claude (no audio) gives a clear message", "can't listen" in msg, msg)
        await pg.click("#arCancel")

        # ---- 4. full scores
        r = await pg.evaluate(r"""async ()=>{
          // a full score page: for each system, a "piano" staff (no percussion clef, filled noteheads everywhere) above the drum staff
          const svgs = [];
          for (const L of LESSONS.slice(0, 6)) {
            E.C = compile(L); renderSheet();
            const s = document.querySelector('#sheet').cloneNode(true);
            s.querySelectorAll('rect[fill-opacity]').forEach(r=>r.remove()); const ls = s.querySelectorAll('line'); ls[ls.length-1].remove();
            s.querySelectorAll('[stroke]').forEach(e=>{ if(e.getAttribute('stroke')!=='none') e.setAttribute('stroke','#111'); });
            s.querySelectorAll('[fill]').forEach(e=>{ if(e.getAttribute('fill')!=='none') e.setAttribute('fill','#111'); });
            s.setAttribute('xmlns','http://www.w3.org/2000/svg');
            svgs.push({src: new XMLSerializer().serializeToString(s), w: +s.getAttribute('width')});
          }
          const W = 1700, sc = (W-120)/svgs[0].w, rowH = 2*176*sc + 30;
          const c = document.createElement('canvas'); c.width = W; c.height = Math.ceil(40 + rowH*svgs.length);
          const x = c.getContext('2d'); x.fillStyle='#fff'; x.fillRect(0,0,c.width,c.height); x.fillStyle='#111'; x.strokeStyle='#111';
          for (let i=0;i<svgs.length;i++) {
            const top = 30 + i*rowH, y0 = top + (22+40)*sc, spc = 12*sc;
            // the other instrument's staff, with notes on lines and spaces
            x.lineWidth = 1.2*sc; for (let k=0;k<5;k++){ x.beginPath(); x.moveTo(60+16*sc, y0+k*spc); x.lineTo(60+svgs[i].w*sc-20*sc, y0+k*spc); x.stroke(); }
            for (let n=0;n<28;n++){ const nx = 60+(70+n*27)*sc, ny = y0 + ((n*5)%9)*spc/2; x.beginPath(); x.ellipse(nx, ny, 6*sc, 4.5*sc, -0.35, 0, Math.PI*2); x.fill(); x.fillRect(nx+5*sc, ny-30*sc, 1.5*sc, 30*sc); }
            const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgs[i].src); await img.decode();
            x.drawImage(img, 60, top + 176*sc, svgs[i].w*sc, 176*sc);
          }
          const res = srOfflineRead([c], 4);
          let right = 0, total = 0, extra = 0;
          LESSONS.slice(0, 6).forEach((L, i) => {
            const want = new Set(L.notes.map(n=>(n.s + i*32)+'|'+n.d)); total += want.size;
            const got = new Set(res.notes.filter(n=>n.s>=i*32 && n.s<(i+1)*32).map(n=>n.s+'|'+n.d));
            for (const k of got) want.has(k) ? right++ : extra++;
          });
          return {right, total, extra, bars: res.bars, report: res.report};
        }""")
        check("full score: other instruments' staves are skipped", "skipped 6" in r["report"] and r["bars"] == 12, r["report"])
        check("full score: drum notes read correctly", r["right"] / r["total"] >= 0.95 and r["extra"] <= 3, f"{r['right']}/{r['total']}, {r['extra']} extra")
        r = await pg.evaluate("""()=>{ const x = `<?xml version="1.0"?><score-partwise><part-list>
            <score-part id="P1"><part-name>Piano</part-name></score-part>
            <score-part id="P2"><part-name>Snare</part-name><score-instrument id="P2-I1"><instrument-name>Snare</instrument-name></score-instrument></score-part>
            <score-part id="P3"><part-name>Bass Drum</part-name><score-instrument id="P3-I1"><instrument-name>Bass Drum</instrument-name></score-instrument></score-part></part-list>
          <part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes><direction><sound tempo="88"/></direction>
            <note><pitch><step>C</step><octave>5</octave></pitch><duration>4</duration></note></measure></part>
          <part id="P2"><measure number="1"><attributes><divisions>1</divisions></attributes>
            <note><rest/><duration>1</duration></note><note><unpitched><display-step>C</display-step><display-octave>5</display-octave></unpitched><duration>1</duration><instrument id="P2-I1"/></note>
            <note><rest/><duration>1</duration></note><note><unpitched><display-step>C</display-step><display-octave>5</display-octave></unpitched><duration>1</duration><instrument id="P2-I1"/></note></measure></part>
          <part id="P3"><measure number="1"><attributes><divisions>1</divisions></attributes>
            <note><unpitched><display-step>F</display-step><display-octave>4</display-octave></unpitched><duration>2</duration><instrument id="P3-I1"/></note>
            <note><unpitched><display-step>F</display-step><display-octave>4</display-octave></unpitched><duration>2</duration><instrument id="P3-I1"/></note></measure></part></score-partwise>`;
          const s = parseMusicXML(x, 't'); return {bpm: s.bpm, notes: s.notes.map(n=>[n.s,n.d])}; }""")
        r["notes"] = sorted(r["notes"])
        check("full score MusicXML: piano ignored, snare and bass drum parts merged, tempo kept", r == {"bpm": 88, "notes": [[0, "kick"], [4, "snare"], [8, "kick"], [12, "snare"]]}, json.dumps(r))
        check("AI sheet prompt asks for the drum part only", await pg.evaluate("AI_PROMPT(1,1).includes('transcribe ONLY the drum kit part')"))
        await b.close()
    check("no JavaScript errors", not errors, "; ".join(errors[:3]))
    sys.exit(0 if all(results) else 1)
asyncio.run(main())
