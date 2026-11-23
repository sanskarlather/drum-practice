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
settings.ai = Object.assign({provider:"gemini", remember:true, method:"auto", keys:{}, models:{}, baseUrl:""}, settings.ai || {});
settings.ai.keys = settings.ai.keys || {}; settings.ai.models = settings.ai.models || {}; settings.ai.loaded = settings.ai.loaded || {}; settings.ai.customs = settings.ai.customs || []; settings.ai.bases = settings.ai.bases || {};
if (settings.ai.key) { settings.ai.keys.anthropic = settings.ai.key; settings.ai.provider = "anthropic"; delete settings.ai.key; } // from v0.3.0
if (settings.ai.model) { settings.ai.models.anthropic = settings.ai.model; delete settings.ai.model; }
settings.artic = settings.artic !== false; // check how notes are played (open hi-hat, accents, ghost notes…)
settings.vel = Object.assign({accent: 96, ghost: 55}, settings.vel || {});
if (!settings.map) settings.map = JSON.parse(JSON.stringify(DEFAULT_MAP));
// map and mic.cal belong to the active kit (kits.js) and are saved with the kits
const saveSettings = () => { const s = Object.assign({}, settings, {map: undefined, mic: Object.assign({}, settings.mic, {cal: undefined})}); store.set("settings", s); if (typeof saveKits === "function") saveKits(); };
let bests = store.get("bests", {});

