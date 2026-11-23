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
  for (const L of LESSONS) {
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
  const W = opts.W || 1700, scale = (W-120)/svgs[0].w, rowH = 140*scale + 40;
  const c = document.createElement('canvas'); c.width = W; c.height = Math.ceil(60 + rowH*svgs.length);
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0,0,c.width,c.height);
  for (let i=0;i<svgs.length;i++) {
    const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgs[i].src);
    await img.decode(); x.drawImage(img, 60, 30 + i*rowH, svgs[i].w*scale, 140*scale);
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
  LESSONS.forEach((L, i) => {
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
        ans = {"readable": True, "title": "Test groove", "bpm": 92, "beats_per_bar": 4, "bars": [{"hits": [{"step": 0, "drums": ["kick", "hihat"]}, {"step": 4, "drums": ["snare", "hihat"]}]}, {"hits": [{"step": 8, "drums": ["floor_tom"]}, {"step": 12, "drums": ["crash", "hihat_pedal"]}]}], "notes": ""}
        replies = {
          "anthropic": {"content": [{"type": "text", "text": json.dumps(ans)}], "stop_reason": "end_turn", "usage": {"input_tokens": 2400, "output_tokens": 180}},
          "gemini": {"candidates": [{"content": {"parts": [{"text": json.dumps(ans)}]}, "finishReason": "STOP"}], "usageMetadata": {"totalTokenCount": 2600}},
          "openrouter": {"choices": [{"message": {"content": "```json\n" + json.dumps(ans) + "\n```"}, "finish_reason": "stop"}], "model": "some/vision-model:free", "usage": {"total_tokens": 2500}},
          "custom": {"choices": [{"message": {"content": json.dumps(ans)}, "finish_reason": "stop"}], "usage": {"total_tokens": 2500}},
        }
        for prov in ["gemini", "openrouter", "anthropic", "custom"]:
            await pg.evaluate("""([prov, reply]) => { settings.ai.provider = prov; settings.ai.remember = true; settings.ai.keys[prov] = 'test-key-' + prov;
              if (prov === 'custom') { settings.ai.baseUrl = 'https://llm.example.test/v1'; settings.ai.models.custom = 'vision-model'; }
              window.__req = null; window.fetch = async (url, o) => { window.__req = {url, headers: o.headers, body: JSON.parse(o.body)}; return new Response(JSON.stringify(reply), {status: 200}); }; }""", [prov, replies[prov]])
            await pg.set_input_files("#fileIn", PDF)
            await pg.wait_for_function("!document.querySelector('#srGo').disabled", timeout=20000)
            await pg.select_option("#srMethod", "ai"); await pg.click("#srGo")
            await pg.wait_for_function("document.querySelector('#srDialog').hidden", timeout=20000)
            r = await pg.evaluate("""()=>{ const b = __req.body; const imgs = JSON.stringify(b).split('/9j/').length - 1;
              return {title: ED.title, bpm: ED.bpm, notes: ED.notes, url: __req.url, h: __req.headers, imgs,
                      model: b.model || __req.url.split('/models/')[1]}; }""")
            want = {"anthropic": "https://api.anthropic.com/v1/messages", "gemini": "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
                    "openrouter": "https://openrouter.ai/api/v1/chat/completions", "custom": "https://llm.example.test/v1/chat/completions"}[prov]
            keyh = {"anthropic": ("x-api-key", "test-key-anthropic"), "gemini": ("x-goog-api-key", "test-key-gemini"),
                    "openrouter": ("authorization", "Bearer test-key-openrouter"), "custom": ("authorization", "Bearer test-key-custom")}[prov]
            check(f"{prov}: request goes to the right endpoint with the user's key", r["url"] == want and r["h"].get(keyh[0]) == keyh[1], r["url"])
            check(f"{prov}: key is not in the URL", "test-key" not in r["url"])
            check(f"{prov}: page image is sent", r["imgs"] >= 1)
            check(f"{prov}: answer becomes notes", r["title"] == "Test groove" and r["bpm"] == 92 and {"s": 24, "d": "floor"} in r["notes"] and {"s": 28, "d": "hhp"} in r["notes"], json.dumps(r["notes"]))
        # model list (used by Test key / Load models) for Gemini
        await pg.evaluate("""()=>{ window.fetch = async (url, o) => new Response(JSON.stringify({models:[{name:'models/gemini-3.8-flash',supportedGenerationMethods:['generateContent']},{name:'models/gemini-3.8-flash-tts',supportedGenerationMethods:['generateContent']},{name:'models/text-embedding-9',supportedGenerationMethods:['embedContent']}]}),{status:200}); }""")
        ids = await pg.evaluate("srListModels('gemini','k')")
        check("Gemini model list keeps usable models only", ids == ["gemini-3.8-flash"], str(ids))
        # Gemini free-tier limit message
        await pg.evaluate("window.fetch = async ()=> new Response(JSON.stringify({error:{code:429,message:'Resource has been exhausted',status:'RESOURCE_EXHAUSTED'}}),{status:429}); settings.ai.provider='gemini'")
        await pg.set_input_files("#fileIn", PDF)
        await pg.wait_for_function("!document.querySelector('#srGo').disabled", timeout=20000)
        await pg.select_option("#srMethod", "ai"); await pg.click("#srGo"); await pg.wait_for_timeout(800)
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
