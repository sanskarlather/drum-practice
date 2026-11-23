"use strict";
/* ---------- Song Compile ---------- */
function compile(song){
  const spb = (song.beats||4)*4, total = song.bars*spb;
  const bySt = new Map();
  for (const n of song.notes) { if (n.s<0||n.s>=total||!D[n.d]) continue; if(!bySt.has(n.s)) bySt.set(n.s,new Set()); bySt.get(n.s).add(n.d); }
  const steps = [...bySt.keys()].sort((a,b)=>a-b);
  const events = []; let alt = 0;
  for (const s of steps) {
    const drums = [...bySt.get(s)].sort((a,b)=>DRUMS.findIndex(x=>x.id===a)-DRUMS.findIndex(x=>x.id===b));
    const hands = {};
    const handed = drums.filter(d=>D[d].hand);
    const cyms = handed.filter(d=>CYMBALS.has(d)), drs = handed.filter(d=>!CYMBALS.has(d));
    if (handed.length >= 2) {
      // one cymbal + one drum: cymbal right, drum left. Two drums: snare left, other right.
      if (cyms.length) { hands[cyms[0]]="R"; cyms.slice(1).forEach(c=>hands[c]="L"); drs.forEach(d=>hands[d]="L"); }
      else { const sn = drs.includes("snare")?"snare":drs[0]; drs.forEach(d=>hands[d]= d===sn?"L":"R"); }
      alt = 0;
    } else if (handed.length === 1) {
      const d = handed[0];
      if (CYMBALS.has(d)) { hands[d]="R"; alt=0; }
      else { hands[d] = alt%2===0 ? "R" : "L"; alt++; }
    }
    if (drums.includes("kick")) hands.kick = "RF";
    if (drums.includes("hhp")) hands.hhp = "LF";
    events.push({s, drums, hands, notes:[]});
  }
  const notes = [];
  events.forEach((ev,i)=> ev.drums.forEach(d=>{ const n={s:ev.s,d,ev:i,j:null}; ev.notes.push(n); notes.push(n); }));
  const stepMap = new Map(events.map((e,i)=>[e.s,i]));
  return {song, spb, total, events, notes, stepMap};
}
const HAND_TXT = {R:"Right hand", L:"Left hand", RF:"Right foot", LF:"Left foot"};
const HAND_SHORT = {R:"R", L:"L", RF:"R foot", LF:"L foot"};

