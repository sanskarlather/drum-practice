"use strict";
/* ---------- Song audio: play along with the real recording ----------
 * A song may have song.audio = { name, bpm, offset } where offset is the time (seconds) in the recording
 * where bar 1 beat 1 is, and bpm is the recording's tempo. The audio file itself is stored in this
 * browser's IndexedDB under the song's id (it's too big for localStorage).
 * The practice clock stays the master: each frame trackSync() keeps the <audio> element at
 *   offset + position(steps) × (60 / audio.bpm / 4)
 * and plays it at E.bpm / audio.bpm speed with the pitch kept (slower practice doesn't sound lower).
 */
const TRACK = { el: null, songId: null, url: null, ready: false, info: null, lastSeek: 0 };

/* --- storage (IndexedDB) --- */
let audioDbP = null;
function audioDb(){
  if (!audioDbP) audioDbP = new Promise((res, rej) => {
    try { const r = indexedDB.open("drumapp", 1); r.onupgradeneeded = () => r.result.createObjectStore("audio"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }
    catch (e) { rej(e); }
  });
  return audioDbP;
}
async function audioPut(id, blob){ const db = await audioDb(); return new Promise((res, rej) => { const t = db.transaction("audio", "readwrite"); t.objectStore("audio").put(blob, id); t.oncomplete = res; t.onerror = () => rej(t.error); }); }
async function audioGet(id){ try { const db = await audioDb(); return await new Promise((res, rej) => { const q = db.transaction("audio").objectStore("audio").get(id); q.onsuccess = () => res(q.result || null); q.onerror = () => rej(q.error); }); } catch (e) { return null; } }
async function audioDel(id){ try { const db = await audioDb(); await new Promise(res => { const t = db.transaction("audio", "readwrite"); t.objectStore("audio").delete(id); t.oncomplete = res; t.onerror = res; }); } catch (e) {} }

/* --- loading a song's audio --- */
async function trackLoad(song){
  trackPause();
  if (TRACK.url) { URL.revokeObjectURL(TRACK.url); TRACK.url = null; }
  TRACK.songId = song ? song.id : null; TRACK.ready = false; TRACK.info = song && song.audio ? song.audio : null;
  trackUI();
  if (!song || !song.audio) return;
  const blob = await audioGet(song.id);
  if (TRACK.songId !== song.id) return; // another song was loaded meanwhile
  if (!blob) { TRACK.info = null; trackUI("The recording for this song isn't stored in this browser. Attach it again in the note editor."); return; }
  if (!TRACK.el) { TRACK.el = new Audio(); TRACK.el.preload = "auto"; }
  TRACK.url = URL.createObjectURL(blob); TRACK.el.src = TRACK.url;
  TRACK.el.preservesPitch = true; TRACK.el.mozPreservesPitch = true; TRACK.el.webkitPreservesPitch = true;
  TRACK.ready = true; trackVolume(); trackUI();
}
function trackVolume(){ if (TRACK.el) TRACK.el.volume = Math.max(0, Math.min(1, settings.songVol/100)); }
function trackPause(){ if (TRACK.el && !TRACK.el.paused) TRACK.el.pause(); }
// Called every frame while playing (practice and editor preview).
function trackSync(pos){
  const el = TRACK.el, info = TRACK.info;
  if (!el || !TRACK.ready || !info || !settings.songOn || !E.playing || E.blocked || (E.C && E.C.song.id !== TRACK.songId)) { trackPause(); return; }
  const want = info.offset + pos * (60 / info.bpm / ((E.C && E.C.sub) || 4));
  const rate = E.bpm / info.bpm;
  if (want < 0) { trackPause(); return; }                         // count-in before the recording starts
  if (isFinite(el.duration) && want >= el.duration) { trackPause(); return; }
  if (el.paused) { el.currentTime = want; el.playbackRate = rate; el.play().catch(() => {}); TRACK.lastSeek = performance.now(); return; }
  const drift = el.currentTime - want;
  if (Math.abs(drift) > 0.15 && performance.now() - TRACK.lastSeek > 400) { el.currentTime = want; TRACK.lastSeek = performance.now(); el.playbackRate = rate; return; }
  // small drift: nudge the speed slightly instead of jumping
  el.playbackRate = rate * (1 - Math.max(-0.04, Math.min(0.04, drift * 0.6)));
}

/* --- attaching audio to a song (editor) --- */
async function trackAttach(song, file, guess){
  await audioPut(song.id, file);
  song.audio = { name: file.name, bpm: (guess && guess.bpm) || song.bpm || 100, offset: guess && guess.offset != null ? guess.offset : 0 };
}
async function trackDetach(song){ await audioDel(song.id); delete song.audio; }

/* --- UI --- */
function trackUI(msg){
  const row = $("#songAudioRow"); if (!row) return;
  const has = !!(TRACK.info && TRACK.ready);
  row.hidden = !TRACK.info && !msg;
  $("#songAudioName").textContent = msg || (TRACK.info ? TRACK.info.name : "");
  $("#optSong").disabled = !has;
}
function edAudioUI(){
  const box = $("#edAudio"); if (!box || !ED) return;
  const a = ED.audio;
  $("#edAudioNone").hidden = !!a; $("#edAudioSet").hidden = !a;
  if (a) { $("#edAudioName").textContent = a.name; $("#edAudioOffset").value = a.offset.toFixed(2); $("#edAudioBpm").value = (+a.bpm).toFixed(1).replace(/\.0$/, ""); }
}
function trackWire(){
  $("#optSong").checked = settings.songOn; $("#optSong").onchange = e => { settings.songOn = e.target.checked; saveSettings(); };
  $("#songVol").value = settings.songVol; $("#songVol").oninput = e => { settings.songVol = +e.target.value; saveSettings(); trackVolume(); };
  $("#edAudioBtn").onclick = () => $("#edAudioIn").click();
  $("#edAudioIn").onchange = async e => {
    const f = e.target.files[0]; e.target.value = ""; if (!f || !ED) return;
    await trackAttach(ED, f, { bpm: ED.bpm, offset: 0 }); saveSong(JSON.parse(JSON.stringify(ED))); edAudioUI();
    toast("Recording attached. Set where bar 1 starts and the recording's tempo, then press Listen");
  };
  $("#edAudioRemove").onclick = async () => { if (!ED) return; await trackDetach(ED); saveSong(JSON.parse(JSON.stringify(ED))); edAudioUI(); toast("Recording removed"); };
  $("#edAudioOffset").onchange = e => { if (ED && ED.audio) { ED.audio.offset = Math.max(0, +e.target.value || 0); saveSong(JSON.parse(JSON.stringify(ED))); } };
  $("#edAudioBpm").onchange = e => { if (ED && ED.audio) { ED.audio.bpm = Math.max(30, Math.min(300, +e.target.value || ED.bpm)); saveSong(JSON.parse(JSON.stringify(ED))); } };
  document.querySelectorAll("[data-nudge]").forEach(b => b.onclick = () => {
    if (!ED || !ED.audio) return; ED.audio.offset = Math.max(0, +(ED.audio.offset + +b.dataset.nudge).toFixed(3)); edAudioUI(); saveSong(JSON.parse(JSON.stringify(ED)));
  });
}
