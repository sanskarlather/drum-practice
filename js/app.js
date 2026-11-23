"use strict";
/* ---------- Nav + Wiring ---------- */
function show(v){
  if (v!=="editor" && E.mode!=="practice") stop();
  if (v!=="practice" && E.mode==="practice") pause();
  for (const s of ["practice","library","editor","setup"]) $("#view-"+s).hidden = s!==v;
  document.querySelectorAll("nav.main button").forEach(b=>{ if (b.dataset.view===v) b.setAttribute("aria-current","page"); else b.removeAttribute("aria-current"); });
  if (v==="editor" && !ED) openEditor({id:uid(), title:"My pattern", bpm:80, bars:2, beats:4, notes:[]});
  if (v==="practice" && E.mode==="practice") { if (!E.C) loadSong(findSong(settings.lastSong)||LESSONS[0]); else updateFrame(true); }
  window.scrollTo(0,0);
}
document.querySelectorAll("[data-view]").forEach(b=>b.addEventListener("click", ()=>show(b.dataset.view)));
function togglePlay(){
  if (E.mode!=="practice") return;
  if (E.playing) { pause(); return; }
  if (MIC.on && settings.metro && !MIC.warned) { MIC.warned = true; toast("Mic is on: use headphones for the click, or the mic will hear it"); }
  start();
}
$("#playBtn").onclick = togglePlay;
$("#restartBtn").onclick = ()=>{ const was = E.playing; E.playing=false; E.pos=0; resetJudgements(); resetStats(); if (was) start(0); else { updateFrame(true); renderCount(0); $("#instr").textContent="Press play to start"; moveSheetHead(0); } };
$("#tempo").oninput = e=>setTempo(+e.target.value);
const bindOpt = (id, key, fn) => { const i=$(id); i.checked = settings[key]; i.onchange = ()=>{ settings[key]=i.checked; saveSettings(); fn&&fn(); }; };
bindOpt("#optMetro","metro"); bindOpt("#optArtic","artic"); bindOpt("#optDemo","demo"); bindOpt("#optHitSnd","hitSnd"); bindOpt("#optLoop","loop",()=>updateFrame(true));
bindOpt("#optWait","wait",()=>{ if (!settings.wait && E.blocked) { E.blocked=false; rebase(E.posBase); } });
$("#optVol").value = settings.vol; $("#optVol").oninput = e=>{ settings.vol=+e.target.value; saveSettings(); if (master) master.gain.value = settings.vol/100; };
document.querySelectorAll(".seg [data-v]").forEach(b=>b.onclick=()=>{ settings.view=b.dataset.v; saveSettings(); applyView(); });
$("#endAgain").onclick = ()=>start(0);
$("#endSlower").onclick = ()=>{ setTempo(E.bpm-10); start(0); };
$("#endNext").onclick = ()=>{ const i = LESSONS.findIndex(l=>l.id===E.C.song.id); if (LESSONS[i+1]) loadSong(LESSONS[i+1]); };
$("#connectBtn").onclick = ()=>connectMidi(true);
$("#mapReset").onclick = ()=>{ const k = activeKit(); for (const key of Object.keys(k.map)) if (key.includes(":")) delete k.map[key]; for (const p of k.pieces) k.map[p.id] = defaultNotesFor(p.id); dedupeMap(k); applyKit(k); saveSettings(); renderMap(); toast("Pads reset to Alesis Nitro Mesh defaults"); };
for (const [id, key] of [["velAccent","accent"],["velGhost","ghost"]]) { const r = $("#"+id); r.value = settings.vel[key]; $("#"+id+"Out").textContent = settings.vel[key]; r.oninput = ()=>{ settings.vel[key] = +r.value; $("#"+id+"Out").textContent = r.value; saveSettings(); }; }
$("#offset").value = settings.offset; $("#offOut").textContent = settings.offset+" ms";
$("#offset").oninput = e=>{ settings.offset=+e.target.value; $("#offOut").textContent = settings.offset+" ms"; saveSettings(); };
$("#keyList").innerHTML = keyListHtml();
// file picking
$("#pickFile").onclick = ()=>{ $("#fileIn").accept = ".mid,.midi,.xml,.musicxml,.pdf,image/*"; $("#fileIn").click(); };
document.querySelectorAll("[data-pick]").forEach(b=>b.onclick=()=>{ $("#fileIn").accept=b.dataset.pick; $("#fileIn").click(); });
$("#fileIn").onchange = e=>{ const f=e.target.files[0]; if (f) importFile(f); e.target.value=""; };
$("#newSong").onclick = ()=>openEditor({id:uid(), title:"My pattern", bpm:80, bars:2, beats:4, notes:[]});
const drop = $("#drop");
drop.addEventListener("dragover", e=>{ e.preventDefault(); drop.classList.add("over"); });
drop.addEventListener("dragleave", ()=>drop.classList.remove("over"));
drop.addEventListener("drop", e=>{ e.preventDefault(); drop.classList.remove("over"); const f=e.dataTransfer.files[0]; if (f) importFile(f); });
document.addEventListener("visibilitychange", ()=>{ if (document.hidden) pause(); });

/* ---------- Init ---------- */
buildKit(); renderMap(); micWire(); srWire(); kitWire(); edToolbar();
$("#quickMic").onclick = ()=> MIC.on ? micStop() : micStart().then(ok=>{ if (!ok) { show("setup"); toast("Microphone couldn't start. See Kit setup."); } else if (!micTaught().length) toast("Listening. Teach it your drums in Kit setup for drum checking"); });
updateInputPill(); renderLibrary(); applyView();
loadSong(findSong(settings.lastSong) || LESSONS[0]);
// Ask for MIDI quietly on load where permission is already granted; otherwise wait for Connect.
if (navigator.permissions && navigator.requestMIDIAccess) {
  navigator.permissions.query({name:"midi"}).then(p=>{ if (p.state==="granted") connectMidi(false); else setMidiPill("","Connect your e-kit"); }).catch(()=>connectMidi(false));
} else if (!navigator.requestMIDIAccess) { setMidiPill("warn","Tap mode (no MIDI here)"); connectMidi(false); }


// Offline support + "Add to Home screen" when served over https (e.g. GitHub Pages).
if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").then(reg => reg.update()).catch(()=>{});
  // when a new version takes over, reload once so every file is the new one
  // (not on the very first visit, when there was no older version to replace)
  const hadOld = !!navigator.serviceWorker.controller; let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (hadOld && !reloaded) { reloaded = true; location.reload(); } });
}
