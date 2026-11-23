"use strict";
/* ---------- Editor ---------- */
let ED = null; // song being edited (copy)
let traceURL = null;
const EDROWS = ["crash","ride","hihat","tom1","tom2","snare","floor","kick","hhp"];
function openEditor(s){
  stop();
  ED = JSON.parse(JSON.stringify(s));
  if (s.builtin) { ED.id = uid(); ED.title = s.title.replace(/^\d+\s·\s/,"") + " (my copy)"; ED.builtin=false; ED.source="Edited lesson"; }
  ED.beats = ED.beats||4;
  $("#edTitle").value = ED.title; $("#edBpm").value = ED.bpm; $("#edBars").value = ED.bars; $("#edBeats").value = ED.beats;
  renderGrid(); show("editor");
}
function edSpb(){ return ED.beats*4; }
function renderGrid(){
  const g = $("#grid"); const spb = edSpb(), total = ED.bars*spb;
  g.style.gridTemplateColumns = `112px repeat(${total}, minmax(26px, 1fr))`; g.innerHTML = "";
  g.appendChild(h("div",{class:"rh",style:"border-top:0"},""));
  for (let s=0;s<total;s++){ const i=s%spb; const lab = i%4===0 ? (i===0?`${Math.floor(s/spb)+1}.1`:String(i/4+1)) : i%4===2 ? "&" : "·"; g.appendChild(h("div",{class:"hd"+(i%4===0?" b":"")+(i===0?" bar":"")},lab)); }
  const on = new Set(ED.notes.map(n=>n.s+"|"+n.d));
  for (const d of EDROWS){
    const dd = D[d];
    g.appendChild(h("div",{class:"rh"},`<i style="background:${dd.color}"></i>${esc(dd.name)}`));
    for (let s=0;s<total;s++){
      const i = s%spb; const cls = "c" + (Math.floor(i/4)%2?" alt":"") + (i===0?" barl":i%4===0?" beat":"") + (on.has(s+"|"+d)?" on":"");
      const b = h("button",{class:cls,type:"button","data-s":s,"data-d":d,style:`--col:${dd.color}`,"aria-label":`${dd.name}, bar ${Math.floor(s/spb)+1}, step ${i+1}`,"aria-pressed":on.has(s+"|"+d)});
      g.appendChild(b);
    }
  }
}
let paint = null;
function setCell(b, val){
  const s = +b.dataset.s, d = b.dataset.d; const has = b.classList.contains("on");
  if (val === has) return;
  b.classList.toggle("on", val); b.setAttribute("aria-pressed", val);
  if (val) { ED.notes.push({s,d}); audio(); playDrum(d, now(), 0.7); } else ED.notes = ED.notes.filter(n=>!(n.s===s && n.d===d));
}
$("#grid").addEventListener("pointerdown", e=>{ const b = e.target.closest(".c"); if (!b) return; e.preventDefault(); paint = !b.classList.contains("on"); setCell(b, paint); });
$("#grid").addEventListener("pointerover", e=>{ if (paint==null || !(e.buttons&1)) return; const b = e.target.closest(".c"); if (b) setCell(b, paint); });
$("#grid").addEventListener("keydown", e=>{ const b = e.target.closest(".c"); if (b && (e.key===" "||e.key==="Enter")) { e.preventDefault(); setCell(b, !b.classList.contains("on")); } });
window.addEventListener("pointerup", ()=>paint=null);
function readEdFields(){
  ED.title = $("#edTitle").value.trim() || "Untitled";
  ED.bpm = Math.max(30, Math.min(240, +$("#edBpm").value || 80));
  const bars = Math.max(1, Math.min(32, +$("#edBars").value || 1)), beats = +$("#edBeats").value;
  if (bars !== ED.bars || beats !== ED.beats) {
    const oldSpb = edSpb(), newSpb = beats*4;
    ED.notes = ED.notes.filter(n=>n.s%oldSpb < newSpb).map(n=>({s: Math.floor(n.s/oldSpb)*newSpb + n.s%oldSpb, d:n.d}));
    ED.bars = bars; ED.beats = beats; ED.notes = ED.notes.filter(n=>n.s < bars*beats*4); renderGrid();
  }
}
["#edBars","#edBeats","#edBpm","#edTitle"].forEach(s=>$(s).addEventListener("change", readEdFields));
$("#edClear").onclick = ()=>{ if (!ED.notes.length) return; if (confirmDelete({id:"clear:"+ED.id,title:"all notes"})) { ED.notes=[]; renderGrid(); } };
$("#edSave").onclick = ()=>{ readEdFields(); saveSong(JSON.parse(JSON.stringify(ED))); toast("Saved to My songs"); };
$("#edPractise").onclick = ()=>{ readEdFields(); const s = JSON.parse(JSON.stringify(ED)); saveSong(s); loadSong(s); show("practice"); };
$("#edPlay").onclick = ()=>{ if (E.mode==="preview" && E.playing) { stop(); return; } readEdFields(); stop(); E.mode="preview"; E.C = compile(ED); E.bpm = ED.bpm; start(0); $("#edPlay").textContent="Stop"; };
$("#edRec").onclick = ()=>{ if (E.mode==="record" && E.playing) { stop(); return; } readEdFields(); stop(); E.mode="record"; E.C = compile(ED); E.bpm = ED.bpm; start(0); $("#edRec").querySelector("span").textContent="Stop recording"; toast("Count-in: 4 clicks, then play"); };
function recordHit(d, pos){
  const total = ED.bars*edSpb(); let s = Math.round(pos); if (s<0 && s>-0.5) s=0; if (s<0 || s>=total) return;
  if (!ED.notes.some(n=>n.s===s && n.d===d)) { ED.notes.push({s,d}); const b = document.querySelector(`#grid .c[data-s="${s}"][data-d="${d}"]`); if (b) { b.classList.add("on"); b.setAttribute("aria-pressed",true); } }
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
  const s = findSong(settings.lastSong) || LESSONS[0]; E.C = compile(s); E.bpm = +$("#tempo").value || s.bpm; resetJudgements(); E.pos = 0;
}
function showTrace(file){
  if (traceURL) URL.revokeObjectURL(traceURL);
  traceURL = URL.createObjectURL(file); const v = $("#traceView"); v.innerHTML = "";
  if (file.type==="application/pdf" || /\.pdf$/i.test(file.name)) { const o = h("object",{data:traceURL,type:"application/pdf"}); o.innerHTML = '<p style="color:#333;padding:12px;margin:0">This browser can\'t show the PDF here. Use "Open in new tab".</p>'; v.appendChild(o); }
  else { const im = h("img",{src:traceURL,alt:"Your sheet music"}); v.appendChild(im); }
  $("#traceOpen").href = traceURL; $("#trace").hidden = false;
}
$("#edTraceBtn").onclick = ()=>$("#edTraceIn").click();
$("#edTraceIn").onchange = e=>{ const f=e.target.files[0]; if (f) showTrace(f); e.target.value=""; };
$("#traceClose").onclick = ()=>$("#trace").hidden = true;

