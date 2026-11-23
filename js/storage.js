"use strict";
/* ---------- Storage ---------- */
const mem = {};
const store = {
  get(k, def){ try { const v = localStorage.getItem("drumapp."+k); return v==null?def:JSON.parse(v); } catch(e){ return k in mem?mem[k]:def; } },
  set(k, v){ mem[k]=v; try { localStorage.setItem("drumapp."+k, JSON.stringify(v)); } catch(e){} }
};
const settings = Object.assign({metro:true, demo:false, hitSnd:false, vol:70, loop:true, wait:false, view:"both", offset:0, map:null, lastSong:"L1"}, store.get("settings", {}));
settings.mic = Object.assign({on:false, sens:60, offset:0, check:"lenient", cal:{}}, settings.mic || {});
settings.mic.on = false; // the microphone always starts off; the browser needs a click to start it
if (!settings.map) settings.map = JSON.parse(JSON.stringify(DEFAULT_MAP));
const saveSettings = () => store.set("settings", settings);
let bests = store.get("bests", {});

