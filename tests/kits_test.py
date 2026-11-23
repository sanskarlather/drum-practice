"""Kit customisation test: presets, adding/removing pieces, fallback of song pieces,
dragging in the kit editor, switching kits, and that each kit keeps its own pad mapping.

Run `python -m http.server 8000` in the repo folder first.
Usage: python tests/kits_test.py [url]
"""
import asyncio, os, sys
from playwright.async_api import async_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, "out"); os.makedirs(OUT, exist_ok=True)
URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000/index.html"
results = []
def check(name, ok, detail=""):
    results.append(ok); print(("PASS " if ok else "FAIL ") + name + (f"  ({detail})" if detail else ""))

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get("CHROME") or None)
        pg = await b.new_page(viewport={"width": 1440, "height": 1100}); errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(500)
        check("default kit has the standard 9 pieces", await pg.evaluate("DRUMS.length") == 9)
        await pg.click("nav.main button[data-view=setup]")
        # add pieces
        await pg.select_option("#kitAddType", "tom"); await pg.click("#kitAdd")
        await pg.select_option("#kitAddType", "crash"); await pg.click("#kitAdd")
        await pg.select_option("#kitAddType", "kick"); await pg.click("#kitAdd")
        ids = await pg.evaluate("DRUMS.map(d=>d.id)")
        check("added tom3, crash2, kick2", all(i in ids for i in ("tom3", "crash2", "kick2")), str(ids))
        check("new pieces drawn on the practice kit", await pg.evaluate("['tom3','crash2','kick2'].every(id=>!!pieceEls[id])"))
        check("new crash takes MIDI note 57 from the first crash", await pg.evaluate("settings.map.crash2.includes(57) && !settings.map.crash.includes(57)"))
        check("second kick is played with the left foot", await pg.evaluate("D.kick2.foot") == "LF")
        check("editor shows a row per piece", await pg.evaluate("openEditor(LESSONS[0]); edRows().length") == 12)
        await pg.click("nav.main button[data-view=setup]")
        # drag tom3 in the editor drawing
        before = await pg.evaluate("activeKit().pieces.find(p=>p.id==='tom3').cx")
        box = await pg.locator('#kitEdit g.piece[data-d="tom3"]').bounding_box()
        cx, cy = box["x"] + box["width"]/2, box["y"] + box["height"]/2
        await pg.mouse.move(cx, cy); await pg.mouse.down(); await pg.mouse.move(cx - 60, cy + 20, steps=5); await pg.mouse.up()
        after = await pg.evaluate("activeKit().pieces.find(p=>p.id==='tom3').cx")
        check("dragging moves a piece", after < before, f"{before} -> {after}")
        await pg.screenshot(path=os.path.join(OUT, "kit_editor.png"))
        # new small kit: lesson 9 (uses tom2) falls back to the only tom
        await pg.select_option("#kitNewPreset", "small"); await pg.click("#kitNew")
        check("new small kit is active", await pg.evaluate("DRUMS.length") == 8)
        r = await pg.evaluate("(()=>{ const C = compile(LESSONS[8]); return [...new Set(C.notes.map(n=>n.d))].sort(); })()")
        check("song pieces fall back to this kit (tom2 -> tom1)", "tom2" not in r and "tom1" in r, str(r))
        # mapping is per kit
        await pg.evaluate("settings.map.snare = [99]; saveSettings()")
        await pg.select_option("#kitSel", await pg.evaluate("kits[0].id"))
        check("first kit kept its own mapping", await pg.evaluate("!settings.map.snare.includes(99) && settings.map.snare.includes(38)"))
        await pg.reload(); await pg.wait_for_timeout(500)
        check("kits survive a reload", await pg.evaluate("kits.length") == 2 and await pg.evaluate("DRUMS.some(d=>d.id==='tom3')"))
        # remove a piece
        await pg.evaluate("removePiece('tom3')")
        check("removing a piece", await pg.evaluate("!D.tom3 && !pieceEls.tom3"))
        # practice still works on a big preset kit
        await pg.evaluate("kits.push(makeKit('Big','big')); settings.kit = kits[kits.length-1].id; kitChanged(); settings.metro=false; loadSong(LESSONS[8]); start(0)")
        await pg.wait_for_timeout(3800)
        await pg.click("nav.main button[data-view=practice]"); await pg.wait_for_timeout(300)
        await pg.screenshot(path=os.path.join(OUT, "big_kit_practice.png"))
        check("big kit has 15 pieces", await pg.evaluate("DRUMS.length") == 15)
        await b.close()
    check("no JavaScript errors", not errors, "; ".join(errors[:3]))
    sys.exit(0 if all(results) else 1)
asyncio.run(main())
