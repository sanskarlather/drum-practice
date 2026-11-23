"use strict";
/* ---------- Rudiments and daily basics ----------
 * Written as sticking, one token per grid step (sub = steps per beat):
 *   R / L      a stroke with the right / left hand       r / l   the same, as a ghost note (very soft)
 *   R>         an accented stroke                         .       nothing on this step
 *   fR  dR  zR flam, drag (two grace notes), buzz stroke (the main stroke is the hand shown)
 *   K / H      kick / hi-hat pedal                         @tom1   on another piece (default: snare)
 * The cycle repeats to fill whole bars; patterns that switch sides write both sides out.
 * Sources: the Percussive Arts Society's 40 International Drum Rudiments (names, grouping and stickings).
 */
const STK_RE = /^([fdz]?)([RLrlKH])(>?)(?:@(\w+))?$/;
function stkNotes(seq, spbTotal, def){
  const toks = seq.trim().split(/\s+/), out = [];
  for (let s = 0; s < spbTotal; s++) {
    const t = toks[s % toks.length]; if (t === ".") continue;
    const m = STK_RE.exec(t); if (!m) { console.warn("bad sticking token", t); continue; }
    const [, orn, hand, acc, on] = m;
    const n = { s };
    if (hand === "K") n.d = on || "kick"; else if (hand === "H") n.d = on || "hhp";
    else { n.d = on || def || "snare"; n.h = hand.toUpperCase(); }
    const a = orn === "f" ? "flam" : orn === "d" ? "drag" : orn === "z" ? "buzz" : acc ? "accent" : (hand === "r" || hand === "l") ? "ghost" : null;
    if (a) n.a = a;
    out.push(n);
  }
  return out;
}
// smallest number of 4/4 bars (1, 2 or 4) that a cycle of `len` steps fills exactly
function barsFor(len, spb){ for (const b of [1,2,4,8]) if ((b*spb) % len === 0) return b; return 2; }
function stkSong(o, kind){
  const beats = o.beats || 4, sub = o.sub || 4, spb = beats*sub, len = o.seq.trim().split(/\s+/).length;
  const bars = Math.max(o.bars || 0, barsFor(len, spb));
  const s = { id: o.id, title: o.name, desc: o.tip, bpm: o.bpm, bars, beats, notes: stkNotes(o.seq, bars*spb, o.on), builtin: true, kind, sticking: true,
    group: o.fam, goal: o.goal, no: o.no, seqText: o.seq.replace(/@\w+/g, "") };
  if (sub !== 4) s.sub = sub;
  if (o.click) s.click = o.click;
  return s;
}

const RUD_FAMILIES = ["Single-stroke rolls", "Multiple-bounce rolls", "Double-stroke rolls", "Diddles", "Flams", "Drags"];
const RUDIMENTS = [
  // I. Roll rudiments — A. single stroke
  { no:1,  name:"Single stroke roll",  fam:0, sub:4, bpm:70, goal:140, seq:"R L", tip:"Alternate hands evenly. Both hands the same height and the same volume." },
  { no:2,  name:"Single stroke four",  fam:0, sub:6, bpm:60, goal:120, seq:"R L R L . . L R L R . .", tip:"Three quick notes into the fourth. Switches lead hand each time." },
  { no:3,  name:"Single stroke seven", fam:0, sub:6, bpm:60, goal:110, seq:"R L R L R L R . . . . . L R L R L R L . . . . .", tip:"Six quick notes landing on the seventh, on the next beat." },
  // B. multiple bounce
  { no:4,  name:"Multiple bounce roll", fam:1, sub:4, bpm:60, goal:110, seq:"zR zL", tip:"Press each stroke into the head so it buzzes. Keep the buzzes the same length." },
  { no:5,  name:"Triple stroke roll",   fam:1, sub:6, bpm:55, goal:110, seq:"R R R L L L", tip:"Three strokes per hand, all the same volume." },
  // C. double stroke open roll
  { no:6,  name:"Double stroke open roll", fam:2, sub:4, bpm:60, goal:130, seq:"R R L L", tip:"Two even strokes per hand. The second stroke must be as loud as the first." },
  { no:7,  name:"Five stroke roll",     fam:2, sub:4, bpm:60, goal:120, seq:"R R L L R> . . . L L R R L> . . .", tip:"Two doubles, then an accent on the beat." },
  { no:8,  name:"Six stroke roll",      fam:2, sub:6, bpm:55, goal:110, seq:"R> L L R R L>", tip:"Accent at both ends, two doubles in the middle." },
  { no:9,  name:"Seven stroke roll",    fam:2, sub:6, bpm:55, goal:110, seq:"L L R R L L R> . . . . . R R L L R R L> . . . . .", tip:"Three doubles, then the accent." },
  { no:10, name:"Nine stroke roll",     fam:2, sub:4, bpm:60, goal:120, seq:"R R L L R R L L R> . . . . . . . L L R R L L R R L> . . . . . . .", tip:"Four doubles into the accent on beat 3." },
  { no:11, name:"Ten stroke roll",      fam:2, sub:4, bpm:60, goal:120, seq:"R R L L R R L L R> . . . L> . . .", tip:"Four doubles, then two accented single strokes." },
  { no:12, name:"Eleven stroke roll",   fam:2, sub:4, bpm:60, goal:120, seq:". . R R L L R R L L R R L> . . .", tip:"Five doubles leading into an accent on beat 4." },
  { no:13, name:"Thirteen stroke roll", fam:2, sub:4, bpm:60, goal:120, seq:"R R L L R R L L R R L L R> . . .", tip:"Six doubles into the accent." },
  { no:14, name:"Fifteen stroke roll",  fam:2, sub:4, bpm:60, goal:120, seq:". . R R L L R R L L R R L L R R L> . . . . . . . . . . . . . . .", tip:"Seven doubles landing on beat 1 of the next bar." },
  { no:15, name:"Seventeen stroke roll", fam:2, sub:4, bpm:60, goal:120, seq:"R R L L R R L L R R L L R R L L R> . . . . . . . . . . . . . . .", tip:"Eight doubles landing on beat 1 of the next bar." },
  // D. diddles
  { no:16, name:"Single paradiddle",    fam:3, sub:4, bpm:65, goal:130, seq:"R> L R R L> R L L", tip:"Accent the first note of each group. The double is soft and low." },
  { no:17, name:"Double paradiddle",    fam:3, sub:6, bpm:60, goal:120, seq:"R> L R L R R L> R L R L L", tip:"Two singles before the double. Accent the first note." },
  { no:18, name:"Triple paradiddle",    fam:3, sub:4, bpm:60, goal:120, seq:"R> L R L R L R R L> R L R L R L L", tip:"Four singles, then the double." },
  { no:19, name:"Paradiddle-diddle",    fam:3, sub:6, bpm:60, goal:120, seq:"R> L R R L L", tip:"Same hand leads every time. Great for moving around the toms later." },
  // II. flams
  { no:20, name:"Flam",                 fam:4, sub:4, bpm:60, goal:110, seq:"fR . fL .", tip:"Grace note low and soft, main stroke high and full. Not two hits at once." },
  { no:21, name:"Flam accent",          fam:4, sub:3, bpm:60, goal:120, seq:"fR L R fL R L", tip:"Flam on the beat, then two soft taps." },
  { no:22, name:"Flam tap",             fam:4, sub:4, bpm:60, goal:120, seq:"fR R fL L", tip:"Flam, then a tap with the same hand." },
  { no:23, name:"Flamacue",             fam:4, sub:4, bpm:60, goal:110, seq:"fR L> R L fR . . . fL R> L R fL . . .", tip:"Accent the second note, not the flam." },
  { no:24, name:"Flam paradiddle",      fam:4, sub:4, bpm:60, goal:110, seq:"fR L R R fL R L L", tip:"A paradiddle with a flam on the first note." },
  { no:25, name:"Single flammed mill",  fam:4, sub:4, bpm:60, goal:110, seq:"fR R L R fL L R L", tip:"Flam, then the same hand again." },
  { no:26, name:"Flam paradiddle-diddle", fam:4, sub:6, bpm:55, goal:110, seq:"fR L R R L L fL R L L R R", tip:"Paradiddle-diddle with a flam on the lead note." },
  { no:27, name:"Pataflafla",           fam:4, sub:4, bpm:55, goal:100, seq:"fR L R fL", tip:"Flams on the first and last note of each group." },
  { no:28, name:"Swiss Army triplet",   fam:4, sub:3, bpm:60, goal:120, seq:"fR R L", tip:"Flam, the same hand again, then the other hand." },
  { no:29, name:"Inverted flam tap",    fam:4, sub:4, bpm:55, goal:110, seq:"fR L fL R", tip:"The tap comes from the hand that just played the grace note." },
  { no:30, name:"Flam drag",            fam:4, sub:3, bpm:55, goal:100, seq:"fR dL R fL dR L", tip:"Flam, a drag on the other hand, then a tap." },
  // III. drags
  { no:31, name:"Drag",                 fam:5, sub:4, bpm:60, goal:110, seq:"dR . dL .", tip:"Two soft bounces from one hand right before the main stroke of the other." },
  { no:32, name:"Single drag tap",      fam:5, sub:4, bpm:60, goal:110, seq:"dR . L . dL . R .", tip:"Drag, then a tap with the other hand." },
  { no:33, name:"Double drag tap",      fam:5, sub:3, bpm:55, goal:100, seq:"dR dR L dL dL R", tip:"Two drags, then a tap." },
  { no:34, name:"Lesson 25",            fam:5, sub:4, bpm:60, goal:110, seq:"dR L R> . dL R L> .", tip:"Drag, tap, accent." },
  { no:35, name:"Single dragadiddle",   fam:5, sub:4, bpm:55, goal:110, seq:"dR L R R dL R L L", tip:"A paradiddle with a drag on the first note." },
  { no:36, name:"Drag paradiddle #1",   fam:5, sub:4, bpm:55, goal:100, seq:"R> . dR L R R . . L> . dL R L L . .", tip:"Accent, then a paradiddle starting with a drag." },
  { no:37, name:"Drag paradiddle #2",   fam:5, sub:4, bpm:55, goal:100, seq:"R> . dR . dR L R R L> . dL . dL R L L", tip:"Accent, two drags, then the paradiddle." },
  { no:38, name:"Single ratamacue",     fam:5, sub:6, bpm:55, goal:100, seq:"dR L R L> . . dL R L R> . .", tip:"Drag into a quick triplet, accent at the end." },
  { no:39, name:"Double ratamacue",     fam:5, sub:6, bpm:50, goal:95,  seq:"dR . . dR L R L> . . . . . dL . . dL R L R> . . . . .", tip:"Two drags, then the ratamacue." },
  { no:40, name:"Triple ratamacue",     fam:5, sub:6, bpm:50, goal:95,  seq:"dR . . dR . . dR L R L> . . dL . . dL . . dL R L R> . .", tip:"Three drags, then the ratamacue." },
].map(r => stkSong(Object.assign({ id: "R" + r.no }, r), "rudiment"));

/* Daily basics: the movements every beginner repeats daily for time, counting, hands, feet and independence. */
const BASIC_GROUPS = ["Time and counting", "Hands", "Feet", "Hands and feet together"];
const BASICS = [
  { id:"B1",  fam:0, name:"Quarter notes, count out loud", bpm:60, goal:120, sub:4, seq:"R . . . L . . .", tip:"Say 1 2 3 4 out loud with the click. Every hit exactly on the click." },
  { id:"B2",  fam:0, name:"8th notes: 1 & 2 &",           bpm:60, goal:130, sub:4, seq:"R . L .", tip:"Say \"1 & 2 &\". The & is exactly halfway between clicks." },
  { id:"B3",  fam:0, name:"16th notes: 1 e & a",          bpm:55, goal:110, sub:4, seq:"R L R L", tip:"Say \"1 e & a\". Keep all four notes evenly spaced." },
  { id:"B4",  fam:0, name:"Triplets: 1 trip let",         bpm:60, goal:120, sub:3, seq:"R L R L R L", tip:"Three even notes per click. The lead hand switches every beat." },
  { id:"B5",  fam:0, name:"Note ladder: 1, 2, 4 per beat", bpm:60, goal:110, sub:4, bars:4,
    seq:"R . . . L . . . R . . . L . . . R . L . R . L . R . L . R . L . R L R L R L R L R L R L R L R L R . L . R . L . R . L . R . L .", tip:"Quarters, 8ths, 16ths, then back to 8ths, without speeding up." },
  { id:"B6",  fam:0, name:"Keep time when the click drops out", bpm:70, goal:120, sub:4, bars:4, click:"gap", seq:"R . L .", tip:"The click plays bars 1 and 3 only. Keep the same tempo through the silent bars." },
  { id:"B7",  fam:0, name:"Click on 2 and 4",             bpm:70, goal:130, sub:4, click:"24", seq:"R . L . R . L .", tip:"The click is the backbeat. Feel it as beats 2 and 4, like a snare." },
  { id:"B8",  fam:1, name:"Right hand alone",             bpm:60, goal:130, sub:4, seq:"R . R .", tip:"One hand, even strokes. Let the stick bounce back up; don't press." },
  { id:"B9",  fam:1, name:"Left hand alone",              bpm:60, goal:130, sub:4, seq:"L . L .", tip:"Your weaker hand needs this most. Match the right hand's sound." },
  { id:"B10", fam:1, name:"Doubles in 8ths",              bpm:60, goal:120, sub:4, seq:"R . R . L . L .", tip:"Two strokes per hand, slow and even. This becomes the double stroke roll." },
  { id:"B11", fam:1, name:"Accent on the beat",           bpm:60, goal:120, sub:4, seq:"R> L R L", tip:"Accent high, taps low. Taps start close to the head." },
  { id:"B12", fam:1, name:"Moving accent",                bpm:55, goal:110, sub:4, bars:4, seq:"R> L R L R> L R L R> L R L R> L R L R L> R L R L> R L R L> R L R L> R L R L R> L R L R> L R L R> L R L R> L R L R L> R L R L> R L R L> R L R L>", tip:"The accent moves from 1 to e to & to a. Count out loud." },
  { id:"B13", fam:1, name:"Loud and soft: accents and ghosts", bpm:55, goal:100, sub:4, seq:"R> l r l L> r l r", tip:"Accents loud, ghost notes barely touching. Two clearly different levels." },
  { id:"B14", fam:1, name:"Around the toms",              bpm:55, goal:110, sub:4, seq:"R L R L R@tom1 L@tom1 R@tom1 L@tom1 R@tom2 L@tom2 R@tom2 L@tom2 R@floor L@floor R@floor L@floor", tip:"Move with your whole arm, not just the wrist. Keep the notes even across drums." },
  { id:"B15", fam:2, name:"Kick on every beat",           bpm:60, goal:120, sub:4, seq:"K . . .", tip:"Heel down or heel up, but the same every time. Let the beater come back off the head." },
  { id:"B16", fam:2, name:"Kick 1 and 3, hi-hat foot 2 and 4", bpm:60, goal:120, sub:4, seq:"K . . . H . . . K . . . H . . .", tip:"Both feet keeping time together." },
  { id:"B17", fam:2, name:"Kick in 8ths",                 bpm:55, goal:100, sub:4, seq:"K . K .", tip:"Two even kicks per beat. Small, relaxed movements." },
  { id:"B18", fam:3, name:"Hand and kick together",       bpm:60, goal:110, sub:4, seq:"R K L K", tip:"Hand on the beat, kick on the &. Even spacing between all hits." },
  { id:"B19", fam:3, name:"Hands, then kick (triplets)",  bpm:55, goal:100, sub:3, seq:"R L K", tip:"Right, left, kick, in even triplets. Every limb the same volume." },
];
const BASIC_PATTERNS = [
  // multi-limb grooves as kit rows (lesson format)
  pat("B20","Hi-hat 8ths with snare on 2 and 4","The right hand keeps going while the left joins in. Don't let the hi-hat stop on the snare.",60,2,{hihat:E8,snare:"....x.......x..."}),
  pat("B21","Four on the floor","Kick on every beat under the hi-hat and snare: hands and feet together.",65,2,{hihat:E8,kick:"x...x...x...x...",snare:"....x.......x..."}),
  pat("B22","All four limbs","Ride 8ths, kick 1 and 3, snare 2 and 4, hi-hat foot 2 and 4.",60,2,{ride:E8,kick:"x.......x.......",snare:"....x.......x...",hhp:"....x.......x..."}),
].map((s, i) => Object.assign(s, { kind:"basic", group:3, goal: 120, desc: s.desc }));
const BASIC_SONGS = [...BASICS.map(b => stkSong(Object.assign({}, b, { on: b.on }), "basic")), ...BASIC_PATTERNS];
