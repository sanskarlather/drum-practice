"use strict";
/* ---------- Data ---------- */
const SVGNS = "http://www.w3.org/2000/svg";
const DRUMS = [
  {id:"crash", name:"Crash",      color:"#FFD166", kind:"cym",  cx:200, cy:120, r:88, staff:28, x:true,  key:"q", hand:true},
  {id:"ride",  name:"Ride",       color:"#F4A3C8", kind:"cym",  cx:700, cy:130, r:96, staff:40, x:true,  key:"h", hand:true},
  {id:"tom1",  name:"Tom 1",      color:"#7BD389", kind:"drum", cx:360, cy:175, r:56, staff:46, key:"d", hand:true},
  {id:"tom2",  name:"Tom 2",      color:"#5B8DEF", kind:"drum", cx:520, cy:175, r:56, staff:52, key:"f", hand:true},
  {id:"floor", name:"Floor tom",  color:"#B57EDC", kind:"drum", cx:670, cy:360, r:84, staff:70, key:"g", hand:true},
  {id:"snare", name:"Snare",      color:"#F25C54", kind:"drum", cx:290, cy:360, r:76, staff:58, key:"s", hand:true},
  {id:"hihat", name:"Hi-hat",     color:"#4CC9F0", kind:"cym",  cx:120, cy:300, r:66, staff:34, x:true,  key:"a", hand:true},
  {id:"kick",  name:"Kick",       color:"#FF8A3D", kind:"kick", cx:440, cy:502, r:52, staff:82, key:" ", hand:false},
  {id:"hhp",   name:"Hi-hat pedal",color:"#4CC9F0",kind:"pedal",cx:120, cy:496, r:42, staff:94, x:true,  key:"z", hand:false},
];
const D = Object.fromEntries(DRUMS.map(d=>[d.id,d]));
const CYMBALS = new Set(["crash","ride","hihat"]);
// Alesis Nitro Mesh defaults + General MIDI fallbacks
const DEFAULT_MAP = {
  kick:[36,35], snare:[38,40,37,39], tom1:[48,50], tom2:[45,47], floor:[43,41,58],
  hihat:[42,46,22,26], hhp:[44], crash:[49,55,57,52], ride:[51,53,59]
};
const GM = {}; for (const [k,v] of Object.entries(DEFAULT_MAP)) v.forEach(n=>GM[n]=k);

