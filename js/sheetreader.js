"use strict";
/* ---------- Sheet music reader: PDF or photo -> notes ----------
 * Two readers, both producing a normal song that opens in the note editor for checking:
 *   AI reader      - sends the page images to Claude with the USER'S OWN Anthropic API key
 *                    (entered in the app, stored only in that browser; never in this code).
 *   Offline reader - classic optical music recognition in the browser. Free and private,
 *                    but only reliable on clean, printed drum notation with simple rhythms.
 * See docs/ARCHITECTURE.md, "Sheet reader".
 */
const PDFJS_BASE = (typeof window.PDFJS_BASE === "string") ? window.PDFJS_BASE : "vendor/pdfjs/";
const SR = { sessionKey: "" };
const AI_MODELS = [
  ["claude-sonnet-5-5", "Claude Sonnet 5.5 (recommended)"],
  ["claude-opus-5-5",   "Claude Opus 5.5 (most careful, costs more)"],
  ["claude-haiku-5-5",  "Claude Haiku 5.5 (fastest, cheapest, less accurate)"],
];
const SR_MAX_PAGES = 8;

/* ============ loading pages as canvases ============ */
function srLoadScript(src){
  return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("couldn't load " + src)); document.head.appendChild(s); });
}
async function srPdfToCanvases(file){
  if (!window.pdfjsLib) await srLoadScript(PDFJS_BASE + "pdf.min.js");
  const lib = window.pdfjsLib;
  const sameOrigin = /^https?:$/.test(location.protocol) && !/^[a-z]+:\/\//i.test(PDFJS_BASE);
  if (sameOrigin) lib.GlobalWorkerOptions.workerSrc = PDFJS_BASE + "pdf.worker.min.js";
  else if (!window.pdfjsWorker) await srLoadScript(PDFJS_BASE + "pdf.worker.min.js"); // runs on the main thread (file:// pages)
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const canvases = [];
  for (let i = 1; i <= Math.min(doc.numPages, SR_MAX_PAGES); i++) {
    const page = await doc.getPage(i);
    const v1 = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: 2200 / Math.max(v1.width, v1.height) });
    const c = document.createElement("canvas"); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: x, viewport: vp }).promise;
    canvases.push(c);
  }
  return { canvases, total: doc.numPages };
}
async function srImageToCanvas(file){
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("couldn't open that image (try JPG or PNG)")); i.src = url; });
    const s = Math.min(1, 2200 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
    const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
    return { canvases: [c], total: 1 };
  } finally { URL.revokeObjectURL(url); }
}
function srFileToCanvases(file){
  return (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) ? srPdfToCanvases(file) : srImageToCanvas(file);
}

/* ============ AI reader (user's own key) ============ */
const AI_DRUMS = ["kick", "kick2", "snare", "hihat", "hihat_pedal", "tom1", "tom2", "tom3", "floor_tom", "floor_tom2", "crash", "crash2", "splash", "china", "ride"];
const AI_TO_ID = { kick:"kick", kick2:"kick2", snare:"snare", hihat:"hihat", hihat_pedal:"hhp", tom1:"tom1", tom2:"tom2", tom3:"tom3", floor_tom:"floor", floor_tom2:"floor2", crash:"crash", crash2:"crash2", splash:"splash", china:"china", ride:"ride" };
const AI_SCHEMA = {
  type: "object",
  properties: {
    readable: { type: "boolean" },
    title: { type: "string" },
    bpm: { type: "integer" },
    beats_per_bar: { type: "integer" },
    bars: { type: "array", items: { type: "object", properties: {
      hits: { type: "array", items: { type: "object", properties: {
        step: { type: "integer" },
        drums: { type: "array", items: { type: "string", enum: AI_DRUMS } }
      }, required: ["step", "drums"], additionalProperties: false } }
    }, required: ["hits"], additionalProperties: false } },
    notes: { type: "string" }
  },
  required: ["readable", "title", "bpm", "beats_per_bar", "bars", "notes"],
  additionalProperties: false
};
const AI_PROMPT = `You are transcribing drum sheet music for a beginner's practice app. The images above are the pages of one piece, in order.

Write out every bar in playing order as a list of hits on a 16th-note grid:
- "step" is the position in the bar in 16th notes, starting at 0. A 4/4 bar has steps 0-15 (beat 1 = 0, beat 2 = 4, beat 3 = 8, beat 4 = 12; the "&" of beat 1 = 2). A 3/4 bar has steps 0-11.
- "drums" lists every drum struck at that step.
- Expand repeat signs, "repeat previous bar" (%) marks and first/second endings, so the bars are exactly what is played. Leave out bars that are only rests at the very start.
- If the page has a drum key/legend, follow it. Otherwise use standard drum-kit notation on a 5-line staff: kick = bottom space (F4); snare = third space (C5); floor tom = second space (A4); tom2 = middle line (B4) or fourth line (D5); tom1 = fourth space (E5); ride = x on the top line (F5); hihat = x just above the staff (G5); crash = x on the ledger line above (A5) or a circled x; hihat_pedal = x below the staff (D4). Use tom3, floor_tom2, crash2, splash, china and kick2 (left foot of a double pedal) only when the sheet clearly has those extra pieces.
- Open hi-hat counts as hihat. Ghost notes, rimshots and cross-stick count as snare. Flams count as one hit. Round triplets and swing to the nearest 16th and say so in "notes".
- "bpm": the tempo marking if there is one, otherwise 0. "beats_per_bar": from the time signature (4 for 4/4, 3 for 3/4; use 4 if unsure). "title": the piece's title if printed, else "".
- "notes": one or two short sentences about anything you were unsure of or had to simplify. Empty if nothing.
- If the images are not drum notation, or are unreadable, set "readable" to false and explain in "notes".`;

function srKey(){ return settings.ai.remember ? settings.ai.key : SR.sessionKey; }
function srJpeg(c, maxEdge = 1568){
  const s = Math.min(1, maxEdge / Math.max(c.width, c.height));
  const o = document.createElement("canvas"); o.width = Math.round(c.width * s); o.height = Math.round(c.height * s);
  o.getContext("2d").drawImage(c, 0, 0, o.width, o.height);
  return o.toDataURL("image/jpeg", 0.88).split(",")[1];
}
async function srCallClaude(key, body){
  let r;
  try {
    r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json", "anthropic-dangerous-direct-browser-access": "true" },
      body: JSON.stringify(body)
    });
  } catch (e) {
    throw new Error("Couldn't reach the Claude API. Check your internet connection. (Inside claude.ai the app can't make this request: use your GitHub Pages link.)");
  }
  const text = await r.text();
  return { ok: r.ok, status: r.status, text };
}
function srApiError(r){
  let msg = ""; try { msg = JSON.parse(r.text).error.message; } catch (e) {}
  if (r.status === 401) return "The API key was rejected. Check it in Library → Sheet reading.";
  if (r.status === 403) return "This API key isn't allowed to do that: " + msg;
  if (r.status === 429) return "Too many requests right now (rate limit). Wait a minute and try again.";
  if (r.status === 529 || r.status === 503) return "Claude is busy right now. Try again in a minute, or use the offline reader.";
  if (/credit|billing|balance/i.test(msg)) return "Your Anthropic account is out of credit: " + msg;
  return `Claude API error ${r.status}${msg ? ": " + msg : ""}`;
}
function srExtractJson(t){ const a = t.indexOf("{"), b = t.lastIndexOf("}"); if (a < 0 || b < a) throw new Error("Claude didn't return a readable answer. Try again."); return t.slice(a, b + 1); }
async function srAiRead(canvases, onStep){
  const key = srKey(); if (!key) throw new Error("Add your Anthropic API key first (Library → Sheet reading).");
  const content = [];
  canvases.forEach((c, i) => { content.push({ type: "text", text: `Page ${i + 1}:` }); content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: srJpeg(c) } }); });
  content.push({ type: "text", text: AI_PROMPT });
  const body = { model: settings.ai.model, max_tokens: 16000, messages: [{ role: "user", content }], output_config: { format: { type: "json_schema", schema: AI_SCHEMA } } };
  onStep && onStep(`Sending ${canvases.length} page${canvases.length > 1 ? "s" : ""} to Claude…`);
  let r = await srCallClaude(key, body);
  if (!r.ok && r.status === 400 && /output_config|json_schema|format/i.test(r.text)) {
    // Older API versions or models without structured outputs: ask for plain JSON instead.
    delete body.output_config;
    content.push({ type: "text", text: "Reply with only one JSON object with the keys readable, title, bpm, beats_per_bar, bars (each {hits:[{step, drums}]}), notes. No other text." });
    r = await srCallClaude(key, body);
  }
  if (!r.ok) throw new Error(srApiError(r));
  const data = JSON.parse(r.text);
  if (data.stop_reason === "max_tokens") throw new Error("The piece is too long to read in one go. Try a PDF with fewer pages.");
  if (data.stop_reason === "refusal") throw new Error("Claude declined to read this image.");
  const j = JSON.parse(srExtractJson((data.content || []).filter(b => b.type === "text").map(b => b.text).join("")));
  if (j.readable === false) throw new Error("Claude couldn't read drum notation here" + (j.notes ? ": " + j.notes : "."));
  const beats = j.beats_per_bar === 3 ? 3 : 4, spb = beats * 4, notes = [];
  (j.bars || []).forEach((bar, bi) => (bar.hits || []).forEach(hh => {
    const s = Math.max(0, Math.min(spb - 1, Math.round(hh.step)));
    (hh.drums || []).forEach(d => { const id = AI_TO_ID[d]; if (id && !notes.some(n => n.s === bi*spb + s && n.d === id)) notes.push({ s: bi*spb + s, d: id }); });
  }));
  const usage = data.usage ? `${data.usage.input_tokens + data.usage.output_tokens} tokens` : "";
  return { title: j.title || "", bpm: j.bpm > 20 && j.bpm < 300 ? j.bpm : 0, beats, bars: Math.max(1, (j.bars || []).length), notes, report: (j.notes || "") , usage };
}
async function srTestKey(key){
  const r = await srCallClaude(key, { model: settings.ai.model, max_tokens: 1, messages: [{ role: "user", content: "Hi" }] });
  if (!r.ok) throw new Error(srApiError(r));
}

/* ============ Offline reader (optical music recognition) ============ */
// Grayscale + adaptive threshold (Bradley): copes with uneven lighting in photos.
function omrBinarize(c){
  const W = c.width, H = c.height, d = c.getContext("2d").getImageData(0, 0, W, H).data;
  const g = new Uint8Array(W*H);
  for (let i = 0, p = 0; i < W*H; i++, p += 4) g[i] = (d[p]*77 + d[p+1]*150 + d[p+2]*29) >> 8;
  const I = new Float64Array((W+1)*(H+1));
  for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += g[y*W+x]; I[(y+1)*(W+1)+x+1] = I[y*(W+1)+x+1] + row; } }
  const s = Math.max(15, Math.round(W/40)) >> 1, bin = new Uint8Array(W*H);
  for (let y = 0; y < H; y++) {
    const y0 = Math.max(0, y-s), y1 = Math.min(H-1, y+s);
    for (let x = 0; x < W; x++) {
      const x0 = Math.max(0, x-s), x1 = Math.min(W-1, x+s), area = (x1-x0+1)*(y1-y0+1);
      const sum = I[(y1+1)*(W+1)+x1+1] - I[y0*(W+1)+x1+1] - I[(y1+1)*(W+1)+x0] + I[y0*(W+1)+x0];
      const v = g[y*W+x];
      bin[y*W+x] = (v*area < sum*0.82 && v < 200) || v < 70 ? 1 : 0;
    }
  }
  return { bin, W, H };
}
// Find the rotation that makes staff lines most horizontal.
function omrSkew(bin, W, H){
  const pts = [];
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 3) if (bin[y*W+x]) pts.push(x, y);
  let best = 0, bestScore = -1;
  for (let a = -5; a <= 5.001; a += 0.25) {
    const t = Math.tan(a*Math.PI/180), hist = new Float64Array(H*2); let sc = 0;
    for (let i = 0; i < pts.length; i += 2) { const yy = Math.round(pts[i+1] - pts[i]*t) + (H>>1); if (yy >= 0 && yy < hist.length) hist[yy]++; }
    for (let i = 0; i < hist.length; i++) sc += hist[i]*hist[i];
    if (sc > bestScore) { bestScore = sc; best = a; }
  }
  return best;
}
function omrRotate(c, deg){
  const o = document.createElement("canvas"); o.width = c.width; o.height = c.height;
  const x = o.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, o.width, o.height);
  x.translate(o.width/2, o.height/2); x.rotate(-deg*Math.PI/180); x.drawImage(c, -c.width/2, -c.height/2); return o;
}
// 5-line staves: rows that are mostly dark, grouped in fives with equal spacing.
function omrStaves(bin, W, H){
  const rc = new Int32Array(H); let mx = 0;
  for (let y = 0; y < H; y++) { let n = 0; for (let x = 0; x < W; x++) n += bin[y*W+x]; rc[y] = n; if (n > mx) mx = n; }
  const lines = []; let y = 0;
  while (y < H) { if (rc[y] > 0.4*mx) { let y2 = y; while (y2+1 < H && rc[y2+1] > 0.4*mx) y2++; lines.push({ y: (y+y2)/2, r0: y, r1: y2 }); y = y2+1; } else y++; }
  const staves = [];
  for (let i = 0; i + 4 < lines.length; ) {
    const L = lines.slice(i, i+5), gaps = [1,2,3,4].map(k => L[k].y - L[k-1].y), m = gaps.reduce((a,b)=>a+b,0)/4;
    if (m >= 4 && m <= 80 && gaps.every(gp => Math.abs(gp - m) < 0.22*m)) { staves.push({ lines: L, sp: m, top: L[0].y, bottom: L[4].y }); i += 5; } else i++;
  }
  // horizontal extent from the middle line
  for (const st of staves) {
    const row = Math.round(st.lines[2].y); let best = [0,0], run0 = -1, gap = 0;
    for (let x = 0; x <= W; x++) {
      const dark = x < W && (bin[row*W+x] || bin[(row-1)*W+x] || bin[(row+1)*W+x]);
      if (dark) { if (run0 < 0) run0 = x; gap = 0; }
      else if (run0 >= 0 && ++gap > 4) { const e = x - gap; if (e - run0 > best[1] - best[0]) best = [run0, e]; run0 = -1; gap = 0; }
    }
    st.x0 = best[0]; st.x1 = best[1];
  }
  return staves.filter(s => s.x1 - s.x0 > 10*s.sp);
}
// Erase staff and ledger lines but keep the symbols crossing them.
function omrRemoveLines(bin, W, H, st){
  const { sp } = st, clear = (r0, r1, xa, xb) => {
    for (let x = xa; x <= xb; x++) {
      const up = r0-2 >= 0 && (bin[(r0-2)*W+x] || (r0-3 >= 0 && bin[(r0-3)*W+x]));
      const dn = r1+2 < H && (bin[(r1+2)*W+x] || (r1+3 < H && bin[(r1+3)*W+x]));
      if (!up && !dn) for (let r = r0-1; r <= r1+1; r++) if (r >= 0 && r < H) bin[r*W+x] = 0;
    }
  };
  for (const L of st.lines) clear(L.r0, L.r1, Math.max(0, st.x0-2), Math.min(W-1, st.x1+2));
  const t = Math.max(1, st.lines[0].r1 - st.lines[0].r0 + 1);
  for (const yl of [st.top - sp, st.top - 2*sp, st.bottom + sp, st.bottom + 2*sp]) {
    for (let r = Math.round(yl - 2); r <= Math.round(yl + 2); r++) {
      if (r < 1 || r >= H-1) continue;
      let x = st.x0;
      while (x <= st.x1) {
        if (!bin[r*W+x]) { x++; continue; }
        let x2 = x; while (x2+1 <= st.x1 && bin[r*W+x2+1]) x2++;
        if (x2 - x + 1 >= 0.9*sp && x2 - x + 1 <= 3.4*sp) clear(r - (t>>1), r + ((t-1)>>1), x, x2);
        x = x2 + 1;
      }
    }
  }
}
// Long thin vertical strokes: barlines (span the staff exactly) and stems. Both are removed.
function omrStrokes(bin, W, H, st, yA, yB, also){
  const { sp } = st, minLen = 2.2*sp, open = [], done = [];
  for (let x = Math.max(0, Math.round(st.x0 - sp)); x <= Math.min(W-1, Math.round(st.x1 + sp)); x++) {
    const runs = []; let y = yA;
    while (y <= yB) { if (bin[y*W+x]) { let y2 = y; while (y2+1 <= yB && bin[(y2+1)*W+x]) y2++; if (y2 - y + 1 >= minLen) runs.push([y, y2]); y = y2+1; } else y++; }
    const next = [];
    for (const [a, b] of runs) {
      const s = open.find(o => o.x1 === x-1 && Math.min(o.y1, b) - Math.max(o.y0, a) > 0.5*(b-a));
      if (s) { s.x1 = x; s.y0 = Math.min(s.y0, a); s.y1 = Math.max(s.y1, b); s.cols.push([x, a, b]); next.push(s); }
      else next.push({ x0: x, x1: x, y0: a, y1: b, cols: [[x, a, b]] });
    }
    for (const o of open) if (!next.includes(o)) done.push(o);
    open.length = 0; open.push(...next);
  }
  done.push(...open);
  const bars = [], stems = [];
  for (const s of done) {
    const w = s.x1 - s.x0 + 1;
    if (w > Math.max(4, 1.0*sp)) continue;
    const isBar = s.y0 >= st.top - 0.5*sp && s.y0 <= st.top + 0.35*sp && s.y1 >= st.bottom - 0.35*sp && s.y1 <= st.bottom + 0.5*sp;
    if (!isBar && w > Math.max(3, 0.4*sp)) continue;
    (isBar ? bars : stems).push({ x: (s.x0 + s.x1)/2, y0: s.y0, y1: s.y1 });
    for (const [x, a, b] of s.cols) for (let y = a; y <= b; y++) { bin[y*W+x] = 0; if (also) also[y*W+x] = 0; }
  }
  return { bars, stems };
}
function omrComponents(mask, W, xa, xb, ya, yb, conn8){
  const seen = new Uint8Array((xb-xa+1)*(yb-ya+1)), comps = [], ww = xb-xa+1, stack = [];
  for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
    const li = (y-ya)*ww + (x-xa); if (!mask[y*W+x] || seen[li]) continue;
    let c = { x0:x, x1:x, y0:y, y1:y, n:0 }; seen[li] = 1; stack.push(x, y);
    while (stack.length) {
      const cy = stack.pop(), cx = stack.pop(); c.n++;
      if (cx < c.x0) c.x0 = cx; if (cx > c.x1) c.x1 = cx; if (cy < c.y0) c.y0 = cy; if (cy > c.y1) c.y1 = cy;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dy) || (!conn8 && dx && dy)) continue;
        const nx = cx+dx, ny = cy+dy; if (nx < xa || nx > xb || ny < ya || ny > yb) continue;
        const nl = (ny-ya)*ww + (nx-xa); if (mask[ny*W+nx] && !seen[nl]) { seen[nl] = 1; stack.push(nx, ny); }
      }
    }
    comps.push(c);
  }
  return comps;
}
// raw: image with staff lines still in (thin lines vanish in the erosion, and heads that touch a line stay whole)
function omrHeads(bin, raw, W, H, st, yA, yB){
  const { sp } = st, xa = Math.max(0, Math.round(st.x0)), xb = Math.min(W-1, Math.round(st.x1));
  // filled heads: erode so thin strokes vanish, keep solid blobs
  const r = Math.max(1, Math.round(0.2*sp)), Wn = W+1, I = new Int32Array((W+1)*(yB-yA+2));
  for (let y = yA; y <= yB; y++) { let row = 0; for (let x = 0; x < W; x++) { row += raw[y*W+x]; I[(y-yA+1)*Wn+x+1] = I[(y-yA)*Wn+x+1] + row; } }
  const box = (x0, y0, x1, y1) => { x0 = Math.max(0, x0); x1 = Math.min(W-1, x1); y0 = Math.max(yA, y0); y1 = Math.min(yB, y1); if (x1 < x0 || y1 < y0) return 0; return I[(y1-yA+1)*Wn+x1+1] - I[(y0-yA)*Wn+x1+1] - I[(y1-yA+1)*Wn+x0] + I[(y0-yA)*Wn+x0]; };
  const er = new Uint8Array(W*H), area = (2*r+1)*(2*r+1);
  for (let y = yA + r; y <= yB - r; y++) for (let x = xa; x <= xb; x++) if (raw[y*W+x] && box(x-r, y-r, x+r, y+r) === area) er[y*W+x] = 1;
  const heads = [];
  for (const c of omrComponents(er, W, xa, xb, yA, yB, false)) {
    const x0 = c.x0 - r, x1 = c.x1 + r, y0 = c.y0 - r, y1 = c.y1 + r, w = x1-x0+1, h = y1-y0+1;
    if (w < 0.55*sp || w > 2.0*sp || h < 0.5*sp || h > 2.7*sp) continue;
    const fill = box(x0, y0, x1, y1) / (w*h); if (fill < 0.5) continue;
    if (h > 1.45*sp) { // two heads touching vertically (e.g. a chord): split
      if (w/h > 1.4) continue;
      heads.push({ x: (x0+x1)/2, y: y0 + h*0.25, filled: true, w, h: h/2 }, { x: (x0+x1)/2, y: y0 + h*0.75, filled: true, w, h: h/2 });
    } else { if (w/h < 0.7 || w/h > 2.6) continue; heads.push({ x: (x0+x1)/2, y: (y0+y1)/2, filled: true, w, h }); }
  }
  // x heads (cymbals): small thin-stroke shapes with both diagonals dark
  const rest = bin.slice(); for (const hd of heads) for (let y = Math.round(hd.y - hd.h/2 - 1); y <= Math.round(hd.y + hd.h/2 + 1); y++) for (let x = Math.round(hd.x - hd.w/2 - 1); x <= Math.round(hd.x + hd.w/2 + 1); x++) if (y >= 0 && y < H && x >= 0 && x < W) rest[y*W+x] = 0;
  // dilate by 1px so slightly broken strokes still count
  const dil = new Uint8Array(W*H);
  for (let y = Math.max(1, yA); y <= Math.min(H-2, yB); y++) for (let x = Math.max(1, xa); x <= Math.min(W-2, xb); x++)
    if (rest[y*W+x] || rest[y*W+x-1] || rest[y*W+x+1] || rest[(y-1)*W+x] || rest[(y+1)*W+x]) dil[y*W+x] = 1;
  const at = (x, y) => { x = Math.round(x); y = Math.round(y); return x >= 0 && x < W && y >= 0 && y < H ? dil[y*W+x] : 0; };
  const half = 0.36*sp, N = 11, xs = [];
  // cymbals sit at a few known heights: scan those rows for an "x" shape
  for (const pos of [11, 10, 9, 8, 7, 0, -1, -2]) {
    const yc = st.bottom - pos*sp/2, cand = [];
    for (let x = xa + half; x <= xb - half; x++) {
      let best = 0;
      for (let dy = -Math.round(0.12*sp); dy <= Math.round(0.12*sp); dy++) {
        const y = yc + dy; let a = 0, b = 0;
        for (let i = 0; i < N; i++) { const t = -1 + 2*i/(N-1); if (at(x + t*half, y + t*half)) a++; if (at(x + t*half, y - t*half)) b++; }
        const holes = at(x, y - half) + at(x, y + half) + at(x - half, y) + at(x + half, y);
        const sc = Math.min(a, b)/N - 0.15*holes;
        if (sc > best) best = sc;
      }
      if (best >= 0.7) cand.push({ x, sc: best });
    }
    // keep local maxima
    cand.sort((p, q) => q.sc - p.sc);
    for (const c of cand) if (!xs.some(o => Math.abs(o.x - c.x) < 0.8*sp && Math.abs(o.y - yc) < 0.8*sp)) xs.push({ x: c.x, y: yc, sc: c.sc });
  }
  for (const c of xs) heads.push({ x: c.x, y: c.y, filled: false, w: 2*half, h: 2*half });
  return heads;
}
// Staff position (0 = bottom line, 1 = bottom space, … 8 = top line) -> drum
function omrDrum(pos, filled){
  if (filled) {
    if (pos <= 1) return pos >= -2 ? "kick" : null;
    if (pos <= 3) return "floor";
    if (pos === 4) return "tom2";
    if (pos === 5) return "snare";
    if (pos === 6) return "tom2";
    if (pos <= 9) return "tom1";
    return null;
  }
  if (pos >= 10 && pos <= 12) return "crash";
  if (pos === 9) return "hihat";
  if (pos === 7 || pos === 8) return "ride";
  if (pos >= -3 && pos <= 0) return "hhp";
  if (pos === 5) return "snare"; // cross-stick
  if (pos === 6) return "hihat";
  return null;
}
// Notes inside one bar -> 16th-note steps, assuming roughly proportional spacing.
function omrQuantize(cols, x0m, R, beats){
  let best = null;
  for (const d of [beats, beats*2, beats*4]) {
    const w = (R - x0m)/d; if (w <= 0) continue;
    const ks = cols.map(c => Math.max(0, Math.round((c.x - x0m)/w)));
    if (ks.some(k => k >= d) || ks.some((k, i) => i && k <= ks[i-1])) continue;
    const err = cols.reduce((s, c, i) => s + Math.abs((c.x - x0m)/w - ks[i]), 0) / cols.length;
    const score = err + 0.04*Math.log2(d/beats);
    if (!best || score < best.score) best = { score, d, ks, err };
  }
  if (!best) { // fall back to 16ths, pushing collisions along
    const d = beats*4, w = (R - x0m)/d; let last = -1;
    const ks = cols.map(c => { let k = Math.max(last+1, Math.round((c.x - x0m)/w)); last = k; return Math.min(d-1, k); });
    best = { d, ks, err: 0.5 };
  }
  return { steps: best.ks.map(k => k*(beats*4/best.d)), err: best.err };
}
function omrPage(canvas, beats){
  let c = canvas;
  if (c.width > 1800) { const s = 1800/c.width, o = document.createElement("canvas"); o.width = 1800; o.height = Math.round(c.height*s); o.getContext("2d").drawImage(c, 0, 0, o.width, o.height); c = o; }
  let { bin, W, H } = omrBinarize(c);
  const ang = omrSkew(bin, W, H);
  if (Math.abs(ang) >= 0.25) { c = omrRotate(c, ang); ({ bin, W, H } = omrBinarize(c)); }
  const staves = omrStaves(bin, W, H);
  const out = { staves: [], measures: [], canvas: c, angle: ang };
  staves.forEach((st, si) => {
    const sp = st.sp;
    const prevB = si ? staves[si-1].bottom : -1e9, nextT = si < staves.length-1 ? staves[si+1].top : 1e9;
    const yA = Math.max(0, Math.round(Math.max(st.top - 4.5*sp, (prevB + st.top)/2)));
    const yB = Math.min(H-1, Math.round(Math.min(st.bottom + 4*sp, (st.bottom + nextT)/2)));
    const raw = bin.slice();
    omrRemoveLines(bin, W, H, st);
    const { bars } = omrStrokes(bin, W, H, st, yA, yB, raw);
    const heads = omrHeads(bin, raw, W, H, st, yA, yB).map(hd => {
      const pos = Math.round((st.bottom - hd.y)/(sp/2)); return { ...hd, pos, d: omrDrum(pos, hd.filled) };
    }).filter(hd => hd.d);
    // barlines -> bar boundaries (merge double barlines / repeat signs)
    const bx = bars.map(b => b.x).sort((a, b) => a-b).filter((x, i, a) => !i || x - a[i-1] > 1.2*sp);
    const bounds = [st.x0, ...bx.filter(x => x > st.x0 + 2*sp)];
    if (st.x1 - bounds[bounds.length-1] > 3*sp) bounds.push(st.x1);
    for (let i = 0; i + 1 < bounds.length; i++) {
      const L = bounds[i], R = bounds[i+1]; if (R - L < 3*sp) continue;
      const hs = heads.filter(hd => hd.x > L + 0.3*sp && hd.x < R - 0.3*sp).sort((a, b) => a.x - b.x);
      const cols = [];
      for (const hd of hs) { const last = cols[cols.length-1]; if (last && hd.x - last.x < 0.7*sp) { last.heads.push(hd); last.x = last.heads.reduce((s, q) => s + q.x, 0)/last.heads.length; } else cols.push({ x: hd.x, heads: [hd] }); }
      out.measures.push({ staff: si, L, R, first: i === 0, cols, sp });
    }
    out.staves.push({ ...st, bars: bx, heads });
  });
  // typical gap between a barline and a bar's first note (used where a bar may start with a rest)
  const pads = out.measures.filter(m => !m.first && m.cols.length).map(m => m.cols[0].x - m.L).sort((a, b) => a-b);
  const pad = pads.length ? pads[Math.floor(pads.length*0.25)] : null;
  for (const m of out.measures) {
    if (!m.cols.length) { m.steps = []; continue; }
    const x0m = m.first || pad == null ? m.cols[0].x : Math.min(m.cols[0].x, m.L + pad);
    const q = omrQuantize(m.cols, x0m, m.R - 0.15*m.sp, beats); m.steps = q.steps; m.err = q.err;
  }
  return out;
}
function omrOverlay(page){
  const c = page.canvas, o = document.createElement("canvas"); o.width = c.width; o.height = c.height;
  const x = o.getContext("2d"); x.drawImage(c, 0, 0); x.lineWidth = 2;
  for (const st of page.staves) {
    x.strokeStyle = "rgba(40,160,90,.55)"; for (const L of st.lines) { x.beginPath(); x.moveTo(st.x0, L.y); x.lineTo(st.x1, L.y); x.stroke(); }
    x.strokeStyle = "rgba(40,110,230,.9)"; x.lineWidth = 3; for (const b of st.bars) { x.beginPath(); x.moveTo(b, st.top - 4); x.lineTo(b, st.bottom + 4); x.stroke(); }
    x.lineWidth = 3;
    for (const hd of st.heads) { x.strokeStyle = D[hd.d].color === "#FFD166" ? "#C99700" : D[hd.d].color; x.beginPath(); x.ellipse(hd.x, hd.y, hd.w/2 + 3, hd.h/2 + 3, 0, 0, Math.PI*2); x.stroke(); }
  }
  let n = 0; x.font = "bold 16px sans-serif"; x.fillStyle = "rgba(40,110,230,1)";
  for (const m of page.measures) { n++; const st = page.staves[m.staff]; x.fillText(String(n), m.L + 4, st.top - st.sp*1.2); }
  return o;
}
function srOfflineRead(canvases, beats){
  const notes = [], overlays = []; let bar = 0, heads = 0, staves = 0, errs = [];
  const spb = beats*4;
  for (const c of canvases) {
    const pg = omrPage(c, beats); staves += pg.staves.length;
    for (const m of pg.measures) {
      m.cols.forEach((col, i) => { const s = bar*spb + m.steps[i]; for (const hd of col.heads) { heads++; if (!notes.some(n => n.s === s && n.d === hd.d)) notes.push({ s, d: hd.d }); } });
      if (m.err != null) errs.push(m.err);
      bar++;
    }
    overlays.push(omrOverlay(pg));
  }
  if (!staves) throw new Error("No 5-line drum staves were found. Use a straight, well-lit photo or a clean scan, or try the AI reader.");
  const avgErr = errs.length ? errs.reduce((a, b) => a+b, 0)/errs.length : 0;
  const report = `Found ${staves} staff line${staves>1?"s":""}, ${bar} bar${bar>1?"s":""} and ${heads} notes.` + (avgErr > 0.2 ? " The rhythm was hard to work out in some bars: check the timing." : "");
  return { title: "", bpm: 0, beats, bars: Math.max(1, bar), notes, report, overlays };
}

/* ============ the "Read sheet music" dialog ============ */
let SRD = null; // {file, pages}
function srMethod(){ const m = settings.ai.method; if (m === "auto") return srKey() ? "ai" : "offline"; return m; }
async function srOpen(file){
  SRD = { file, pages: null };
  const dlg = $("#srDialog"); dlg.hidden = false;
  $("#srFile").textContent = file.name; $("#srErr").textContent = ""; $("#srStatus").textContent = "Opening…";
  $("#srGo").disabled = true; $("#srMethod").value = srMethod(); $("#srBeats").value = "4"; srMethodHint();
  try {
    const { canvases, total } = await srFileToCanvases(file);
    SRD.pages = canvases;
    const pv = $("#srPreview"); pv.innerHTML = "";
    canvases.forEach(c => { const im = h("img", { src: c.toDataURL("image/jpeg", 0.6), alt: "Page preview" }); pv.appendChild(im); });
    $("#srStatus").textContent = `${canvases.length} page${canvases.length>1?"s":""}` + (total > canvases.length ? ` (only the first ${SR_MAX_PAGES} of ${total} are read)` : "");
    $("#srGo").disabled = false;
  } catch (e) { console.error(e); $("#srStatus").textContent = ""; $("#srErr").textContent = "Couldn't open that file: " + e.message; }
}
function srMethodHint(){
  const m = $("#srMethod").value, k = !!srKey();
  $("#srHint").innerHTML = m === "ai"
    ? (k ? `Uses <b>your</b> Anthropic API key and model ${esc(settings.ai.model)}. A few thousand tokens per page are charged to your account.` : `<span style="color:var(--amber)">No API key set.</span> Add one under Library → Sheet reading, or use the offline reader.`)
    : "Runs on this device, free. Best on clean printed sheets with simple rhythms; photos should be straight and evenly lit.";
  $("#srBeatsRow").hidden = m === "ai";
}
function srClose(){ $("#srDialog").hidden = true; SRD = null; }
async function srGo(){
  if (!SRD || !SRD.pages) return;
  const method = $("#srMethod").value, beats = +$("#srBeats").value, go = $("#srGo");
  $("#srErr").textContent = ""; go.disabled = true; go.textContent = "Reading…";
  const step = t => { $("#srStatus").textContent = t; };
  try {
    let res;
    if (method === "ai") res = await srAiRead(SRD.pages, step);
    else { step("Reading notes…"); await new Promise(r => setTimeout(r, 30)); res = srOfflineRead(SRD.pages, beats); }
    if (!res.notes.length) throw new Error("No notes were found. " + (method === "offline" ? "Try the AI reader, or a clearer image." : (res.report || "")));
    const name = SRD.file.name.replace(/\.[^.]+$/, "");
    const song = { id: uid(), title: res.title || name, bpm: res.bpm || 80, bars: Math.min(64, res.bars), beats: res.beats, notes: res.notes.filter(n => n.s < 64*res.beats*4), source: method === "ai" ? "Read by AI from sheet" : "Read offline from sheet" };
    const file = SRD.file, overlays = res.overlays;
    srClose(); saveSong(song); openEditor(song);
    if (overlays) showTraceCanvases(overlays, "What the offline reader found (circles = notes it read, blue = barlines, numbers = bars)"); else showTrace(file);
    toast(`Read ${song.notes.length} notes in ${song.bars} bar${song.bars>1?"s":""}. Check them against the sheet, then Practise`);
    if (res.report) setTimeout(()=>toast(res.report + (res.usage ? ` (${res.usage})` : "")), 3400);
  } catch (e) { console.error(e); $("#srErr").textContent = e.message; $("#srStatus").textContent = ""; }
  finally { go.disabled = false; go.textContent = "Read notes"; }
}

/* ============ settings card ============ */
function srRenderSettings(){
  const k = settings.ai.remember ? settings.ai.key : SR.sessionKey;
  $("#aiKeyState").textContent = k ? (settings.ai.remember ? "Key saved on this device: ••••" + k.slice(-4) : "Key set for this session only: ••••" + k.slice(-4)) : "No key set: the free offline reader will be used.";
  $("#aiRemember").checked = settings.ai.remember; $("#aiModel").value = settings.ai.model; $("#aiMethod").value = settings.ai.method;
}
function srWire(){
  const sel = $("#aiModel"); sel.innerHTML = AI_MODELS.map(([id, n]) => `<option value="${id}">${esc(n)}</option>`).join("");
  $("#aiSave").onclick = () => {
    const v = $("#aiKey").value.trim();
    if (!v) { toast("Paste your API key first"); return; }
    if (!/^sk-ant-/.test(v)) toast("That doesn't look like an Anthropic key (they start with sk-ant-). Saved anyway.");
    if (settings.ai.remember) { settings.ai.key = v; SR.sessionKey = ""; } else { SR.sessionKey = v; settings.ai.key = ""; }
    saveSettings(); $("#aiKey").value = ""; srRenderSettings(); toast("API key saved");
  };
  $("#aiRemove").onclick = () => { settings.ai.key = ""; SR.sessionKey = ""; saveSettings(); srRenderSettings(); toast("API key removed from this device"); };
  $("#aiRemember").onchange = e => { const k = srKey(); settings.ai.remember = e.target.checked; if (settings.ai.remember) { settings.ai.key = k; SR.sessionKey = ""; } else { SR.sessionKey = k; settings.ai.key = ""; } saveSettings(); srRenderSettings(); };
  $("#aiModel").onchange = e => { settings.ai.model = e.target.value; saveSettings(); };
  $("#aiMethod").onchange = e => { settings.ai.method = e.target.value; saveSettings(); };
  $("#aiTest").onclick = async () => {
    const k = $("#aiKey").value.trim() || srKey(); if (!k) { toast("Paste or save a key first"); return; }
    const b = $("#aiTest"); b.disabled = true; b.textContent = "Testing…";
    try { await srTestKey(k); toast("The key works"); } catch (e) { toast(e.message); } finally { b.disabled = false; b.textContent = "Test key"; }
  };
  $("#srMethod").onchange = srMethodHint; $("#srGo").onclick = srGo; $("#srCancel").onclick = srClose;
  srRenderSettings();
}
