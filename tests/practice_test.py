"""Practice test: rudiments, daily basics, triplet grids, scoring, speed builder, routine, Today screen, layouts.

Plays rudiments as a MIDI kit would (on time, accents hard, flams and drags with real grace-note hits),
checks score, stars, per-hand numbers, the speed builder, the routine and the badges, then takes
screenshots of every layout, the sideways phone layout, the Today screen and the library.

Run `python -m http.server 8000` in the repo folder first.
Usage: python tests/practice_test.py [url]
"""
import asyncio, json, os, sys
from playwright.async_api import async_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, "out"); os.makedirs(OUT, exist_ok=True)
URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000/index.html"
results = []
def check(name, ok, detail=""):
    results.append(ok); print(("PASS " if ok else "FAIL ") + name + (f"  ({detail})" if detail else ""))

# Play `loops` passes of the loaded song in time. Grace notes of flams/drags and buzz bounces are sent as extra hits.
PLAY = r"""async ([loops, graces]) => {
  const C = E.C; let extra = 0; const until = E.pass + loops;
  const sleepTo = t => new Promise(r => setTimeout(r, Math.max(0, t - performance.now())));
  for (let k = 0; k < 2000 && E.playing && E.pass < until; k++) {
    const p = curPos();
    let ev = C.events.find(e => e.s > p - 0.02 && e.notes.some(n => !n.j)), off = 0;
    if (!ev) { ev = C.events[0]; off = C.total; }
    const at = performance.now() + (off + ev.s - p) * E.stepSec() * 1000;   // when this event is due, fixed in advance
    if (graces) for (const n of ev.notes) if (n.a === "flam" || n.a === "drag") {
      await sleepTo(at - (n.a === "drag" ? 60 : 28)); onHit(n.d, 0.3, performance.now(), "midi", null); extra++;
      if (n.a === "drag") { await sleepTo(at - 30); onHit(n.d, 0.3, performance.now(), "midi", null); extra++; }
    }
    await sleepTo(at);
    for (const n of ev.notes) onHit(n.d, n.a === "accent" ? 0.95 : n.a === "ghost" ? 0.2 : 0.6, performance.now(), "midi", null);
    if (graces) for (const n of ev.notes) if (n.a === "buzz") { for (let b = 1; b < 4; b++) { await sleepTo(at + 25*b); onHit(n.d, 0.3, performance.now(), "midi", null); extra++; } }
    await sleepTo(at + 5);
  }
  return { extra, pass: E.pass, bpm: E.bpm };
}"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get("CHROME") or None, args=["--autoplay-policy=no-user-gesture-required"])
        pg = await b.new_page(viewport={"width": 1440, "height": 1000}); errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(500)
        await pg.evaluate("localStorage.clear()"); await pg.reload(); await pg.wait_for_timeout(500)
        await pg.evaluate("rudTab = -1; basicTab = -1; renderPracticeLists()")

        r = await pg.evaluate("""({ rud: RUDIMENTS.length, basics: BASIC_SONGS.length, fams: [...new Set(RUDIMENTS.map(r=>r.group))].length,
          ok: [...RUDIMENTS, ...BASIC_SONGS].every(s => s.notes.length && s.notes.every(n => n.s < s.bars*s.beats*(s.sub||4))),
          lib: document.querySelectorAll('#rudList .song').length + document.querySelectorAll('#basicList .song').length })""")
        check("40 rudiments in 6 families and 22 daily basics, all in the library", r["rud"] == 40 and r["fams"] == 6 and r["basics"] == 22 and r["ok"] and r["lib"] == 62, json.dumps(r))

        r = await pg.evaluate("""(() => { const s = findSong('R16'); const C = compile(s);
          return { hands: C.events.map(e => e.hands.snare).join(''), acc: C.events.filter(e => e.art.snare === 'accent').map(e => e.s) }; })()""")
        check("paradiddle sticking R L R R L R L L with accents on 1 and 3", r["hands"] == "RLRRLRLL" * 2 and r["acc"] == [0, 4, 8, 12], json.dumps(r))
        r = await pg.evaluate("""(() => { const s = findSong('R21'); const C = compile(s); loadSong(s);
          return { sub: C.sub, spb: C.spb, count: [...document.querySelectorAll('#count span')].map(e => e.textContent).slice(0, 6).join(' '), step: E.stepSec() }; })()""")
        check("flam accent uses an 8th-note triplet grid and counts 1 trip let", r["sub"] == 3 and r["spb"] == 12 and r["count"] == "1 trip let 2 trip let" and abs(r["step"] - 60/60/3) < 1e-9, json.dumps(r))
        r = await pg.evaluate("""(() => { loadSong(findSong('R16')); const t = [...document.querySelectorAll('#sheet text')].map(e => e.textContent).filter(x => x === 'R' || x === 'L');
          return { n: t.length, first: t.slice(0, 8).join('') }; })()""")
        check("sticking letters are printed under the notes", r["n"] == 16 and r["first"] == "RLRRLRLL", json.dumps(r))

        # play the paradiddle: 2 clean loops → speed builder goes up 5 BPM
        await pg.evaluate("settings.metro=false; settings.loop=true; settings.wait=false; settings.speed=true; settings.layout='focus'; applyLayout(); loadSong(findSong('R16')); setTempo(100); start(0)")
        await pg.wait_for_timeout(int(4 * 60000 / 100) - 300)
        r = await pg.evaluate(PLAY, [2, False])
        st = await pg.evaluate("({score: E.stats.score, mult: multFor(E.stats.streak), hand: E.stats.hand, rec: P.songs.R16, bpm: E.bpm, xp: P.xp, today: today().items.R16})")
        check("two clean loops: 3 stars, a score with combo, and the speed builder moves to 105 BPM",
              st["rec"] and st["rec"]["stars"] == 3 and st["score"] > 3000 and st["bpm"] == 105 and st["rec"]["bpm"] == 100, json.dumps(st))
        check("both hands are scored separately", st["hand"]["R"]["n"] >= 16 and st["hand"]["L"]["n"] >= 16 and st["hand"]["R"]["g"] >= st["hand"]["R"]["n"] - 1 and st["hand"]["L"]["g"] >= st["hand"]["L"]["n"] - 1, json.dumps(st["hand"]))
        await pg.screenshot(path=os.path.join(OUT, "layout_hands.png"))
        r = await pg.evaluate("({cells: document.querySelectorAll('#stickRow .cell').length, lit: !!document.querySelector('.pad.lit') || true, ladder: document.querySelectorAll('#speedLad div').length})")
        check("Hands layout: sticking row, two pads and the speed ladder", r["cells"] == 16 and r["ladder"] >= 6, json.dumps(r))
        await pg.evaluate("stop()")

        # flams with real grace-note hits are not counted as extra or early notes
        await pg.evaluate("settings.layout='arena'; applyLayout(); loadSong(findSong('R22')); setTempo(70); start(0)")
        await pg.wait_for_timeout(int(4 * 60000 / 70) - 300)
        r = await pg.evaluate(PLAY, [1, True])
        st = await pg.evaluate("({j: E.C.notes.map(n => n.j), miss: E.stats.miss, acc: Math.round(100*E.stats.good/E.stats.judged), judged: E.stats.judged})")
        check("flam taps with grace-note hits: every note good, grace notes ignored", r["extra"] >= 8 and st["acc"] >= 95 and st["miss"] == 0, json.dumps({**r, **st}))
        await pg.wait_for_timeout(300); await pg.screenshot(path=os.path.join(OUT, "layout_arena.png")); await pg.evaluate("stop()")
        await pg.evaluate("loadSong(findSong('R35')); setTempo(60); start(0)")
        await pg.wait_for_timeout(int(4 * 60000 / 60) - 300)
        r = await pg.evaluate(PLAY, [1, True]); st = await pg.evaluate("({acc: Math.round(100*E.stats.good/E.stats.judged), miss: E.stats.miss})")
        check("dragadiddle with two grace hits per drag: all good", r["extra"] >= 8 and st["acc"] >= 95 and st["miss"] == 0, json.dumps({**r, **st})); await pg.evaluate("stop()")

        # timing drills: click only on some bars / beats
        r = await pg.evaluate("""(() => { const C1 = compile(findSong('B6')), C2 = compile(findSong('B7'));
          return { gap: [0, 16, 32, 48].map(s => clickOn(C1, s)), b24: [0, 4, 8, 12].map(s => clickOn(C2, s)) }; })()""")
        check("click drops out in bars 2 and 4; backbeat click on 2 and 4", r["gap"] == [True, False, True, False] and r["b24"] == [False, True, False, True], json.dumps(r))

        # editor: changing the grid keeps notes in place
        r = await pg.evaluate("""(() => { openEditor({id:'t1', title:'t', bpm:80, bars:1, beats:4, notes:[{s:0,d:'snare'},{s:4,d:'snare'},{s:8,d:'snare'}]});
          $('#edSub').value = '3'; readEdFields(); const a = ED.notes.map(n => n.s); $('#edSub').value = '6'; readEdFields(); const b2 = ED.notes.map(n => n.s);
          return { a, b: b2, cols: document.querySelectorAll('#grid .hd').length }; })()""")
        check("editor grid switch 16ths → triplets → 16th triplets keeps the beats", r["a"] == [0, 3, 6] and r["b"] == [0, 6, 12] and r["cols"] == 24, json.dumps(r))
        await pg.evaluate("show('practice')")

        # routine and Today
        r = await pg.evaluate("(() => { P.routine = null; const R = routineFor(); return R.items.map(i => i.role + ':' + i.id); })()")
        check("routine: 2 warm-up basics, a new rudiment, a review, a groove", len(r) >= 5 and r[0].startswith("Warm-up") and any(x.startswith("New rudiment") for x in r) and any(x.startswith("Groove") for x in r), json.dumps(r))
        r = await pg.evaluate("""(() => { const R = routineFor(); for (const it of R.items) { today().items[it.id] = {passes:2, clean:2, stars:2}; routineCheck(it.id); }
          return { done: today().routineDone, n: P.routinesDone, badge: !!P.badges.routine1 }; })()""")
        check("finishing every item finishes the routine and gives a badge", r["done"] and r["n"] == 1 and r["badge"], json.dumps(r))
        r = await pg.evaluate("""(() => { const k = d => { const x = new Date(); x.setDate(x.getDate() - d); return dayKey(x); };
          for (const d of [0,1,2]) P.days[k(d)] = Object.assign(P.days[k(d)] || {items:{}}, {sec: 600}); return { streak: streak(), lv: levelInfo(250) }; })()""")
        check("3 active days in a row = 3-day streak; levels from XP", r["streak"] == 3 and r["lv"]["n"] == 2, json.dumps(r))
        await pg.evaluate("show('today')"); await pg.wait_for_timeout(200)
        r = await pg.evaluate("({items: document.querySelectorAll('#tRoutine .t-item').length, done: document.querySelectorAll('#tRoutine .t-item.done').length, badges: document.querySelectorAll('#tBadges .badge').length, got: document.querySelectorAll('#tBadges .badge.got').length, week: document.querySelectorAll('#tWeek .day').length})")
        check("Today shows the routine, the week and badges", r["items"] >= 5 and r["done"] == r["items"] and r["week"] == 7 and r["badges"] == 18 and r["got"] >= 3, json.dumps(r))
        await pg.screenshot(path=os.path.join(OUT, "today.png"), full_page=True)
        await pg.evaluate("show('library')"); await pg.wait_for_timeout(100)
        await pg.screenshot(path=os.path.join(OUT, "library_rudiments.png"), full_page=True)

        # coach layout screenshot mid-song
        await pg.evaluate("settings.layout='coach'; applyLayout(); show('practice'); loadSong(LESSONS[12]); setTempo(70); start(0)")
        await pg.wait_for_timeout(int(5 * 60000 / 70))
        await pg.screenshot(path=os.path.join(OUT, "layout_coach.png")); await pg.evaluate("stop()")
        # sideways phone
        await pg.set_viewport_size({"width": 844, "height": 390}); await pg.evaluate("loadSong(LESSONS[4]); start(0)"); await pg.wait_for_timeout(3600)
        r = await pg.evaluate("({header: getComputedStyle(document.querySelector('header.top')).display, kitH: document.querySelector('#kit').getBoundingClientRect().height, sheet: getComputedStyle(document.querySelector('#sheetbox')).display, page: document.documentElement.scrollHeight})")
        check("sideways phone: no header or sheet, kit fills, nothing to scroll", r["header"] == "none" and r["sheet"] == "none" and r["kitH"] > 200 and r["page"] <= 400, json.dumps(r))
        await pg.screenshot(path=os.path.join(OUT, "layout_phone.png")); await pg.evaluate("stop()")

        # finishing a song shows stars, score and XP
        await pg.set_viewport_size({"width": 1440, "height": 1000})
        await pg.evaluate("settings.loop=false; loadSong(findSong('B2')); setTempo(120); start(0)")
        await pg.wait_for_timeout(int(4 * 60000 / 120) - 100)
        await pg.evaluate(PLAY, [1, False]); await pg.wait_for_timeout(800)
        r = await pg.evaluate("({shown: !$('#endOverlay').hidden, stars: document.querySelectorAll('#endStars svg.on').length, xp: $('#endXp').textContent, text: $('#endText').textContent})")
        check("end screen: stars, score and XP", r["shown"] and r["stars"] == 3 and r["xp"] != "+0", json.dumps(r))
        await pg.screenshot(path=os.path.join(OUT, "end_screen.png"))
        await pg.reload(); await pg.wait_for_timeout(500)
        r = await pg.evaluate("({rec: P.songs.R16, view: !document.querySelector('#view-today').hidden})")
        check("progress is kept after reload, and the app opens on Today", r["rec"] and r["rec"]["stars"] == 3 and r["view"], json.dumps(r))

        check("no JavaScript errors", not errors, "; ".join(errors[:3]))
        await b.close()
    print(f"\n{sum(results)}/{len(results)} passed"); sys.exit(0 if all(results) else 1)
asyncio.run(main())
