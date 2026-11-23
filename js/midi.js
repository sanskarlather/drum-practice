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
// -> {d, a}: the piece and, for variant notes (open hi-hat, rimshot, cross-stick, ride bell), the articulation
function noteToDrum(n){
  for (const d of DRUMS) for (const a of variantsFor(d.id)) if ((settings.map[variantKey(d.id, a)]||[]).includes(n)) return { d: d.id, a };
  for (const d of DRUMS) if ((settings.map[d.id]||[]).includes(n)) return { d: d.id, a: null };
  const g = GM_ARTIC[n]; if (g) { const d = resolveDrum(g.d); return d ? { d, a: articFits(g.a, d) ? g.a : null } : null; }
  return GM[n] ? { d: resolveDrum(GM[n]), a: null } : null;
}
const GM_ARTIC = { 46:{d:"hihat",a:"open"}, 26:{d:"hihat",a:"open"}, 37:{d:"snare",a:"xstick"}, 40:{d:"snare",a:"rim"}, 53:{d:"ride",a:"bell"} };
function onMidi(e){
  const [st, n, v] = e.data; if ((st & 0xF0) !== 0x90 || !v) return;
  $("#lastNote").textContent = `${n} (velocity ${v})`;
  if (learnFor) {
    for (const k in settings.map) settings.map[k] = (settings.map[k]||[]).filter(x=>x!==n);
    (settings.map[learnFor] = settings.map[learnFor] || []).unshift(n); saveSettings();
    const [pid, va] = learnFor.split(":"); toast(`Note ${n} now plays ${D[pid].name}${va ? " (" + articLabel(va).toLowerCase() + ")" : ""}`); learnFor=null; renderMap(); return;
  }
  const r = noteToDrum(n);
  $("#lastNote").textContent = `${n} (velocity ${v})` + (r && r.d ? ` → ${D[r.d] ? D[r.d].name : r.d}${r.a ? " · " + articLabel(r.a).toLowerCase() : ""}` : "");
  if (r) highlightMapRow(r.a ? variantKey(r.d, r.a) : r.d);
  if (r && r.d) onHit(r.d, v/127, e.timeStamp || performance.now(), "midi", r.a);
}
function renderMap(){
  const box = $("#mapRows"); box.innerHTML="";
  const row = (key, label, color, sub) => {
    const r = h("div",{class:"maprow"+(sub?" sub":""),"data-d":key});
    r.innerHTML = `<span class="n"><i style="background:${color}${sub?";opacity:.5":""}"></i>${esc(label)}</span><span class="notes">${(settings.map[key]||[]).join(", ")||"—"}</span>`;
    const b = h("button",{class:"btn",type:"button"}, learnFor===key ? "Hit the pad…" : "Learn");
    b.onclick = ()=>{ learnFor = learnFor===key ? null : key; renderMap(); };
    r.appendChild(b); box.appendChild(r);
  };
  for (const d of DRUMS){
    row(d.id, d.name, d.color, false);
    for (const a of variantsFor(d.id)) row(variantKey(d.id, a), `${d.name}: ${articLabel(a).replace(/^Ride bell$/,"bell").replace(/^Open hi-hat$/,"open").toLowerCase()}`, d.color, true);
  }
}
function highlightMapRow(d){ const r = document.querySelector(`.maprow[data-d="${d}"]`); if (!r) return; r.classList.add("lit"); setTimeout(()=>r.classList.remove("lit"),200); }
const KEYNAMES = {" ":"Space"};
document.addEventListener("keydown", e=>{
  if (e.target.matches("input,select,textarea") || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key==="Enter" && e.target.closest("button,a")) return;
  if (e.key===" " && e.target.closest("#grid")) return;
  const k = e.key.toLowerCase(); const d = DRUMS.find(x=>x.key===k);
  // Shift + key = the piece's special stroke (open hi-hat, rimshot, ride bell)
  if (d) { e.preventDefault(); audio(); const v = e.shiftKey ? variantsFor(d.id)[0] || null : null; onHit(d.id, 0.9, performance.now(), "key", v); }
  else if (k==="enter" && !$("#view-practice").hidden) { e.preventDefault(); togglePlay(); }
});

