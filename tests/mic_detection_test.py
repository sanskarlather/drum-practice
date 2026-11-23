"""Fake-microphone test: plays tests/out/mic.wav into Chrome as the microphone and checks
that every hit is detected, identified, and judged correctly.

Run `python -m http.server 8000` in the repo folder and `python tests/make_test_audio.py` first.
Usage: python tests/mic_detection_test.py [url]   (default http://localhost:8000/index.html)
"""
import asyncio, json, os, sys
from playwright.async_api import async_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000/index.html"

async def main():
    events = json.load(open(os.path.join(OUT, "events.json")))
    wav = os.path.join(OUT, "mic.wav")
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path=os.environ.get("CHROME") or None, args=[
            "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream",
            f"--use-file-for-fake-audio-capture={wav}%noloop", "--autoplay-policy=no-user-gesture-required"])
        page = await browser.new_page(); errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        await page.goto(URL); await page.wait_for_timeout(500)
        await page.click("nav.main button[data-view=setup]")
        await page.evaluate("window.__on=[]; const orig=micMessage; micMessage=function(m){ if(m.lvl==null) window.__on.push(m); return orig(m); }; 0")
        await page.click("#micBtn")
        await page.wait_for_timeout(32000)
        onsets = await page.evaluate("window.__on")
        assert onsets, "no hits detected at all (" + await page.inner_text("#micStatus") + ")"
        offset = onsets[0]["t"] - events[0][0]
        r = await page.evaluate("""([on, ev, off]) => {
          const match = e => on.find(o => Math.abs(o.t - off - e[0]) < 0.03);
          const teach = {kick:[], snare:[], hihat:[]};
          ev.slice(0, 18).forEach(e => { const o = match(e); if (o) teach[e[1][0]].push(o); });
          for (const d in teach) { const hits = teach[d], p = [0,0,0,0,0]; let tot = 0, dr = 0;
            for (const h of hits) { const t = h.att.reduce((a,b)=>a+b,0)+1e-12; h.att.forEach((a,k)=>p[k]+=a/t/hits.length); tot += t/hits.length; dr += h.dec/t/hits.length; }
            settings.mic.cal[d] = {p, tot, dr, n:hits.length}; }
          let found=0, ok=0, single=0, cls=0, wrong=0, wrongN=0, maxErr=0;
          ev.slice(18).forEach(e => { const o = match(e); if (!o) return; found++; maxErr = Math.max(maxErr, Math.abs(o.t-off-e[0])*1000);
            settings.mic.check = "strict"; if (micDrumCheck(o, e[1]).ok) ok++;
            if (e[1].length === 1) { single++; if (micClassify(o).d === e[1][0]) cls++; }
            if (e[1].length === 1 && e[1][0] === "snare") { wrongN++; if (!micDrumCheck(o, ["kick"]).ok) wrong++; } });
          return {detected: on.length, expected: ev.length, found, total: ev.length-18, ok, single, cls, wrong, wrongN, maxErr: Math.round(maxErr)};
        }""", [onsets, events, offset])
        await browser.close()
    print(json.dumps(r, indent=1))
    checks = [("all hits detected, no extras", r["detected"] == r["expected"]),
              ("pattern hits found", r["found"] == r["total"]),
              ("expected drums accepted", r["ok"] == r["total"]),
              ("single drums identified", r["cls"] == r["single"]),
              ("wrong drum rejected", r["wrong"] == r["wrongN"]),
              ("no page errors", not errors)]
    for name, passed in checks: print(("PASS " if passed else "FAIL ") + name)
    sys.exit(0 if all(c for _, c in checks) else 1)

asyncio.run(main())
