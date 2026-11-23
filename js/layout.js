"use strict";
/* ---------- Play-screen layouts ----------
 * arena: score, combo and stars on top, the kit, and a lane showing the next two beats
 * coach: the kit with big Now / Next cards that say which hand and how to play it
 * focus ("Hands"): a big sticking row, left and right hand pads, per-hand scores and the speed builder
 * A phone held sideways gets a full-screen kit automatically (CSS, any layout).
 */
function applyLayout(){
  const v = $("#view-practice"), L = settings.layout;
  v.classList.remove("lay-arena", "lay-coach", "lay-focus"); v.classList.add("lay-" + L);
  document.querySelectorAll("[data-lay]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.lay === L)));
  layoutSong(); if (E.C) updateFrame(true);
}
function renderHud(){
  const st = E.stats; if (!st || !$("#hudScore")) return;
  $("#hudScore").textContent = (st.score || 0).toLocaleString();
  const m = st.streak ? multFor(st.streak) : 1;
  $("#hudMult").textContent = "×" + m; $("#hudCombo").textContent = "combo " + st.streak; $("#hudMultBox").classList.toggle("hot", m > 1);
  const acc = st.judged ? Math.round(100 * st.good / st.judged) : null;
  $("#hudAcc").textContent = acc == null ? "–" : acc + "%";
  const stars = acc == null ? 0 : starsFor(acc, settings.wait);
  document.querySelectorAll("#hudStars svg").forEach((e, i) => e.classList.toggle("on", i < stars));
  $("#hudStars").setAttribute("aria-label", `${stars} star${stars === 1 ? "" : "s"} so far`);
  const hd = st.hand || { R:{n:0}, L:{n:0} }, pc = x => x.n ? Math.round(100 * x.g / x.n) + "%" : "–";
  $("#hudR").textContent = pc(hd.R); $("#hudL").textContent = pc(hd.L);
}
let popT = 0;
function hudPop(pts, mult){
  const p = $("#hudPop"); if (!p) return; p.textContent = "+" + pts + (mult > 1 ? " ×" + mult : "");
  p.classList.remove("go"); void p.offsetWidth; p.classList.add("go"); clearTimeout(popT); popT = setTimeout(() => p.classList.remove("go"), 700);
}

/* ----- per song: sticking cells, lane rows, speed ladder ----- */
let LAY = { bars: [], rows: [] };
function layoutSong(){
  const C = E.C; if (!C) return;
  // sticking cells per bar: every step where a hand plays
  LAY.bars = [];
  for (let b = 0; b < C.song.bars; b++) LAY.bars.push(C.events.filter(ev => Math.floor(ev.s / C.spb) === b && ev.drums.some(d => ev.hands[d] === "R" || ev.hands[d] === "L")));
  LAY.bar = -1; LAY.cur = null;
  const used = new Set(C.notes.map(n => n.d));
  LAY.rows = DRUMS.filter(d => used.has(d.id)).sort((a, b) => a.staff - b.staff).slice(0, 7).map(d => d.id);
  renderSpeed(); renderHud();
}
const syl = (C, s) => { const cs = COUNT_SYL[C.sub] || COUNT_SYL[4], k = s % C.sub; return k === 0 ? String(Math.floor((s % C.spb) / C.sub) + 1) : k % cs.w === 0 ? cs.l[k / cs.w] : ""; };
function renderStick(bar, curEv){
  const C = E.C, row = $("#stickRow"); const evs = LAY.bars[bar] || [];
  if (LAY.bar !== bar) {
    LAY.bar = bar; row.innerHTML = ""; row.style.setProperty("--n", Math.max(4, Math.min(evs.length, 16)));
    row.classList.toggle("dense", evs.length > 12);
    if (!evs.length) { row.innerHTML = '<p class="muted" style="margin:0">No hand notes in this bar.</p>'; }
    for (const ev of evs) {
      const hands = [...new Set(ev.drums.map(d => ev.hands[d]).filter(x => x === "R" || x === "L"))];
      const arts = ev.drums.map(d => ev.art[d]).filter(Boolean);
      const top = arts.includes("accent") ? "&gt;" : arts.includes("flam") ? "flam" : arts.includes("drag") ? "drag" : arts.includes("buzz") ? "buzz" : arts.includes("ghost") ? "( )" : "";
      const c = h("div", { class: "cell" + (hands.length === 1 ? " h" + hands[0] : ""), "data-s": ev.s }, `<i>${top}</i><b>${hands.join("")}</b><span>${syl(C, ev.s)}</span>`);
      row.appendChild(c);
    }
  }
  const cs = curEv ? curEv.s : null;
  if (LAY.cur !== cs) { LAY.cur = cs; row.querySelectorAll(".cell").forEach(c => { const s = +c.dataset.s; c.classList.toggle("now", s === cs); c.classList.toggle("past", cs != null && s < cs); }); }
}
function renderSpeed(){
  const C = E.C, lad = $("#speedLad"); if (!C || !lad) return;
  const song = C.song, goal = song.goal || Math.max(song.bpm + 40, 120), rec = P.songs[song.id] || {};
  const stepBy = (goal - song.bpm) / 5 > 12 ? 10 : 5, steps = [];
  for (let b = song.bpm; b < goal; b += stepBy) steps.push(b); steps.push(goal);
  lad.innerHTML = steps.map(b => `<div class="${b <= (rec.bpm || 0) ? "done" : ""} ${b === E.bpm || (b < E.bpm && E.bpm < b + stepBy) ? "now" : ""}"><i></i><span>${b}</span></div>`).join("");
  $("#speedTxt").textContent = !settings.speed ? "Off (turn it on under Sounds)" : rec.bpm >= goal ? `Goal reached: ${rec.bpm} BPM clean` : `2 clean loops (90%+) at ${E.bpm} BPM to move up · goal ${goal}` + (rec.bpm ? ` · best clean ${rec.bpm}` : "");
}
// called every frame from updateFrame()
function layoutFrame(pos, curEv, litSet){
  const L = settings.layout, C = E.C; if (!C) return;
  if (L === "focus") {
    const bar = Math.max(0, Math.min(C.song.bars - 1, Math.floor(Math.max(0, pos) / C.spb)));
    renderStick(bar, curEv);
    const lh = new Set(); if (curEv) for (const d of litSet) lh.add(curEv.hands[d]);
    const art = curEv ? curEv.drums.map(d => litSet.has(d) && curEv.art[d]).find(Boolean) : null;
    for (const side of ["L", "R"]) { const p = $("#pad" + side); p.classList.toggle("lit", lh.has(side)); p.querySelector("span").textContent = (side === "L" ? "Left" : "Right") + " hand" + (lh.has(side) && art ? " · " + ARTICS[art].short : ""); }
  }
  if (L === "arena") drawLane(pos);
}
function drawLane(pos){
  const cv = $("#lane"), C = E.C; if (!cv || cv.offsetParent === null) return;
  const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
  if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  const rows = LAY.rows, rh = (H - 12) / Math.max(1, rows.length), hitX = W * 0.12, span = C.sub * 2, px = (W - hitX - 12) / span;
  // beat lines
  g.lineWidth = 1;
  for (let s = Math.ceil(pos - C.sub * 0.5); s <= pos + span; s++) { if (((s % C.sub) + C.sub) % C.sub) continue; const x = hitX + (s - pos) * px; g.strokeStyle = ((s % C.spb) + C.spb) % C.spb === 0 ? "#4A4F5A" : "#2A2D35"; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  rows.forEach((d, i) => { const y = 6 + rh * (i + 0.5); g.strokeStyle = "#23262E"; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); });
  g.fillStyle = "#FFB547"; g.fillRect(hitX - 1.5, 0, 3, H);
  const r = Math.max(4, Math.min(9, rh * 0.36));
  const drawN = (n, s) => { const i = rows.indexOf(n.d); if (i < 0) return; const x = hitX + (s - pos) * px; if (x < -10 || x > W + 10) return;
    const y = 6 + rh * (i + 0.5); g.globalAlpha = n.j ? (n.j === "miss" ? 0.35 : 0.15) : 1; g.fillStyle = n.j === "miss" ? "#7A808C" : D[n.d].color;
    g.beginPath(); g.arc(x, y, n.a === "accent" ? r * 1.25 : n.a === "ghost" ? r * 0.65 : r, 0, Math.PI * 2); g.fill();
    if (n.a === "open") { g.strokeStyle = "#0E0F12"; g.lineWidth = 2; g.beginPath(); g.arc(x, y, r * 0.5, 0, Math.PI * 2); g.stroke(); } g.globalAlpha = 1; };
  for (const n of C.notes) { if (n.s > pos + span + 1) break; if (n.s >= pos - C.sub) drawN(n, n.s); }
  if (settings.loop && pos + span > C.total) for (const n of C.notes) { if (n.s + C.total > pos + span + 1) break; drawN({ d: n.d, a: n.a, j: null }, n.s + C.total); }
}
document.querySelectorAll("[data-lay]").forEach(b => b.onclick = () => { settings.layout = b.dataset.lay; saveSettings(); applyLayout(); });
window.addEventListener("resize", () => { if (settings.layout === "arena" && E.C) drawLane(E.pos); });
