"""Smoke test: practice playback and judging, misses, wait mode, importers, editor, mic judging,
plus desktop and phone screenshots in tests/out/.

Run `python -m http.server 8000` in the repo folder first.
Usage: python tests/smoke_test.py [url]   (default http://localhost:8000/index.html)
"""
import asyncio, json, os, sys
from playwright.async_api import async_playwright

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
OUT = os.path.join(HERE, "out"); os.makedirs(OUT, exist_ok=True)
URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000/index.html"
results = []
def check(name, ok, detail=""):
    results.append(ok); print(("PASS " if ok else "FAIL ") + name + (f"  ({detail})" if detail else ""))

AUTO_HIT = """window.__auto=setInterval(()=>{ if(!E.playing) return; const p=curPos();
  for (const n of E.C.notes) if (!n.j && Math.abs(n.s-p)<0.08) onHit(n.d,0.9,performance.now(),'midi'); }, 5)"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get("CHROME") or None, args=["--autoplay-policy=no-user-gesture-required"])
        pg = await b.new_page(viewport={"width": 1440, "height": 1000}); errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" and "fonts" not in m.text else None)
        await pg.goto(URL); await pg.wait_for_timeout(600)

        # practice: auto-hit every note on time from the start
        await pg.evaluate("settings.metro=false; settings.loop=true; loadSong(LESSONS[3]); start(0)")
        await pg.evaluate(AUTO_HIT)
        await pg.wait_for_timeout(7000)
        st = json.loads(await pg.evaluate("JSON.stringify(E.stats)"))
        check("on-time hits graded good", st["judged"] >= 10 and st["good"] == st["judged"], f"{st['good']}/{st['judged']}")
        await pg.screenshot(path=os.path.join(OUT, "practice.png"))
        await pg.evaluate("clearInterval(window.__auto)"); await pg.wait_for_timeout(1500)
        st2 = json.loads(await pg.evaluate("JSON.stringify(E.stats)"))
        check("unplayed notes become misses", st2["miss"] > 0, f"{st2['miss']} misses")

        await pg.evaluate("settings.wait=true"); await pg.wait_for_timeout(1500)
        check("wait mode stops at the next note", await pg.evaluate("E.blocked"))
        await pg.evaluate("settings.wait=false; pause()")

        # importers
        midi = list(open(os.path.join(ROOT, "samples", "rock-beat.mid"), "rb").read())
        r = await pg.evaluate("(a)=>{const s=parseMidi(new Uint8Array(a),'t'); return {bpm:s.bpm, bars:s.bars, n:s.notes.length}}", midi)
        check("MIDI import", r == {"bpm": 120, "bars": 2, "n": 24}, str(r))
        xml = open(os.path.join(ROOT, "samples", "rock-beat.musicxml")).read()
        r = await pg.evaluate("(x)=>{const s=parseMusicXML(x,'t'); return {bpm:s.bpm, bars:s.bars, n:s.notes.length}}", xml)
        check("MusicXML import", r == {"bpm": 96, "bars": 1, "n": 12}, str(r))

        # editor
        await pg.evaluate("openEditor(LESSONS[8])"); await pg.wait_for_timeout(300)
        check("editor grid drawn", await pg.evaluate("document.querySelectorAll('#grid .c.on').length") == len(await pg.evaluate("LESSONS[8].notes")))
        await pg.click("#edSave")
        check("save adds to My songs", await pg.evaluate("songs.length") >= 1)
        await pg.screenshot(path=os.path.join(OUT, "editor.png"))

        # microphone judging with fake taught fingerprints
        await pg.click("nav.main button[data-view=practice]")
        r = await pg.evaluate("""async ()=>{
          settings.mic.cal = {kick:{p:[.9,.06,.02,.01,.01],tot:1,dr:.3,n:6}, snare:{p:[.05,.2,.4,.3,.05],tot:1,dr:.2,n:6}, hihat:{p:[.01,.01,.03,.25,.7],tot:.3,dr:.05,n:6}};
          settings.mic.check='strict'; settings.loop=false; loadSong(LESSONS[3]); start(0);
          await new Promise(r=>setTimeout(r, 3600)); const out=[];
          for (let k=0;k<4;k++){
            const ev = E.C.events.find(e=>e.notes.some(n=>!n.j) && e.s > curPos());
            await new Promise(r=>setTimeout(r, Math.max(0,(ev.s-curPos())*E.stepSec()*1000)));
            const mix = k%2===0 ? ev.drums : (ev.drums.includes('snare') ? ['kick'] : ['snare']);
            const att=[0,0,0,0,0]; let dec=0; mix.forEach(d=>{const c=settings.mic.cal[d]; c.p.forEach((p,i)=>att[i]+=p*c.tot); dec+=c.dr*c.tot;});
            judgeOnset({t:ac.currentTime, att, dec}, curPos()); out.push(ev.notes.map(n=>n.j));
          } stop(); return out; }""")
        check("mic: right drum on time = perfect", all(j == "perfect" for j in r[0] + r[2]), str(r))
        check("mic: wrong drum rejected", all(j == "wrong" for j in r[1] + r[3]), str(r))

        # phone layout
        m = await b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        await m.goto(URL); await m.wait_for_timeout(500)
        await m.screenshot(path=os.path.join(OUT, "phone.png"), full_page=True)
        check("phone: kit fits the screen", await m.evaluate("document.querySelector('#kit').getBoundingClientRect().width <= 390"))
        await b.close()
    check("no JavaScript errors", not errors, "; ".join(errors[:3]))
    sys.exit(0 if all(results) else 1)

asyncio.run(main())
