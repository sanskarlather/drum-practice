"use strict";
/* ---------- Lessons ---------- */
function pat(id, title, desc, bpm, bars, rows, beats=4){
  // rows: {drum: ["x...", ...] per bar, or a single string used for every bar}
  const spb = beats*4, notes = [];
  for (const [d, val] of Object.entries(rows)) {
    for (let b=0; b<bars; b++) {
      const s = Array.isArray(val) ? (val[b] ?? "") : val;
      for (let i=0; i<s.length && i<spb; i++) if (s[i]==="x") notes.push({s:b*spb+i, d});
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
];
let songs = store.get("songs", []);
const allSongs = () => [...LESSONS, ...songs];
const findSong = id => allSongs().find(s=>s.id===id);

