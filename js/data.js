"use strict";
/* ---------- Data: piece types, default kit, MIDI notes ----------
 * DRUMS and D describe the ACTIVE kit. They are filled by applyKit() in kits.js and
 * change when you switch or edit kits, so other code must read them at call time.
 */
const SVGNS = "http://www.w3.org/2000/svg";

// Every kind of piece a kit can have. kind decides how it's drawn; group decides what
// "forgiving" checking treats as interchangeable; staff is the notation height(s) by index.
const PIECE_TYPES = {
  crash:  { label:"Crash cymbal",  kind:"cym",   colors:["#FFD166","#FFC46B","#F7DD8B"], r:84, hand:true,  x:true, group:"cyms", staff:[28,22,22] },
  ride:   { label:"Ride cymbal",   kind:"cym",   colors:["#F4A3C8","#F7B9D6"],           r:92, hand:true,  x:true, group:"cyms", staff:[40,40] },
  splash: { label:"Splash cymbal", kind:"cym",   colors:["#FFE29A","#FFEBB5"],           r:50, hand:true,  x:true, group:"cyms", staff:[22,22] },
  china:  { label:"China cymbal",  kind:"cym",   colors:["#E9A96B","#F0BC88"],           r:70, hand:true,  x:true, group:"cyms", staff:[16,16] },
  hihat:  { label:"Hi-hat",        kind:"cym",   colors:["#4CC9F0","#7FD8F4"],           r:66, hand:true,  x:true, staff:[34,34] },
  snare:  { label:"Snare",         kind:"drum",  colors:["#F25C54","#F5837C"],           r:76, hand:true,  staff:[58,58] },
  tom:    { label:"Rack tom",      kind:"drum",  colors:["#7BD389","#5B8DEF","#3FC1A5","#9AD45C","#6A9CF2"], r:56, hand:true, group:"toms", staff:[46,52,64,64,64] },
  floor:  { label:"Floor tom",     kind:"drum",  colors:["#B57EDC","#D08BE8","#9F6CD0"], r:84, hand:true,  group:"toms", staff:[70,76,76] },
  kick:   { label:"Kick pedal",    kind:"kick",  colors:["#FF8A3D","#FFA566"],           r:52, hand:false, staff:[82,82] },
  hhp:    { label:"Hi-hat pedal",  kind:"pedal", colors:["#4CC9F0"],                     r:42, hand:false, x:true, staff:[94] },
};
// Ids used by lessons and older songs. The first piece of a type gets the plain id.
const BASE_IDS = { crash:["crash","crash2","crash3"], ride:["ride","ride2"], splash:["splash","splash2"], china:["china","china2"],
  hihat:["hihat","hihat2"], snare:["snare","snare2"], tom:["tom1","tom2","tom3","tom4","tom5"], floor:["floor","floor2","floor3"],
  kick:["kick","kick2"], hhp:["hhp"] };
const BASE_NAMES = { tom1:"Tom 1", tom2:"Tom 2", tom3:"Tom 3", tom4:"Tom 4", tom5:"Tom 5", floor:"Floor tom", floor2:"Floor tom 2", floor3:"Floor tom 3",
  crash:"Crash", crash2:"Crash 2", crash3:"Crash 3", ride:"Ride", ride2:"Ride 2", splash:"Splash", splash2:"Splash 2", china:"China", china2:"China 2",
  hihat:"Hi-hat", hihat2:"Hi-hat 2", snare:"Snare", snare2:"Snare 2", kick:"Kick", kick2:"Kick 2", hhp:"Hi-hat pedal" };
const BASE_KEYS = { crash:"q", ride:"h", tom1:"d", tom2:"f", floor:"g", snare:"s", hihat:"a", kick:" ", hhp:"z" };
const EXTRA_KEYS = "wertyuiopjklxcvbnm".split("");

// If the active kit doesn't have a piece a song uses, play it on the closest one it does have.
const FALLBACK = {
  tom1:["tom2","tom3","floor"], tom2:["tom1","tom3","floor"], tom3:["tom2","tom1","floor"], tom4:["tom3","tom2","tom1","floor"], tom5:["tom4","tom3","tom2","floor"],
  floor:["floor2","tom3","tom2","tom1"], floor2:["floor","tom3","tom2"], floor3:["floor2","floor"],
  crash:["crash2","china","splash","ride"], crash2:["crash","china","splash"], crash3:["crash2","crash"], splash:["splash2","crash","crash2"], splash2:["splash","crash"],
  china:["china2","crash2","crash"], china2:["china","crash"], ride:["ride2","crash","hihat"], ride2:["ride","crash"],
  hihat2:["hihat"], snare2:["snare"], kick2:["kick"], hihat:["ride"], snare:[], kick:[], hhp:[]
};

// Alesis Nitro Mesh defaults + General MIDI notes, per piece id
const DEFAULT_MAP = {
  kick:[36,35], snare:[38,40,37,39], tom1:[48,50], tom2:[45,47], floor:[43,41,58],
  hihat:[42,46,22,26], hhp:[44], crash:[49,55,57,52], ride:[51,53,59]
};
// Notes to offer a newly added piece (taken away from whichever piece had them)
const EXTRA_MAP = { crash2:[57], crash3:[], splash:[55], china:[52], ride2:[59], tom3:[47], tom4:[], floor2:[41], kick2:[], snare2:[], hihat2:[] };
// General MIDI drum notes -> piece id, used by the MIDI importer (resolved against the kit)
const GM = { 35:"kick", 36:"kick", 37:"snare", 38:"snare", 39:"snare", 40:"snare", 41:"floor2", 43:"floor", 58:"floor",
  45:"tom2", 47:"tom2", 48:"tom1", 50:"tom1", 42:"hihat", 46:"hihat", 22:"hihat", 26:"hihat", 44:"hhp",
  49:"crash", 57:"crash2", 55:"splash", 52:"china", 51:"ride", 53:"ride", 59:"ride2" };

const DRUMS = [];   // active kit pieces, filled by applyKit()
const D = {};       // id -> piece
