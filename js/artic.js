"use strict";
/* ---------- Articulations: how a note is played ----------
 * A note is {s, d, a?}. a is one of the keys below, or absent for a normal hit.
 * tab: the character used in lesson patterns, the AI's drum-tab answers and the editor.
 * types: which piece types it applies to (absent = any hand-played piece).
 * variant: true if an e-kit sends a different MIDI note for it (so it has its own row in Pad mapping
 *          and can be taught separately in microphone mode).
 */
const ARTICS = {
  accent: { label:"Accent",      short:"ACCENT",  tab:"X", sign:">",  tip:"Hit it harder than the notes around it" },
  ghost:  { label:"Ghost note",  short:"GHOST",   tab:"g", sign:"( )", tip:"Barely touch it: very soft" },
  open:   { label:"Open hi-hat", short:"OPEN",    tab:"o", sign:"o",  tip:"Lift your left foot so the hi-hat rings", types:["hihat"], variant:true },
  rim:    { label:"Rimshot",     short:"RIM",     tab:"r", sign:"R",  tip:"Hit the head and the rim at the same time", types:["snare"], variant:true },
  xstick: { label:"Cross-stick", short:"X-STICK", tab:"c", sign:"X",  tip:"Lay the stick across and click it on the rim", types:["snare"], variant:true },
  bell:   { label:"Ride bell",   short:"BELL",    tab:"b", sign:"◇",  tip:"Hit the raised bell in the middle of the ride", types:["ride"], variant:true },
  flam:   { label:"Flam",        short:"FLAM",    tab:"f", sign:"f",  tip:"A soft grace note with the other hand just before the main hit", types:["snare","tom","floor"] },
  choke:  { label:"Choke",       short:"CHOKE",   tab:"k", sign:"+",  tip:"Grab the cymbal right after hitting it to stop the sound", types:["crash","splash","china"] },
};
const TAB_TO_ARTIC = Object.fromEntries(Object.entries(ARTICS).map(([k, v]) => [v.tab, k]));
// Does this articulation make sense on this piece?
function articFits(a, id){
  const A = ARTICS[a], d = D[id]; if (!A || !d) return false;
  if (A.types) return A.types.includes(d.type);
  return d.hand || a === "accent"; // accents also make sense on the kick
}
// Variant keys used in pad mapping and mic training, e.g. "hihat:open"
const variantKey = (id, a) => id + ":" + a;
function variantsFor(id){ return Object.keys(ARTICS).filter(a => ARTICS[a].variant && articFits(a, id)); }
const articLabel = a => a && ARTICS[a] ? ARTICS[a].label : "";
// Default MIDI notes for variants of the first piece of each type (Alesis Nitro Mesh / General MIDI)
const DEFAULT_VARIANT_MAP = { "hihat:open":[46,26], "snare:rim":[40], "snare:xstick":[37], "ride:bell":[53] };
