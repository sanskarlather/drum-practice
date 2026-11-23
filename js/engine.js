"use strict";
/* ---------- Engine ---------- */
const E = {
  mode:"practice", // practice | preview | record
  C:null, bpm:70, playing:false, pos:0, posBase:0, clockBase:0, blocked:false,
  nextSched:0, stats:null, lastEv:-2, pass:0,
  stepSec(){ return 60/this.bpm/4; },
  windowSteps(ms){ return ms/1000/this.stepSec(); },
};
function resetStats(){ E.stats = {judged:0, good:0, perfect:0, miss:0, streak:0, best:0, offs:[], artRight:0, artWrong:0}; renderStats(); }
function loadSong(song, keepTempo){
  stop();
  E.C = compile(song);
  if (!keepTempo) E.bpm = song.bpm;
  $("#tempo").value = E.bpm; $("#tempoOut").textContent = E.bpm+" BPM";
  $("#songTitle").textContent = song.title;
  settings.lastSong = song.id; saveSettings();
  resetJudgements(); resetStats();
  E.pos = 0; renderSheet(); renderCount(0); updateFrame(true);
  $("#instr").textContent = "Press play to start";
  $("#endOverlay").hidden = true;
}
function resetJudgements(){ E.C.notes.forEach(n=>n.j=null); }
function rebase(pos){ E.posBase = pos; E.clockBase = now(); E.pos = pos; }
function curPos(){ return E.posBase + (now()-E.clockBase)/E.stepSec(); }
function start(fromPos){
  audio(); if (!E.C) return;
  $("#endOverlay").hidden = true;
  if (fromPos === undefined) fromPos = E.pos;
  const countIn = E.mode==="preview" ? 0 : E.C.spb;
  if (fromPos <= 0 || fromPos >= E.C.total) { fromPos = -countIn; resetJudgements(); if (E.mode==="practice") resetStats(); }
  E.playing = true; E.blocked = false; rebase(fromPos);
  E.nextSched = Math.ceil(fromPos - 0.001);
  setPlayIcon(); requestAnimationFrame(loop);
}
function stop(){ E.playing=false; E.blocked=false; setPlayIcon(); if (E.mode!=="practice") { const m=E.mode; E.mode="practice"; editorStopped(m); } }
function pause(){ if (!E.playing) return; E.pos = curPos(); E.playing=false; setPlayIcon(); }
function setPlayIcon(){
  const pb = $("#playBtn"); pb.setAttribute("aria-label", E.playing?"Pause":"Play");
  $("#playIcon").innerHTML = E.playing ? '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>' : '<path d="M7 4l13 8-13 8z"/>';
}
function setTempo(b){
  b = Math.max(30, Math.min(240, Math.round(b)));
  if (E.playing && !E.blocked) { const p = curPos(); E.bpm = b; rebase(p); } else E.bpm = b;
  $("#tempo").value = b; $("#tempoOut").textContent = b+" BPM";
}
function blockEvent(){
  // first event with an unjudged note
  const C = E.C; for (let i=0;i<C.events.length;i++) if (C.events[i].notes.some(n=>!n.j)) return i; return -1;
}
function loop(){
  if (!E.playing) return;
  const C = E.C;
  let pos = E.blocked ? E.posBase : curPos();
  const waitOn = settings.wait && E.mode==="practice";
  // wait mode
  if (waitOn && !E.blocked) {
    const bi = blockEvent();
    if (bi>=0 && pos >= C.events[bi].s) { pos = C.events[bi].s; E.blocked = true; E.posBase = pos; }
  }
  if (E.blocked) {
    const bi = blockEvent();
    if (bi<0 || C.events[bi].s > E.posBase || !waitOn) { E.blocked=false; rebase(E.posBase); pos = E.posBase; }
  }
  E.pos = pos;
  // misses
  if (E.mode==="practice" && !waitOn) {
    const w = E.windowSteps(160);
    for (const n of C.notes) if (!n.j && pos - n.s > w && n.s >= 0) { n.j="miss"; E.stats.miss++; E.stats.streak=0; E.stats.judged++; floatText(n.d,"Miss","#A3A9B4"); renderStats(); setFb("Miss","#3A3F4A","#F2F2F0", D[n.d].name+" was missed"); }
  }
  // sound scheduling
  const ahead = 0.12/E.stepSec();
  let horizon = pos + ahead;
  if (waitOn) { const bi = blockEvent(); if (bi>=0 && !E.blocked) horizon = Math.min(horizon, C.events[bi].s - 1e-6); if (E.blocked) horizon = E.posBase - 1e-6; }
  const loopOn = E.mode==="practice" && settings.loop;
  while (E.nextSched < horizon && (E.nextSched < C.total || loopOn)) {
    const raw = E.nextSched, s = raw >= C.total ? raw - C.total : raw, t = now() + Math.max(0,(raw - pos))*E.stepSec();
    const metro = settings.metro || s < 0 || E.mode==="record";
    if (metro && ((s % 4)+4)%4===0 && E.mode!=="preview") click(t, ((s % C.spb)+C.spb)%C.spb===0);
    if (s>=0 && (settings.demo || E.mode==="preview")) { const ei = C.stepMap.get(s); if (ei!=null) { const ev = C.events[ei]; ev.drums.forEach(d=>playDrum(d,t,0.85,ev.art[d])); } }
    E.nextSched++;
  }
  // end of song
  if (pos >= C.total) {
    if (E.mode==="practice" && settings.loop) { E.pass++; resetJudgements(); rebase(pos - C.total); E.nextSched -= C.total; }
    else if (E.mode==="practice") { finish(); return; }
    else { stop(); return; }
  }
  updateFrame();
  requestAnimationFrame(loop);
}
function finish(){
  E.playing=false; setPlayIcon(); E.pos = 0;
  const st = E.stats, acc = st.judged ? Math.round(100*st.good/st.judged) : 0;
  const id = E.C.song.id; const prev = bests[id]||0; if (acc>prev) { bests[id]=acc; store.set("bests",bests); }
  $("#endTitle").textContent = acc>=90 ? "Great job!" : acc>=70 ? "Nice work!" : "Keep going!";
  const artTotal = (st.artRight||0) + (st.artWrong||0);
  $("#endText").textContent = `On target: ${acc}% · Longest run: ${st.best} in a row · Best ever: ${Math.max(acc,prev)}%` + (artTotal ? ` · Accents, ghosts, open hi-hats etc. right: ${Math.round(100*(st.artRight||0)/artTotal)}%` : "") + (acc<70 ? ". Try it slower, or turn on Wait for me." : "");
  const li = LESSONS.findIndex(l=>l.id===id); $("#endNext").hidden = li<0 || li===LESSONS.length-1;
  $("#endOverlay").hidden = false; updateFrame(true); renderLibrary();
}

/* -------- judging -------- */
// Is the way it was played (info: {a, vel, src}) what the note asks for? Returns null if fine, else a tip.
function articProblem(n, info){
  if (!settings.artic || !info || !n) return null;
  const want = n.a || null, got = info.a || null, type = D[n.d] && D[n.d].type;
  const variantWanted = want && ARTICS[want].variant, gotVariant = got && ARTICS[got] && ARTICS[got].variant;
  if (info.src === "midi" || info.src === "mic-variant") {
    if (variantWanted && got !== want) return { short: ARTICS[want].short + "!", tip: ARTICS[want].tip };
    if (!variantWanted && gotVariant && variantsFor(n.d).includes(got)) return { short: got==="open" ? "CLOSE IT" : "NORMAL HIT", tip: got==="open" ? "Keep the hi-hat closed for this one" : `That was a ${ARTICS[got].label.toLowerCase()}: hit the middle of the ${D[n.d].name.toLowerCase()}` };
  }
  if (info.vel != null && (info.src === "midi" || info.src === "mic")) {
    if (want === "accent" && info.vel < settings.vel.accent/127) return { short: "HARDER", tip: "Accent: hit it harder" };
    if (want === "ghost" && info.vel > settings.vel.ghost/127) return { short: "SOFTER", tip: "Ghost note: much softer" };
  }
  return null;
}
function judge(drum, pos, info){
  const C = E.C; const w = E.windowSteps(160);
  let best=null, bd=1e9;
  for (const n of C.notes) { if (n.j || n.d!==drum) continue; const dd = Math.abs(n.s - pos); if (dd < bd) { bd=dd; best=n; } if (n.s > pos + w) break; }
  const st = E.stats;
  if (E.blocked && best && best.ev === blockEvent() && C.events[best.ev].s === E.posBase) {
    const prob = articProblem(best, info);
    if (prob) { floatText(drum, prob.short, "#FFB547"); setFb("Not quite", "#FFB547", "#0E0F12", prob.tip); return; } // wait until it's played right
    best.j="ok"; st.judged++; st.good++; st.streak++; st.best=Math.max(st.best,st.streak);
    floatText(drum,"Got it!","#7BD389"); setFb("Got it!","#7BD389","#0E0F12", D[drum].name); renderStats(); return;
  }
  if (!best || bd > w) { floatText(drum,"Not yet","#8C929D"); return; }
  const ms = (pos - best.s)*E.stepSec()*1000;
  const a = Math.abs(ms);
  best.j = a<=45 ? "perfect" : a<=100 ? "good" : "ok";
  st.offs.push(ms); if (st.offs.length>12) st.offs.shift();
  const prob = best.j !== "ok" ? articProblem(best, info) : null;
  if (prob) {
    best.j = "art"; st.judged++; st.streak = 0; st.artWrong = (st.artWrong||0) + 1;
    floatText(drum, prob.short, "#FFB547"); setFb("Right time, wrong touch", "#FFB547", "#0E0F12", prob.tip); renderStats(); return;
  }
  if (best.a && best.j !== "ok") st.artRight = (st.artRight||0) + 1;
  st.judged++; if (best.j!=="ok") { st.good++; st.streak++; } else st.streak = 0;
  st.best = Math.max(st.best, st.streak);
  if (best.j==="perfect") { floatText(drum,"Perfect!","#7BD389"); setFb("Perfect!","#7BD389","#0E0F12", D[drum].name); }
  else if (best.j==="good") { floatText(drum, ms<0?"Good · early":"Good · late","#FFB547"); setFb("Good","#FFB547","#0E0F12", `${D[drum].name} · ${Math.round(a)} ms ${ms<0?"early":"late"}`); }
  else { floatText(drum, ms<0?"Too early":"Too late","#FF8A84"); setFb(ms<0?"Too early":"Too late","#3A3F4A","#F2F2F0", `${D[drum].name} · ${Math.round(a)} ms`); }
  renderStats();
}
function setFb(t,bg,fg,detail){ const f=$("#fb"); f.textContent=t; f.style.background=bg; f.style.color=fg; $("#fbDetail").textContent=detail||""; }
function renderStats(){
  const st = E.stats; if (!st) return;
  $("#stAcc").textContent = st.judged ? Math.round(100*st.good/st.judged)+"%" : "–";
  $("#stStreak").textContent = st.streak; $("#stMiss").textContent = st.miss;
  if (st.offs.length) {
    const avg = st.offs.reduce((a,b)=>a+b,0)/st.offs.length;
    $("#timingDot").style.left = (50 + Math.max(-45, Math.min(45, avg/3)))+"%";
    $("#timingTxt").textContent = Math.abs(avg)<20 ? "Right on time" : `${Math.round(Math.abs(avg))} ms ${avg<0?"early":"late"} on average`;
  }
}

/* -------- input -------- */
let learnFor = null;
// info.a: the articulation the input reports (e.g. "open" from the hi-hat's open MIDI note)
function onHit(drum, vel, ts, src, a){
  if (settings.hitSnd || src==="tap" || src==="key") { audio(); playDrum(drum, now(), vel, a); }
  flashPiece(drum);
  if (!E.playing) return;
  const lag = Math.max(0, (performance.now() - ts)) / 1000;
  const pos = (E.blocked ? E.posBase : curPos() - lag/E.stepSec()) - (settings.offset/1000)/E.stepSec();
  const info = { a: a || null, vel: src==="midi" ? vel : null, src };
  if (E.mode==="practice") judge(drum, pos, info);
  else if (E.mode==="record") recordHit(drum, pos, info);
}

/* -------- frame render -------- */
let lastUpKey = "";
function updateFrame(force){
  const C = E.C; if (!C) return;
  const pos = E.pos, lead = Math.max(4, E.windowSteps(650));
  const w = E.windowSteps(160);
  // current event = first event with unjudged notes not yet past window
  let cur = -1;
  for (let i=0;i<C.events.length;i++){ const ev=C.events[i]; if (ev.notes.some(n=>!n.j) && (ev.s >= pos - w || E.blocked)) { cur=i; break; } }
  const playingish = E.playing || force;
  const litSet = new Set(), nextSet = new Set(); const ringP = {};
  let curEv = cur>=0 ? C.events[cur] : null;
  if (curEv && curEv.s - pos <= lead && E.playing) curEv.notes.forEach(n=>{ if(!n.j) litSet.add(n.d); });
  let nextEv = null;
  if (cur>=0) nextEv = C.events[cur+1] || (settings.loop ? C.events[0] : null);
  if (!E.playing) { curEv = C.events[0]; nextEv = C.events[1]; }
  if (nextEv && E.playing) nextEv.drums.forEach(d=>{ if(!litSet.has(d)) nextSet.add(d); });
  // rings: nearest upcoming unjudged note per drum within lead
  if (E.playing) for (const n of C.notes) { if (n.j) continue; const dt = n.s - pos; if (dt > lead) break; if (dt < -w) continue; if (ringP[n.d]==null) ringP[n.d] = Math.max(0, dt/lead); }
  for (const d of DRUMS) {
    const p = pieceEls[d.id]; const lit = litSet.has(d.id);
    p.g.classList.toggle("lit", lit);
    const art = lit && curEv ? curEv.art[d.id] : null;
    const label = art ? ARTICS[art].short : "HIT";
    if (p.hit.textContent !== label) { p.hit.textContent = label; p.hit.setAttribute("font-size", Math.max(art ? 15 : 20, Math.round(d.r*(art ? (label.length > 5 ? 0.26 : 0.32) : 0.42)))); }
    p.hit.setAttribute("opacity", lit && (d.kind==="drum" || art) ? (E.blocked || ringP[d.id] < 0.25 ? 1 : 0.45) : 0);
    p.hit.setAttribute("fill", art && d.kind!=="drum" ? "#F2F2F0" : "#0E0F12");
    if (ringP[d.id]!=null) { const k = ringP[d.id]; p.ring.setAttribute("r", d.r*(1+0.85*k)); p.ring.setAttribute("opacity", (1-k*0.75).toFixed(2)); }
    else p.ring.setAttribute("opacity", 0);
    p.next.setAttribute("opacity", nextSet.has(d.id)?0.9:0);
    p.nextTxt.setAttribute("opacity", nextSet.has(d.id) && d.kind!=="kick" && d.kind!=="pedal" ? 1 : 0);
    setChip(d.id, lit && curEv ? curEv.hands[d.id] : null);
  }
  // instruction
  if (E.mode==="practice") {
    const instr = $("#instr");
    if (E.playing && pos < 0) { const n = Math.floor((pos + C.spb)/4)+1; instr.textContent = `Get ready… ${n}`; }
    else if (E.playing && litSet.size) {
      const names = [...litSet].map(d=>{ const a = curEv && curEv.art[d]; return `<span style="color:${D[d].color}">${D[d].name}${a ? ` <span style="font-size:.7em;opacity:.9">(${ARTICS[a].label.toLowerCase().replace(" hi-hat","")})</span>` : ""}</span>`; });
      instr.innerHTML = "Hit " + (names.length>1 ? names.slice(0,-1).join(", ")+" + "+names[names.length-1]+" together" : "the "+names[0]);
    } else if (E.playing && E.blocked) instr.textContent = "Waiting for you…";
    else if (E.playing && curEv) instr.innerHTML = `Next: <span style="color:${D[curEv.drums[0]].color}">${curEv.drums.map(d=>D[d].name).join(" + ")}</span>`;
    else if (!E.playing && !force) {}
    renderCount(pos);
    $("#barInfo").textContent = pos<0 ? "Count-in" : `Bar ${Math.min(E.C.song.bars, Math.floor(pos/C.spb)+1)} of ${E.C.song.bars}`;
    // up next
    const key = cur+"|"+E.playing+"|"+E.pass;
    if (key !== lastUpKey || force) { lastUpKey = key; renderUpNext(E.playing ? cur : 0); }
    moveSheetHead(pos);
  } else if (E.mode==="preview" || E.mode==="record") {
    edPlayhead(pos);
  }
}
function renderCount(pos){
  const C = E.C; const beats = C.spb/4; const c = $("#count");
  if (c.children.length !== beats*2) { c.innerHTML = ""; for (let b=0;b<beats;b++){ c.appendChild(h("span",{},String(b+1))); c.appendChild(h("span",{},"&")); } }
  const inBar = ((pos % C.spb)+C.spb)%C.spb; const idx = Math.floor(inBar/2);
  [...c.children].forEach((s,i)=>{ s.className = !E.playing ? "" : i===idx ? "now" : i<idx ? "past" : ""; });
}
function renderUpNext(cur){
  const C = E.C, box = $("#upnext"); box.innerHTML = "";
  if (!C.events.length) { box.innerHTML = '<p class="muted" style="margin:0;font-size:14px">This song has no notes yet. Add some in the note editor.</p>'; return; }
  for (let k=0;k<5;k++){
    let i = cur + k; if (i >= C.events.length) { if (!settings.loop) break; i = i % C.events.length; }
    if (i<0) i=0;
    const ev = C.events[i];
    const row = h("div",{class:"row"+(k===0?" now":"")});
    row.appendChild(h("span",{class:"when"}, k===0?"Now":k===1?"Next":"Then"));
    const chips = h("div",{style:"display:flex;gap:6px;flex-wrap:wrap"});
    ev.drums.forEach(d=>{ const c=D[d].color; chips.appendChild(h("span",{class:"chip",style: k===0?`background:${c};border-color:${c};color:#0E0F12`:`background:${c}22;border-color:${c}`}, `${esc(D[d].name)}${ev.art[d] ? " · "+esc(ARTICS[ev.art[d]].short.toLowerCase()) : ""} <small>${HAND_SHORT[ev.hands[d]]||""}</small>`)); });
    row.appendChild(chips); box.appendChild(row);
  }
}

