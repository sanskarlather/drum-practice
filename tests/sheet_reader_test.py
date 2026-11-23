"""Sheet reader test.

1. Offline reader: draws all 10 lessons as printed drum notation on one page (clean, and again
   rotated/blurred/unevenly lit like a phone photo), reads it back and compares note by note.
2. Real PDF: imports samples/rock-beat-sheet.pdf through the Library (PDF.js + offline reader).
3. AI reader: with a stand-in for the Claude API, checks the request (headers, model, images,
   JSON schema), that the answer becomes notes, and that a rejected key gives a clear message.
   No real API calls are made and no key is needed.

Run `python -m http.server 8000` in the repo folder first.
Usage: python tests/sheet_reader_test.py [url]
"""
import asyncio, json, os, sys
from playwright.async_api import async_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
PDF = os.path.join(ROOT, "samples", "rock-beat-sheet.pdf")
URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000/index.html"
results = []
def check(name, ok, detail=""):
    results.append(ok); print(("PASS " if ok else "FAIL ") + name + (f"  ({detail})" if detail else ""))

HARNESS = r"""
async (opts) => {
  // render each lesson as a printed 2-bar staff, stack them on a white page
  const svgs = [];
  for (const L of LESSONS.slice(0, 10)) {
    E.C = compile(L); renderSheet();
    const s = document.querySelector('#sheet').cloneNode(true);
    s.querySelectorAll('rect[fill-opacity]').forEach(r=>r.remove());
    const lines = s.querySelectorAll('line'); lines[lines.length-1].remove(); // playhead
    s.querySelectorAll('[stroke]').forEach(e=>{ if(e.getAttribute('stroke')!=='none') e.setAttribute('stroke','#111'); });
    s.querySelectorAll('[fill]').forEach(e=>{ if(e.getAttribute('fill')!=='none') e.setAttribute('fill','#111'); });
    s.querySelectorAll('text').forEach(t=>t.setAttribute('fill','#444'));
    s.setAttribute('xmlns','http://www.w3.org/2000/svg');
    svgs.push({src:new XMLSerializer().serializeToString(s), w:+s.getAttribute('width')});
  }
  const W = opts.W || 1700, scale = (W-120)/svgs[0].w, rowH = 176*scale + 40;
  const c = document.createElement('canvas'); c.width = W; c.height = Math.ceil(60 + rowH*svgs.length);
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0,0,c.width,c.height);
  for (let i=0;i<svgs.length;i++) {
    const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgs[i].src);
    await img.decode(); x.drawImage(img, 60, 30 + i*rowH, svgs[i].w*scale, 176*scale);
  }
  let page = c;
  if (opts.photo) { // rotate, blur, uneven light, noise
    const p = document.createElement('canvas'); p.width = c.width; p.height = c.height; const q = p.getContext('2d');
    q.fillStyle = '#fff'; q.fillRect(0,0,p.width,p.height); q.translate(p.width/2,p.height/2); q.rotate(opts.photo*Math.PI/180);
    q.filter = 'blur(1.2px)'; q.drawImage(c, -c.width/2, -c.height/2); q.setTransform(1,0,0,1,0,0); q.filter='none';
    const g = q.createLinearGradient(0,0,p.width,p.height); g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(1,'rgba(60,40,0,0.35)');
    q.fillStyle = g; q.fillRect(0,0,p.width,p.height);
    const d = q.getImageData(0,0,p.width,p.height); for (let i=0;i<d.data.length;i+=4){ const n=(Math.random()-0.5)*40; d.data[i]+=n; d.data[i+1]+=n; d.data[i+2]+=n; } q.putImageData(d,0,0);
    page = p;
  }
  const res = srOfflineRead([page], 4);
  // compare bar by bar: lesson i occupies bars 2i, 2i+1
  const out = []; let tp=0, fp=0, fn=0;
  LESSONS.slice(0, 10).forEach((L, i) => {
    const want = new Set(L.notes.map(n=>(n.s + i*32)+'|'+n.d));
    const got = new Set(res.notes.filter(n=>n.s>=i*32 && n.s<(i+1)*32).map(n=>n.s+'|'+n.d));
    let a=0,b=0,cmiss=0; for (const k of got) want.has(k)?a++:b++; for (const k of want) if(!got.has(k)) cmiss++;
    tp+=a; fp+=b; fn+=cmiss; out.push(`${L.id}: ${a}/${want.size} right, ${b} wrong, ${cmiss} missed`);
  });
  window.__page = page.toDataURL('image/jpeg',0.8); window.__ov = res.overlays[0].toDataURL('image/jpeg',0.8);
  return {bars: res.bars, report: res.report, tp, fp, fn, per: out};
}
"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get("CHROME") or None)
        pg = await b.new_page(); errors = []; pg.on("pageerror", lambda e: errors.append(str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(500)
        for photo, W, need in [(0, 1700, 0.97), (1.5, 1700, 0.9), (0, 1000, 0.97)]:
            r = await pg.evaluate(HARNESS, {"photo": photo, "W": W})
            total = r["tp"] + r["fn"]
            check(f"offline reader, {'photo-like' if photo else 'clean'} page {W}px: notes found", r["tp"]/total >= need, f"{r['tp']}/{total}, {r['fp']} wrong")
            check(f"offline reader, {'photo-like' if photo else 'clean'} page {W}px: few wrong notes", r["fp"] <= 0.03*total, f"{r['fp']} wrong")
        # 2) read the PDF through the real import path (pdf.js + offline reader)
        await pg.set_input_files("#fileIn", PDF)
        await pg.wait_for_function("!document.querySelector('#srGo').disabled", timeout=20000)
        await pg.select_option("#srMethod", "offline"); await pg.click("#srGo")
        await pg.wait_for_function("document.querySelector('#srDialog').hidden", timeout=20000)
        r = await pg.evaluate("({title:ED.title, bars:ED.bars, n:ED.notes.length, want:LESSONS[4].notes.length*2, ok: LESSONS[4].notes.every(n=>ED.notes.some(m=>m.s===n.s&&m.d===n.d)) && LESSONS[4].notes.every(n=>ED.notes.some(m=>m.s===n.s+32&&m.d===n.d))})")
        check("PDF import with the offline reader", r["ok"] and r["bars"] == 4, str(r))

        # 3) AI reader with a stand-in for each provider's API: checks the request we send and that the answer becomes notes
        tab = "TITLE: Test groove\nTEMPO: 92\nTIME: 4/4\nBAR 1\nHH x...x...........\nSD ....x...........\nBD x...............\nBAR 2\nFT ........x.......\nCR ............x...\nHP ............x...\nNOTES:"
        tab = tab.replace("HH x...x...........", "HH x...x.........")  # 16 cells
        tab = tab.replace("SD ....x...........", "SD ....x...........".replace("...........", "..........."))
        replies = {
          "anthropic": {"content": [{"type": "text", "text": tab}], "stop_reason": "end_turn", "usage": {"input_tokens": 2400, "output_tokens": 180}},
          "gemini": {"candidates": [{"content": {"parts": [{"text": "thinking...", "thought": True}, {"text": tab}]}, "finishReason": "STOP"}], "usageMetadata": {"totalTokenCount": 2600}},
          "openrouter": {"choices": [{"message": {"content": "```\n" + tab + "\n```"}, "finish_reason": "stop"}], "model": "some/vision-model:free", "usage": {"total_tokens": 2500}},
          "groq": {"choices": [{"message": {"content": tab}, "finish_reason": "stop"}], "usage": {"total_tokens": 2500}},
          "custom": {"choices": [{"message": {"content": tab}, "finish_reason": "stop"}], "usage": {"total_tokens": 2500}},
        }
        for prov in ["gemini", "groq", "openrouter", "anthropic", "custom"]:
            await pg.evaluate("""([prov, reply]) => { settings.ai.provider = prov; settings.ai.remember = true; settings.ai.keys[prov] = 'test-key-' + prov;
              if (prov === 'custom') { settings.ai.baseUrl = 'https://llm.example.test/v1'; settings.ai.models.custom = 'vision-model'; }
              window.__req = null; window.fetch = async (url, o) => { window.__req = {url, headers: o.headers, body: JSON.parse(o.body)}; return new Response(JSON.stringify(reply), {status: 200}); }; }""", [prov, replies[prov]])
            await pg.set_input_files("#fileIn", PDF)
            await pg.wait_for_function("!document.querySelector('#srGo').disabled", timeout=20000)
            await pg.select_option("#srMethod", "ai"); await pg.click("#srGo")
            await pg.wait_for_function("document.querySelector('#srDialog').hidden", timeout=20000)
            if prov == "openrouter":
                check("openrouter: asks for low reasoning so thinking doesn't eat the answer", await pg.evaluate("__req.body.reasoning && __req.body.reasoning.effort === 'low'"))
            r = await pg.evaluate("""()=>{ const b = __req.body; const imgs = JSON.stringify(b).split('/9j/').length - 1;
              return {title: ED.title, bpm: ED.bpm, notes: ED.notes, url: __req.url, h: __req.headers, imgs,
                      model: b.model || __req.url.split('/models/')[1]}; }""")
            want = {"anthropic": "https://api.anthropic.com/v1/messages", "gemini": "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
                    "openrouter": "https://openrouter.ai/api/v1/chat/completions", "groq": "https://api.groq.com/openai/v1/chat/completions", "custom": "https://llm.example.test/v1/chat/completions"}[prov]
            keyh = {"anthropic": ("x-api-key", "test-key-anthropic"), "gemini": ("x-goog-api-key", "test-key-gemini"),
                    "openrouter": ("authorization", "Bearer test-key-openrouter"), "groq": ("authorization", "Bearer test-key-groq"), "custom": ("authorization", "Bearer test-key-custom")}[prov]
            check(f"{prov}: request goes to the right endpoint with the user's key", r["url"] == want and r["h"].get(keyh[0]) == keyh[1], r["url"])
            check(f"{prov}: key is not in the URL", "test-key" not in r["url"])
            check(f"{prov}: page image is sent", r["imgs"] >= 1)
            check(f"{prov}: answer becomes notes", r["title"] == "Test groove" and r["bpm"] == 92 and {"s": 24, "d": "floor"} in r["notes"] and {"s": 28, "d": "hhp"} in r["notes"], json.dumps(r["notes"]))
        # drum-tab parser edge cases
        r = await pg.evaluate(r"""()=>{
          const a = srParseTab("BAR 1\nHH | x-x-x-x- |\nBD x.......x.......", 4);         // 8 cells = 8th notes, dashes and bars
          const b = srParseTab("HH x.x.x.x.x.x.x.x.\nSD ....x.......x...", 4);           // no BAR line
          const c = srParseTab("UNREADABLE: this is a photo of a cat", 4);
          const d = srParseTab("TIME: 3/4\nBAR 1\nBD x...x...x...", 4);
          return { a: srTabNotes(a, 0), b: srTabNotes(b, 0).length, c: c.unreadable, d: [d.beats, srTabNotes(d, 0).map(n=>n.s)] };
        }""")
        check("tab parser: short lines with dashes and bar marks are stretched to the bar", [n["s"] for n in r["a"] if n["d"] == "hihat"] == [0, 4, 8, 12] and {"s": 8, "d": "kick"} in r["a"], json.dumps(r["a"]))
        check("tab parser: lines without a BAR header", r["b"] == 10, str(r["b"]))
        check("tab parser: unreadable answer", "cat" in (r["c"] or ""))
        check("tab parser: 3/4 bars", r["d"] == [3, [0, 4, 8]], str(r["d"]))
        # answer cut off with nothing written (a model that only "thought")
        await pg.evaluate("""()=>{ settings.ai.provider='openrouter'; settings.ai.keys.openrouter='k';
          window.fetch = async () => new Response(JSON.stringify({choices:[{message:{content:""},finish_reason:"length"}]}),{status:200}); }""")
        await pg.set_input_files("#fileIn", PDF)
        await pg.wait_for_function("!document.querySelector('#srGo').disabled", timeout=20000)
        await pg.select_option("#srMethod", "ai"); await pg.click("#srGo"); await pg.wait_for_timeout(800)
        msg = await pg.inner_text("#srErr"); check("cut-off answer explains the thinking limit", "answer limit" in msg, msg)
        await pg.click("#srCancel")
        # a provider rejecting the reasoning option is retried without it
        await pg.evaluate(r"""()=>{ window.__n=0; window.__bodies=[]; window.fetch = async (u,o) => { __n++; __bodies.push(JSON.parse(o.body));
            if (__n===1) return new Response(JSON.stringify({error:{code:400,message:"reasoning is not supported"}}),{status:400});
            return new Response(JSON.stringify({choices:[{message:{content:"BAR 1\nBD x..............."},finish_reason:"stop"}]}),{status:200}); }; }""")
        res = await pg.evaluate("srAiRead([document.createElement('canvas')], null, 4).then(r=>({n:r.notes.length, retried: __n, second: !!__bodies[1].reasoning}))")
        check("retries without the reasoning option when a model rejects it", res == {"n": 1, "retried": 2, "second": False}, str(res))
        # key pasted under the wrong provider
        await pg.evaluate("settings.ai.provider='openrouter'; srRenderSettings()")
        await pg.click("nav.main button[data-view=library]")
        await pg.fill("#aiKey", "AIzaFakeKeyForTest"); await pg.click("#aiSave")
        check("a Gemini key pasted under another provider switches to Gemini", await pg.evaluate("settings.ai.provider") == "gemini")
        await pg.click("nav.main button[data-view=practice]")
        # model list (used by Test key / Load models) for Gemini
        await pg.evaluate("""()=>{ window.fetch = async (url, o) => new Response(JSON.stringify({models:[{name:'models/gemini-3.8-flash',supportedGenerationMethods:['generateContent']},{name:'models/gemini-3.8-flash-tts',supportedGenerationMethods:['generateContent']},{name:'models/text-embedding-9',supportedGenerationMethods:['embedContent']}]}),{status:200}); }""")
        ids = await pg.evaluate("srListModels('gemini','k')")
        # "Load models" fills a drop-down with every model (not filtered by what's already chosen)
        await pg.evaluate("""()=>{ settings.ai.provider='openrouter'; settings.ai.keys.openrouter='k'; srRenderSettings();
          window.fetch = async () => new Response(JSON.stringify({data:[{id:'a/one:free'},{id:'b/two:free'},{id:'c/three'}]}),{status:200}); }""")
        await pg.click("nav.main button[data-view=library]"); await pg.click("#aiLoad"); await pg.wait_for_timeout(300)
        opts = await pg.evaluate("[...document.querySelectorAll('#aiModelSel option')].map(o=>o.value)")
        check("Load models lists every model in the drop-down", all(m in opts for m in ["a/one:free", "b/two:free", "c/three", "openrouter/free"]), str(opts))
        await pg.select_option("#aiModelSel", "b/two:free")
        check("picking a model from the drop-down saves it", await pg.evaluate("srModel('openrouter')") == "b/two:free")
        await pg.select_option("#aiModelSel", "__type"); await pg.fill("#aiModel", "x/typed-model"); await pg.press("#aiModel", "Tab")
        check("a model name can still be typed", await pg.evaluate("srModel('openrouter')") == "x/typed-model")
        await pg.click("nav.main button[data-view=practice]")
        await pg.evaluate("settings.ai.models.openrouter=''; settings.ai.provider='gemini'")
        await pg.evaluate("""()=>{ window.fetch = async (url, o) => new Response(JSON.stringify({models:[{name:'models/gemini-3.8-flash',supportedGenerationMethods:['generateContent']},{name:'models/gemini-3.8-flash-tts',supportedGenerationMethods:['generateContent']},{name:'models/text-embedding-9',supportedGenerationMethods:['embedContent']}]}),{status:200}); }""")
        check("Gemini model list keeps usable models only", ids == ["gemini-3.8-flash"], str(ids))
        # Gemini free-tier limit message
        await pg.evaluate("window.fetch = async ()=> new Response(JSON.stringify({error:{code:429,message:'Resource has been exhausted',status:'RESOURCE_EXHAUSTED'}}),{status:429}); settings.ai.provider='gemini'")
        await pg.set_input_files("#fileIn", PDF)
        await pg.wait_for_function("!document.querySelector('#srGo').disabled", timeout=20000)
        await pg.select_option("#srMethod", "ai"); await pg.click("#srGo")
        await pg.wait_for_timeout(1500); waiting = await pg.inner_text("#srStatus")
        check("free-tier limit: waits and retries automatically", "waiting 20 seconds" in waiting, waiting)
        await pg.wait_for_function("document.querySelector('#srErr').textContent.length > 0", timeout=40000)
        msg = await pg.inner_text("#srErr"); check("Gemini free-tier limit gives a clear message", "free-tier limit" in msg, msg)
        await pg.click("#srCancel")
        await pg.evaluate("settings.ai.provider='anthropic'")
        # 4) error handling: 401
        await pg.evaluate("window.fetch = async ()=> new Response(JSON.stringify({type:'error',error:{type:'authentication_error',message:'invalid x-api-key'}}),{status:401})")
        await pg.set_input_files("#fileIn", PDF)
        await pg.wait_for_function("!document.querySelector('#srGo').disabled", timeout=20000)
        await pg.select_option("#srMethod", "ai"); await pg.click("#srGo"); await pg.wait_for_timeout(800)
        msg = await pg.inner_text("#srErr"); check("rejected key gives a clear message", "rejected" in msg, msg)

        await b.close()
    check("no JavaScript errors", not errors, "; ".join(errors[:3]))
    sys.exit(0 if all(results) else 1)
asyncio.run(main())
