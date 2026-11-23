"use strict";
/* ---------- Today screen + library sections for rudiments and daily basics ---------- */
const STAR_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l3 7 7 .6-5.3 4.7 1.7 7.2L12 17.8 5.6 21.5l1.7-7.2L2 9.6 9 9z"/></svg>';
const starsHtml = n => `<span class="stars" aria-label="${n} of 3 stars">${[0,1,2].map(i => STAR_SVG.replace("<svg", `<svg class="${i < n ? "on" : ""}"`)).join("")}</span>`;
function renderToday(){
  checkCollectionBadges();
  const d = new Date(), td = today(), lv = levelInfo();
  $("#tDate").textContent = d.toLocaleDateString(undefined, { weekday:"long", day:"numeric", month:"long" });
  $("#tStreak").textContent = streak();
  $("#tMin").textContent = Math.floor(td.sec / 60); $("#tMinOf").textContent = `of ${settings.goalMin} min today`;
  $("#tLevel").textContent = "Level " + lv.n; $("#tLevelTitle").textContent = lv.title;
  $("#tXpBar").style.width = Math.round(100 * lv.into / lv.need) + "%"; $("#tXp").textContent = `${lv.into} / ${lv.need} XP to level ${lv.n + 1}`;
  $("#tGoal").value = settings.goalMin;
  // routine
  const r = routineFor(), box = $("#tRoutine"); box.innerHTML = "";
  r.items.forEach((it, i) => {
    const s = findSong(it.id); if (!s) return; const done = itemDone(it.id), ti = td.items[it.id] || { clean:0 }, rec = P.songs[it.id] || {};
    const row = h("div", { class: "t-item" + (done ? " done" : "") });
    row.innerHTML = `<span class="num">${done ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L20 7" fill="none" stroke="currentColor" stroke-width="3"/></svg>' : i + 1}</span>
      <div class="t"><span class="role">${esc(it.role)}</span><b>${esc(s.title)}</b><span>${esc(s.seqText ? s.seqText.replace(/\s*\.\s*/g, " ").trim().slice(0, 48) : s.desc || "")}</span></div>
      <div class="meta">${starsHtml(rec.stars || 0)}<span>${done ? "Done" : `${Math.min(2, ti.clean)} of 2 passes`}</span></div>`;
    const b = h("button", { class: "btn" + (done ? "" : " primary"), type: "button" }, done ? "Again" : "Start"); b.onclick = () => startRoutineItem(it);
    row.appendChild(b); box.appendChild(row);
  });
  const next = routineNextItem(); $("#tStart").textContent = next ? (r.items.some(i => itemDone(i.id)) ? "Continue routine" : "Start routine") : "Routine done for today";
  $("#tStart").disabled = !next;
  // week
  const wk = $("#tWeek"); wk.innerHTML = ""; const days = [];
  for (let k = 6; k >= 0; k--) { const x = new Date(); x.setDate(x.getDate() - k); days.push(x); }
  const mins = days.map(x => Math.round(((P.days[dayKey(x)] || {}).sec || 0) / 60)), top = Math.max(settings.goalMin, ...mins);
  days.forEach((x, i) => wk.appendChild(h("div", { class: "day" + (mins[i] >= settings.goalMin ? " hit" : "") + (i === 6 ? " today" : ""), title: `${mins[i]} min` },
    `<span class="v">${mins[i] || ""}</span><i style="height:${Math.max(3, Math.round(100 * mins[i] / top))}%"></i><span>${x.toLocaleDateString(undefined, { weekday: "narrow" })}</span>`)));
  $("#tTotal").textContent = `${totalMinutes()} minutes in total · ${P.routinesDone} routine${P.routinesDone === 1 ? "" : "s"} finished · best combo ${P.best.combo || 0}`;
  // badges
  $("#tBadges").innerHTML = BADGES.map(([id, name, how]) => `<div class="badge${P.badges[id] ? " got" : ""}" title="${esc(how)}"><span class="ic">${STAR_SVG}</span><b>${esc(name)}</b><span>${esc(P.badges[id] ? "Earned " + P.badges[id] : how)}</span></div>`).join("");
  // records
  const recs = [...RUDIMENTS, ...BASIC_SONGS].map(s => ({ s, r: P.songs[s.id] })).filter(x => x.r && x.r.bpm).sort((a, b) => b.r.bpm - a.r.bpm).slice(0, 10);
  $("#tRecords").innerHTML = recs.length ? recs.map(({ s, r }) => `<div><b>${esc(s.title)}</b><span>${r.bpm} BPM <small>/ goal ${s.goal || "–"}</small></span></div>`).join("") : '<p class="muted" style="margin:0;font-size:14px">Play a rudiment or basic cleanly (90%+) and its tempo shows here.</p>';
}
$("#tStart").onclick = () => { const it = routineNextItem(); if (it) startRoutineItem(it); };
$("#tGoal").onchange = e => { settings.goalMin = +e.target.value; saveSettings(); renderToday(); };
$("#routineNext").onclick = () => { const it = routineNextItem(); if (it) startRoutineItem(it); };
$("#endRoutine").onclick = () => { const it = routineNextItem(); if (it) startRoutineItem(it); };

/* ----- library sections ----- */
let rudTab = settings.rudTab ?? 0, basicTab = settings.basicTab ?? 0;
function tabs(box, names, cur, set){
  box.innerHTML = ""; [["All", -1], ...names.map((n, i) => [n, i])].forEach(([n, i]) => { const b = h("button", { type:"button", "aria-pressed": String(i === cur) }, esc(n)); b.onclick = () => set(i); box.appendChild(b); });
}
function practiceRow(s, list){
  const rec = P.songs[s.id] || {};
  const r = h("div", { class: "song" });
  const stick = s.seqText ? `<code class="stk">${esc(s.seqText.replace(/\s+/g, " ").slice(0, 60))}</code>` : "";
  r.innerHTML = `<div class="t"><b>${s.no ? s.no + " · " : ""}${esc(s.title)}</b><span>${esc(s.desc || "")}</span>${stick}</div>
    <div class="rec">${starsHtml(rec.stars || 0)}<span>${rec.bpm ? `${rec.bpm} / ${s.goal} BPM` : `${s.bpm} → ${s.goal || "–"} BPM`}</span></div>`;
  const acts = h("div", { class: "acts" });
  const p = h("button", { class: "btn primary", type: "button" }, "Practise"); p.onclick = () => { E.routine = false; loadSong(s); if (settings.speed && rec.bpm) setTempo(Math.max(s.bpm, Math.min(rec.bpm - 5, s.goal || 240))); show("practice"); };
  const e = h("button", { class: "btn", type: "button" }, "Edit"); e.onclick = () => openEditor(s);
  acts.append(p, e); r.appendChild(acts); list.appendChild(r);
}
function renderPracticeLists(){
  if (!$("#rudList")) return;
  tabs($("#rudTabs"), RUD_FAMILIES, rudTab, i => { rudTab = settings.rudTab = i; saveSettings(); renderPracticeLists(); });
  tabs($("#basicTabs"), BASIC_GROUPS, basicTab, i => { basicTab = settings.basicTab = i; saveSettings(); renderPracticeLists(); });
  const rl = $("#rudList"); rl.innerHTML = ""; RUDIMENTS.filter(s => rudTab < 0 || s.group === rudTab).forEach(s => practiceRow(s, rl));
  const bl = $("#basicList"); bl.innerHTML = ""; BASIC_SONGS.filter(s => basicTab < 0 || s.group === basicTab).forEach(s => practiceRow(s, bl));
}
