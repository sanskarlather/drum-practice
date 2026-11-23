"use strict";
/* ---------- Drum notes from a recording (MP3, WAV…) ----------
 *   AI listening   - sends the audio to a model that can hear (Google Gemini; or an OpenAI-compatible
 *                    service with an audio-capable model), with the user's own key. Works on full songs.
 *   Offline        - finds drum hits in the audio itself (the microphone-mode detector), works out the tempo
 *                    and beat, and sorts hits into kick / snare / toms / hi-hat / cymbals by their sound.
 *                    Free and private; meant for recordings of drums alone (a drum cover, a practice track).
 * Either way the recording is attached to the song so you can play along with it.
 */
const AR_MAX_SECONDS = 360;
async function arDecode(file){
  audio();
  const buf = await file.arrayBuffer();
  try { return await ac.decodeAudioData(buf.slice(0)); }
  catch (e) { throw new Error("Couldn't decode that audio file. Try MP3 or WAV."); }
}
function arMono(buf, maxSec = AR_MAX_SECONDS){
  const n = Math.min(buf.length, Math.round(maxSec * buf.sampleRate)), out = new Float32Array(n);
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) out[i] += d[i] / buf.numberOfChannels; }
  return out;
}
async function arResample(buf, rate, maxSec = AR_MAX_SECONDS){
  const dur = Math.min(buf.duration, maxSec), oc = new OfflineAudioContext(1, Math.ceil(dur * rate), rate);
  const src = oc.createBufferSource(); src.buffer = buf; src.connect(oc.destination); src.start();
  return (await oc.startRendering()).getChannelData(0);
}
function arWavB64(x, rate){
  const n = x.length, b = new ArrayBuffer(44 + n*2), v = new DataView(b);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o+i, s.charCodeAt(i)); };
  w(0,"RIFF"); v.setUint32(4, 36 + n*2, true); w(8,"WAVE"); w(12,"fmt "); v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,1,true);
  v.setUint32(24, rate, true); v.setUint32(28, rate*2, true); v.setUint16(32,2,true); v.setUint16(34,16,true); w(36,"data"); v.setUint32(40, n*2, true);
  let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(x[i])); const g = peak > 0 ? 0.95/peak : 1;
  for (let i = 0; i < n; i++) v.setInt16(44 + i*2, Math.max(-1, Math.min(1, x[i]*g)) * 32767, true);
  const u = new Uint8Array(b); let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}

/* ============ AI listening ============ */
const AUDIO_PROMPT = `You are transcribing the DRUM KIT part of this recording for a drum practice app. Ignore every other instrument and the vocals.

Answer in EXACTLY this plain-text format and nothing else:

TEMPO: <tempo in BPM, one decimal>
TIME: <4/4 or 3/4>
START: <time in seconds, two decimals, where bar 1 beat 1 is: the first bar in which the drums play>
BAR 1
HH x.x.x.x.x.x.x.x.
SD ....x.......x...
BD x.......x.......
BAR 2
...
NOTES: <one short sentence about anything unsure, or blank>

Rules:
- Each drum line is a code, a space, then one character per 16th note: 16 characters for a 4/4 bar, 12 for 3/4. "." = no hit. Only list drums played in that bar. Write a BAR line for every bar from START to the end, even bars with no drums.
- Codes: CR crash, CR2 second crash, SP splash, CH china, RD ride, HH hi-hat, HP hi-hat pedal, SD snare, T1 high tom, T2 mid tom, T3 third tom, FT floor tom, FT2 second floor tom, BD kick, BD2 second kick.
- Characters: x = normal hit · X = accent · g = ghost note · o = OPEN hi-hat · r = rimshot · c = cross-stick · f = flam · b = ride bell · k = choke. A closed hi-hat is x; never write an open hi-hat as x.
- Keep the tempo steady unless the song clearly changes tempo. Round to the nearest 16th note.
- If there are no drums in the recording, answer only: UNREADABLE: no drums
- Do not explain, do not use code blocks.`;
async function arAiRead(buf, onStep){
  const prov = aiProv(), P = provInfo(prov), key = srKey(prov), model = srModel(prov), name = provName(prov);
  if (prov === "anthropic") throw new Error("Claude can't listen to audio. Choose Google Gemini (free tier) under Library → Sheet reading, or use the offline reader.");
  if (!key && !P.editBase) throw new Error(`Add your ${name} API key first (Library → Sheet reading).`);
  onStep && onStep("Preparing the audio…");
  const wav = arWavB64(await arResample(buf, 16000), 16000);
  onStep && onStep(`${name} is listening${buf.duration > AR_MAX_SECONDS ? " to the first 6 minutes" : ""}… (this can take a minute)`);
  let text, cut;
  if (prov === "gemini") {
    const body = { contents: [{ role: "user", parts: [{ inlineData: { mimeType: "audio/wav", data: wav } }, { text: AUDIO_PROMPT }] }],
      generationConfig: { maxOutputTokens: 30000, thinkingConfig: { thinkingLevel: "low" } } };
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.replace(/^models\//, ""))}:generateContent`;
    const go = () => srFetchRetry(url, { method: "POST", headers: { "x-goog-api-key": key, "content-type": "application/json" }, body: JSON.stringify(body) }, onStep);
    let r = await go();
    if (!r.ok && r.status === 400 && /thinking/i.test(r.text)) { delete body.generationConfig.thinkingConfig; r = await go(); }
    if (!r.ok) throw new Error(/audio|mime|inline/i.test(r.text) && r.status === 400 ? `The model “${model}” can't listen to audio. Pick another Gemini model.` : srApiError(r, "gemini"));
    const data = JSON.parse(r.text), cand = (data.candidates || [])[0];
    if (!cand) throw new Error("Gemini returned no answer. Try again.");
    text = ((cand.content && cand.content.parts) || []).filter(p => !p.thought).map(p => p.text || "").join(""); cut = cand.finishReason === "MAX_TOKENS";
  } else {
    // OpenAI-compatible services: only models that accept audio input (e.g. some on OpenRouter) will work
    const base = srBase(prov); if (!base) throw new Error("Enter the service's base URL in Library → Sheet reading.");
    const headers = { "content-type": "application/json" }; if (key) headers.authorization = "Bearer " + key;
    if (prov === "openrouter") { headers["HTTP-Referer"] = location.origin; headers["X-Title"] = "Drum Practice"; }
    const body = { model, max_tokens: 16000, messages: [{ role: "user", content: [{ type: "text", text: AUDIO_PROMPT }, { type: "input_audio", input_audio: { data: wav, format: "wav" } }] }] };
    if (prov === "openrouter") body.reasoning = { effort: "low", exclude: true };
    const go = () => srFetchRetry(base + "/chat/completions", { method: "POST", headers, body: JSON.stringify(body) }, onStep);
    let r = await go();
    if (!r.ok && r.status === 400 && /reasoning/i.test(r.text)) { delete body.reasoning; r = await go(); }
    if (!r.ok) throw new Error(/audio|modalit|input_audio/i.test(r.text) ? `The model “${model}” can't listen to audio. Use Google Gemini, or pick an audio model with “Load models”.` : srApiError(r, prov));
    const data = JSON.parse(r.text), ch = (data.choices || [])[0]; if (!ch) throw new Error("The service returned no answer. Try again.");
    const c = ch.message && ch.message.content; text = Array.isArray(c) ? c.map(x => x.text || "").join("") : (c || ""); cut = ch.finish_reason === "length";
  }
  const tab = srParseTab(text, 4);
  if (tab.unreadable) throw new Error("The AI didn't hear any drums: " + tab.unreadable);
  if (!tab.bars.length) throw new Error(cut ? "The model used up its answer limit before writing the notes. Try a shorter recording or another model." : "The AI's answer didn't contain any bars. Try again.");
  const start = (text.match(/START\s*:\s*([\d.]+)/i) || [])[1];
  const bpm = +((text.match(/TEMPO\s*:\s*([\d.]+)/i) || [])[1] || 0) || 100;
  return { notes: srTabNotes(tab, 0), bars: tab.bars.length, beats: tab.beats, bpm: Math.round(bpm), audioBpm: bpm, offset: start != null ? +start : 0,
           report: (tab.notes || "") + (cut ? " The answer was cut off: the last bars may be missing." : "") };
}

/* ============ Offline: drum-only recordings ============ */
// Find hits with the same detector microphone mode uses.
function arOnsets(x, rate){
  let peak = 0; for (let i = 0; i + 128 <= x.length; i += 128) { let e = 0; for (let j = i; j < i + 128; j++) e += x[j]*x[j]; peak = Math.max(peak, Math.sqrt(e/128)); }
  const hits = [], core = OnsetCore(rate, m => { if (m.t != null) hits.push(m); });
  core.setThresh(Math.max(0.003, peak * 0.1));
  for (let i = 0; i + 128 <= x.length; i += 128) core.block(x.subarray(i, i + 128), i / rate);
  return hits;
}
// Which drums are in each hit: per-band loudness compared with the loudest hits in the recording.
function arClassify(hits){
  const mx = [0,0,0,0,0]; for (const h of hits) h.att.forEach((a, k) => mx[k] = Math.max(mx[k], a));
  for (const h of hits) {
    const tot = h.att.reduce((a, b) => a + b, 0) + 1e-12, p = h.att.map(a => a / tot), L = h.att.map((a, k) => a / (mx[k] + 1e-12)), dr = h.dec / tot;
    const ds = [];
    const kick = L[0] > 0.2 && p[0] > 0.3;
    if (kick) ds.push("kick");
    // snare: loud in the middle bands compared with the loudest snare-like hits (hi-hats alone are quiet there);
    // a loud kick leaks a little into those bands, so with a kick the snare must also be a real share of the sound
    // a kick leaks into the 900 Hz band but hardly into the 3.5 kHz band, so that band decides
    const snare = L[3] > 0.35 && L[2] > 0.3;
    if (snare) ds.push("snare");
    else if (L[1] > 0.3 && p[1] > 0.25) ds.push(p[0] > p[1] * 0.7 ? "floor" : "tom1");
    // cymbals: how long the high frequencies ring decides closed hi-hat / open hi-hat / crash
    const ring = (h.decHi || 0) / (h.att[4] + 1e-12);
    // (a snare's rattle also rings in the high band, so with a snare an open hi-hat must ring much longer)
    const openAt = snare ? 0.6 : 0.3;
    if (L[4] > (kick ? 0.08 : 0.1) && p[4] > (kick ? 0.01 : 0.04)) ds.push(ring > 0.9 && L[4] > 0.6 ? "crash" : ring > openAt ? "hihat:open" : "hihat");
    if (!ds.length) ds.push(p[0] >= Math.max(p[2], p[4]) ? "kick" : p[4] > p[2] ? "hihat" : "snare");
    h.drums = ds;
  }
  return hits;
}
// Tempo and beat: find the 16th-note grid that the hits line up with best.
function arGrid(hits){
  const ts = hits.map(h => h.t), ws = hits.map(h => Math.sqrt(h.att.reduce((a, b) => a + b, 0)));
  const align = q => { let re = 0, im = 0, W = 0; for (let i = 0; i < ts.length; i++) { const a = 2*Math.PI*ts[i]/q; re += ws[i]*Math.cos(a); im += ws[i]*Math.sin(a); W += ws[i]; } return { mag: Math.hypot(re, im)/(W || 1), ph: Math.atan2(im, re) }; };
  let best = null;
  // try beats from 60 to 200 BPM; prefer 75-150, where most songs are counted
  for (let bpm = 60; bpm <= 200; bpm += 0.25) {
    const q = 60/bpm/4, a = align(q), w = Math.exp(-Math.pow(Math.log2(bpm/110), 2)/(2*0.4*0.4));
    // straight 8th notes fit a grid at double tempo just as well, so prefer the range drummers count in (about 70-160)
    const beat = align(60/bpm);
    const sc = a.mag * (0.6 + 0.4*beat.mag) * (0.4 + 0.6*w);
    if (!best || sc > best.sc) best = { bpm, q, ph: a.ph, sc };
  }
  const q = best.q; let phase = ((best.ph / (2*Math.PI)) * q) % q; if (phase < 0) phase += q;
  return { bpm: best.bpm, q, phase, fit: best.sc };
}
function arOfflineRead(buf){
  const rate = buf.sampleRate, x = arMono(buf);
  const hits = arClassify(arOnsets(x, rate));
  if (hits.length < 8) throw new Error("Hardly any drum hits were found. The offline reader needs a clear recording of drums alone; for full songs use AI listening.");
  const g = arGrid(hits);
  const idx = h => Math.round((h.t - g.phase) / g.q);
  // bar 1 beat 1: the beat position (0, 4, 8 or 12 in the 16-step cycle) where kicks/crashes on 1 and snares on 2 and 4 fit best
  const firstIdx = Math.min(...hits.map(idx));
  let bestR = 0, bestS = -1;
  for (const r of [0,4,8,12]) {
    let s = ((((firstIdx - r) % 16) + 16) % 16) === 0 ? 3 : 0; // songs usually start on beat 1
    s *= Math.max(1, hits.length / 32);
    for (const h of hits) { const k = (((idx(h) - r) % 16) + 16) % 16;
      if (k === 0 && h.drums.some(d => d === "kick" || d === "crash")) s += 2; if (k === 8 && h.drums.includes("kick")) s += 1;
      if ((k === 4 || k === 12) && h.drums.includes("snare")) s += 2; }
    if (s > bestS) { bestS = s; bestR = r; }
  }
  const first = Math.min(...hits.map(idx)), base = first - ((((first - bestR) % 16) + 16) % 16);
  const notes = [], seen = new Set();
  for (const h of hits) for (const dd of h.drums) {
    const [d, a] = dd.split(":"), s = idx(h) - base, k = s + "|" + d; if (s < 0 || seen.has(k)) continue; seen.add(k);
    notes.push(a ? { s, d, a } : { s, d });
  }
  const bars = Math.max(1, Math.ceil((Math.max(...notes.map(n => n.s)) + 1) / 16));
  return { notes, bars: Math.min(bars, 64), beats: 4, bpm: Math.round(g.bpm), audioBpm: g.bpm, offset: Math.max(0, g.phase + base * g.q),
           report: `Found ${hits.length} hits at about ${g.bpm.toFixed(1)} BPM.` + (g.fit < 0.5 ? " The beat was hard to follow (is the tempo steady? are there other instruments?): check the result." : "") };
}

/* ============ dialog ============ */
let ARD = null;
async function arOpen(file){
  ARD = { file, buf: null };
  const dlg = $("#arDialog"); dlg.hidden = false;
  $("#arFile").textContent = file.name; $("#arErr").textContent = ""; $("#arStatus").textContent = "Opening…"; $("#arGo").disabled = true;
  $("#arMethod").value = srKey() || provInfo(aiProv()).editBase ? (aiProv() === "anthropic" ? "offline" : "ai") : "offline"; arHint();
  try { ARD.buf = await arDecode(file); const d = ARD.buf.duration; $("#arStatus").textContent = `${Math.floor(d/60)}:${String(Math.round(d%60)).padStart(2,"0")} long` + (d > AR_MAX_SECONDS ? " (only the first 6 minutes are read)" : ""); $("#arGo").disabled = false; }
  catch (e) { $("#arStatus").textContent = ""; $("#arErr").textContent = e.message; }
}
function arHint(){
  const m = $("#arMethod").value, name = provName(aiProv());
  $("#arHint").innerHTML = m === "ai"
    ? `Sends the recording to <b>${esc(name)}</b> with your key (set under Library → Sheet reading). Works on full songs; Google Gemini can listen to audio on its free tier. AI transcription of a full mix is rough, so check it.`
    : "Runs on this device, free. Only for recordings of <b>drums alone</b> (a drum cover, a practice track) at a steady tempo. With other instruments in the mix it will find the wrong things: use AI listening for those.";
}
function arClose(){ $("#arDialog").hidden = true; ARD = null; }
async function arGo(){
  if (!ARD || !ARD.buf) return;
  const method = $("#arMethod").value, go = $("#arGo"); $("#arErr").textContent = ""; go.disabled = true; go.textContent = "Working…";
  const step = t => { $("#arStatus").textContent = t; };
  try {
    let res;
    if (method === "ai") res = await arAiRead(ARD.buf, step);
    else { step("Finding the drum hits…"); await new Promise(r => setTimeout(r, 30)); res = arOfflineRead(ARD.buf); }
    if (!res.notes.length) throw new Error("No drum notes were found.");
    const file = ARD.file, name = file.name.replace(/\.[^.]+$/, "");
    const song = { id: uid(), title: name, bpm: res.bpm || 100, bars: Math.min(64, res.bars), beats: res.beats, notes: res.notes.filter(n => n.s < 64*res.beats*4), source: method === "ai" ? "Heard by AI from a recording" : "Read offline from a recording" };
    await trackAttach(song, file, { bpm: res.audioBpm, offset: res.offset });
    arClose(); saveSong(song); openEditor(song);
    toast(`Found ${song.notes.length} notes in ${song.bars} bars. Press Listen to check them against the recording`);
    if (res.report) setTimeout(() => toast(res.report), 3400);
  } catch (e) { console.error(e); $("#arErr").textContent = e.message; $("#arStatus").textContent = ""; }
  finally { go.disabled = false; go.textContent = "Get the drum notes"; }
}
function arWire(){ $("#arMethod").onchange = arHint; $("#arGo").onclick = arGo; $("#arCancel").onclick = arClose; }
