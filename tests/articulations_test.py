"""Articulation test: open hi-hat, accents, ghost notes, rimshot, cross-stick, flam, ride bell, choke.

Checks lessons, judging (MIDI notes and velocity), Wait-for-me, display on the kit, notation marks,
the editor tools, recording, MIDI/MusicXML import, the AI's drum-tab answers, the pad mapping rows
and the microphone's loudness check.

Run `python -m http.server 8000` in the repo folder first.
Usage: python tests/articulations_test.py [url]
"""
import asyncio, json, os, sys
from playwright.async_api import async_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, "out"); os.makedirs(OUT, exist_ok=True)
URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000/index.html"
results = []
def check(name, ok, detail=""):
    results.append(ok); print(("PASS " if ok else "FAIL ") + name + (f"  ({detail})" if detail else ""))

# Hit every note of the current event on time, as a MIDI kit would, with a chosen articulation/velocity per note.
PLAY = r"""async ([how]) => {
  // how: "right" plays every note as written; "closed" plays open hi-hats closed; "soft" plays accents softly
  const C = E.C, out = [];
  for (let k = 0; k < 40 && E.playing; k++) {
    const ev = C.events.find(e => e.notes.some(n => !n.j) && e.s > curPos() - 0.05);
    if (!ev) break;
    await new Promise(r => setTimeout(r, Math.max(0, (ev.s - curPos()) * E.stepSec() * 1000)));
    for (const n of ev.notes) {
      let a = n.a && ARTICS[n.a].variant ? n.a : null, vel = 0.7;
      if (n.a === "accent") vel = 0.95; if (n.a === "ghost") vel = 0.2;
      if (how === "closed" && n.a === "open") a = null;
      if (how === "soft" && n.a === "accent") vel = 0.5;
      onHit(n.d, vel, performance.now(), "midi", a);
    }
  }
  return C.notes.filter(n => n.j).map(n => ({ d: n.d, a: n.a, j: n.j }));
}"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get("CHROME") or None, args=["--autoplay-policy=no-user-gesture-required"])
        pg = await b.new_page(viewport={"width": 1440, "height": 1000}); errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(500)

        # lessons carry articulations
        r = await pg.evaluate("Object.fromEntries(LESSONS.slice(10).map(l => [l.id, [...new Set(l.notes.filter(n=>n.a).map(n=>n.a))].sort()]))")
        check("new lessons use accents, open hi-hat, ghost notes, cross-stick, bell, flam, rimshot",
              r == {"L11": ["accent"], "L12": ["open"], "L13": ["accent", "ghost"], "L14": ["bell", "xstick"], "L15": ["flam", "rim"]}, json.dumps(r))

        # judging: open hi-hat lesson played correctly vs with the hi-hat closed
        async def run(lesson, how, artic=True):
            await pg.evaluate(f"settings.metro=false; settings.loop=false; settings.wait=false; settings.artic={'true' if artic else 'false'}; loadSong(LESSONS[{lesson}]); start(0)")
            await pg.wait_for_timeout(int(4 * 60000 / await pg.evaluate("E.bpm")) - 350)
            res = await pg.evaluate(PLAY, [how]); await pg.evaluate("stop()"); return res
        res = await run(11, "right")
        opens = [n for n in res if n["a"] == "open"]
        check("open hi-hat played open counts as good", opens and all(n["j"] in ("perfect", "good") for n in opens), json.dumps(opens))
        res = await run(11, "closed")
        opens = [n for n in res if n["a"] == "open"]
        check("open hi-hat played closed is marked wrong", opens and all(n["j"] == "art" for n in opens), json.dumps(opens))
        closed = [n for n in res if n["d"] == "hihat" and not n["a"]]
        check("closed hi-hats played closed still count as good", closed and all(n["j"] in ("perfect", "good") for n in closed))
        res = await run(10, "soft")
        acc = [n for n in res if n["a"] == "accent"]
        check("accents played too softly are marked wrong", acc and all(n["j"] == "art" for n in acc), f"{len(acc)} accents")
        tips = await pg.evaluate("[articProblem({d:'hihat',a:'accent'},{vel:0.4,src:'midi'}).tip, articProblem({d:'hihat',a:'open'},{a:null,src:'midi'}).tip, articProblem({d:'hihat',a:null},{a:'open',src:'midi'}).tip, articProblem({d:'snare',a:'ghost'},{vel:0.9,src:'midi'}).tip]")
        check("feedback says what to change", "harder" in tips[0] and "left foot" in tips[1] and "closed" in tips[2] and "softer" in tips[3], " | ".join(tips))
        res = await run(10, "right")
        acc = [n for n in res if n["a"] == "accent"]
        check("accents played hard count as good", acc and all(n["j"] in ("perfect", "good") for n in acc))
        res = await run(12, "right")
        gh = [n for n in res if n["a"] == "ghost"]
        check("ghost notes played softly count as good", gh and all(n["j"] in ("perfect", "good") for n in gh), json.dumps(gh))
        # playing a closed note with the open-hi-hat pad
        await pg.evaluate("settings.loop=false; loadSong(LESSONS[0]); start(0)"); await pg.wait_for_timeout(int(4 * 60000 / 70) - 350)
        await pg.evaluate("""async ()=>{ const ev = E.C.events[0]; await new Promise(r=>setTimeout(r, Math.max(0,(ev.s-curPos())*E.stepSec()*1000))); onHit('hihat', 0.7, performance.now(), 'midi', 'open'); }""")
        check("open hi-hat where a closed one is written is marked wrong", await pg.evaluate("E.C.notes[0].j") == "art")
        await pg.evaluate("stop()")
        # checking can be switched off
        res = await run(11, "closed", artic=False)
        check("with checking off, the open hi-hat played closed is accepted", all(n["j"] in ("perfect", "good") for n in res if n["a"] == "open"))
        await pg.evaluate("settings.artic=true")
        # wait mode holds until the open hi-hat is played open
        await pg.evaluate("settings.wait=true; settings.loop=false; loadSong(LESSONS[11]); start(0)")
        # play each waiting event correctly until the one with the open hi-hat
        await pg.evaluate("""async ()=>{ for (let k=0; k<400; k++) { await new Promise(r=>setTimeout(r,40)); if (!E.blocked) continue;
            const ev = E.C.events[blockEvent()]; if (ev.notes.some(n=>n.a==='open')) return;
            for (const n of ev.notes) onHit(n.d, n.a==='accent'?0.95:0.7, performance.now(), 'midi', n.a && ARTICS[n.a].variant ? n.a : null); } }""")
        await pg.evaluate("onHit('hihat', 0.7, performance.now(), 'midi', null)")
        still = await pg.evaluate("E.blocked && E.C.events[blockEvent()].notes.some(n=>n.a==='open' && !n.j)")
        await pg.evaluate("onHit('hihat', 0.7, performance.now(), 'midi', 'open')")
        done = await pg.evaluate("E.C.notes.filter(n=>n.a==='open')[0].j")
        check("Wait for me waits until the hi-hat is played open", still and done == "ok", f"{still}, {done}")
        await pg.screenshot(path=os.path.join(OUT, "artic_practice.png"))
        label = await pg.evaluate("[...document.querySelectorAll('#kit text')].map(t=>t.textContent).filter(t=>/OPEN|ACCENT|GHOST/.test(t)).length")
        check("the kit shows the articulation label", label > 0)
        await pg.evaluate("stop(); settings.wait=false")

        # notation marks
        await pg.evaluate("loadSong(LESSONS[12])")
        r = await pg.evaluate("[...document.querySelectorAll('#sheet text')].map(t=>t.textContent).join('')")
        check("notation shows accents (>) and ghost notes ( )", ">" in r and "(" in r and ")" in r)
        await pg.evaluate("loadSong(LESSONS[11])")
        r = await pg.evaluate("[...document.querySelectorAll('#sheet text')].map(t=>t.textContent).join('')")
        check("notation shows the open hi-hat (o)", "o" in r)
        await pg.evaluate("loadSong(LESSONS[13])")
        r = await pg.evaluate("document.querySelectorAll('#sheet path[fill=none]').length")
        check("notation draws ride-bell diamonds", r > 0)

        # editor tools
        await pg.evaluate("openEditor({id:'t1',title:'t',bpm:80,bars:1,beats:4,notes:[]})")
        await pg.click("#edArt button:has-text('Open hi-hat')")
        await pg.click('#grid .c[data-s="0"][data-d="hihat"]')
        await pg.click('#grid .c[data-s="0"][data-d="snare"]')  # not possible on a snare: normal hit
        await pg.click("#edArt button:has-text('Ghost')")
        await pg.click('#grid .c[data-s="4"][data-d="snare"]')
        await pg.click("#edArt button:has-text('Accent')")
        await pg.click('#grid .c[data-s="4"][data-d="snare"]')  # change ghost -> accent
        await pg.click('#grid .c[data-s="8"][data-d="snare"]'); await pg.click('#grid .c[data-s="8"][data-d="snare"]')  # add then remove
        notes = await pg.evaluate("ED.notes.map(n=>[n.s,n.d,n.a||''])")
        check("editor tools set, change and remove articulations", sorted(map(tuple, notes)) == [(0, "hihat", "open"), (0, "snare", ""), (4, "snare", "accent")], str(notes))
        check("editor cells show the sign", await pg.evaluate("document.querySelector('#grid .c[data-s=\"0\"][data-d=\"hihat\"]').dataset.art") == "o")
        await pg.screenshot(path=os.path.join(OUT, "artic_editor.png"))
        # recording keeps how it was played
        await pg.evaluate("""()=>{ ED.notes=[]; E.mode='record'; E.C=compile(ED); E.bpm=80; E.playing=true; rebase(0);
          recordHit('hihat', 0, {a:'open', vel:0.7, src:'midi'}); recordHit('snare', 4, {a:null, vel:0.98, src:'midi'}); recordHit('snare', 6, {a:null, vel:0.2, src:'midi'}); stop(); }""")
        notes = await pg.evaluate("ED.notes.map(n=>[n.s,n.d,n.a||''])")
        check("recording keeps open hi-hat, accents and ghost notes", sorted(map(tuple, notes)) == [(0, "hihat", "open"), (4, "snare", "accent"), (6, "snare", "ghost")], str(notes))

        # importers
        r = await pg.evaluate("""()=>{
          // tiny MIDI file: closed hh, open hh (46), cross-stick (37), ride bell (53), loud and soft snares
          const ev = [[0,42,80],[240,46,80],[480,37,80],[720,53,80],[960,38,120],[1200,38,30],[1440,38,80],[1680,38,82]];
          const vlq = n => { const b=[n&127]; n>>=7; while(n){ b.unshift((n&127)|128); n>>=7; } return b; };
          let trk=[], last=0; for (const [t,n,v] of ev) { trk.push(...vlq(t-last), 0x99, n, v); last=t; } trk.push(0,0xff,0x2f,0);
          const hdr=[77,84,104,100,0,0,0,6,0,0,0,1,1,224], th=[77,84,114,107,0,0,0,trk.length];
          const s = parseMidi(new Uint8Array([...hdr,...th,...trk]), 't'); return s.notes.map(n=>[n.s,n.d,n.a||'']); }""")
        check("MIDI import: open hi-hat, cross-stick, bell, accent and ghost", [2, "hihat", "open"] in r and [4, "snare", "xstick"] in r and [6, "ride", "bell"] in r and [8, "snare", "accent"] in r and [10, "snare", "ghost"] in r and [0, "hihat", ""] in r, str(r))
        r = await pg.evaluate("""()=>{ const x = `<?xml version="1.0"?><score-partwise><part-list><score-part id="P1"><score-instrument id="I1"><instrument-name>Open Hi-Hat</instrument-name></score-instrument><score-instrument id="I2"><instrument-name>Acoustic Snare</instrument-name></score-instrument></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes>
          <note><unpitched><display-step>G</display-step><display-octave>5</display-octave></unpitched><duration>1</duration><instrument id="I1"/></note>
          <note><unpitched><display-step>C</display-step><display-octave>5</display-octave></unpitched><duration>1</duration><instrument id="I2"/><notations><articulations><accent/></articulations></notations></note>
          <note><unpitched><display-step>C</display-step><display-octave>5</display-octave></unpitched><duration>1</duration><instrument id="I2"/><notehead parentheses="yes">normal</notehead></note>
          <note><grace/><unpitched><display-step>C</display-step><display-octave>5</display-octave></unpitched><instrument id="I2"/></note>
          <note><unpitched><display-step>C</display-step><display-octave>5</display-octave></unpitched><duration>1</duration><instrument id="I2"/></note>
          </measure></part></score-partwise>`; return parseMusicXML(x,'t').notes.map(n=>[n.s,n.d,n.a||'']); }""")
        check("MusicXML import: open hi-hat, accent, ghost, flam", r == [[0, "hihat", "open"], [4, "snare", "accent"], [8, "snare", "ghost"], [12, "snare", "flam"]], str(r))
        r = await pg.evaluate(r"""()=>{ const t = srParseTab("BAR 1\nHH x.x.x.x.x.x.x.o.\nSD ....X..g.g..r..c\nRD b...............\nCR k...............\nBD x.......x.......", 4); return srTabNotes(t, 0).filter(n=>n.a).map(n=>[n.s,n.d,n.a]); }""")
        check("AI drum-tab answers keep articulations", sorted(map(tuple, r)) == sorted([(14, "hihat", "open"), (4, "snare", "accent"), (7, "snare", "ghost"), (9, "snare", "ghost"), (12, "snare", "rim"), (15, "snare", "xstick"), (0, "ride", "bell"), (0, "crash", "choke")]), str(r))

        # pad mapping has rows for the special strokes, with Nitro Mesh defaults
        await pg.click("nav.main button[data-view=setup]")
        r = await pg.evaluate("({open: settings.map['hihat:open'], rim: settings.map['snare:rim'], xs: settings.map['snare:xstick'], bell: settings.map['ride:bell'], hh: settings.map.hihat, sn: settings.map.snare, rows: document.querySelectorAll('#mapRows .maprow.sub').length})")
        check("pad mapping: open hi-hat 46, rimshot 40, cross-stick 37, bell 53 on their own rows", r["open"][0] == 46 and r["rim"] == [40] and r["xs"] == [37] and r["bell"] == [53] and 46 not in r["hh"] and 40 not in r["sn"] and r["rows"] == 4, json.dumps(r))
        r = await pg.evaluate("[noteToDrum(46), noteToDrum(42), noteToDrum(40), noteToDrum(53)]")
        check("MIDI notes map to piece + articulation", r == [{"d": "hihat", "a": "open"}, {"d": "hihat", "a": None}, {"d": "snare", "a": "rim"}, {"d": "ride", "a": "bell"}], json.dumps(r))
        await pg.screenshot(path=os.path.join(OUT, "artic_mapping.png"), full_page=True)

        # microphone: loudness decides accents / ghost notes
        r = await pg.evaluate("""()=>{
          settings.mic.cal = {snare:{p:[.05,.2,.4,.3,.05],tot:1,dr:.2,n:6}};
          const ev = {drums:['snare']}; const mk = (e) => ({att:[.05*e,.2*e,.4*e,.3*e,.05*e], dec:.2*e});
          const acc = [{d:'snare', a:'accent', j:null}], gh = [{d:'snare', a:'ghost', j:null}];
          return { loudAccent: micArticProblem(mk(2.2), ev, acc), softAccent: micArticProblem(mk(1.0), ev, acc),
                   softGhost: micArticProblem(mk(0.3), ev, gh), loudGhost: micArticProblem(mk(1.0), ev, gh) }; }""")
        check("mic: loud accent ok, soft accent flagged", r["loudAccent"] is None and r["softAccent"] is not None, json.dumps(r))
        check("mic: soft ghost ok, loud ghost flagged", r["softGhost"] is None and r["loudGhost"] is not None)
        await b.close()
    check("no JavaScript errors", not errors, "; ".join(errors[:3]))
    sys.exit(0 if all(results) else 1)
asyncio.run(main())
