"use strict";
/* ---------- Midi ---------- */
let midiAccess = null;
async function connectMidi(user){
  const help = $("#midiHelp");
  if (!navigator.requestMIDIAccess) {
    setMidiPill("warn","Kit needs Chrome/Edge");
    help.textContent = "This browser can't read MIDI. Use Chrome or Edge on your laptop, or Chrome on Android. On iPhone/iPad you can still tap the drums on screen.";
    return;
  }
  try {
    midiAccess = await navigator.requestMIDIAccess({sysex:false});
    midiAccess.onstatechange = bindInputs; bindInputs();
    help.textContent = "";
  } catch(e) {
    setMidiPill("warn","MIDI blocked");
    help.innerHTML = "MIDI access was blocked. Allow MIDI for this site (click the icon left of the address bar). If you opened this inside another page, download the app file and open it directly in Chrome.";
    if (user) toast("MIDI access was blocked");
  }
}
function bindInputs(){
  const names = [];
  for (const inp of midiAccess.inputs.values()) { inp.onmidimessage = onMidi; if (inp.state!=="disconnected") names.push(inp.name); }
  if (names.length) { setMidiPill("ok", names[0].replace(/\s*MIDI\s*\d*$/i,"") + " connected"); $("#midiDevices").textContent = "Connected: "+names.join(", "); }
  else { setMidiPill("warn","No kit found"); $("#midiDevices").textContent = "No MIDI device found. Check the USB cable and that the module is on."; }
}
const midiState = {cls:"", txt:"Connect your e-kit"};
function setMidiPill(cls, txt){ midiState.cls = cls; midiState.txt = txt; updateInputPill(); }
// Header pill shows what is listening: the e-kit over USB, the microphone, or neither.
function updateInputPill(){
  const p = $("#midiPill"), midiOk = midiState.cls === "ok";
  let cls = midiState.cls, txt = midiState.txt;
  if (MIC.on && midiOk) txt += " + mic";
  else if (MIC.on) { cls = "ok"; txt = "Microphone listening"; }
  p.className = "pill " + cls; $("#midiText").textContent = txt;
  const q = $("#quickMic"); if (q) { q.textContent = MIC.on ? "Microphone on · turn off" : "Listen with microphone"; q.className = MIC.on ? "btn on" : "btn"; }
}
function noteToDrum(n){ for (const d of DRUMS) if ((settings.map[d.id]||[]).includes(n)) return d.id; return GM[n] ? resolveDrum(GM[n]) : null; }
function onMidi(e){
  const [st, n, v] = e.data; if ((st & 0xF0) !== 0x90 || !v) return;
  $("#lastNote").textContent = `${n} (velocity ${v})`;
  if (learnFor) {
    for (const k in settings.map) settings.map[k] = (settings.map[k]||[]).filter(x=>x!==n);
    settings.map[learnFor].unshift(n); saveSettings(); toast(`Note ${n} now plays ${D[learnFor].name}`); learnFor=null; renderMap(); return;
  }
  const d = noteToDrum(n);
  highlightMapRow(d);
  if (d) onHit(d, v/127, e.timeStamp || performance.now(), "midi");
}
function renderMap(){
  const box = $("#mapRows"); box.innerHTML="";
  for (const d of DRUMS){
    const r = h("div",{class:"maprow","data-d":d.id});
    r.innerHTML = `<span class="n"><i style="background:${d.color}"></i>${esc(d.name)}</span><span class="notes">${(settings.map[d.id]||[]).join(", ")||"—"}</span>`;
    const b = h("button",{class:"btn",type:"button"}, learnFor===d.id ? "Hit the pad…" : "Learn");
    b.onclick = ()=>{ learnFor = learnFor===d.id ? null : d.id; renderMap(); };
    r.appendChild(b); box.appendChild(r);
  }
}
function highlightMapRow(d){ const r = document.querySelector(`.maprow[data-d="${d}"]`); if (!r) return; r.classList.add("lit"); setTimeout(()=>r.classList.remove("lit"),200); }
const KEYNAMES = {" ":"Space"};
document.addEventListener("keydown", e=>{
  if (e.target.matches("input,select,textarea") || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key==="Enter" && e.target.closest("button,a")) return;
  if (e.key===" " && e.target.closest("#grid")) return;
  const k = e.key.toLowerCase(); const d = DRUMS.find(x=>x.key===k);
  if (d) { e.preventDefault(); audio(); onHit(d.id, 0.9, performance.now(), "key"); }
  else if (k==="enter" && !$("#view-practice").hidden) { e.preventDefault(); togglePlay(); }
});

