"use strict";
/* ---------- Lessons ---------- */
function pat(id, title, desc, bpm, bars, rows, beats=4){
  // rows: {drum: ["x...", ...] per bar, or a single string used for every bar}
  const spb = beats*4, notes = [];
  for (const [d, val] of Object.entries(rows)) {
    for (let b=0; b<bars; b++) {
      const s = Array.isArray(val) ? (val[b] ?? "") : val;
      // "x" = hit; other letters are articulations (see artic.js): X accent, g ghost, o open hi-hat, f flam, b bell…
      for (let i=0; i<s.length && i<spb; i++) { const c = s[i]; if (c==="x") notes.push({s:b*spb+i, d}); else if (TAB_TO_ARTIC[c]) notes.push({s:b*spb+i, d, a:TAB_TO_ARTIC[c]}); }
    }
  }
  return {id, title, desc, bpm, bars, beats, notes, builtin:true};
}
const Q = "x...x...x...x...", E8 = "x.x.x.x.x.x.x.x.";
const LESSONS = [
  pat("L1","1 · Meet the hi-hat","Right hand only. Four steady hits per bar.",70,2,{hihat:Q}),
  pat("L2","2 · Kick on 1 and 3","Add your right foot on the kick pedal.",70,2,{hihat:Q,kick:"x.......x......."}),
  pat("L3","3 · Snare on 2 and 4","Left hand on the snare instead of the kick.",70,2,{hihat:Q,snare:"....x.......x..."}),
  pat("L4","4 · Your first rock beat","Hi-hat, kick and snare together.",70,2,{hihat:Q,kick:"x.......x.......",snare:"....x.......x..."}),
  pat("L5","5 · 8th-note rock beat","Hi-hat twice as often. Count 1 & 2 & 3 & 4 &.",75,2,{hihat:E8,kick:"x.......x.......",snare:"....x.......x..."}),
  pat("L6","6 · Extra kick","A kick on the '& of 3' gives it bounce.",80,2,{hihat:E8,kick:"x.....x.x.......",snare:"....x.......x..."}),
  pat("L7","7 · Crash on one","Start each 2-bar phrase with the crash.",80,2,{crash:["x",""],hihat:[".x.x.x.x.x.x.x.x",E8],kick:"x.......x.......",snare:"....x.......x..."}),
  pat("L8","8 · First fill","Bar 2 ends with snare hits instead of the beat.",75,2,{hihat:[E8,"x.x.x.x."],kick:["x.......x.......","x......."],snare:["....x.......x...","....x...x.x.x.x."]}),
  pat("L9","9 · Around the toms","Snare, tom 1, tom 2, floor tom — then crash.",70,2,{crash:["x",""],hihat:[".x.x.x.x.x.x.x.x","x.x.x.x."],kick:["x.......x.......","x......."],snare:["....x.......x...","....x...xx......"],tom1:["","..........xx...."],tom2:["","............xx.."],floor:["","..............xx"]}),
  pat("L10","10 · Ride cymbal groove","Same beat, right hand moves to the ride.",85,2,{ride:E8,kick:"x.......x.x.....",snare:"....x.......x..."}),
  pat("L11","11 · Accents on the hi-hat","Hit the hi-hat harder on the beat (ACCENT) and softer on the &.",75,2,{hihat:"X.x.X.x.X.x.X.x.",kick:"x.......x.......",snare:"....x.......x..."}),
  pat("L12","12 · Open hi-hat","On the & of 4, lift your left foot (OPEN), then close it again on 1.",75,2,{hihat:"x.x.x.x.x.x.x.o.",hhp:"x...............",kick:"x.......x.......",snare:"....x.......x..."}),
  pat("L13","13 · Ghost notes","Tiny, soft snare taps (GHOST) between loud backbeats (ACCENT).",70,2,{hihat:E8,kick:"x.......x.x.....",snare:"....X..g.g..X..g"}),
  pat("L14","14 · Cross-stick and ride bell","A soft groove: cross-stick on the snare, bell on the ride.",80,2,{ride:"b.x.b.x.b.x.b.x.",kick:"x.....x.x.......",snare:"....c.......c..."}),
  pat("L15","15 · Flams and rimshots","Flams (FLAM) in the fill, a rimshot (RIM) on the backbeat.",70,2,{hihat:[E8,"x.x.x.x."],kick:["x.......x.......","x......."],snare:["....r.......r...","........f...f.f."],crash:["",""]}),
];
let songs = store.get("songs", []);
const allSongs = () => [...LESSONS, ...songs];
const findSong = id => allSongs().find(s=>s.id===id);

