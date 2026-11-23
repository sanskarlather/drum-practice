"use strict";
/* ---------- Song Compile ---------- */
function compile(song){
  const sub = song.sub||4, spb = (song.beats||4)*sub, total = song.bars*spb; // sub = steps per beat: 4 = 16ths, 3 = 8th triplets, 6 = 16th triplets, 8 = 32nds
  const bySt = new Map();
  const art = new Map(); // "step|drum" -> articulation
  const hOver = new Map(); // "step|drum" -> "R"|"L" when the song says which hand (rudiments)
  for (const n0 of song.notes) { const n = {s:n0.s, d:resolveDrum(n0.d)}; if (n.s<0||n.s>=total||!n.d) continue; if(!bySt.has(n.s)) bySt.set(n.s,new Set()); bySt.get(n.s).add(n.d); if (n0.a && articFits(n0.a, n.d)) art.set(n.s+"|"+n.d, n0.a); if (n0.h === "R" || n0.h === "L") hOver.set(n.s+"|"+n.d, n0.h); }
  const steps = [...bySt.keys()].sort((a,b)=>a-b);
  const events = []; let alt = 0;
  for (const s of steps) {
    const drums = [...bySt.get(s)].sort((a,b)=>DRUMS.findIndex(x=>x.id===a)-DRUMS.findIndex(x=>x.id===b));
    const hands = {};
    const handed = drums.filter(d=>D[d].hand);
    const isCym = d => D[d].kind==="cym";
    const cyms = handed.filter(isCym), drs = handed.filter(d=>!isCym(d));
    if (handed.length >= 2) {
      // one cymbal + one drum: cymbal right, drum left. Two drums: snare left, other right.
      if (cyms.length) { hands[cyms[0]]="R"; cyms.slice(1).forEach(c=>hands[c]="L"); drs.forEach(d=>hands[d]="L"); }
      else { const sn = drs.find(d=>D[d].type==="snare") || drs[0]; drs.forEach(d=>hands[d]= d===sn?"L":"R"); }
      alt = 0;
    } else if (handed.length === 1) {
      const d = handed[0];
      if (isCym(d)) { hands[d]="R"; alt=0; }
      else { hands[d] = alt%2===0 ? "R" : "L"; alt++; }
    }
    drums.forEach(d=>{ const o = hOver.get(s+"|"+d); if (o && D[d].hand) hands[d] = o; if (D[d].foot) hands[d] = D[d].foot; });
    events.push({s, drums, hands, notes:[]});
  }
  const notes = [];
  events.forEach((ev,i)=> { ev.art = {}; ev.drums.forEach(d=>{ const a = art.get(ev.s+"|"+d) || null; if (a) ev.art[d] = a; const n={s:ev.s,d,a,ev:i,j:null}; ev.notes.push(n); notes.push(n); }); });
  const stepMap = new Map(events.map((e,i)=>[e.s,i]));
  return {song, sub, spb, total, events, notes, stepMap};
}
const HAND_TXT = {R:"Right hand", L:"Left hand", RF:"Right foot", LF:"Left foot"};
const HAND_SHORT = {R:"R", L:"L", RF:"R foot", LF:"L foot"};

