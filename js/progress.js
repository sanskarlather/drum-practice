"use strict";
/* ---------- Progress: score, stars, XP, streaks, speed builder, daily routine, badges ----------
 * Everything is kept in this browser (localStorage "drumapp.progress"). Nothing is uploaded.
 *   P.songs[id] = { best, stars, score, bpm, plays, last }   best = best accuracy %, bpm = fastest tempo with ≥ 90 %
 *   P.days["YYYY-MM-DD"] = { sec, xp, items: {id: {passes, clean, stars}} }
 *   P.xp, P.badges {id: date}, P.routine {date, items:[{id, role}]}, P.routinesDone
 */
const P = Object.assign({ v:1, xp:0, songs:{}, days:{}, badges:{}, routine:null, routinesDone:0, best:{ combo:0 } }, store.get("progress", {}));
P.songs = P.songs || {}; P.days = P.days || {}; P.badges = P.badges || {}; P.best = P.best || { combo:0 };
// older versions kept only best accuracy per song
for (const [id, acc] of Object.entries(typeof bests === "object" ? bests : {})) if (!P.songs[id]) P.songs[id] = { best: acc, stars: starsFor(acc, false), score: 0, bpm: 0, plays: 1 };
settings.speed = settings.speed !== false;       // speed builder on by default
settings.goalMin = settings.goalMin || 15;        // daily minutes goal
settings.layout = settings.layout || "coach";     // arena | coach | focus
let progDirty = false;
const saveProgress = () => { store.set("progress", P); progDirty = false; };
const dayKey = (d = new Date()) => d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
function today(){ const k = dayKey(); if (!P.days[k]) P.days[k] = { sec:0, xp:0, items:{} }; return P.days[k]; }

/* ----- scoring ----- */
const POINTS = { perfect:100, good:70, ok:20, art:30, wait:50, miss:0 };
const multFor = streak => Math.min(4, 1 + Math.floor(streak / 8));
function starsFor(acc, waited){ const s = acc >= 95 ? 3 : acc >= 85 ? 2 : acc >= 70 ? 1 : 0; return waited ? Math.min(1, s) : s; }
function newPass(){ return { judged:0, good:0, perfect:0, miss:0, score:0, waited:false, hand:{ R:{n:0,g:0}, L:{n:0,g:0} }, t0: performance.now() }; }
// called by the engine for every judged note. kind: perfect | good | ok | art | wait | miss
function scoreHit(kind, n){
  const st = E.stats; if (!st) return;
  if (!E.pass1) E.pass1 = newPass();
  const ps = E.pass1, good = kind === "perfect" || kind === "good" || kind === "wait";
  const mult = good ? multFor(st.streak) : 1, pts = (POINTS[kind] || 0) * mult;
  st.score = (st.score || 0) + pts; st.mult = good ? multFor(st.streak) : 1;
  ps.judged++; if (good) ps.good++; if (kind === "perfect") ps.perfect++; if (kind === "miss") ps.miss++; if (kind === "wait") ps.waited = true; ps.score += pts;
  const ev = n && E.C.events[n.ev], hd = ev && ev.hands[n.d];
  if (hd === "R" || hd === "L") { ps.hand[hd].n++; if (good) ps.hand[hd].g++; st.hand = st.hand || { R:{n:0,g:0}, L:{n:0,g:0} }; st.hand[hd].n++; if (good) st.hand[hd].g++; }
  if (st.best > (P.best.combo || 0)) { P.best.combo = st.best; if (st.best >= 50) award("combo50"); }
  if (kind !== "miss" && pts) hudPop(pts, mult);
  renderHud();
}
// One pass through the song (a loop, or the end of the song). Returns a summary.
function passDone(final){
  const ps = E.pass1; E.pass1 = newPass();
  const C = E.C; if (!ps || !C || E.mode !== "practice") return null;
  const need = Math.max(4, Math.floor(C.notes.length * 0.5));
  if (ps.judged < need) return null; // they weren't really playing
  const song = C.song, acc = Math.round(100 * ps.good / ps.judged), stars = starsFor(acc, ps.waited);
  const rec = P.songs[song.id] || (P.songs[song.id] = { best:0, stars:0, score:0, bpm:0, plays:0 });
  const firstStars = stars > (rec.stars || 0), newBest = acc > (rec.best || 0), clean = acc >= 90 && !ps.waited;
  const fasterClean = clean && E.bpm > (rec.bpm || 0);
  rec.plays++; rec.last = Date.now(); rec.best = Math.max(rec.best || 0, acc); rec.stars = Math.max(rec.stars || 0, stars); rec.score = Math.max(rec.score || 0, ps.score);
  if (fasterClean) rec.bpm = E.bpm;
  bests[song.id] = rec.best; store.set("bests", bests);
  let xp = Math.round(ps.good + stars * 15 + (stars === 3 ? 10 : 0)); if (ps.waited) xp = Math.round(xp / 2);
  const d = today(), it = d.items[song.id] || (d.items[song.id] = { passes:0, clean:0, stars:0 });
  it.passes++; if (acc >= 70) it.clean++; it.stars = Math.max(it.stars, stars);
  P.xp += xp; d.xp += xp;
  // badges
  award("first"); if (stars === 3) award("three"); if (acc === 100 && ps.judged >= 16 && !ps.waited) award("perfect");
  if (clean && song.goal && E.bpm >= song.goal) award("speed");
  if (clean && song.id === "R16" && E.bpm >= 120) award("para120");
  checkCollectionBadges();
  const res = { acc, stars, xp, score: ps.score, newBest, firstStars, fasterClean, hand: ps.hand, waited: ps.waited, tempoMsg: "" };
  // speed builder: two clean passes in a row → 5 BPM faster, up to the goal; struggling → 5 BPM slower
  if (settings.speed && !final && !ps.waited) {
    E.cleanRun = clean ? (E.cleanRun || 0) + 1 : 0; E.badRun = acc < 60 ? (E.badRun || 0) + 1 : 0;
    const top = song.goal || Math.max(song.bpm + 40, 120);
    if (E.cleanRun >= 2 && E.bpm < top) { setTempo(Math.min(top, E.bpm + 5)); E.cleanRun = 0; res.tempoMsg = `Speed builder: ${E.bpm} BPM`; }
    else if (E.badRun >= 2 && E.bpm > Math.max(30, song.bpm - 20)) { setTempo(E.bpm - 5); E.badRun = 0; res.tempoMsg = `Slowed to ${E.bpm} BPM: get it clean first`; }
  }
  routineCheck(song.id);
  saveProgress(); renderHud(); renderSpeed();
  return res;
}
// practice time, counted only while the song is playing in practice mode
let lastTick = 0;
function progTick(){
  const t = performance.now();
  if (E.playing && E.mode === "practice" && !document.hidden && lastTick) { const dt = Math.min(1, (t - lastTick) / 1000); today().sec += dt; progDirty = true;
    const k = Math.floor(today().sec); if (k % 10 === 0 && progDirty) { saveProgress(); if (k >= settings.goalMin*60 && !today().goalHit) { today().goalHit = true; toast(`Daily goal reached: ${settings.goalMin} minutes`); award("goal"); } } }
  lastTick = t;
}
setInterval(progTick, 250);

/* ----- levels and streaks ----- */
const LEVEL_TITLES = [[1,"First sticks"],[3,"Beat keeper"],[5,"Groove builder"],[8,"Fill finder"],[12,"Rudiment runner"],[16,"Pocket player"],[20,"Drummer"]];
function levelInfo(xp = P.xp){ let n = 1; while (50*n*(n+1) <= xp) n++; const lo = 50*(n-1)*n, hi = 50*n*(n+1);
  const title = LEVEL_TITLES.filter(([l]) => l <= n).pop()[1]; return { n, title, into: xp - lo, need: hi - lo }; }
function dayActive(k){ const d = P.days[k]; return d && (d.sec >= 300 || d.routineDone); }
function streak(){
  let n = 0; const d = new Date(); if (!dayActive(dayKey(d))) d.setDate(d.getDate() - 1);
  while (dayActive(dayKey(d))) { n++; d.setDate(d.getDate() - 1); } return n;
}
function totalMinutes(){ return Math.round(Object.values(P.days).reduce((a, d) => a + (d.sec || 0), 0) / 60); }

/* ----- badges ----- */
const BADGES = [
  ["first","First pass","Play a song all the way through"], ["three","Three stars","Get 95% or more in a pass"],
  ["perfect","Flawless","100% in a pass of 16 notes or more"], ["combo50","On a roll","50 notes in a row"],
  ["goal","Daily goal","Practise for your daily minutes"], ["streak3","3-day streak","Practise 3 days in a row"],
  ["streak7","7-day streak","Practise a whole week in a row"], ["streak30","30-day streak","Practise 30 days in a row"],
  ["hour","One hour","Practise for 60 minutes in total"], ["tenhours","Ten hours","Practise for 10 hours in total"],
  ["routine1","Routine done","Finish a daily routine"], ["routine10","Ten routines","Finish 10 daily routines"],
  ["basics","Solid basics","Two stars on every daily basic"], ["rud10","Ten rudiments","Two stars on 10 rudiments"],
  ["rud40","All 40","Two stars on all 40 rudiments"], ["lessons","Lessons done","Two stars on every beginner lesson"],
  ["speed","Up to speed","Play a rudiment or basic cleanly at its goal tempo"], ["para120","Paradiddle 120","Single paradiddle clean at 120 BPM"],
];
function award(id){ if (P.badges[id]) return; P.badges[id] = dayKey(); const b = BADGES.find(x => x[0] === id); if (b) toast(`Badge: ${b[1]}`); saveProgress(); }
function checkCollectionBadges(){
  const st = id => (P.songs[id] && P.songs[id].stars) || 0;
  const s2 = list => list.filter(s => st(s.id) >= 2).length;
  if (s2(BASIC_SONGS) === BASIC_SONGS.length) award("basics");
  const r = s2(RUDIMENTS); if (r >= 10) award("rud10"); if (r >= 40) award("rud40");
  if (s2(LESSONS) === LESSONS.length) award("lessons");
  const s = streak(); if (s >= 3) award("streak3"); if (s >= 7) award("streak7"); if (s >= 30) award("streak30");
  const m = totalMinutes(); if (m >= 60) award("hour"); if (m >= 600) award("tenhours");
}

/* ----- daily routine ----- */
// The order a beginner meets the rudiments in (not the PAS numbering)
const RUD_ORDER = [1,6,16,20,31,4,2,5,22,21,7,24,17,19,8,9,10,11,13,3,28,25,27,29,32,34,35,33,38,12,14,15,18,23,26,30,36,37,39,40].map(n => "R" + n);
function routineFor(){
  const k = dayKey(); if (P.routine && P.routine.date === k) return P.routine;
  const st = id => (P.songs[id] && P.songs[id].stars) || 0, dayN = Math.floor(Date.now() / 86400000);
  const pick = (list, minStars, n, skip = []) => { const out = list.filter(s => st(s.id) < minStars && !skip.includes(s.id)).slice(0, n);
    const rest = list.filter(s => !out.includes(s) && !skip.includes(s.id)); while (out.length < n && rest.length) out.push(rest.splice((dayN + out.length*7) % rest.length, 1)[0]); return out; };
  const basicsList = BASIC_SONGS, rudList = RUD_ORDER.map(id => RUDIMENTS.find(r => r.id === id));
  const items = [];
  pick(basicsList, 3, 2).forEach(s => items.push({ id: s.id, role: "Warm-up" }));
  const learn = pick(rudList, 2, 1)[0]; items.push({ id: learn.id, role: "New rudiment" });
  const known = rudList.filter(r => st(r.id) >= 2 && r.id !== learn.id);
  items.push({ id: (known.length ? known[dayN % known.length] : rudList.find(r => r.id !== learn.id)).id, role: "Review" });
  const lesson = LESSONS.find(l => st(l.id) < 3) || LESSONS[dayN % LESSONS.length]; items.push({ id: lesson.id, role: "Groove" });
  const mine = songs.length ? (songs.find(s => s.id === settings.lastSong) || songs[dayN % songs.length]) : null;
  if (mine) items.push({ id: mine.id, role: "Your song" });
  P.routine = { date: k, items }; saveProgress(); return P.routine;
}
// an item is done today after 2 passes with 70 % or better
const itemDone = id => { const it = today().items[id]; return !!it && it.clean >= 2; };
function routineCheck(id){
  const r = routineFor(); if (!r.items.some(i => i.id === id)) return;
  const done = r.items.filter(i => itemDone(i.id)).length;
  if (itemDone(id) && !r.told) r.told = {};
  if (itemDone(id) && !r.told[id]) { r.told[id] = 1;
    const next = r.items.find(i => !itemDone(i.id));
    toast(next ? `Routine: ${done} of ${r.items.length} done. Next: ${findSong(next.id).title}` : "Daily routine finished!");
  }
  if (done === r.items.length && !today().routineDone) { today().routineDone = true; P.routinesDone++; P.xp += 50; today().xp += 50; award("routine1"); if (P.routinesDone >= 10) award("routine10"); }
  renderRoutineNext();
}
function routineNextItem(){ const r = routineFor(); return r.items.find(i => !itemDone(i.id)); }
function startRoutineItem(it){ const s = findSong(it.id); if (!s) return; E.routine = true; loadSong(s); const rec = P.songs[s.id];
  // carry on from the fastest clean tempo, a little slower to warm up
  if (settings.speed && rec && rec.bpm) setTempo(Math.max(s.bpm, Math.min(rec.bpm - 5, s.goal || 240)));
  show("practice"); }
function renderRoutineNext(){
  const b = $("#routineNext"); if (!b) return; const it = E.routine && routineNextItem();
  const cur = E.C && E.C.song.id;
  b.hidden = !it || it.id === cur && !itemDone(cur);
  if (it) b.textContent = itemDone(cur) || it.id !== cur ? "Next: " + findSong(it.id).title : "";
}
