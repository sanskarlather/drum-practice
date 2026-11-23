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

        # 3) AI reader with a mocked API: checks the request we send and that the answer is turned into notes
        await pg.evaluate("""()=>{ settings.ai.key='sk-ant-test'; settings.ai.remember=true; window.__req=null;
          window.fetch = async (url, o) => { window.__req = {url, headers:o.headers, body: JSON.parse(o.body)};
            const ans = {readable:true,title:"Test groove",bpm:92,beats_per_bar:4,bars:[{hits:[{step:0,drums:["kick","hihat"]},{step:4,drums:["snare","hihat"]}]},{hits:[{step:8,drums:["floor_tom"]},{step:12,drums:["crash","hihat_pedal"]}]}],notes:"Bar 2 has a triplet, rounded."};
            return new Response(JSON.stringify({content:[{type:"text",text:JSON.stringify(ans)}],stop_reason:"end_turn",usage:{input_tokens:2400,output_tokens:180}}),{status:200}); }; }""")
        await pg.set_input_files("#fileIn", PDF)
        await pg.wait_for_function("!document.querySelector('#srGo').disabled", timeout=20000)
        await pg.select_option("#srMethod", "ai"); await pg.click("#srGo")
        await pg.wait_for_function("document.querySelector('#srDialog').hidden", timeout=20000)
        r = await pg.evaluate("""()=>({title:ED.title,bpm:ED.bpm,notes:ED.notes, url:__req.url, h:__req.headers, model:__req.body.model, imgs:__req.body.messages[0].content.filter(c=>c.type==='image').length, schema: !!__req.body.output_config})""")
        check("AI request: correct endpoint and headers", r["url"] == "https://api.anthropic.com/v1/messages" and r["h"].get("anthropic-dangerous-direct-browser-access") == "true" and r["h"].get("x-api-key") == "sk-ant-test")
        check("AI request: page sent as an image with a JSON schema", r["imgs"] == 1 and r["schema"])
        check("AI answer becomes notes", r["title"] == "Test groove" and r["bpm"] == 92 and {"s": 24, "d": "floor"} in r["notes"] and {"s": 28, "d": "hhp"} in r["notes"], json.dumps(r["notes"]))
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
