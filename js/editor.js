"use strict";
/* ---------- Editor ---------- */
let ED = null; // song being edited (copy)
let traceURL = null;
// rows = the active kit, top to bottom as on a drum staff
const edRows = () => DRUMS.slice().sort((a,b)=>a.staff-b.staff || DRUMS.indexOf(a)-DRUMS.indexOf(b)).map(d=>d.id);
function openEditor(s){
  stop();
  ED = JSON.parse(JSON.stringify(s));
  ED.notes = resolveNotes(ED.notes || []);
  if (s.builtin) { ED.id = uid(); ED.title = s.title.replace(/^\d+\s·\s/,"") + " (my copy)"; ED.builtin=false; ED.source="Edited lesson"; }
  ED.beats = ED.beats||4; ED.sub = ED.sub||4;
  $("#edTitle").value = ED.title; $("#edBpm").value = ED.bpm; $("#edBars").value = ED.bars; $("#edBeats").value = ED.beats; $("#edSub").value = ED.sub;
  renderGrid(); edAudioUI(); show("editor");
}
function edSpb(){ return ED.beats*(ED.sub||4); }
function renderGrid(){
  const g = $("#grid"); const spb = edSpb(), total = ED.bars*spb;
  g.style.gridTemplateColumns = `112px repeat(${total}, minmax(26px, 1fr))`; g.innerHTML = "";
  g.appendChild(h("div",{class:"rh",style:"border-top:0"},""));
  const sub = ED.sub||4, cs = COUNT_SYL[sub] || COUNT_SYL[4];
  for (let s=0;s<total;s++){ const i=s%spb, k=i%sub; const lab = k===0 ? (i===0?`${Math.floor(s/spb)+1}.1`:String(i/sub+1)) : k%cs.w===0 ? cs.l[k/cs.w] : "·"; g.appendChild(h("div",{class:"hd"+(k===0?" b":"")+(i===0?" bar":"")},lab)); }
  const on = new Map(ED.notes.map(n=>[n.s+"|"+n.d, n.a || ""]));
  for (const d of edRows()){
    const dd = D[d];
    g.appendChild(h("div",{class:"rh"},`<i style="background:${dd.color}"></i>${esc(dd.name)}`));
    for (let s=0;s<total;s++){
      const i = s%spb, k = s+"|"+d, a = on.get(k) || "";
      const cls = "c" + (Math.floor(i/sub)%2?" alt":"") + (i===0?" barl":i%sub===0?" beat":"") + (on.has(k)?" on":"");
      const b = h("button",{class:cls,type:"button","data-s":s,"data-d":d,"data-a":a,"data-art":a ? ARTICS[a].sign : "",style:`--col:${dd.color}`,"aria-label":`${dd.name}, bar ${Math.floor(s/spb)+1}, step ${i+1}${a ? ", "+ARTICS[a].label : ""}`,"aria-pressed":on.has(k)});
      g.appendChild(b);
    }
  }
}
// The tool picked above the grid: "normal" or an articulation (accent, ghost, open…)
let edTool = "normal", paint = null;
function edToolbar(){
  const box = $("#edArt"); box.innerHTML = "";
  for (const [k, label] of [["normal","Normal"], ...Object.entries(ARTICS).map(([k, A]) => [k, `${A.sign} ${A.label}`])]) {
    const b = h("button", { type:"button", "aria-pressed": String(k === edTool), title: k === "normal" ? "A normal hit" : ARTICS[k].tip }, esc(label));
    b.onclick = () => { edTool = k; edToolbar(); }; box.appendChild(b);
  }
}
function edNote(s, d){ return ED.notes.find(n=>n.s===s && n.d===d); }
function setCellArt(b, a){ b.dataset.a = a || ""; b.dataset.art = a ? ARTICS[a].sign : ""; }
// action: "add" | "remove" | "art"
function setCell(b, action){
  const s = +b.dataset.s, d = b.dataset.d, n = edNote(s, d);
  const a = edTool !== "normal" && articFits(edTool, d) ? edTool : null;
  if (action === "remove") { if (!n) return; ED.notes = ED.notes.filter(x=>x!==n); b.classList.remove("on"); b.setAttribute("aria-pressed", false); setCellArt(b, null); return; }
  if (action === "add" && n) return;
  if (action === "art" && !n) return;
  if (edTool !== "normal" && !a && !edWarned[edTool]) { edWarned[edTool] = 1; toast(`${ARTICS[edTool].label} doesn't apply to the ${D[d].name.toLowerCase()}; added a normal hit`); }
  if (n) { if (a) n.a = a; else delete n.a; } else ED.notes.push(a ? {s,d,a} : {s,d});
  b.classList.add("on"); b.setAttribute("aria-pressed", true); setCellArt(b, a);
  audio(); playDrum(d, now(), 0.7, a);
}
const edWarned = {};
function edAction(b){
  const n = edNote(+b.dataset.s, b.dataset.d);
  if (!n) return "add";
  const a = edTool !== "normal" && articFits(edTool, b.dataset.d) ? edTool : null;
  return (n.a || null) === a ? "remove" : "art";
}
$("#grid").addEventListener("pointerdown", e=>{ const b = e.target.closest(".c"); if (!b) return; e.preventDefault(); paint = edAction(b); setCell(b, paint); });
$("#grid").addEventListener("pointerover", e=>{ if (paint==null || !(e.buttons&1)) return; const b = e.target.closest(".c"); if (b) setCell(b, paint === "art" ? (edNote(+b.dataset.s, b.dataset.d) ? "art" : "add") : paint); });
$("#grid").addEventListener("keydown", e=>{ const b = e.target.closest(".c"); if (b && (e.key===" "||e.key==="Enter")) { e.preventDefault(); setCell(b, edAction(b)); } });
window.addEventListener("pointerup", ()=>paint=null);
function readEdFields(){
  ED.title = $("#edTitle").value.trim() || "Untitled";
  ED.bpm = Math.max(30, Math.min(240, +$("#edBpm").value || 80));
  const bars = Math.max(1, Math.min(32, +$("#edBars").value || 1)), beats = +$("#edBeats").value, sub = +$("#edSub").value || 4;
  if (bars !== ED.bars || beats !== ED.beats || sub !== (ED.sub||4)) {
    const oldSub = ED.sub||4, oldSpb = edSpb(), newSpb = beats*sub;
    // keep each note at the same moment in its bar; on a coarser grid it moves to the nearest step
    const seen = new Set(), out = [];
    for (const n of ED.notes) {
      const bar = Math.floor(n.s/oldSpb), inBar = Math.round((n.s%oldSpb) * sub / oldSub);
      if (inBar >= newSpb) continue; const s = bar*newSpb + inBar, k = s+"|"+n.d; if (seen.has(k)) continue; seen.add(k);
      out.push(Object.assign({}, n, {s}));
    }
    ED.bars = bars; ED.beats = beats; ED.sub = sub; ED.notes = out.filter(n=>n.s < bars*newSpb); renderGrid();
  }
}
["#edBars","#edBeats","#edSub","#edBpm","#edTitle"].forEach(s=>$(s).addEventListener("change", readEdFields));
$("#edClear").onclick = ()=>{ if (!ED.notes.length) return; if (confirmDelete({id:"clear:"+ED.id,title:"all notes"})) { ED.notes=[]; renderGrid(); } };
$("#edSave").onclick = ()=>{ readEdFields(); saveSong(JSON.parse(JSON.stringify(ED))); toast("Saved to My songs"); };
$("#edPractise").onclick = ()=>{ readEdFields(); const s = JSON.parse(JSON.stringify(ED)); saveSong(s); loadSong(s); show("practice"); };
$("#edPlay").onclick = async ()=>{ if (E.mode==="preview" && E.playing) { stop(); return; } readEdFields(); stop(); await trackLoad(ED); E.mode="preview"; E.C = compile(ED); E.bpm = ED.bpm; start(0); $("#edPlay").textContent="Stop"; };
$("#edRec").onclick = ()=>{ if (E.mode==="record" && E.playing) { stop(); return; } readEdFields(); stop(); E.mode="record"; E.C = compile(ED); E.bpm = ED.bpm; start(0); $("#edRec").querySelector("span").textContent="Stop recording"; toast("Count-in: 4 clicks, then play"); };
// Recording keeps how you played: open hi-hat / rimshot / bell from the pad, accents and ghost notes from how hard you hit.
function recordHit(d, pos, info){
  const total = ED.bars*edSpb(); let s = Math.round(pos); if (s<0 && s>-0.5) s=0; if (s<0 || s>=total) return;
  let a = info && info.a && articFits(info.a, d) ? info.a : null;
  if (!a && info && info.vel != null) { if (info.vel >= settings.vel.accent/127) a = "accent"; else if (info.vel <= settings.vel.ghost/127 && articFits("ghost", d)) a = "ghost"; }
  if (!ED.notes.some(n=>n.s===s && n.d===d)) {
    ED.notes.push(a ? {s,d,a} : {s,d});
    const b = document.querySelector(`#grid .c[data-s="${s}"][data-d="${d}"]`); if (b) { b.classList.add("on"); b.setAttribute("aria-pressed",true); setCellArt(b, a); }
  }
}
let edHeadCol = -1;
function edPlayhead(pos){
  const s = Math.floor(pos); if (s === edHeadCol) return;
  document.querySelectorAll("#grid .c.play").forEach(c=>c.classList.remove("play"));
  edHeadCol = s; if (s<0) return;
  document.querySelectorAll(`#grid .c[data-s="${s}"]`).forEach(c=>c.classList.add("play"));
  const first = document.querySelector(`#grid .c[data-s="${s}"]`); const box = $(".gridbox");
  if (first) { const x = first.offsetLeft; if (x > box.scrollLeft + box.clientWidth - 80 || x < box.scrollLeft + 100) box.scrollLeft = x - 120; }
}
function editorStopped(m){
  $("#edPlay").textContent = "Listen"; $("#edRec").querySelector("span").textContent = "Record from kit";
  document.querySelectorAll("#grid .c.play").forEach(c=>c.classList.remove("play")); edHeadCol=-1;
  if (m==="record") toast(`Recorded. ${ED.notes.length} notes on the grid`);
  const s = findSong(settings.lastSong) || LESSONS[0]; E.C = compile(s); E.bpm = +$("#tempo").value || s.bpm; resetJudgements(); E.pos = 0; trackLoad(s);
}
// Shows the sheet above the grid. PDFs are drawn as page images (works on phones and offline too).
let traceFile = null;
async function showTrace(file){
  if (traceURL) URL.revokeObjectURL(traceURL);
  traceFile = file; traceURL = URL.createObjectURL(file); $("#traceOpen").href = traceURL;
  $("#traceCaption").textContent = "Your sheet";
  const v = $("#traceView"); v.innerHTML = '<p style="color:#333;padding:12px;margin:0">Opening…</p>'; $("#trace").hidden = false;
  try { const { canvases } = await srFileToCanvases(file); v.innerHTML = ""; canvases.forEach(c => v.appendChild(h("img",{src:c.toDataURL("image/jpeg",0.85),alt:"Sheet music page"}))); }
  catch (e) { v.innerHTML = '<p style="color:#333;padding:12px;margin:0">Couldn\'t show this file here. Use "Open in new tab".</p>'; }
}
function showTraceCanvases(canvases, caption){
  const v = $("#traceView"); v.innerHTML = ""; canvases.forEach(c => v.appendChild(h("img",{src:c.toDataURL("image/jpeg",0.85),alt:"Sheet music page with the notes the reader found marked"})));
  $("#traceCaption").textContent = caption || "Your sheet"; $("#trace").hidden = false;
}
$("#traceRead").onclick = ()=>{ if (traceFile) srOpen(traceFile); else toast("Open a sheet first"); };
$("#edTraceBtn").onclick = ()=>$("#edTraceIn").click();
$("#edTraceIn").onchange = e=>{ const f=e.target.files[0]; if (f) srOpen(f); e.target.value=""; };
$("#traceClose").onclick = ()=>$("#trace").hidden = true;

