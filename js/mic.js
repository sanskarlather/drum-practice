"use strict";
/* ---------- Microphone mode ----------
 * Listens to an acoustic kit (or a module played through a speaker) and turns
 * each hit into an "onset" with a rough sound fingerprint:
 *   - 5 frequency-band energies over the first ~30 ms of the hit (the attack)
 *   - how much sound is left 30-90 ms later (the decay: cymbals ring, closed hi-hats don't)
 * Timing comes from the audio clock, so it is accurate to a few milliseconds.
 * Drum identification compares the fingerprint with ones learned during "Teach it your drums".
 * See docs/ARCHITECTURE.md, "Microphone mode".
 */

// The hit detector. The same code runs on the audio thread (AudioWorklet, used on GitHub Pages / https)
// or, as a fallback, on the main thread (ScriptProcessor) when index.html is opened straight from disk,
// where browsers refuse to load worklets.
function OnsetCore(fs, post){
  // RBJ biquad coefficients
  const mk = (type, f, q) => {
    const w = 2*Math.PI*f/fs, c = Math.cos(w), s = Math.sin(w), a = s/(2*q);
    let b0,b1,b2; const a0 = 1+a, a1 = -2*c, a2 = 1-a;
    if (type==="lp") { b0=(1-c)/2; b1=1-c; b2=(1-c)/2; }
    else if (type==="hp") { b0=(1+c)/2; b1=-(1+c); b2=(1+c)/2; }
    else { b0=a; b1=0; b2=-a; }
    return {b0:b0/a0,b1:b1/a0,b2:b2/a0,a1:a1/a0,a2:a2/a0,x1:0,x2:0,y1:0,y2:0};
  };
  // bands: kick body, tom body, snare body, snare wires / stick, cymbal sizzle
  const f = [mk("lp",110,0.7), mk("bp",250,0.9), mk("bp",900,0.9), mk("bp",3500,0.9), mk("hp",7000,0.7)];
  let fast = 1e-6, thresh = 0.02, col = null, lvlPeak = 0, lvlN = 0;
  return {
    setThresh(t){ thresh = t; },
    // x: a block of ~128 samples; t: audio-clock time of its first sample
    block(x, t){
      const n = x.length, be = [0,0,0,0,0]; let e = 0;
      for (let i=0;i<n;i++){
        const v = x[i]; e += v*v;
        for (let k=0;k<5;k++){ const q=f[k]; const y=q.b0*v+q.b1*q.x1+q.b2*q.x2-q.a1*q.y1-q.a2*q.y2; q.x2=q.x1; q.x1=v; q.y2=q.y1; q.y1=y; be[k]+=y*y; }
      }
      const ms = e/n, rms = Math.sqrt(ms);
      // a hit = loud enough AND a sudden jump over the last few milliseconds
      // (comparing with a short window lets a soft hi-hat right after a loud kick still count)
      if (!col && rms > thresh && ms > 5*fast) col = {t, att:[0,0,0,0,0], dec:0, dur:0, peak:0};
      fast = 0.6*fast + 0.4*ms;
      if (col) {
        col.dur += n/fs; col.peak = Math.max(col.peak, rms);
        if (col.dur <= 0.032) for (let k=0;k<5;k++) col.att[k] += be[k]; else col.dec += e;
        if (col.dur >= 0.09) { post({t:col.t, att:col.att, dec:col.dec, peak:col.peak}); col = null; }
      }
      lvlPeak = Math.max(lvlPeak, rms);
      if (++lvlN >= 12) { post({lvl:lvlPeak}); lvlPeak = 0; lvlN = 0; }
    }
  };
}
const MIC_WORKLET = OnsetCore.toString() + `
class OnsetProc extends AudioWorkletProcessor {
  constructor(){ super(); this.core = OnsetCore(sampleRate, m => this.port.postMessage(m)); this.port.onmessage = e => { if (e.data.thresh != null) this.core.setThresh(e.data.thresh); }; }
  process(inputs){ const x = inputs[0] && inputs[0][0]; if (x) this.core.block(x, currentTime); return true; }
}
registerProcessor("onset-proc", OnsetProc);
`;

const MIC = {stream:null, src:null, node:null, sink:null, on:false, teach:null, teachHits:[], measuring:null, warned:false};
const micGroup = id => D[id] && D[id].group;
const MIC_TEACH_HITS = 6;

/* --- fingerprints --- */
function micFeat(att, dec){
  const tot = att.reduce((a,b)=>a+b,0) + 1e-12;
  const v = att.map(a=>Math.log10(a/tot + 1e-6));
  v.push(0.6*Math.log10(dec/tot + 1e-6));
  return v;
}
// Expected fingerprint of one or more taught drums hit together.
function micCalFeat(ids){
  const att = [0,0,0,0,0]; let dec = 0;
  for (const id of ids){ const c = settings.mic.cal[id]; if (!c) continue; c.p.forEach((p,k)=>att[k] += p*c.tot); dec += c.dr*c.tot; }
  return micFeat(att, dec);
}
const micDist = (a,b) => Math.sqrt(a.reduce((s,x,i)=>s+(x-b[i])**2, 0));
// taught keys: piece ids, plus variants like "hihat:open" taught separately
function micTaught(){ return Object.keys(settings.mic.cal).filter(k => D[k.split(":")[0]]); }
const micBase = k => k.split(":")[0];
function micClassify(o){
  const v = micFeat(o.att, o.dec); let best = null;
  for (const k of micTaught()) { const d = micDist(v, micCalFeat([k])); if (!best || d < best.dist) best = {key:k, d:micBase(k), a:k.split(":")[1] || null, dist:d}; }
  return best;
}
// Does this onset sound like the drums the song expects at this moment?
function micDrumCheck(o, drums){
  const mode = settings.mic.check;
  const taught = micTaught();
  const exp = drums.filter(d=>taught.includes(d)), expAll = taught.filter(k => drums.includes(micBase(k)));
  const best = micClassify(o);
  if (mode === "timing" || !exp.length) return {ok:true, heard:best};
  const v = micFeat(o.att, o.dec);
  let dExp = micDist(v, micCalFeat(exp));
  for (const d of exp) dExp = Math.min(dExp, micDist(v, micCalFeat([d])) * (exp.length>1 ? 1.1 : 1));
  const lenient = mode === "lenient";
  const groups = new Set(exp.map(d=>micGroup(d)).filter(Boolean));
  let dAlt = Infinity;
  for (const k of expAll) if (k.includes(":")) dExp = Math.min(dExp, micDist(v, micCalFeat([k]))); // e.g. the open hi-hat is still the hi-hat
  for (const id of taught) {
    if (drums.includes(micBase(id))) continue;
    if (lenient && micGroup(micBase(id)) && groups.has(micGroup(micBase(id)))) continue;
    dAlt = Math.min(dAlt, micDist(v, micCalFeat([id])));
  }
  return {ok: dExp <= dAlt * (lenient ? 1.25 : 1.0), heard:best};
}

/* --- start / stop --- */
async function micStart(){
  const st = $("#micStatus");
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { st.textContent = "This browser can't use the microphone here. Open the app from your GitHub Pages link or the downloaded file in Chrome."; return false; }
  audio();
    try {
    MIC.stream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false, noiseSuppression:false, autoGainControl:false}});
  } catch (e) {
    st.textContent = "Microphone access was blocked. Allow the microphone for this site (icon left of the address bar) and try again.";
    return false;
  }
  MIC.src = ac.createMediaStreamSource(MIC.stream);
  MIC.sink = ac.createGain(); MIC.sink.gain.value = 0; MIC.sink.connect(ac.destination);
  try {
    if (!MIC.loaded) { const url = URL.createObjectURL(new Blob([MIC_WORKLET], {type:"application/javascript"})); await ac.audioWorklet.addModule(url); MIC.loaded = true; }
    MIC.node = new AudioWorkletNode(ac, "onset-proc");
    MIC.node.port.onmessage = e => micMessage(e.data);
    MIC.post = m => MIC.node.port.postMessage(m);
  } catch (e) {
    // Fallback (file:// pages): same detector on the main thread.
    const size = 512, core = OnsetCore(ac.sampleRate, micMessage);
    MIC.node = ac.createScriptProcessor(size, 1, 1);
    MIC.node.onaudioprocess = ev => {
      const x = ev.inputBuffer.getChannelData(0);
      const t0 = ev.playbackTime - 2*size/ac.sampleRate; // approximate capture time; "Measure delay" corrects the rest
      for (let i=0;i<size;i+=128) core.block(x.subarray(i, i+128), t0 + i/ac.sampleRate);
    };
    MIC.post = m => { if (m.thresh != null) core.setThresh(m.thresh); };
  }
  MIC.src.connect(MIC.node); MIC.node.connect(MIC.sink);
  MIC.on = true; settings.mic.on = true;
  if (settings.hitSnd) { settings.hitSnd = false; $("#optHitSnd").checked = false; toast("Turned off app drum sounds so the mic doesn't hear them"); }
  saveSettings(); micApplySens(); micRenderUI(); updateInputPill();
  return true;
}
function micStop(){
  if (MIC.stream) MIC.stream.getTracks().forEach(t=>t.stop());
  try { MIC.src && MIC.src.disconnect(); MIC.node && MIC.node.disconnect(); MIC.sink && MIC.sink.disconnect(); } catch(e){}
  MIC.stream = MIC.src = MIC.node = MIC.sink = MIC.post = null; MIC.on = false; MIC.teach = null;
  settings.mic.on = false; saveSettings(); micRenderUI(); updateInputPill();
}
// Sensitivity 1..100 -> loudness threshold (RMS). Higher sensitivity hears softer hits.
function micThreshold(){ return 0.2 * Math.pow(0.02, settings.mic.sens/100); }
function micApplySens(){ if (MIC.post) MIC.post({thresh: micThreshold()}); const t = $("#micThr"); if (t) t.style.left = Math.min(100, micThreshold()/0.25*100) + "%"; }

/* --- incoming onsets --- */
function micMessage(m){
  if (m.lvl != null) { const l = $("#micLvl"); if (l) l.style.width = Math.min(100, m.lvl/0.25*100) + "%"; return; }
  if (MIC.measuring) { MIC.measuring.hits.push(m.t); return; }
  if (MIC.teach) { micTeachHit(m); return; }
  const guess = micClassify(m);
  const heard = guess ? D[guess.d].name : "a hit";
  const hEl = $("#micHeard"); if (hEl) hEl.textContent = heard;
  if (guess) flashPiece(guess.d);
  if (!E.playing) { if (!$("#view-practice").hidden) setFb("Heard", "#23262E", "#F2F2F0", heard); return; }
  const offSteps = (settings.mic.offset/1000)/E.stepSec();
  const pos = E.blocked ? E.posBase : E.posBase + (m.t - E.clockBase)/E.stepSec() - offSteps;
  if (E.mode === "practice") judgeOnset(m, pos);
  else if (E.mode === "record" && guess) recordHit(guess.d, pos, { a: guess.a, src: "mic" });
}

/* --- teaching --- */
function micTeachStart(id){
  if (!MIC.on) { toast("Turn on the microphone first"); return; }
  MIC.teach = id; MIC.teachHits = []; micRenderUI();
}
function micTeachHit(m){
  MIC.teachHits.push(m);
  if (MIC.teachHits.length >= MIC_TEACH_HITS) {
    const hits = MIC.teachHits, p = [0,0,0,0,0]; let tot = 0, dr = 0;
    for (const h of hits) { const t = h.att.reduce((a,b)=>a+b,0)+1e-12; h.att.forEach((a,k)=>p[k]+=a/t/hits.length); tot += t/hits.length; dr += h.dec/t/hits.length; }
    settings.mic.cal[MIC.teach] = {p, tot, dr, n:hits.length};
    const [pid, va] = MIC.teach.split(":"); toast(`Learned your ${D[pid].name}${va ? " (" + articLabel(va).toLowerCase() + ")" : ""}`);
    MIC.teach = null; saveSettings();
  }
  micRenderUI();
}

/* --- delay measurement: play 8 clicks, listen for them, take the median delay --- */
function micMeasureDelay(){
  if (!MIC.on) { toast("Turn on the microphone first"); return; }
  audio(); const t0 = ac.currentTime + 0.6, clicks = [];
  for (let i=0;i<8;i++){ const t = t0 + i*0.5; clicks.push(t); click(t, i%4===0); }
  MIC.measuring = {hits:[]}; $("#micMeasure").disabled = true; $("#micMeasure").textContent = "Listening…";
  setTimeout(()=>{
    const hits = MIC.measuring.hits; MIC.measuring = null;
    $("#micMeasure").disabled = false; $("#micMeasure").textContent = "Measure delay";
    const diffs = clicks.map(c=>{ const h = hits.find(x=>x>=c-0.02 && x<=c+0.45); return h==null?null:h-c; }).filter(x=>x!=null).sort((a,b)=>a-b);
    if (diffs.length < 4) { toast("Couldn't hear the clicks. Turn your speakers up, move the mic closer, or raise sensitivity."); return; }
    const med = diffs[Math.floor(diffs.length/2)];
    settings.mic.offset = Math.round(med*1000); saveSettings(); micRenderUI();
    toast(`Delay measured: ${settings.mic.offset} ms`);
  }, 0.6*1000 + 8*500 + 700);
}

/* --- judging a mic hit against the song --- */
function judgeOnset(o, pos){
  const C = E.C, w = E.windowSteps(160), st = E.stats;
  let ev = null, bd = 1e9;
  if (E.blocked) { const bi = blockEvent(); if (bi >= 0) { ev = C.events[bi]; bd = 0; } }
  else for (const e of C.events) { if (!e.notes.some(n=>!n.j)) continue; const dd = Math.abs(e.s - pos); if (dd < bd) { bd = dd; ev = e; } if (e.s > pos + w) break; }
  const chk = ev ? micDrumCheck(o, ev.drums) : {heard:micClassify(o)};
  const heardName = chk.heard ? D[chk.heard.d].name : "a hit";
  if (!ev || bd > w) { if (chk.heard) floatText(chk.heard.d, "Not yet", "#8C929D"); return; }
  const anchor = ev.drums.find(d=>D[d].hand) || ev.drums[0];
  const open = ev.notes.filter(n=>!n.j);
  if (!chk.ok) {
    floatText(anchor, "Wrong drum?", "#FF8A84");
    setFb("Wrong drum?", "#3A3F4A", "#F2F2F0", `Expected ${ev.drums.map(d=>D[d].name).join(" + ")}, sounded like ${heardName}`);
    if (!E.blocked) { open.forEach(n=>n.j="wrong"); st.judged += open.length; st.streak = 0; renderStats(); }
    return;
  }
  // how it was played: special strokes (if taught) and loudness for accents / ghost notes
  const prob = micArticProblem(o, ev, open);
  if (prob) {
    floatText(anchor, prob.short, "#FFB547"); setFb(E.blocked ? "Not quite" : "Right time, wrong touch", "#FFB547", "#0E0F12", prob.tip);
    if (!E.blocked) { open.forEach(n=>n.j="art"); st.judged += open.length; st.streak = 0; st.artWrong = (st.artWrong||0) + 1; renderStats(); }
    return;
  }
  if (open.some(n=>n.a)) st.artRight = (st.artRight||0) + 1;
  if (E.blocked) {
    open.forEach(n=>n.j="ok"); st.judged += open.length; st.good += open.length; st.streak += open.length; st.best = Math.max(st.best, st.streak);
    floatText(anchor, "Got it!", "#7BD389"); setFb("Got it!", "#7BD389", "#0E0F12", "Heard " + heardName); renderStats(); return;
  }
  const ms = (pos - ev.s)*E.stepSec()*1000, a = Math.abs(ms);
  const grade = a<=45 ? "perfect" : a<=100 ? "good" : "ok";
  open.forEach(n=>n.j = grade); st.judged += open.length;
  if (grade !== "ok") { st.good += open.length; st.streak += open.length; } else st.streak = 0;
  st.best = Math.max(st.best, st.streak); st.offs.push(ms); if (st.offs.length > 12) st.offs.shift();
  if (grade === "perfect") { floatText(anchor, "Perfect!", "#7BD389"); setFb("Perfect!", "#7BD389", "#0E0F12", "Heard " + heardName); }
  else if (grade === "good") { floatText(anchor, ms<0?"Good · early":"Good · late", "#FFB547"); setFb("Good", "#FFB547", "#0E0F12", `${Math.round(a)} ms ${ms<0?"early":"late"} · heard ${heardName}`); }
  else { floatText(anchor, ms<0?"Too early":"Too late", "#FF8A84"); setFb(ms<0?"Too early":"Too late", "#3A3F4A", "#F2F2F0", `${Math.round(a)} ms`); }
  renderStats();
}

// For each note of the event: was the special stroke right (only if both versions were taught), and the loudness?
function micArticProblem(o, ev, open){
  if (!settings.artic) return null;
  const taught = micTaught(), v = micFeat(o.att, o.dec);
  const keyOf = (n, a) => a && taught.includes(variantKey(n.d, a)) ? variantKey(n.d, a) : n.d;
  for (const n of open) {
    for (const va of variantsFor(n.d)) {
      if (!taught.includes(variantKey(n.d, va)) || !taught.includes(n.d)) continue;
      const withV = open.map(m => m === n ? variantKey(n.d, va) : keyOf(m, m.a)).filter(k => taught.includes(k));
      const without = open.map(m => m === n ? n.d : keyOf(m, m.a)).filter(k => taught.includes(k));
      const got = micDist(v, micCalFeat(withV)) < micDist(v, micCalFeat(without)) * 0.92 ? va : null;
      const p = articProblem(n, { a: got, src: "mic-variant" }); if (p) return p;
    }
  }
  // loudness: amplitude compared with the taught hits of the same drums
  const keys = open.map(n => keyOf(n, n.a)).filter(k => settings.mic.cal[k]);
  if (keys.length) {
    const ref = keys.reduce((s, k) => s + settings.mic.cal[k].tot, 0), e = o.att.reduce((a, b) => a + b, 0);
    const vel = 0.6 * Math.sqrt(e / ref); // a hit as loud as the taught ones = about velocity 76
    for (const n of open) { if (n.a !== "accent" && n.a !== "ghost") continue; const p = articProblem(n, { vel, src: "mic" }); if (p) return p; }
  }
  return null;
}

/* --- setup UI --- */
function micRenderUI(){
  const btn = $("#micBtn"); if (!btn) return;
  btn.textContent = MIC.on ? "Turn off microphone" : "Turn on microphone";
  btn.className = MIC.on ? "btn" : "btn primary";
  if (MIC.on) $("#micStatus").textContent = "Listening. Hit a drum: the level bar should jump past the white line.";
  $("#micSens").value = settings.mic.sens; $("#micSensOut").textContent = settings.mic.sens;
  $("#micOffset").value = settings.mic.offset; $("#micOffOut").textContent = settings.mic.offset + " ms";
  $("#micCheck").value = settings.mic.check;
  const box = $("#micCalRows"); box.innerHTML = "";
  const rows = [];
  for (const d of DRUMS) { rows.push({ key: d.id, name: d.name, color: d.color }); for (const va of variantsFor(d.id)) rows.push({ key: variantKey(d.id, va), name: `${d.name}: ${articLabel(va).replace(/^Ride bell$/,"bell").replace(/^Open hi-hat$/,"open").toLowerCase()} (optional)`, color: d.color, sub: true }); }
  for (const row of rows) {
    const c = settings.mic.cal[row.key];
    const r = h("div", {class:"maprow" + (row.sub ? " sub" : "")});
    const status = MIC.teach === row.key ? `Hit it ${MIC_TEACH_HITS - MIC.teachHits.length} more time${MIC_TEACH_HITS - MIC.teachHits.length === 1 ? "" : "s"}…` : c ? "Learned" : "Not taught";
    r.innerHTML = `<span class="n"><i style="background:${row.color}${row.sub?";opacity:.5":""}"></i>${esc(row.name)}</span><span class="notes" style="${MIC.teach===row.key?"color:var(--amber)":c?"color:var(--green)":""}">${status}</span>`;
    const b = h("button", {class:"btn", type:"button"}, MIC.teach === row.key ? "Cancel" : c ? "Teach again" : "Teach");
    b.onclick = () => { if (MIC.teach === row.key) { MIC.teach = null; micRenderUI(); } else micTeachStart(row.key); };
    r.appendChild(b);
    if (c) { const x = h("button", {class:"btn danger", type:"button", "aria-label":"Forget "+row.name}, "Forget"); x.onclick = () => { delete settings.mic.cal[row.key]; saveSettings(); micRenderUI(); }; r.appendChild(x); }
    box.appendChild(r);
  }
}
function micWire(){
  $("#micBtn").onclick = () => MIC.on ? micStop() : micStart();
  $("#micSens").oninput = e => { settings.mic.sens = +e.target.value; $("#micSensOut").textContent = settings.mic.sens; micApplySens(); saveSettings(); };
  $("#micOffset").oninput = e => { settings.mic.offset = +e.target.value; $("#micOffOut").textContent = settings.mic.offset + " ms"; saveSettings(); };
  $("#micCheck").onchange = e => { settings.mic.check = e.target.value; saveSettings(); };
  $("#micMeasure").onclick = micMeasureDelay;
  micRenderUI(); micApplySens();
}
