"use strict";
/* ---------- Storage ---------- */
const mem = {};
const store = {
  get(k, def){ try { const v = localStorage.getItem("drumapp."+k); return v==null?def:JSON.parse(v); } catch(e){ return k in mem?mem[k]:def; } },
  set(k, v){ mem[k]=v; try { localStorage.setItem("drumapp."+k, JSON.stringify(v)); } catch(e){} }
};
const settings = Object.assign({metro:true, demo:false, hitSnd:false, vol:70, loop:true, wait:false, view:"both", offset:0, map:null, lastSong:"L1"}, store.get("settings", {}));
settings.mic = Object.assign({on:false, sens:60, offset:0, check:"lenient"}, settings.mic || {});
settings.mic.cal = settings.mic.cal || {};
settings.mic.on = false; // the microphone always starts off; the browser needs a click to start it
settings.ai = Object.assign({key:"", remember:true, model:"claude-sonnet-5-5", method:"auto"}, settings.ai || {});
if (!settings.map) settings.map = JSON.parse(JSON.stringify(DEFAULT_MAP));
// map and mic.cal belong to the active kit (kits.js) and are saved with the kits
const saveSettings = () => { const s = Object.assign({}, settings, {map: undefined, mic: Object.assign({}, settings.mic, {cal: undefined})}); store.set("settings", s); if (typeof saveKits === "function") saveKits(); };
let bests = store.get("bests", {});

