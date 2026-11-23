"use strict";
/* ---------- Kit Svg ---------- */
const kitSvg = $("#kit");
const pieceEls = {};
function buildKit(){
  const s = kitSvg; s.innerHTML = "";
  const defs = el("defs",{},s);
  const cg = el("radialGradient",{id:"cymg"},defs);
  [["0","#6B5418"],["0.07","#6B5418"],["0.08","#E9C766"],["0.3","#C49C3C"],["0.46","#E3BE58"],["0.62","#B88F33"],["0.8","#DDB652"],["1","#A57F2B"]].forEach(([o,c])=>el("stop",{offset:o,"stop-color":c},cg));
  const hg = el("radialGradient",{id:"headg",cx:"0.4",cy:"0.35"},defs);
  [["0","#FAF8F3"],["0.6","#E6E1D6"],["1","#CFC8B8"]].forEach(([o,c])=>el("stop",{offset:o,"stop-color":c},hg));
  const fg = el("radialGradient",{id:"floorg",cx:"0.5",cy:"0.55"},defs);
  [["0","#1E2028"],["0.7","#15171C"],["1","#111317"]].forEach(([o,c])=>el("stop",{offset:o,"stop-color":c},fg));
  el("ellipse",{cx:440,cy:300,rx:400,ry:280,fill:"url(#floorg)"},s);
  // seat
  el("circle",{cx:600,cy:540,r:24,fill:"#23262E",stroke:"#3A3F4A","stroke-width":2},s);
  const st = el("text",{x:632,y:545,fill:"#8C929D","font-size":14},s); st.textContent="You sit here";
  // kick body (under toms)
  const kb = el("g",{},s);
  el("rect",{x:330,y:232,width:220,height:150,rx:28,fill:"#2E2218",stroke:D.kick.color,"stroke-width":6,opacity:.8},kb);
  const kbt = el("text",{x:440,y:368,"text-anchor":"middle",fill:"#C9CDD4","font-size":13,"font-weight":600},kb); kbt.textContent="Bass drum";
  const order = ["crash","ride","tom1","tom2","floor","snare","hihat","kick","hhp"];
  for (const id of order) {
    const d = D[id]; const g = el("g",{class:"piece","data-d":id},s);
    const p = {g};
    p.glow = el("circle",{cx:d.cx,cy:d.cy,r:d.r+24,fill:d.color,class:"glowc"},g);
    if (d.kind==="cym") {
      p.body = el("g",{class:"body"},g);
      el("circle",{cx:d.cx,cy:d.cy,r:d.r,fill:"url(#cymg)"},p.body);
      el("circle",{cx:d.cx,cy:d.cy,r:d.r-1,fill:"none",stroke:d.color,"stroke-width":3,opacity:.9},p.body);
    } else if (d.kind==="drum") {
      p.body = el("g",{class:"body"},g);
      el("circle",{cx:d.cx,cy:d.cy,r:d.r,fill:d.color},p.body);
      el("circle",{cx:d.cx,cy:d.cy,r:d.r-10,fill:"url(#headg)",stroke:"#9A9488","stroke-width":2},p.body);
    } else {
      // pedals
      const w = id==="kick"?72:58, hgt = id==="kick"?104:92;
      p.body = el("g",{class:"body"},g);
      el("rect",{x:d.cx-w/2,y:d.cy-hgt/2,width:w,height:hgt,rx:12,fill:"#2A2D35",stroke:d.color,"stroke-width":4},p.body);
      for (let i=0;i<4;i++) el("line",{x1:d.cx-w/2+12,x2:d.cx+w/2-12,y1:d.cy-hgt/2+22+i*16,y2:d.cy-hgt/2+22+i*16,stroke:"#3A3F4A","stroke-width":3},p.body);
    }
    p.next = el("circle",{cx:d.cx,cy:d.cy,r:d.r+9,fill:"none",stroke:d.color,"stroke-width":3,"stroke-dasharray":"8 7",opacity:0},g);
    p.ring = el("circle",{cx:d.cx,cy:d.cy,r:d.r,fill:"none",stroke:d.color,"stroke-width":7,opacity:0},g);
    p.hit = el("text",{x:d.cx,y:d.cy-(d.kind==="drum"||d.kind==="cym"?d.r*0.12:28),"text-anchor":"middle","dominant-baseline":"middle","font-family":"Space Grotesk, sans-serif","font-weight":700,"font-size":Math.max(20,Math.round(d.r*0.42)),fill:"#0E0F12",opacity:0},g);
    p.hit.textContent = "HIT";
    // hand chip
    p.chip = el("g",{opacity:0},g);
    const cy = d.kind==="drum"||d.kind==="cym" ? d.cy + d.r*0.42 : d.cy + 4;
    p.chipRect = el("rect",{x:d.cx-46,y:cy-15,width:92,height:30,rx:15,fill:"#F2F2F0"},p.chip);
    p.chipDot = el("circle",{cx:d.cx-31,cy:cy,r:11,fill:d.color},p.chip);
    p.chipL = el("text",{x:d.cx-31,y:cy+1,"text-anchor":"middle","dominant-baseline":"middle","font-size":12,"font-weight":800,fill:"#0E0F12"},p.chip);
    p.chipT = el("text",{x:d.cx-16,y:cy+1,"dominant-baseline":"middle","font-size":13,"font-weight":700,fill:"#0E0F12"},p.chip);
    p.nextTxt = el("text",{x:d.cx,y:d.cy+1,"text-anchor":"middle","dominant-baseline":"middle","font-size":13,"font-weight":800,fill:d.color,opacity:0,stroke:"#0E0F12","stroke-width":4,"paint-order":"stroke"},g);
    p.nextTxt.textContent = "NEXT";
    // label
    const ly = id==="kick" ? d.cy+68 : id==="hhp" ? d.cy+60 : d.cy+d.r+18;
    const lbl = id==="kick" ? "Kick pedal" : d.name;
    const lw = lbl.length*8+26;
    p.lblR = el("rect",{x:d.cx-lw/2,y:ly-13,width:lw,height:26,rx:13,fill:"#0E0F12",stroke:d.color,"stroke-width":1.5},g);
    p.lblT = el("text",{x:d.cx,y:ly+1,"text-anchor":"middle","dominant-baseline":"middle","font-size":13,"font-weight":700,fill:"#F2F2F0"},g);
    p.lblT.textContent = lbl;
    g.addEventListener("pointerdown", e=>{ e.preventDefault(); audio(); onHit(id, 0.9, performance.now(), "tap"); });
    pieceEls[id] = p;
  }
  kitSvg.floatLayer = el("g",{},s);
}
function setChip(id, hand){
  const p = pieceEls[id]; if (!hand) { p.chip.setAttribute("opacity",0); return; }
  p.chip.setAttribute("opacity",1);
  p.chipL.textContent = hand.startsWith("R")?"R":"L";
  p.chipT.textContent = hand.endsWith("F") ? (hand==="RF"?"R foot":"L foot") : (hand==="R"?"Right":"Left");
}
function flashPiece(id){ const p = pieceEls[id]; if(!p) return; p.g.classList.add("flash"); setTimeout(()=>p.g.classList.remove("flash"),110); }
function floatText(id, txt, color){
  const d = D[id]; const t = el("text",{x:d.cx,y:(d.kind==="kick"||d.kind==="pedal")?d.cy-62:d.cy-d.r-10,"text-anchor":"middle",fill:color,class:"float",stroke:"#0E0F12","stroke-width":5,"paint-order":"stroke"},kitSvg.floatLayer);
  t.textContent = txt; setTimeout(()=>t.remove(), 750);
}

