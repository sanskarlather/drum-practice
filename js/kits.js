"use strict";
/* ---------- Kits: several kits, each with its own pieces, layout, pad mapping and mic training ----------
 * A kit is { id, name, pieces:[{id, type, name, cx, cy, r, color?}], map:{pieceId:[midi notes]}, cal:{pieceId: mic fingerprint} }.
 * applyKit() turns the active kit into DRUMS / D (data.js), which the rest of the app reads.
 */
const KIT_PRESETS = {
  standard: { label: "Standard 5-piece (2 rack toms)", pieces: [
    ["crash",200,120,88], ["ride",700,130,96], ["tom",360,175,56], ["tom",520,175,56], ["floor",670,360,84],
    ["snare",290,360,76], ["hihat",120,300,66], ["kick",440,502], ["hhp",120,496] ] },
  small: { label: "Small 4-piece (1 rack tom)", pieces: [
    ["crash",210,120,88], ["ride",690,140,96], ["tom",440,170,60], ["floor",670,360,84],
    ["snare",290,360,76], ["hihat",120,300,66], ["kick",440,502], ["hhp",120,496] ] },
  big: { label: "Big kit (3 toms, 2 floor toms, extra cymbals, double pedal)", pieces: [
    ["hihat",105,300,60], ["crash",185,110,72], ["splash",330,62,44], ["crash",665,80,60], ["china",822,70,44], ["ride",790,235,72],
    ["tom",320,190,48], ["tom",440,165,48], ["tom",560,190,48], ["floor",660,390,70], ["floor",800,470,58],
    ["snare",265,370,70], ["kick",440,502], ["kick",320,522], ["hhp",120,496] ] },
};
const kitUid = () => "K" + Date.now().toString(36) + Math.random().toString(36).slice(2,5);
function newPieceId(kit, type){
  const used = new Set(kit.pieces.map(p=>p.id));
  for (const id of BASE_IDS[type]) if (!used.has(id)) return id;
  let n = BASE_IDS[type].length + 1; while (used.has(type + n)) n++; return type + n;
}
function defaultNotesFor(id){ return (DEFAULT_MAP[id] || EXTRA_MAP[id] || []).slice(); }
function makeKit(name, preset, map, cal){
  const kit = { id: kitUid(), name, pieces: [], map: {}, cal: cal || {} };
  for (const [type, cx, cy, r] of KIT_PRESETS[preset].pieces) {
    const id = newPieceId(kit, type);
    kit.pieces.push({ id, type, name: BASE_NAMES[id] || PIECE_TYPES[type].label, cx, cy, r: r || PIECE_TYPES[type].r });
  }
  for (const p of kit.pieces) kit.map[p.id] = map && map[p.id] ? map[p.id].slice() : defaultNotesFor(p.id);
  dedupeMap(kit);
  return kit;
}
// a MIDI note may only trigger one piece: keep it on the piece that lists it most specifically (extras win)
function dedupeMap(kit){
  const owner = {};
  for (const p of kit.pieces) for (const n of (EXTRA_MAP[p.id] || [])) if (kit.map[p.id].includes(n)) owner[n] = p.id;
  for (const p of kit.pieces) kit.map[p.id] = kit.map[p.id].filter(n => !owner[n] || owner[n] === p.id);
}

let kits = store.get("kits", null);
if (!Array.isArray(kits) || !kits.length) {
  // first run, or upgrading from a version with one fixed kit: keep its pad mapping and mic training
  kits = [makeKit("My kit", "standard", settings.map, settings.mic.cal)];
  settings.kit = kits[0].id;
}
function saveKits(){ store.set("kits", kits); }
function activeKit(){ return kits.find(k => k.id === settings.kit) || kits[0]; }

function applyKit(kit){
  DRUMS.length = 0; for (const k in D) delete D[k];
  const count = {}, usedKeys = new Set(kit.pieces.map(p => BASE_KEYS[p.id]).filter(Boolean)); let ek = 0;
  for (const p of kit.pieces) {
    const T = PIECE_TYPES[p.type]; if (!T) continue;
    const i = count[p.type] = (count[p.type] ?? -1) + 1;
    let key = BASE_KEYS[p.id];
    if (!key) { while (ek < EXTRA_KEYS.length && usedKeys.has(EXTRA_KEYS[ek])) ek++; key = EXTRA_KEYS[ek++] || ""; usedKeys.add(key); }
    const d = { id: p.id, type: p.type, name: p.name, color: p.color || T.colors[i % T.colors.length], kind: T.kind,
      cx: p.cx, cy: p.cy, r: p.r || T.r, staff: T.staff[Math.min(i, T.staff.length-1)], x: !!T.x, key, hand: T.hand, group: T.group,
      foot: T.kind === "kick" ? (i === 0 ? "RF" : "LF") : T.kind === "pedal" ? "LF" : null };
    DRUMS.push(d); D[d.id] = d;
    if (!kit.map[d.id]) kit.map[d.id] = [];
  }
  // pad mapping for special strokes (open hi-hat, rimshot, cross-stick, ride bell); older kits had these notes on the main piece
  for (const d of DRUMS) for (const a of variantsFor(d.id)) {
    const vk = variantKey(d.id, a);
    if (kit.map[vk]) continue;
    const notes = (DEFAULT_VARIANT_MAP[vk] || []).slice();
    for (const k in kit.map) kit.map[k] = kit.map[k].filter(n => !notes.includes(n));
    kit.map[vk] = notes;
  }
  settings.map = kit.map; settings.mic.cal = kit.cal; settings.kit = kit.id;
}
// Play a song's piece on this kit: the piece itself, or the closest one the kit has.
function resolveDrum(id){
  if (D[id]) return id;
  for (const f of (FALLBACK[id] || [])) if (D[f]) return f;
  const type = Object.keys(BASE_IDS).find(t => BASE_IDS[t].includes(id)) || id.replace(/\d+$/, "");
  const same = DRUMS.find(d => d.type === type); return same ? same.id : null;
}
applyKit(activeKit());

/* --- changes --- */
function kitChanged(){
  applyKit(activeKit()); saveSettings();
  if (typeof buildKit === "function") { buildKit(); if (E.C) { E.C = compile(E.C.song); renderSheet(); updateFrame(true); } }
  if (typeof renderMap === "function") renderMap();
  if (typeof micRenderUI === "function") micRenderUI();
  if (typeof ED !== "undefined" && ED && typeof renderGrid === "function") { ED.notes = resolveNotes(ED.notes); renderGrid(); }
  renderKitEditor();
  const kl = $("#keyList"); if (kl) kl.innerHTML = keyListHtml();
}
function resolveNotes(notes){ const out = [], seen = new Set(); for (const n of notes) { const d = resolveDrum(n.d); if (!d || seen.has(n.s+"|"+d)) continue; seen.add(n.s+"|"+d); const o = n.a && articFits(n.a, d) ? { s:n.s, d, a:n.a } : { s:n.s, d }; if (n.h) o.h = n.h; out.push(o); } return out; }
function keyListHtml(){ return DRUMS.filter(d=>d.key).map(d=>`<span><kbd>${d.key===" "?"Space":d.key.toUpperCase()}</kbd> ${esc(d.name)}</span>`).join("") + `<span><kbd>Enter</kbd> Play / pause</span>`; }
function addPiece(type){
  const kit = activeKit(), T = PIECE_TYPES[type], id = newPieceId(kit, type);
  const r = T.kind === "kick" || T.kind === "pedal" ? T.r : Math.round(T.r * 0.85);
  // put it in the emptiest spot; you can drag it afterwards
  // where this kind of piece usually goes: cymbals high, toms over the bass drum, floor toms and snare lower, pedals at the bottom
  const zone = { cym:[60,250], drum: type==="tom" ? [120,260] : [300,470], kick:[490,520], pedal:[490,520] }[T.kind];
  const k1 = kit.pieces.find(p=>p.type==="kick");
  const obstacles = kit.pieces.map(p=>({ x:p.cx, y:p.cy, r:(p.r || 52) + 30 }));
  if (k1 && T.kind !== "drum") obstacles.push({ x:k1.cx, y:k1.cy-195, r:100 });   // bass drum body (toms may sit over it)
  obstacles.push({ x:640, y:540, r:70 });                                         // the seat label
  let best = { x: 440, y: 300, s: -1e9 };
  for (let y = zone[0]; y <= zone[1]; y += 10) for (let x = 70; x <= 810; x += 10) {
    let s = 1e9; for (const o of obstacles) s = Math.min(s, Math.hypot(o.x - x, o.y - y) - o.r - r);
    if (s > best.s) best = { x, y, s };
  }
  const name = BASE_NAMES[id] || `${T.label} ${kit.pieces.filter(p=>p.type===type).length + 1}`;
  kit.pieces.push({ id, type, name, cx: best.x, cy: best.y, r });
  const notes = EXTRA_MAP[id] || DEFAULT_MAP[id] || [];
  for (const p of kit.pieces) if (p.id !== id && kit.map[p.id]) kit.map[p.id] = kit.map[p.id].filter(n => !notes.includes(n));
  kit.map[id] = notes.slice();
  kitChanged(); toast(`Added ${name}. Drag it to where it sits on your kit.`);
}
function removePiece(id){
  const kit = activeKit(); if (kit.pieces.length <= 1) { toast("A kit needs at least one piece"); return; }
  for (const k of Object.keys(kit.map)) if (k.startsWith(id + ":")) delete kit.map[k];
  for (const k of Object.keys(kit.cal)) if (k.startsWith(id + ":")) delete kit.cal[k];
  const p = kit.pieces.find(x=>x.id===id);
  kit.pieces = kit.pieces.filter(x=>x.id!==id); delete kit.map[id]; delete kit.cal[id];
  kitChanged(); toast(`Removed ${p ? p.name : id}`);
}

/* --- kit editor (Kit setup) --- */
let kitDelArm = null;
function renderKitEditor(){
  const sel = $("#kitSel"); if (!sel) return;
  const kit = activeKit();
  sel.innerHTML = kits.map(k => `<option value="${k.id}"${k.id===kit.id?" selected":""}>${esc(k.name)}</option>`).join("");
  $("#kitName").value = kit.name;
  const list = $("#kitPieces"); list.innerHTML = "";
  for (const d of DRUMS) {
    const p = kit.pieces.find(x=>x.id===d.id), row = h("div", { class: "piece-row" });
    row.innerHTML = `<i style="background:${d.color}" aria-hidden="true"></i>`;
    const nm = h("input", { type: "text", value: p.name, "aria-label": "Name of " + p.name, maxlength: "24" });
    nm.onchange = () => { p.name = nm.value.trim() || BASE_NAMES[p.id] || PIECE_TYPES[p.type].label; kitChanged(); };
    row.appendChild(nm);
    row.appendChild(h("span", { class: "muted", style: "font-size:12px;min-width:90px" }, esc(PIECE_TYPES[p.type].label)));
    if (d.kind === "cym" || d.kind === "drum") {
      const sz = h("input", { type: "range", min: "30", max: "120", value: String(d.r), "aria-label": "Size of " + p.name });
      sz.oninput = () => { p.r = +sz.value; applyKit(kit); buildKit($("#kitEdit"), true); };
      sz.onchange = () => kitChanged();
      row.appendChild(sz);
    } else row.appendChild(h("span", { style: "flex:1" }));
    const rm = h("button", { class: "btn danger", type: "button", "aria-label": "Remove " + p.name }, "Remove");
    rm.onclick = () => removePiece(p.id); row.appendChild(rm);
    list.appendChild(row);
  }
  buildKit($("#kitEdit"), true);
}
function kitWire(){
  $("#kitAddType").innerHTML = Object.entries(PIECE_TYPES).map(([t, T]) => `<option value="${t}">${esc(T.label)}</option>`).join("");
  $("#kitNewPreset").innerHTML = Object.entries(KIT_PRESETS).map(([k, P]) => `<option value="${k}">${esc(P.label)}</option>`).join("") + `<option value="copy">Copy of the current kit</option>`;
  $("#kitSel").onchange = e => { settings.kit = e.target.value; kitChanged(); toast(`Switched to ${activeKit().name}`); };
  $("#kitName").onchange = e => { activeKit().name = e.target.value.trim() || "My kit"; kitChanged(); };
  $("#kitAdd").onclick = () => addPiece($("#kitAddType").value);
  $("#kitNew").onclick = () => {
    const pre = $("#kitNewPreset").value; let k;
    if (pre === "copy") { k = JSON.parse(JSON.stringify(activeKit())); k.id = kitUid(); k.name = activeKit().name + " (copy)"; }
    else k = makeKit(`Kit ${kits.length + 1}`, pre);
    kits.push(k); settings.kit = k.id; kitChanged(); toast(`Created "${k.name}". Rename it and set it up below.`);
  };
  $("#kitDel").onclick = () => {
    if (kits.length <= 1) { toast("You need at least one kit"); return; }
    const k = activeKit();
    if (kitDelArm !== k.id) { kitDelArm = k.id; toast(`Press Delete kit again to delete "${k.name}"`); setTimeout(()=>{ if (kitDelArm === k.id) kitDelArm = null; }, 3500); return; }
    kitDelArm = null; kits = kits.filter(x=>x.id!==k.id); settings.kit = kits[0].id; kitChanged(); toast(`Deleted "${k.name}"`);
  };
  renderKitEditor();
}
// Dragging a piece in the kit editor
function kitDragStart(e, svg, id){
  e.preventDefault();
  const kit = activeKit(), p = kit.pieces.find(x=>x.id===id); if (!p) return;
  const g = e.currentTarget, pt = svg.createSVGPoint();
  const toSvg = ev => { pt.x = ev.clientX; pt.y = ev.clientY; return pt.matrixTransform(svg.getScreenCTM().inverse()); };
  const start = toSvg(e), ox = p.cx, oy = p.cy;
  try { svg.setPointerCapture(e.pointerId); } catch(_) {}
  const move = ev => { const q = toSvg(ev); p.cx = Math.max(40, Math.min(840, Math.round(ox + q.x - start.x))); p.cy = Math.max(40, Math.min(570, Math.round(oy + q.y - start.y))); g.setAttribute("transform", `translate(${p.cx-ox} ${p.cy-oy})`); };
  const up = () => { svg.removeEventListener("pointermove", move); svg.removeEventListener("pointerup", up); svg.removeEventListener("pointercancel", up); kitChanged(); };
  svg.addEventListener("pointermove", move); svg.addEventListener("pointerup", up); svg.addEventListener("pointercancel", up);
}
