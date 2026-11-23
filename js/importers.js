"use strict";
/* ---------- File importers: MIDI and MusicXML -> song ---------- */
function parseMidi(b, name){
  let p = 0; const rd = n => { let v=0; for(let i=0;i<n;i++) v=(v<<8)|b[p++]; return v>>>0; };
  const str = n => { let s=""; for(let i=0;i<n;i++) s+=String.fromCharCode(b[p++]); return s; };
  const vlq = () => { let v=0, c; do { c=b[p++]; v=(v<<7)|(c&0x7f); } while(c&0x80); return v; };
  if (str(4)!=="MThd") throw new Error("not a MIDI file");
  const hl = rd(4), fmt = rd(2), ntr = rd(2), div = rd(2); p = 8+hl;
  if (div & 0x8000) throw new Error("SMPTE timing not supported");
  let tempo = null, beats = 4; const hits = [];
  for (let t=0; t<ntr && p<b.length; t++){
    if (str(4)!=="MTrk") break; const len = rd(4), end = p+len; let tick=0, run=0;
    while (p<end){
      tick += vlq(); let st = b[p];
      if (st & 0x80) p++; else st = run;
      if (st===0xFF){ const type=b[p++], l=vlq(); if (type===0x51 && tempo==null) tempo = 60000000/((b[p]<<16)|(b[p+1]<<8)|b[p+2]); if (type===0x58) beats = b[p]===3?3:4; p+=l; }
      else if (st===0xF0 || st===0xF7){ p += vlq(); }
      else { run = st; const hi = st&0xF0, ch = st&0x0F;
        if (hi===0xC0 || hi===0xD0) p+=1; else { const a=b[p++], v=b[p++]; if (hi===0x90 && v>0) hits.push({tick, n:a, ch, v}); } }
    }
    p = end;
  }
  let use = hits.filter(x=>x.ch===9); if (!use.length) use = hits.filter(x=>GM[x.n]);
  // General MIDI notes that mean a special stroke; how hard each note is played gives accents and ghost notes
  const GM_IMPORT_ART = { 46:"open", 26:"open", 37:"xstick", 53:"bell" };
  const vels = {}; for (const x of use) { const d = GM[x.n]; if (d) (vels[d] = vels[d] || []).push(x.v); }
  const med = {}; for (const d in vels) { const a = vels[d].slice().sort((p,q)=>p-q); med[d] = a[a.length>>1]; }
  const notes = []; const seen = new Set(); let maxS = 0;
  for (const x of use){
    const d = GM[x.n]; if (!d) continue; const s = Math.round(x.tick/(div/4)); const k=s+"|"+d; if (seen.has(k)) continue; seen.add(k);
    let a = GM_IMPORT_ART[x.n] || null;
    if (!a && x.v >= 100 && x.v >= med[d] + 15) a = "accent";
    else if (!a && x.v <= 55 && x.v <= med[d] - 20 && d !== "kick" && d !== "hhp") a = "ghost";
    notes.push(a ? {s,d,a} : {s,d}); maxS=Math.max(maxS,s);
  }
  const spb = beats*4;
  return {id:uid(), title:name, bpm: Math.round(tempo||100), beats, bars: Math.max(1, Math.min(64, Math.ceil((maxS+1)/spb))), notes: notes.filter(n=>n.s < 64*spb)};
}
function parseMusicXML(text, name){
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("not valid MusicXML");
  if (doc.documentElement.nodeName === "score-timewise") throw new Error("timewise MusicXML isn't supported");
  const kid = (n, tag) => { for (const c of n.children) if (c.nodeName===tag) return c; return null; };
  const txt = (n, tag) => { const c = n && n.getElementsByTagName(tag)[0]; return c ? c.textContent.trim() : null; };
  const instName = {};
  for (const si of doc.getElementsByTagName("score-instrument")) instName[si.getAttribute("id")] = (txt(si,"instrument-name")||"").toLowerCase();
  const byName = s => {
    if (!s) return null;
    if (/kick|bass drum|bassdrum/.test(s)) return "kick";
    if (/snare|side stick|rim/.test(s)) return "snare";
    if (/hi-?\s?hat|hihat/.test(s)) return /pedal|foot/.test(s) ? "hhp" : "hihat";
    if (/ride/.test(s)) return "ride";
    if (/crash|splash|china|cymbal/.test(s)) return "crash";
    if (/floor|low tom|tom 3|tom3/.test(s)) return "floor";
    if (/mid|tom 2|tom2|low-mid/.test(s)) return "tom2";
    if (/tom/.test(s)) return "tom1";
    return null;
  };
  const byPos = (step, oct, head) => {
    const k = step+oct, x = head && /x|cross|circle-x/.test(head);
    return ({F4:"kick",E4:"kick",C5:"snare",E5:"tom1",D5:"tom2",B4:"tom2",A4:"floor",G4:"floor",F5: x?"ride":"tom1",G5:"hihat",A5:"crash",B5:"crash",D4:"hhp",C4:"hhp"})[k] || null;
  };
  // Full scores: use every percussion part (some scores split snare, bass drum and cymbals into separate parts)
  const parts = [...doc.getElementsByTagName("part")];
  const percParts = parts.filter(p=>p.getElementsByTagName("unpitched").length);
  const use = percParts.length ? percParts : parts.slice(0, 1);
  if (!use.length) throw new Error("no parts found");
  let divisions = 1, beats = 4, beatType = 4, tempo = null; const notes = []; const seen = new Set();
  for (const part of use) {
  let mStart = 0, grace = false;
  for (const m of part.children) {
    if (m.nodeName !== "measure") continue;
    let local = 0, lastStart = 0, maxLocal = 0;
    for (const c of m.children) {
      if (c.nodeName==="attributes") { const dv = txt(c,"divisions"); if (dv) divisions = +dv; const bt = txt(c,"beats"); if (bt) beats = +bt; const bty = txt(c,"beat-type"); if (bty) beatType = +bty; }
      else if (c.nodeName==="sound" && c.getAttribute("tempo") && tempo==null) tempo = +c.getAttribute("tempo");
      else if (c.nodeName==="direction") { const s = c.getElementsByTagName("sound")[0]; if (s && s.getAttribute("tempo") && tempo==null) tempo = +s.getAttribute("tempo"); }
      else if (c.nodeName==="backup") local -= +(txt(c,"duration")||0);
      else if (c.nodeName==="forward") { local += +(txt(c,"duration")||0); maxLocal=Math.max(maxLocal,local); }
      else if (c.nodeName==="note") {
        if (kid(c,"grace")) { grace = true; continue; } // a grace note just before a note = flam
        const dur = +(txt(c,"duration")||0), chord = !!kid(c,"chord");
        const st = chord ? lastStart : local; if (!chord) { lastStart = local; local += dur; maxLocal = Math.max(maxLocal, local); }
        if (kid(c,"rest")) continue;
        const ins = kid(c,"instrument"), iname = ins ? (instName[ins.getAttribute("id")] || "") : ""; let d = ins ? byName(iname) : null;
        const up = kid(c,"unpitched"), pi = kid(c,"pitch");
        if (!d && up) d = byPos(txt(up,"display-step"), txt(up,"display-octave"), txt(c,"notehead"));
        if (!d && pi) d = byPos(txt(pi,"step"), txt(pi,"octave"), txt(c,"notehead"));
        if (!d) continue;
        const s = Math.round((mStart + st) / divisions * 4); const k = s+"|"+d; if (seen.has(k)) continue; seen.add(k);
        // how it's played: from the instrument name, articulation marks, noteheads and grace notes
        const head = c.getElementsByTagName("notehead")[0], has = t => c.getElementsByTagName(t).length > 0;
        let a = null;
        if (/open/.test(iname) && d === "hihat") a = "open";
        else if (/side stick|cross/.test(iname)) a = "xstick";
        else if (/rim ?shot/.test(iname)) a = "rim";
        else if (/bell/.test(iname) && d === "ride") a = "bell";
        else if ((has("open") || has("open-string")) && d === "hihat") a = "open";
        else if (head && head.getAttribute("parentheses") === "yes") a = "ghost";
        else if (has("accent") || has("strong-accent")) a = "accent";
        else if (grace) a = "flam";
        grace = false;
        notes.push(a ? {s,d,a} : {s,d});
      }
    }
    const full = beats * (4/beatType) * divisions;
    mStart += Math.max(full, maxLocal) || full;
  }
  }
  if (tempo == null) { const snd = [...doc.getElementsByTagName("sound")].find(x => x.getAttribute("tempo")); if (snd) tempo = +snd.getAttribute("tempo"); }
  const qPerBar = beats*(4/beatType); const bt = Math.round(qPerBar)===3 ? 3 : 4; const spb = bt*4;
  const maxS = notes.reduce((a,n)=>Math.max(a,n.s),0);
  return {id:uid(), title:name, bpm: Math.round(tempo||90), beats:bt, bars: Math.max(1, Math.min(64, Math.ceil((maxS+1)/spb))), notes};
}

