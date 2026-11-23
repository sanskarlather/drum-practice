"use strict";
/* ---------- Sheet ---------- */
const SW = 22, BARPAD = 18, SX0 = 56;
const sx = (s, spb) => SX0 + s*SW + Math.floor(s/spb)*BARPAD;
let sheetHead=null, sheetBar=null;
function renderSheet(){
  const C = E.C, svg = $("#sheet"); svg.innerHTML = "";
  const W = sx(C.total, C.spb) + 30; svg.setAttribute("width", W); svg.setAttribute("height", 176); svg.setAttribute("viewBox", `0 -22 ${W} 176`);
  sheetBar = el("rect",{x:0,y:-18,width:C.spb*SW+BARPAD,height:170,rx:8,fill:"#FFB547","fill-opacity":0.08},svg);
  for (let i=0;i<5;i++) el("line",{x1:16,x2:W-20,y1:40+i*12,y2:40+i*12,stroke:"#4A4F5A","stroke-width":1.2},svg);
  el("rect",{x:20,y:52,width:4,height:24,fill:"#C9CDD4"},svg); el("rect",{x:28,y:52,width:4,height:24,fill:"#C9CDD4"},svg);
  for (let b=0;b<=C.song.bars;b++){ const x = sx(b*C.spb, C.spb) - (b? BARPAD/2 + SW/2 : 12); el("line",{x1:x,x2:x,y1:40,y2:88,stroke:"#7A808C","stroke-width": b===C.song.bars?3:1.4},svg); if (b<C.song.bars){ const t=el("text",{x:x+4,y:20,fill:"#8C929D","font-size":11,"font-family":"JetBrains Mono, monospace"},svg); t.textContent=b+1; } }
  // notes per beat groups
  const up = new Map(), down = new Map();
  for (const ev of C.events) for (const d of ev.drums) { const m = D[d].hand ? up : down; if(!m.has(ev.s)) m.set(ev.s,[]); m.get(ev.s).push(d); }
  const artAt = new Map(); for (const ev of C.events) for (const d in ev.art) artAt.set(ev.s+"|"+d, ev.art[d]);
  const marks = new Map(); // "step|up" -> [sign…] drawn above (hands) or below (feet) the notes
  const txt = (x, y, t, size, anchor) => { const e = el("text",{x,y,"text-anchor":anchor||"middle","font-size":size||13,"font-weight":700,fill:"#F2F2F0","font-family":"Inter, sans-serif"},svg); e.textContent = t; return e; };
  const drawHead = (d, x, s, isUp) => {
    const y = D[d].staff, col = "#F2F2F0", a = artAt.get(s+"|"+d);
    if (y < 40 || y > 88) { for (let ly = y<40?28:100; y<40 ? ly>=y : ly<=y; ly += y<40?-12:12) if (ly%12===4) el("line",{x1:x-9,x2:x+9,y1:ly,y2:ly,stroke:"#7A808C","stroke-width":1.2},svg); }
    if (a === "bell") el("path",{d:`M${x-6} ${y}L${x} ${y-6}L${x+6} ${y}L${x} ${y+6}Z`,fill:"none",stroke:col,"stroke-width":2},svg);       // ride bell: diamond
    else if (D[d].x || a === "xstick") { el("path",{d:`M${x-5} ${y-5}L${x+5} ${y+5}M${x+5} ${y-5}L${x-5} ${y+5}`,stroke:col,"stroke-width":2},svg); if (D[d].type==="crash" || a === "xstick") el("circle",{cx:x,cy:y,r:8,fill:"none",stroke:col,"stroke-width":1.3},svg); }
    else el("ellipse",{cx:x,cy:y,rx:6,ry:4.5,fill:col,transform:`rotate(-20 ${x} ${y})`},svg);
    if (a === "ghost") { txt(x-11, y+5, "(", 15); txt(x+11, y+5, ")", 15); }
    if (a === "rim") el("line",{x1:x-9,y1:y+6,x2:x+9,y2:y-6,stroke:col,"stroke-width":1.6},svg);                                        // slashed head
    if (a === "flam") { el("ellipse",{cx:x-12,cy:y-1,rx:3.4,ry:2.6,fill:col,transform:`rotate(-20 ${x-12} ${y-1})`},svg); el("line",{x1:x-9,y1:y-2,x2:x-9,y2:y-15,stroke:col,"stroke-width":1},svg); el("line",{x1:x-13,y1:y-6,x2:x-5,y2:y-13,stroke:col,"stroke-width":1},svg); }
    if (a === "choke") txt(x+13, y+4, "+", 13);
    if (a === "accent" || a === "open") { const k = s+"|"+isUp; if (!marks.has(k)) marks.set(k, []); marks.get(k).push(a === "accent" ? ">" : "o"); }
  };
  const beams = (map, isUp) => {
    const groups = new Map();
    for (const [s, ds] of map) {
      const x = sx(s, C.spb); ds.forEach(d=>drawHead(d,x,s,isUp));
      const ys = ds.map(d=>D[d].staff);
      const tip = isUp ? 6 : 128, root = isUp ? Math.max(...ys) : Math.min(...ys);
      const stx = isUp ? x+5 : x-5;
      el("line",{x1:stx,x2:stx,y1:root,y2:tip,stroke:"#F2F2F0","stroke-width":1.5},svg);
      const g = Math.floor(s/4); if(!groups.has(g)) groups.set(g,[]); groups.get(g).push({s,x:stx});
    }
    for (const [, arr] of groups) {
      arr.sort((a,b)=>a.s-b.s); const tip = isUp?6:128, tip2 = isUp?12:122;
      if (arr.length>1) {
        el("line",{x1:arr[0].x,x2:arr[arr.length-1].x,y1:tip,y2:tip,stroke:"#F2F2F0","stroke-width":4},svg);
        for (let i=0;i<arr.length;i++){ const a=arr[i]; if (a.s%2===1) { const nb = arr[i+1] && arr[i+1].s===a.s+1 ? arr[i+1] : arr[i-1] && arr[i-1].s===a.s-1 ? arr[i-1] : null; const x2 = nb ? nb.x : a.x + (i? -8 : 8); el("line",{x1:a.x,x2:x2,y1:tip2,y2:tip2,stroke:"#F2F2F0","stroke-width":4},svg); } }
      } else if (arr[0].s % 4 !== 0 || (arr[0].s%2===1)) {
        const a = arr[0]; el("path",{d: isUp?`M${a.x} ${tip} q10 8 8 20`:`M${a.x} ${tip} q10 -8 8 -20`,fill:"none",stroke:"#F2F2F0","stroke-width":2},svg);
      }
    }
  };
  beams(up,true); beams(down,false);
  for (const [k, signs] of marks) { const [s, isUp] = k.split("|"); const x = sx(+s, C.spb) + (isUp === "true" ? 5 : -5);
    [...new Set(signs)].forEach((g, i) => txt(x, isUp === "true" ? -4 - i*12 : 146 + i*12, g, g === ">" ? 14 : 12)); }
  sheetHead = el("line",{x1:0,x2:0,y1:-16,y2:150,stroke:"#FFB547","stroke-width":2.5},svg);
  moveSheetHead(0);
}
function moveSheetHead(pos){
  if (!sheetHead || !E.C) return; const C = E.C; const p = Math.max(0,pos);
  const s = Math.floor(p), f = p - s;
  const x = sx(s, C.spb) + f*SW;
  sheetHead.setAttribute("x1",x); sheetHead.setAttribute("x2",x);
  const bar = Math.min(C.song.bars-1, Math.floor(p/C.spb));
  sheetBar.setAttribute("x", sx(bar*C.spb, C.spb) - SW/2 - BARPAD/2);
  const sc = $("#sheetScroll"); if (E.playing && sc.scrollWidth > sc.clientWidth) { const target = x - sc.clientWidth*0.3; if (Math.abs(sc.scrollLeft - target) > 4) sc.scrollLeft = target; }
}
function applyView(){
  const v = settings.view;
  document.querySelectorAll(".seg [data-v]").forEach(b=>b.setAttribute("aria-pressed", b.dataset.v===v));
  $("#kitbox").hidden = v==="sheet"; $("#sheetbox").hidden = v==="kit";
}

