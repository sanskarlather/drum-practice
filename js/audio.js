"use strict";
/* ---------- Audio ---------- */
let ac=null, master=null, noiseBuf=null;
function audio(){
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ac = new AC(); master = ac.createGain(); master.gain.value = settings.vol/100; master.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate*1.5, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i=0;i<d.length;i++) d[i]=Math.random()*2-1;
  }
  if (ac.state === "suspended") ac.resume();
  return ac;
}
const now = () => ac ? ac.currentTime : performance.now()/1000;
function env(g, t, peak, decay){ g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(peak,t+0.003); g.gain.exponentialRampToValueAtTime(0.0001,t+decay); }
function noise(t, decay, peak, type, freq, q=0.7){
  const s = ac.createBufferSource(); s.buffer = noiseBuf;
  const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ac.createGain(); env(g,t,peak,decay);
  s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t+decay+0.05);
}
function tone(t, f0, f1, decay, peak, type="sine"){
  const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0,t); o.frequency.exponentialRampToValueAtTime(f1,t+decay*0.6);
  const g = ac.createGain(); env(g,t,peak,decay); o.connect(g); g.connect(master); o.start(t); o.stop(t+decay+0.05);
}
function playDrum(id, t, vel=1, a=null){
  if (!ac) return; t = Math.max(t, ac.currentTime);
  if (a==="ghost") vel *= 0.3; else if (a==="accent") vel = Math.min(1.4, vel*1.35);
  const v = Math.max(0.08, vel);
  const type = D[id] ? D[id].type : id;
  if (a==="flam") playDrum(id, t-0.028, vel*0.35);
  if (a==="drag") { playDrum(id, t-0.07, vel*0.3); playDrum(id, t-0.035, vel*0.3); }
  if (a==="buzz") { for (let k=1;k<7;k++) playDrum(id, t+k*0.018, vel*0.5*Math.pow(0.8,k)); }
  if (a==="open" && type==="hihat") { noise(t,0.45,0.32*v,"highpass",6500); return; }
  if (a==="rim" && type==="snare") { noise(t,0.22,0.7*v,"highpass",1500); tone(t,520,400,0.05,0.5*v,"square"); return; }
  if (a==="xstick" && type==="snare") { noise(t,0.05,0.45*v,"bandpass",1900,3); tone(t,950,800,0.04,0.35*v,"triangle"); return; }
  if (a==="bell" && type==="ride") { tone(t,2450,2400,0.9,0.22*v,"sine"); tone(t,3650,3600,0.6,0.12*v,"sine"); noise(t,0.2,0.05*v,"bandpass",8000,2); return; }
  if (a==="choke") { noise(t,0.14,0.32*v,"highpass",4500); return; }
  switch(type){
    case "kick":  tone(t,160,42,0.38,0.95*v); tone(t,900,200,0.02,0.25*v,"triangle"); break;
    case "snare": noise(t,0.2,0.55*v,"highpass",1200); tone(t,210,160,0.12,0.4*v,"triangle"); break;
    case "hihat": noise(t,0.06,0.35*v,"highpass",7500); break;
    case "hhp":   noise(t,0.035,0.2*v,"highpass",6000); break;
    case "tom": case "tom1":  tone(t,260,170,0.32,0.7*v); noise(t,0.05,0.1*v,"bandpass",2500); break;
    case "tom2":  tone(t,200,130,0.36,0.7*v); noise(t,0.05,0.1*v,"bandpass",2000); break;
    case "floor": tone(t,130,82,0.45,0.8*v); noise(t,0.05,0.1*v,"bandpass",1500); break;
    case "crash": case "splash": case "china": noise(t,1.4,0.32*v,"highpass",4500); noise(t,0.6,0.15*v,"bandpass",9000,2); break;
    case "ride":  noise(t,0.7,0.16*v,"bandpass",8500,1.5); tone(t,3400,3300,0.5,0.06*v,"triangle"); break;
  }
}
function click(t, accent){ if (!ac) return; tone(Math.max(t,ac.currentTime), accent?2000:1350, accent?1990:1340, 0.045, accent?0.5:0.32, "square"); }

