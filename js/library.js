"use strict";
/* ---------- Library ---------- */
function songRow(s, list){
  const r = h("div",{class:"song"});
  const total = s.notes.length; const rec = P.songs[s.id];
  r.innerHTML = `<div class="t"><b>${esc(s.title)}</b><span>${esc(s.desc || s.source || "")} · ${s.bpm} BPM · ${s.bars} bar${s.bars>1?"s":""}</span></div><div class="rec">${starsHtml(rec ? rec.stars||0 : 0)}<span>${rec ? "Best "+rec.best+"%" : total+" notes"}</span></div>`;
  const acts = h("div",{class:"acts"});
  const p = h("button",{class:"btn primary",type:"button"},"Practise"); p.onclick=()=>{ E.routine = false; loadSong(s); show("practice"); };
  const e = h("button",{class:"btn",type:"button"},"Edit"); e.onclick=()=>openEditor(s);
  acts.append(p,e);
  if (!s.builtin) { const del = h("button",{class:"btn danger",type:"button","aria-label":"Delete "+s.title},"Delete"); del.onclick=()=>{ if (confirmDelete(s)) { songs = songs.filter(x=>x.id!==s.id); store.set("songs",songs); audioDel(s.id); renderLibrary(); toast("Deleted"); } }; acts.append(del); }
  r.appendChild(acts); list.appendChild(r);
}
let pendingDelete = null;
function confirmDelete(s){ if (pendingDelete===s.id) { pendingDelete=null; return true; } pendingDelete=s.id; toast(`Press Delete again to remove "${s.title}"`); setTimeout(()=>{ if(pendingDelete===s.id) pendingDelete=null; },3500); return false; }
function renderLibrary(){
  const ll = $("#lessonList"); ll.innerHTML=""; LESSONS.forEach(s=>songRow(s,ll));
  const sl = $("#songList"); sl.innerHTML="";
  if (!songs.length) sl.innerHTML = '<p class="muted" style="margin:0;font-size:14px">Nothing here yet. Import a file or write a pattern in the note editor.</p>';
  songs.forEach(s=>songRow(s,sl));
  renderPracticeLists();
}
function saveSong(s){ s.builtin=false; const i = songs.findIndex(x=>x.id===s.id); if (i>=0) songs[i]=s; else songs.push(s); store.set("songs",songs); renderLibrary(); }

/* -------- imports -------- */
async function importFile(file){
  const name = file.name.replace(/\.[^.]+$/,""), ext = (file.name.split(".").pop()||"").toLowerCase();
  try {
    if (ext==="mid" || ext==="midi") { const s = parseMidi(new Uint8Array(await file.arrayBuffer()), name); finishImport(s, "MIDI file"); }
    else if (ext==="xml" || ext==="musicxml") { const s = parseMusicXML(await file.text(), name); finishImport(s, "MusicXML"); }
    else if (ext==="mxl") toast("Compressed .mxl isn't supported yet. Export as uncompressed MusicXML (.musicxml).");
    else if (ext==="pdf" || file.type.startsWith("image/")) srOpen(file);
    else if (file.type.startsWith("audio/") || /^(mp3|wav|m4a|ogg|oga|flac|aac|opus|webm)$/.test(ext)) arOpen(file);
    else toast("That file type isn't supported");
  } catch(err) { console.error(err); toast("Couldn't read that file: "+err.message); }
}
function finishImport(s, src){
  if (!s.notes.length) throw new Error("no drum notes found");
  s.source = src; saveSong(s); openEditor(s); toast(`Imported ${s.notes.length} notes. Check them, then press Practise this`);
}
