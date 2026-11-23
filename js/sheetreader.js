"use strict";
/* ---------- Sheet music reader: PDF or photo -> notes ----------
 * Two readers, both producing a normal song that opens in the note editor for checking:
 *   AI reader      - sends the page images to an AI model with the USER'S OWN API key, from a provider of
 *                    their choice (Anthropic Claude, Google Gemini, OpenRouter or any OpenAI-compatible
 *                    service). Keys are entered in the app and stored only in that browser; never in this code.
 *   Offline reader - classic optical music recognition in the browser. Free and private,
 *                    but only reliable on clean, printed drum notation with simple rhythms.
 * See docs/ARCHITECTURE.md, "Sheet reader".
 */
const PDFJS_BASE = (typeof window.PDFJS_BASE === "string") ? window.PDFJS_BASE : "vendor/pdfjs/";
const SR = { sessionKeys: {} };
// AI providers. Each person uses their own key; nothing here is a key.
const AI_PROVIDERS = {
  gemini: { label: "Google Gemini (free tier)", keyUrl: "https://aistudio.google.com/apikey", keyHint: "AIza…",
    models: [["gemini-3.8-flash", "Gemini 3.8 Flash"]],
    note: "Free tier: no payment needed, but limited requests per minute and per day, and it can be busy at times. On the free tier Google may use what you send to improve its products." },
  groq: { label: "Groq (free plan)", keyUrl: "https://console.groq.com/keys", keyHint: "gsk_…", base: "https://api.groq.com/openai/v1",
    models: [["meta-llama/llama-4-scout-17b-16e-instruct", "Llama 4 Scout (vision)"], ["qwen/qwen3.8-27b", "Qwen 3.8 27B (vision, thinks more)"]],
    note: "Free plan with rate limits; very fast. Only some Groq models read images: use the suggested ones, or Load models." },
  openrouter: { label: "OpenRouter (free models)", keyUrl: "https://openrouter.ai/settings/keys", keyHint: "sk-or-…", base: "https://openrouter.ai/api/v1",
    models: [["openrouter/free", "Free models router (random free model)"]],
    note: "The free router picks a random free model each time, so results vary. For steadier results press “Load models” and pick a specific free vision model (they're listed first)." },
  alibaba: { label: "Alibaba Cloud Model Studio (Qwen)", keyUrl: "https://www.alibabacloud.com/help/en/model-studio/get-api-key", keyHint: "sk-…", base: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", editBase: true,
    models: [["qwen3-vl-plus", "Qwen3 VL Plus (vision)"]],
    note: "Qwen vision models through Alibaba's OpenAI-compatible API. The address depends on your region: Singapore (default) https://dashscope-intl.aliyuncs.com/compatible-mode/v1, Virginia https://dashscope-us.aliyuncs.com/compatible-mode/v1, Beijing https://dashscope.aliyuncs.com/compatible-mode/v1. Keys differ per region. New accounts often get a free quota; check your console." },
  mistral: { label: "Mistral", keyUrl: "https://console.mistral.ai/api-keys", keyHint: "your Mistral key", base: "https://api.mistral.ai/v1",
    models: [["mistral-medium-3-5", "Mistral Medium 3.5 (vision)"]],
    note: "Mistral's vision models through its Chat Completions API. Mistral's free mode may not include API access; check your plan. Use “Load models” to pick a model that reads images." },
  huggingface: { label: "Hugging Face (Inference Providers)", keyUrl: "https://huggingface.co/settings/tokens", keyHint: "hf_…", base: "https://router.huggingface.co/v1",
    models: [["Qwen/Qwen3.8-27B:novita", "Qwen3.8 27B via Novita (vision)"]],
    note: "One token for many open models from many providers. Free accounts don't include monthly credits; PRO accounts include a small monthly amount. Model names look like owner/model:provider." },
  anthropic: { label: "Anthropic Claude", keyUrl: "https://console.anthropic.com/settings/keys", keyHint: "sk-ant-…",
    models: [["claude-sonnet-5-5", "Claude Sonnet 5.5"], ["claude-opus-5-5", "Claude Opus 5.5 (most careful)"], ["claude-haiku-5-5", "Claude Haiku 5.5 (cheapest)"]],
    note: "Needs prepaid API credit on your Anthropic account." },
  custom: { label: "Other OpenAI-compatible service", keyUrl: "", keyHint: "your key (if it needs one)", editBase: true,
    models: [],
    note: "Almost every AI service offers an “OpenAI-compatible” API: OpenAI, Together, Fireworks, DeepInfra, NVIDIA, xAI, Cerebras, SambaNova, SiliconFlow, a local Ollama or LM Studio server, and more. Enter its base URL (from its docs, usually ending in /v1) and a model that can read images. The service must allow requests from web pages (for Ollama, set OLLAMA_ORIGINS=*). Use “Add another service” to keep several." },
};
// Services you add yourself: {id, label, base}. Each keeps its own key and model.
function provInfo(p){
  if (AI_PROVIDERS[p]) return AI_PROVIDERS[p];
  const c = (settings.ai.customs || []).find(x => x.id === p);
  return c ? { label: c.label || "My service", keyUrl: "", keyHint: "your key (if it needs one)", editBase: true, mine: true, models: [],
    note: "A service you added. Enter its base URL (usually ending in /v1) and pick a model that reads images. It must use the OpenAI-compatible Chat Completions API and allow requests from web pages." } : AI_PROVIDERS.custom;
}
const SR_MAX_PAGES = 8;

/* ============ loading pages as canvases ============ */
function srLoadScript(src){
  return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("couldn't load " + src)); document.head.appendChild(s); });
}
async function srPdfToCanvases(file){
  if (!window.pdfjsLib) await srLoadScript(PDFJS_BASE + "pdf.min.js");
  const lib = window.pdfjsLib;
  const sameOrigin = /^https?:$/.test(location.protocol) && !/^[a-z]+:\/\//i.test(PDFJS_BASE);
  if (sameOrigin) lib.GlobalWorkerOptions.workerSrc = PDFJS_BASE + "pdf.worker.min.js";
  else if (!window.pdfjsWorker) await srLoadScript(PDFJS_BASE + "pdf.worker.min.js"); // runs on the main thread (file:// pages)
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const canvases = [];
  for (let i = 1; i <= Math.min(doc.numPages, SR_MAX_PAGES); i++) {
    const page = await doc.getPage(i);
    const v1 = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: 2200 / Math.max(v1.width, v1.height) });
    const c = document.createElement("canvas"); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: x, viewport: vp }).promise;
    canvases.push(c);
  }
  return { canvases, total: doc.numPages };
}
async function srImageToCanvas(file){
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("couldn't open that image (try JPG or PNG)")); i.src = url; });
    const s = Math.min(1, 2200 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
    const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
    return { canvases: [c], total: 1 };
  } finally { URL.revokeObjectURL(url); }
}
function srFileToCanvases(file){
  return (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) ? srPdfToCanvases(file) : srImageToCanvas(file);
}

/* ============ AI reader (user's own key) ============ */
// The AI answers in compact drum-tab lines (one line per drum per bar). This is ~10x shorter than
// listing every hit as JSON, so whole pages fit easily in any model's output limit, and models
// already know drum tabs well.
const TAB_CODES = { CR:"crash", CR2:"crash2", SP:"splash", CH:"china", RD:"ride", HH:"hihat", HP:"hhp",
  SD:"snare", T1:"tom1", T2:"tom2", T3:"tom3", FT:"floor", FT2:"floor2", BD:"kick", BD2:"kick2" };
const AI_PROMPT = (page, pages) => `You are transcribing drum sheet music for a beginner's practice app.${pages > 1 ? ` This image is page ${page} of ${pages} of one piece.` : ""}

Write every bar on this page, in playing order, as drum tab. Answer in EXACTLY this plain-text format and nothing else:

TITLE: <title printed on the page, or blank>
TEMPO: <tempo marking in BPM, or 0 if none>
TIME: <4/4 or 3/4>
BAR 1
HH x.x.x.x.x.x.x.x.
SD ....x.......x...
BD x.......x.......
BAR 2
...
NOTES: <one short sentence about anything unsure or simplified, or blank>

Rules:
- Each drum line is a code, a space, then one character per 16th note: 16 characters for a 4/4 bar, 12 for 3/4. "." = no hit. Only list drums that are played in that bar.
- Write HOW each note is played; this matters, so be precise:
  x = normal hit · X = accent (">" or "^") · g = ghost note (in parentheses) · o = OPEN hi-hat ("o" above the note or a circled hi-hat) · r = rimshot · c = cross-stick / side stick · f = flam (small grace note before) · b = ride BELL (diamond notehead or "bell") · k = choke (cymbal grabbed/stopped).
  A closed hi-hat (or "+" above it) is a plain x. Never write an open hi-hat as x.
- Codes: CR crash, CR2 second crash, SP splash, CH china, RD ride, HH hi-hat, HP hi-hat pedal (foot), SD snare, T1 high tom, T2 mid tom, T3 third tom, FT floor tom, FT2 second floor tom, BD bass drum/kick, BD2 second kick (double pedal).
- Follow the page's drum key/legend if it has one. Otherwise standard drum-kit notation on a 5-line staff: kick = bottom space; snare = third space; floor tom = second space; T2 = middle line; T1 = fourth space; ride = x on the top line; hi-hat = x just above the staff; crash = x on the ledger line above or a circled x; hi-hat pedal = x below the staff.
- Write out repeat signs and "repeat bar" marks in full. Round triplets and swing to the nearest 16th and mention it in NOTES.
- If the image is not drum notation, answer only: UNREADABLE: <reason>
- Do not explain, do not use code blocks, keep it short.`;

// Turn the drum-tab answer into bars of {step, drum}. Tolerates small format slips.
function srParseTab(text, beats){
  const out = { title:"", bpm:0, beats, bars:[], notes:"" };
  const t = String(text || "").replace(/```[a-z]*/gi, "");
  const un = t.match(/UNREADABLE:\s*(.*)/i); if (un && !/BAR\s*\d/i.test(t)) { out.unreadable = un[1].trim() || "no drum notation found"; return out; }
  let cur = null;
  for (const raw of t.split(/\r?\n/)) {
    const line = raw.trim(); if (!line) continue;
    let m;
    if ((m = line.match(/^TITLE\s*:\s*(.*)$/i))) { out.title = m[1].trim().replace(/^<.*>$/, ""); continue; }
    if ((m = line.match(/^TEMPO\s*:\s*(\d+)/i))) { out.bpm = +m[1]; continue; }
    if ((m = line.match(/^TIME\s*:\s*(\d)\s*\/\s*(\d)/i))) { out.beats = +m[1] === 3 ? 3 : 4; continue; }
    if ((m = line.match(/^NOTES\s*:\s*(.*)$/i))) { out.notes = m[1].trim(); continue; }
    if (/^BAR\b/i.test(line)) { cur = []; out.bars.push(cur); continue; }
    if ((m = line.match(/^(CR2|CR|SP|CH|RD|HH|HP|SD|T1|T2|T3|FT2|FT|BD2|BD)\b\s*[:|]?\s*([xXoOgGrRcCfFbBkK.\-|_ ]+)$/))) {
      if (!cur) { cur = []; out.bars.push(cur); }
      const cells = m[2].replace(/[|\s]/g, "").replace(/[-_]/g, ".");
      cur.push({ d: TAB_CODES[m[1]], cells });
    }
  }
  return out;
}
function srTabNotes(parsed, startBar){
  const spb = parsed.beats * 4, notes = [];
  parsed.bars.forEach((bar, bi) => bar.forEach(({ d, cells }) => {
    // 16 cells = 16ths; 8 = 8ths; 4 = quarters (in 4/4). Anything else is stretched to fit the bar.
    const n = cells.length; if (!n) return;
    for (let i = 0; i < n; i++) { const ch = cells[i]; if (ch === ".") continue;
      const st = (startBar + bi) * spb + Math.min(spb - 1, Math.floor(i * spb / n + 1e-9));
      const a = ch === "x" ? null : TAB_TO_ARTIC[ch] || TAB_TO_ARTIC[ch.toLowerCase()] || null;
      if (!notes.some(x => x.s === st && x.d === d)) notes.push(a && articFitsType(a, d) ? { s: st, d, a } : { s: st, d });
    }
  }));
  return notes;
}
const aiProv = () => settings.ai.provider;
function srKey(prov = aiProv()){ return (settings.ai.remember ? settings.ai.keys[prov] : SR.sessionKeys[prov]) || ""; }
function srModel(prov = aiProv()){ return settings.ai.models[prov] || (provInfo(prov).models[0] || [""])[0]; }
function srBase(prov = aiProv()){
  const P = provInfo(prov), own = (settings.ai.bases && settings.ai.bases[prov]) || (prov === "custom" ? settings.ai.baseUrl : "");
  return ((P.editBase && own) || P.base || own || "").trim().replace(/\/+$/, "").replace(/\/chat\/completions$/, "");
}
function srJpeg(c, maxEdge = 1568){
  const s = Math.min(1, maxEdge / Math.max(c.width, c.height));
  const o = document.createElement("canvas"); o.width = Math.round(c.width * s); o.height = Math.round(c.height * s);
  o.getContext("2d").drawImage(c, 0, 0, o.width, o.height);
  return o.toDataURL("image/jpeg", 0.88).split(",")[1];
}
async function srFetch(url, opts){
  let r;
  try { r = await fetch(url, opts); }
  catch (e) { throw new Error("Couldn't reach " + new URL(url).host + ". Check your internet connection. (Inside claude.ai the app can't make this request: use your GitHub Pages link. A custom service must allow requests from web pages.)"); }
  return { ok: r.ok, status: r.status, text: await r.text() };
}
const srSleep = ms => new Promise(r => setTimeout(r, ms));
// Retry once when the provider is busy or the free-tier per-minute limit is hit.
async function srFetchRetry(url, opts, onStep){
  let r = await srFetch(url, opts);
  if (r.status === 429 || r.status === 503 || r.status === 500 || r.status === 529) {
    const wait = r.status === 429 ? 20000 : 5000;
    onStep && onStep(r.status === 429 ? "Free-tier limit reached; waiting 20 seconds, then trying again…" : "The service is busy; trying again in 5 seconds…");
    await srSleep(wait); r = await srFetch(url, opts);
  }
  return r;
}
function srErrMsg(r){ try { const j = JSON.parse(r.text); const e = j.error || j; return (e.message || (e.metadata && e.metadata.raw) || (typeof e === "string" ? e : "")) + ""; } catch (e) { return r.text.slice(0, 200); } }
const provName = prov => provInfo(prov).label.replace(/ \(.*\)$/, "");
function srApiError(r, prov = aiProv()){
  const msg = String(srErrMsg(r) || ""), name = provName(prov);
  if (r.status === 401 || /API_KEY_INVALID|invalid.*key|incorrect api key/i.test(msg)) return `The ${name} API key was rejected. Check it in Library → Sheet reading, and that it is a key from ${name}.`;
  if (r.status === 402 || /credit|billing|balance|insufficient/i.test(msg)) return `Your ${name} account has no credit for this model. Pick a free model (Load models) or another provider. (${msg})`;
  if (r.status === 429) return prov === "gemini" ? "Gemini's free-tier limit was reached. Wait a few minutes (or until tomorrow for the daily limit), or use another provider." : `${name}'s rate limit was reached${/free/i.test(srModel(prov)) ? " for this free model" : ""}. Wait a few minutes, pick another model, or use another provider.`;
  if (r.status === 404 || /not found|does not exist|unknown model|no endpoints/i.test(msg)) return `The model “${srModel(prov)}” isn't available${/image|vision|modalit/i.test(msg) ? " for images" : ""}. Press “Load models” in Library → Sheet reading and pick one that reads images.`;
  if (/image|vision|modalit|multimodal/i.test(msg)) return `The model “${srModel(prov)}” can't read images. Press “Load models” and pick a vision model.`;
  if (r.status === 503 || r.status === 529 || r.status === 500 || r.status === 502) return `${name} is busy right now. Try again in a minute, or use another provider or the offline reader.`;
  if (r.status === 403) return `${name} refused the request: ${msg}`;
  return `${name} error ${r.status}${msg ? ": " + msg : ""}`;
}

// One call per provider, one page per call. Each returns {text, cut, usage}.
const AI_CALL = {
  async anthropic(img, prompt, key, model, onStep){
    const body = { model, max_tokens: 8000, messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: img } }, { type: "text", text: prompt } ] }] };
    const r = await srFetchRetry("https://api.anthropic.com/v1/messages", { method: "POST", body: JSON.stringify(body),
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json", "anthropic-dangerous-direct-browser-access": "true" } }, onStep);
    if (!r.ok) throw new Error(srApiError(r, "anthropic"));
    const data = JSON.parse(r.text);
    if (data.stop_reason === "refusal") throw new Error("The model declined to read this image.");
    return { text: (data.content || []).filter(b => b.type === "text").map(b => b.text).join(""), cut: data.stop_reason === "max_tokens",
             usage: data.usage ? data.usage.input_tokens + data.usage.output_tokens : 0 };
  },
  async gemini(img, prompt, key, model, onStep){
    const body = { contents: [{ role: "user", parts: [{ inlineData: { mimeType: "image/jpeg", data: img } }, { text: prompt }] }],
      generationConfig: { maxOutputTokens: 16000, thinkingConfig: { thinkingLevel: "low" } } };
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.replace(/^models\//, ""))}:generateContent`;
    const go = () => srFetchRetry(url, { method: "POST", headers: { "x-goog-api-key": key, "content-type": "application/json" }, body: JSON.stringify(body) }, onStep);
    let r = await go();
    if (!r.ok && r.status === 400 && /thinking/i.test(r.text)) { delete body.generationConfig.thinkingConfig; r = await go(); } // models without that setting
    if (!r.ok) throw new Error(srApiError(r, "gemini"));
    const data = JSON.parse(r.text);
    if (data.promptFeedback && data.promptFeedback.blockReason) throw new Error("Gemini blocked this request (" + data.promptFeedback.blockReason + ").");
    const cand = (data.candidates || [])[0]; if (!cand) throw new Error("Gemini returned no answer. Try again.");
    return { text: ((cand.content && cand.content.parts) || []).filter(p => !p.thought).map(p => p.text || "").join(""), cut: cand.finishReason === "MAX_TOKENS",
             usage: data.usageMetadata ? data.usageMetadata.totalTokenCount : 0 };
  },
  async openai(img, prompt, key, model, onStep, prov){
    const base = srBase(prov); if (!base) throw new Error("Enter the service's base URL in Library → Sheet reading.");
    if (!model) throw new Error("Enter a model name in Library → Sheet reading (press “Load models” to see what's available).");
    const headers = { "content-type": "application/json" };
    if (key) headers.authorization = "Bearer " + key;
    if (prov === "openrouter") { headers["HTTP-Referer"] = location.origin; headers["X-Title"] = "Drum Practice"; }
    const body = { model, max_tokens: 12000, messages: [{ role: "user", content: [
      { type: "text", text: prompt }, { type: "image_url", image_url: { url: "data:image/jpeg;base64," + img } } ] }] };
    // Keep "thinking" short: on OpenRouter it shares the output limit with the answer.
    if (prov === "openrouter") body.reasoning = { effort: "low", exclude: true };
    const go = () => srFetchRetry(base + "/chat/completions", { method: "POST", headers, body: JSON.stringify(body) }, onStep);
    let r = await go();
    if (!r.ok && r.status === 400 && /reasoning/i.test(r.text)) { delete body.reasoning; r = await go(); }
    if (!r.ok && r.status === 400 && /max_tokens|max_completion/i.test(r.text)) { body.max_tokens = 4096; r = await go(); }
    if (!r.ok && (r.status === 400 || r.status === 422) && /image_url|content|url/i.test(r.text)) { body.messages[0].content[1] = { type: "image_url", image_url: "data:image/jpeg;base64," + img }; r = await go(); } // older style some services use
    if (!r.ok) throw new Error(srApiError(r, prov));
    const data = JSON.parse(r.text);
    if (data.error) throw new Error(srApiError({ status: data.error.code || 500, text: JSON.stringify(data) }, prov));
    const ch = (data.choices || [])[0]; if (!ch) throw new Error("The service returned no answer. Try again.");
    const c = ch.message && ch.message.content;
    const text = Array.isArray(c) ? c.map(x => x.text || "").join("") : (c || "");
    return { text, cut: ch.finish_reason === "length", usage: data.usage ? data.usage.total_tokens : 0, used: data.model && data.model !== model ? data.model : "" };
  },
};
async function srAiRead(canvases, onStep, beatsHint = 4){
  const prov = aiProv(), P = provInfo(prov), key = srKey(prov), model = srModel(prov), name = provName(prov);
  if (!key && !P.editBase) throw new Error(`Add your ${name} API key first (Library → Sheet reading).`);
  const call = AI_CALL[prov] || AI_CALL.openai; // everything except Gemini and Claude speaks the OpenAI-compatible API
  const all = { title:"", bpm:0, beats: beatsHint, notes: [], bars: 0, reports: [], usage: 0, used: new Set() };
  for (let p = 0; p < canvases.length; p++) {
    onStep && onStep(canvases.length > 1 ? `Reading page ${p + 1} of ${canvases.length} with ${name}…` : `Reading the page with ${name}…`);
    if (p) await srSleep(1500); // be gentle with free-tier per-minute limits
    const res = await call(srJpeg(canvases[p]), AI_PROMPT(p + 1, canvases.length), key, model, onStep, prov);
    all.usage += res.usage || 0; if (res.used) all.used.add(res.used);
    const tab = srParseTab(res.text, all.beats);
    if (tab.unreadable) { if (canvases.length === 1) throw new Error("The AI couldn't read drum notation here: " + tab.unreadable); all.reports.push(`Page ${p + 1}: ${tab.unreadable}`); continue; }
    if (!tab.bars.length) {
      if (res.cut) throw new Error(`The model used up its whole answer limit before writing the notes (usually because it "thinks" a lot). Pick a different model with “Load models”, preferably one without reasoning, or use another provider.`);
      throw new Error("The AI's answer didn't contain any bars. Try again, or pick another model.");
    }
    if (p === 0) { all.title = tab.title; all.bpm = tab.bpm; all.beats = tab.beats; }
    tab.beats = all.beats;
    all.notes.push(...srTabNotes(tab, all.bars)); all.bars += tab.bars.length;
    if (tab.notes) all.reports.push((canvases.length > 1 ? `Page ${p + 1}: ` : "") + tab.notes);
    if (res.cut) all.reports.push(`Page ${p + 1} may be incomplete (the answer was cut off). Check the last bars.`);
  }
  return { title: all.title, bpm: all.bpm > 20 && all.bpm < 300 ? all.bpm : 0, beats: all.beats, bars: Math.max(1, all.bars), notes: all.notes,
           report: all.reports.join(" "), usage: (all.usage ? all.usage + " tokens" : "") + (all.used.size ? " via " + [...all.used].join(", ") : "") };
}
// Lists the models a key can use. Costs nothing, so it doubles as "Test key".
async function srListModels(prov, key){
  let r, ids = [];
  if (prov === "anthropic") {
    r = await srFetch("https://api.anthropic.com/v1/models?limit=100", { headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" } });
    if (!r.ok) throw new Error(srApiError(r, prov));
    ids = (JSON.parse(r.text).data || []).map(m => m.id);
  } else if (prov === "gemini") {
    r = await srFetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": key } });
    if (!r.ok) throw new Error(srApiError(r, prov));
    ids = (JSON.parse(r.text).models || []).filter(m => (m.supportedGenerationMethods || []).includes("generateContent") && /gemini/.test(m.name) && !/tts|embedding|image-generation|live|audio/.test(m.name)).map(m => m.name.replace(/^models\//, ""));
  } else {
    const base = srBase(prov); if (!base) throw new Error("Enter the service's base URL first.");
    r = await srFetch(base + "/models", { headers: key ? { authorization: "Bearer " + key } : {} });
    if (!r.ok) throw new Error(srApiError(r, prov));
    let list = JSON.parse(r.text).data || [];
    if (prov === "openrouter") {
      // vision models only; free ones first, models that don't need reasoning before those that do
      list = list.filter(m => !m.architecture || !m.architecture.input_modalities || m.architecture.input_modalities.includes("image"));
      const free = m => /:free$/.test(m.id) || (m.pricing && +m.pricing.prompt === 0 && +m.pricing.completion === 0);
      const thinks = m => !!(m.reasoning && m.reasoning.mandatory);
      list.sort((a, b) => (free(b) - free(a)) || (thinks(a) - thinks(b)) || a.id.localeCompare(b.id));
    }
    ids = list.map(m => m.id);
  }
  return ids;
}
// Guess the provider from what a key looks like, so a key pasted under the wrong provider still works.
function srGuessProvider(k){
  if (/^AIza/.test(k)) return "gemini";
  if (/^sk-or-/.test(k)) return "openrouter";
  if (/^sk-ant-/.test(k)) return "anthropic";
  if (/^gsk_/.test(k)) return "groq";
  if (/^hf_/.test(k)) return "huggingface";
  return null;
}
/* ============ Offline reader (optical music recognition) ============ */
// Grayscale + adaptive threshold (Bradley): copes with uneven lighting in photos.
function omrBinarize(c){
  const W = c.width, H = c.height, d = c.getContext("2d").getImageData(0, 0, W, H).data;
  const g = new Uint8Array(W*H);
  for (let i = 0, p = 0; i < W*H; i++, p += 4) g[i] = (d[p]*77 + d[p+1]*150 + d[p+2]*29) >> 8;
  const I = new Float64Array((W+1)*(H+1));
  for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += g[y*W+x]; I[(y+1)*(W+1)+x+1] = I[y*(W+1)+x+1] + row; } }
  const s = Math.max(15, Math.round(W/40)) >> 1, bin = new Uint8Array(W*H);
  for (let y = 0; y < H; y++) {
    const y0 = Math.max(0, y-s), y1 = Math.min(H-1, y+s);
    for (let x = 0; x < W; x++) {
      const x0 = Math.max(0, x-s), x1 = Math.min(W-1, x+s), area = (x1-x0+1)*(y1-y0+1);
      const sum = I[(y1+1)*(W+1)+x1+1] - I[y0*(W+1)+x1+1] - I[(y1+1)*(W+1)+x0] + I[y0*(W+1)+x0];
      const v = g[y*W+x];
      bin[y*W+x] = (v*area < sum*0.82 && v < 200) || v < 70 ? 1 : 0;
    }
  }
  return { bin, W, H };
}
// Find the rotation that makes staff lines most horizontal.
function omrSkew(bin, W, H){
  const pts = [];
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 3) if (bin[y*W+x]) pts.push(x, y);
  let best = 0, bestScore = -1;
  for (let a = -5; a <= 5.001; a += 0.25) {
    const t = Math.tan(a*Math.PI/180), hist = new Float64Array(H*2); let sc = 0;
    for (let i = 0; i < pts.length; i += 2) { const yy = Math.round(pts[i+1] - pts[i]*t) + (H>>1); if (yy >= 0 && yy < hist.length) hist[yy]++; }
    for (let i = 0; i < hist.length; i++) sc += hist[i]*hist[i];
    if (sc > bestScore) { bestScore = sc; best = a; }
  }
  return best;
}
function omrRotate(c, deg){
  const o = document.createElement("canvas"); o.width = c.width; o.height = c.height;
  const x = o.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, o.width, o.height);
  x.translate(o.width/2, o.height/2); x.rotate(-deg*Math.PI/180); x.drawImage(c, -c.width/2, -c.height/2); return o;
}
// 5-line staves: rows that are mostly dark, grouped in fives with equal spacing.
function omrStaves(bin, W, H){
  const rc = new Int32Array(H); let mx = 0;
  for (let y = 0; y < H; y++) { let n = 0; for (let x = 0; x < W; x++) n += bin[y*W+x]; rc[y] = n; if (n > mx) mx = n; }
  const lines = []; let y = 0;
  while (y < H) { if (rc[y] > 0.4*mx) { let y2 = y; while (y2+1 < H && rc[y2+1] > 0.4*mx) y2++; lines.push({ y: (y+y2)/2, r0: y, r1: y2 }); y = y2+1; } else y++; }
  const staves = [];
  for (let i = 0; i + 4 < lines.length; ) {
    const L = lines.slice(i, i+5), gaps = [1,2,3,4].map(k => L[k].y - L[k-1].y), m = gaps.reduce((a,b)=>a+b,0)/4;
    if (m >= 4 && m <= 80 && gaps.every(gp => Math.abs(gp - m) < 0.22*m)) { staves.push({ lines: L, sp: m, top: L[0].y, bottom: L[4].y }); i += 5; } else i++;
  }
  // horizontal extent from the middle line
  for (const st of staves) {
    const row = Math.round(st.lines[2].y); let best = [0,0], run0 = -1, gap = 0;
    for (let x = 0; x <= W; x++) {
      const dark = x < W && (bin[row*W+x] || bin[(row-1)*W+x] || bin[(row+1)*W+x]);
      if (dark) { if (run0 < 0) run0 = x; gap = 0; }
      else if (run0 >= 0 && ++gap > 4) { const e = x - gap; if (e - run0 > best[1] - best[0]) best = [run0, e]; run0 = -1; gap = 0; }
    }
    st.x0 = best[0]; st.x1 = best[1];
  }
  return staves.filter(s => s.x1 - s.x0 > 10*s.sp);
}
// Erase staff and ledger lines but keep the symbols crossing them.
function omrRemoveLines(bin, W, H, st){
  const { sp } = st, clear = (r0, r1, xa, xb) => {
    for (let x = xa; x <= xb; x++) {
      const up = r0-2 >= 0 && (bin[(r0-2)*W+x] || (r0-3 >= 0 && bin[(r0-3)*W+x]));
      const dn = r1+2 < H && (bin[(r1+2)*W+x] || (r1+3 < H && bin[(r1+3)*W+x]));
      if (!up && !dn) for (let r = r0-1; r <= r1+1; r++) if (r >= 0 && r < H) bin[r*W+x] = 0;
    }
  };
  for (const L of st.lines) clear(L.r0, L.r1, Math.max(0, st.x0-2), Math.min(W-1, st.x1+2));
  const t = Math.max(1, st.lines[0].r1 - st.lines[0].r0 + 1);
  for (const yl of [st.top - sp, st.top - 2*sp, st.bottom + sp, st.bottom + 2*sp]) {
    for (let r = Math.round(yl - 2); r <= Math.round(yl + 2); r++) {
      if (r < 1 || r >= H-1) continue;
      let x = st.x0;
      while (x <= st.x1) {
        if (!bin[r*W+x]) { x++; continue; }
        let x2 = x; while (x2+1 <= st.x1 && bin[r*W+x2+1]) x2++;
        if (x2 - x + 1 >= 0.9*sp && x2 - x + 1 <= 3.4*sp) clear(r - (t>>1), r + ((t-1)>>1), x, x2);
        x = x2 + 1;
      }
    }
  }
}
// Long thin vertical strokes: barlines (span the staff exactly) and stems. Both are removed.
function omrStrokes(bin, W, H, st, yA, yB, also){
  const { sp } = st, minLen = 2.2*sp, open = [], done = [];
  for (let x = Math.max(0, Math.round(st.x0 - sp)); x <= Math.min(W-1, Math.round(st.x1 + sp)); x++) {
    const runs = []; let y = yA;
    while (y <= yB) { if (bin[y*W+x]) { let y2 = y; while (y2+1 <= yB && bin[(y2+1)*W+x]) y2++; if (y2 - y + 1 >= minLen) runs.push([y, y2]); y = y2+1; } else y++; }
    const next = [];
    for (const [a, b] of runs) {
      const s = open.find(o => o.x1 === x-1 && Math.min(o.y1, b) - Math.max(o.y0, a) > 0.5*(b-a));
      if (s) { s.x1 = x; s.y0 = Math.min(s.y0, a); s.y1 = Math.max(s.y1, b); s.cols.push([x, a, b]); next.push(s); }
      else next.push({ x0: x, x1: x, y0: a, y1: b, cols: [[x, a, b]] });
    }
    for (const o of open) if (!next.includes(o)) done.push(o);
    open.length = 0; open.push(...next);
  }
  done.push(...open);
  const bars = [], stems = [];
  for (const s of done) {
    const w = s.x1 - s.x0 + 1;
    if (w > Math.max(4, 1.0*sp)) continue;
    const isBar = s.y0 >= st.top - 0.5*sp && s.y0 <= st.top + 0.35*sp && s.y1 >= st.bottom - 0.35*sp && s.y1 <= st.bottom + 0.5*sp;
    if (!isBar && w > Math.max(3, 0.4*sp)) continue;
    (isBar ? bars : stems).push({ x: (s.x0 + s.x1)/2, y0: s.y0, y1: s.y1 });
    for (const [x, a, b] of s.cols) for (let y = a; y <= b; y++) { bin[y*W+x] = 0; if (also) also[y*W+x] = 0; }
  }
  return { bars, stems };
}
function omrComponents(mask, W, xa, xb, ya, yb, conn8){
  const seen = new Uint8Array((xb-xa+1)*(yb-ya+1)), comps = [], ww = xb-xa+1, stack = [];
  for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
    const li = (y-ya)*ww + (x-xa); if (!mask[y*W+x] || seen[li]) continue;
    let c = { x0:x, x1:x, y0:y, y1:y, n:0 }; seen[li] = 1; stack.push(x, y);
    while (stack.length) {
      const cy = stack.pop(), cx = stack.pop(); c.n++;
      if (cx < c.x0) c.x0 = cx; if (cx > c.x1) c.x1 = cx; if (cy < c.y0) c.y0 = cy; if (cy > c.y1) c.y1 = cy;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dy) || (!conn8 && dx && dy)) continue;
        const nx = cx+dx, ny = cy+dy; if (nx < xa || nx > xb || ny < ya || ny > yb) continue;
        const nl = (ny-ya)*ww + (nx-xa); if (mask[ny*W+nx] && !seen[nl]) { seen[nl] = 1; stack.push(nx, ny); }
      }
    }
    comps.push(c);
  }
  return comps;
}
// raw: image with staff lines still in (thin lines vanish in the erosion, and heads that touch a line stay whole)
function omrHeads(bin, raw, W, H, st, yA, yB){
  const { sp } = st, xa = Math.max(0, Math.round(st.x0)), xb = Math.min(W-1, Math.round(st.x1));
  // filled heads: erode so thin strokes vanish, keep solid blobs
  const r = Math.max(1, Math.round(0.2*sp)), Wn = W+1, I = new Int32Array((W+1)*(yB-yA+2));
  for (let y = yA; y <= yB; y++) { let row = 0; for (let x = 0; x < W; x++) { row += raw[y*W+x]; I[(y-yA+1)*Wn+x+1] = I[(y-yA)*Wn+x+1] + row; } }
  const box = (x0, y0, x1, y1) => { x0 = Math.max(0, x0); x1 = Math.min(W-1, x1); y0 = Math.max(yA, y0); y1 = Math.min(yB, y1); if (x1 < x0 || y1 < y0) return 0; return I[(y1-yA+1)*Wn+x1+1] - I[(y0-yA)*Wn+x1+1] - I[(y1-yA+1)*Wn+x0] + I[(y0-yA)*Wn+x0]; };
  const er = new Uint8Array(W*H), area = (2*r+1)*(2*r+1);
  for (let y = yA + r; y <= yB - r; y++) for (let x = xa; x <= xb; x++) if (raw[y*W+x] && box(x-r, y-r, x+r, y+r) === area) er[y*W+x] = 1;
  const heads = [];
  for (const c of omrComponents(er, W, xa, xb, yA, yB, false)) {
    const x0 = c.x0 - r, x1 = c.x1 + r, y0 = c.y0 - r, y1 = c.y1 + r, w = x1-x0+1, h = y1-y0+1;
    if (w < 0.55*sp || w > 2.0*sp || h < 0.5*sp || h > 2.7*sp) continue;
    const fill = box(x0, y0, x1, y1) / (w*h); if (fill < 0.5) continue;
    if (h > 1.45*sp) { // two heads touching vertically (e.g. a chord): split
      if (w/h > 1.4) continue;
      heads.push({ x: (x0+x1)/2, y: y0 + h*0.25, filled: true, w, h: h/2 }, { x: (x0+x1)/2, y: y0 + h*0.75, filled: true, w, h: h/2 });
    } else { if (w/h < 0.7 || w/h > 2.6) continue; heads.push({ x: (x0+x1)/2, y: (y0+y1)/2, filled: true, w, h }); }
  }
  // x heads (cymbals): small thin-stroke shapes with both diagonals dark
  const rest = bin.slice(); for (const hd of heads) for (let y = Math.round(hd.y - hd.h/2 - 1); y <= Math.round(hd.y + hd.h/2 + 1); y++) for (let x = Math.round(hd.x - hd.w/2 - 1); x <= Math.round(hd.x + hd.w/2 + 1); x++) if (y >= 0 && y < H && x >= 0 && x < W) rest[y*W+x] = 0;
  // dilate by 1px so slightly broken strokes still count
  const dil = new Uint8Array(W*H);
  for (let y = Math.max(1, yA); y <= Math.min(H-2, yB); y++) for (let x = Math.max(1, xa); x <= Math.min(W-2, xb); x++)
    if (rest[y*W+x] || rest[y*W+x-1] || rest[y*W+x+1] || rest[(y-1)*W+x] || rest[(y+1)*W+x]) dil[y*W+x] = 1;
  const at = (x, y) => { x = Math.round(x); y = Math.round(y); return x >= 0 && x < W && y >= 0 && y < H ? dil[y*W+x] : 0; };
  const half = 0.36*sp, N = 11, xs = [];
  // cymbals sit at a few known heights: scan those rows for an "x" shape
  for (const pos of [11, 10, 9, 8, 7, 0, -1, -2]) {
    const yc = st.bottom - pos*sp/2, cand = [];
    for (let x = xa + half; x <= xb - half; x++) {
      let best = 0;
      for (let dy = -Math.round(0.12*sp); dy <= Math.round(0.12*sp); dy++) {
        const y = yc + dy; let a = 0, b = 0;
        for (let i = 0; i < N; i++) { const t = -1 + 2*i/(N-1); if (at(x + t*half, y + t*half)) a++; if (at(x + t*half, y - t*half)) b++; }
        const holes = at(x, y - half) + at(x, y + half) + at(x - half, y) + at(x + half, y);
        const sc = Math.min(a, b)/N - 0.15*holes;
        if (sc > best) best = sc;
      }
      if (best >= 0.7) cand.push({ x, sc: best });
    }
    // keep local maxima
    cand.sort((p, q) => q.sc - p.sc);
    for (const c of cand) if (!xs.some(o => Math.abs(o.x - c.x) < 0.8*sp && Math.abs(o.y - yc) < 0.8*sp)) xs.push({ x: c.x, y: yc, sc: c.sc });
  }
  for (const c of xs) heads.push({ x: c.x, y: c.y, filled: false, w: 2*half, h: 2*half });
  return heads;
}
// Staff position (0 = bottom line, 1 = bottom space, … 8 = top line) -> drum
function omrDrum(pos, filled){
  if (filled) {
    if (pos <= 1) return pos >= -2 ? "kick" : null;
    if (pos <= 3) return "floor";
    if (pos === 4) return "tom2";
    if (pos === 5) return "snare";
    if (pos === 6) return "tom2";
    if (pos <= 9) return "tom1";
    return null;
  }
  if (pos >= 10 && pos <= 12) return "crash";
  if (pos === 9) return "hihat";
  if (pos === 7 || pos === 8) return "ride";
  if (pos >= -3 && pos <= 0) return "hhp";
  if (pos === 5) return "snare"; // cross-stick
  if (pos === 6) return "hihat";
  return null;
}
// Notes inside one bar -> 16th-note steps, assuming roughly proportional spacing.
function omrQuantize(cols, x0m, R, beats){
  let best = null;
  for (const d of [beats, beats*2, beats*4]) {
    const w = (R - x0m)/d; if (w <= 0) continue;
    const ks = cols.map(c => Math.max(0, Math.round((c.x - x0m)/w)));
    if (ks.some(k => k >= d) || ks.some((k, i) => i && k <= ks[i-1])) continue;
    const err = cols.reduce((s, c, i) => s + Math.abs((c.x - x0m)/w - ks[i]), 0) / cols.length;
    const score = err + 0.04*Math.log2(d/beats);
    if (!best || score < best.score) best = { score, d, ks, err };
  }
  if (!best) { // fall back to 16ths, pushing collisions along
    const d = beats*4, w = (R - x0m)/d; let last = -1;
    const ks = cols.map(c => { let k = Math.max(last+1, Math.round((c.x - x0m)/w)); last = k; return Math.min(d-1, k); });
    best = { d, ks, err: 0.5 };
  }
  return { steps: best.ks.map(k => k*(beats*4/best.d)), err: best.err };
}
function omrPage(canvas, beats){
  let c = canvas;
  if (c.width > 1800) { const s = 1800/c.width, o = document.createElement("canvas"); o.width = 1800; o.height = Math.round(c.height*s); o.getContext("2d").drawImage(c, 0, 0, o.width, o.height); c = o; }
  let { bin, W, H } = omrBinarize(c);
  const ang = omrSkew(bin, W, H);
  if (Math.abs(ang) >= 0.25) { c = omrRotate(c, ang); ({ bin, W, H } = omrBinarize(c)); }
  const staves = omrStaves(bin, W, H);
  const out = { staves: [], measures: [], canvas: c, angle: ang };
  staves.forEach((st, si) => {
    const sp = st.sp;
    const prevB = si ? staves[si-1].bottom : -1e9, nextT = si < staves.length-1 ? staves[si+1].top : 1e9;
    const yA = Math.max(0, Math.round(Math.max(st.top - 4.5*sp, (prevB + st.top)/2)));
    const yB = Math.min(H-1, Math.round(Math.min(st.bottom + 4*sp, (st.bottom + nextT)/2)));
    const raw = bin.slice();
    omrRemoveLines(bin, W, H, st);
    const { bars } = omrStrokes(bin, W, H, st, yA, yB, raw);
    const heads = omrHeads(bin, raw, W, H, st, yA, yB).map(hd => {
      const pos = Math.round((st.bottom - hd.y)/(sp/2)); return { ...hd, pos, d: omrDrum(pos, hd.filled) };
    }).filter(hd => hd.d);
    // barlines -> bar boundaries (merge double barlines / repeat signs)
    const bx = bars.map(b => b.x).sort((a, b) => a-b).filter((x, i, a) => !i || x - a[i-1] > 1.2*sp);
    const bounds = [st.x0, ...bx.filter(x => x > st.x0 + 2*sp)];
    if (st.x1 - bounds[bounds.length-1] > 3*sp) bounds.push(st.x1);
    for (let i = 0; i + 1 < bounds.length; i++) {
      const L = bounds[i], R = bounds[i+1]; if (R - L < 3*sp) continue;
      const hs = heads.filter(hd => hd.x > L + 0.3*sp && hd.x < R - 0.3*sp).sort((a, b) => a.x - b.x);
      const cols = [];
      for (const hd of hs) { const last = cols[cols.length-1]; if (last && hd.x - last.x < 0.7*sp) { last.heads.push(hd); last.x = last.heads.reduce((s, q) => s + q.x, 0)/last.heads.length; } else cols.push({ x: hd.x, heads: [hd] }); }
      out.measures.push({ staff: si, L, R, first: i === 0, cols, sp });
    }
    out.staves.push({ ...st, bars: bx, heads });
  });
  // typical gap between a barline and a bar's first note (used where a bar may start with a rest)
  const pads = out.measures.filter(m => !m.first && m.cols.length).map(m => m.cols[0].x - m.L).sort((a, b) => a-b);
  const pad = pads.length ? pads[Math.floor(pads.length*0.25)] : null;
  for (const m of out.measures) {
    if (!m.cols.length) { m.steps = []; continue; }
    const x0m = m.first || pad == null ? m.cols[0].x : Math.min(m.cols[0].x, m.L + pad);
    const q = omrQuantize(m.cols, x0m, m.R - 0.15*m.sp, beats); m.steps = q.steps; m.err = q.err;
  }
  return out;
}
function omrOverlay(page){
  const c = page.canvas, o = document.createElement("canvas"); o.width = c.width; o.height = c.height;
  const x = o.getContext("2d"); x.drawImage(c, 0, 0); x.lineWidth = 2;
  for (const st of page.staves) {
    x.strokeStyle = "rgba(40,160,90,.55)"; for (const L of st.lines) { x.beginPath(); x.moveTo(st.x0, L.y); x.lineTo(st.x1, L.y); x.stroke(); }
    x.strokeStyle = "rgba(40,110,230,.9)"; x.lineWidth = 3; for (const b of st.bars) { x.beginPath(); x.moveTo(b, st.top - 4); x.lineTo(b, st.bottom + 4); x.stroke(); }
    x.lineWidth = 3;
    for (const hd of st.heads) { x.strokeStyle = D[hd.d].color === "#FFD166" ? "#C99700" : D[hd.d].color; x.beginPath(); x.ellipse(hd.x, hd.y, hd.w/2 + 3, hd.h/2 + 3, 0, 0, Math.PI*2); x.stroke(); }
  }
  let n = 0; x.font = "bold 16px sans-serif"; x.fillStyle = "rgba(40,110,230,1)";
  for (const m of page.measures) { n++; const st = page.staves[m.staff]; x.fillText(String(n), m.L + 4, st.top - st.sp*1.2); }
  return o;
}
function srOfflineRead(canvases, beats){
  const notes = [], overlays = []; let bar = 0, heads = 0, staves = 0, errs = [];
  const spb = beats*4;
  for (const c of canvases) {
    const pg = omrPage(c, beats); staves += pg.staves.length;
    for (const m of pg.measures) {
      m.cols.forEach((col, i) => { const s = bar*spb + m.steps[i]; for (const hd of col.heads) { heads++; if (!notes.some(n => n.s === s && n.d === hd.d)) notes.push({ s, d: hd.d }); } });
      if (m.err != null) errs.push(m.err);
      bar++;
    }
    overlays.push(omrOverlay(pg));
  }
  if (!staves) throw new Error("No 5-line drum staves were found. Use a straight, well-lit photo or a clean scan, or try the AI reader.");
  const avgErr = errs.length ? errs.reduce((a, b) => a+b, 0)/errs.length : 0;
  const report = `Found ${staves} staff line${staves>1?"s":""}, ${bar} bar${bar>1?"s":""} and ${heads} notes.` + (avgErr > 0.2 ? " The rhythm was hard to work out in some bars: check the timing." : "");
  return { title: "", bpm: 0, beats, bars: Math.max(1, bar), notes, report, overlays };
}

/* ============ the "Read sheet music" dialog ============ */
let SRD = null; // {file, pages}
function srMethod(){ const m = settings.ai.method; if (m === "auto") return srKey() ? "ai" : "offline"; return m; }
async function srOpen(file){
  SRD = { file, pages: null };
  const dlg = $("#srDialog"); dlg.hidden = false;
  $("#srFile").textContent = file.name; $("#srErr").textContent = ""; $("#srStatus").textContent = "Opening…";
  $("#srGo").disabled = true; $("#srMethod").value = srMethod(); $("#srBeats").value = "4"; srMethodHint();
  try {
    const { canvases, total } = await srFileToCanvases(file);
    SRD.pages = canvases;
    const pv = $("#srPreview"); pv.innerHTML = "";
    canvases.forEach(c => { const im = h("img", { src: c.toDataURL("image/jpeg", 0.6), alt: "Page preview" }); pv.appendChild(im); });
    $("#srStatus").textContent = `${canvases.length} page${canvases.length>1?"s":""}` + (total > canvases.length ? ` (only the first ${SR_MAX_PAGES} of ${total} are read)` : "");
    $("#srGo").disabled = false;
  } catch (e) { console.error(e); $("#srStatus").textContent = ""; $("#srErr").textContent = "Couldn't open that file: " + e.message; }
}
function srMethodHint(){
  const m = $("#srMethod").value, prov = aiProv(), P = provInfo(prov), k = !!srKey(prov) || !!P.editBase;
  const name = P.label.replace(/ \(.*\)$/, "");
  $("#srHint").innerHTML = m === "ai"
    ? (k ? `Uses <b>your</b> ${esc(name)} key, model ${esc(srModel(prov))}. ${prov === "gemini" || prov === "groq" || /:free$|openrouter\/free/.test(srModel(prov)) ? "Free within the provider's limits." : "May be charged to your account."}` : `<span style="color:var(--amber)">No ${esc(name)} key set.</span> Add one under Library → Sheet reading, or use the offline reader.`)
    : "Runs on this device, free. Best on clean printed sheets with simple rhythms; photos should be straight and evenly lit. It reads which drum and when, but not accents, ghost notes or open hi-hats: add those in the editor, or use the AI reader.";
  }
function srClose(){ $("#srDialog").hidden = true; SRD = null; }
async function srGo(){
  if (!SRD || !SRD.pages) return;
  const method = $("#srMethod").value, beats = +$("#srBeats").value, go = $("#srGo");
  $("#srErr").textContent = ""; go.disabled = true; go.textContent = "Reading…";
  const step = t => { $("#srStatus").textContent = t; };
  try {
    let res;
    if (method === "ai") res = await srAiRead(SRD.pages, step, beats);
    else { step("Reading notes…"); await new Promise(r => setTimeout(r, 30)); res = srOfflineRead(SRD.pages, beats); }
    if (!res.notes.length) throw new Error("No notes were found. " + (method === "offline" ? "Try the AI reader, or a clearer image." : (res.report || "")));
    const name = SRD.file.name.replace(/\.[^.]+$/, "");
    const song = { id: uid(), title: res.title || name, bpm: res.bpm || 80, bars: Math.min(64, res.bars), beats: res.beats, notes: res.notes.filter(n => n.s < 64*res.beats*4), source: method === "ai" ? "Read by AI from sheet" : "Read offline from sheet" };
    const file = SRD.file, overlays = res.overlays;
    srClose(); saveSong(song); openEditor(song);
    if (overlays) showTraceCanvases(overlays, "What the offline reader found (circles = notes it read, blue = barlines, numbers = bars)"); else showTrace(file);
    toast(`Read ${song.notes.length} notes in ${song.bars} bar${song.bars>1?"s":""}. Check them against the sheet, then Practise`);
    if (res.report) setTimeout(()=>toast(res.report + (res.usage ? ` (${res.usage})` : "")), 3400);
  } catch (e) { console.error(e); $("#srErr").textContent = e.message; $("#srStatus").textContent = ""; }
  finally { go.disabled = false; go.textContent = "Read notes"; }
}

/* ============ settings card ============ */
function srRenderSettings(){
  const prov = aiProv(), P = provInfo(prov), k = srKey(prov);
  $("#aiProvider").value = prov; $("#aiMethod").value = settings.ai.method; $("#aiRemember").checked = settings.ai.remember;
  $("#aiKey").placeholder = P.keyHint; $("#aiKey").value = "";
  $("#aiKeyState").textContent = k ? (settings.ai.remember ? "Key saved on this device: ••••" + k.slice(-4) : "Key set for this session only: ••••" + k.slice(-4)) : (P.editBase ? "No key set (some local servers don't need one)." : "No key set for this provider.");
  $("#aiProvider").innerHTML = srProviderOptions(); $("#aiProvider").value = prov;
  $("#aiBaseRow").hidden = !P.editBase; $("#aiBase").value = srBase(prov);
  $("#aiNameRow").hidden = !P.mine; $("#aiName").value = P.mine ? P.label : "";
  srRenderModels();
  $("#aiProvNote").textContent = P.note;
  const link = $("#aiKeyLink"); link.hidden = !P.keyUrl; if (P.keyUrl) { link.href = P.keyUrl; link.textContent = "Get a " + P.label.replace(/ \(.*\)$/, "") + " key"; }
}
// Model drop-down: suggested models + the ones "Load models" found (remembered per provider) + "type a name".
function srRenderModels(){
  const prov = aiProv(), P = provInfo(prov), cur = srModel(prov), named = Object.fromEntries(P.models);
  const loaded = (settings.ai.loaded && settings.ai.loaded[prov]) || [];
  const ids = [...new Set([...P.models.map(m => m[0]), ...loaded])];
  if (cur && !ids.includes(cur)) ids.unshift(cur);
  const sel = $("#aiModelSel");
  sel.innerHTML = ids.map(id => `<option value="${esc(id)}"${id === cur ? " selected" : ""}>${esc(named[id] ? `${named[id]} (${id})` : id)}</option>`).join("") + `<option value="__type">Type a model name…</option>`;
  if (!cur) sel.value = "__type";
  $("#aiModel").hidden = sel.value !== "__type"; $("#aiModel").value = cur || "";
  $("#aiModelCount").textContent = loaded.length ? `${loaded.length} models loaded from your account.` : "Press “Load models” to see every model your key can use.";
}
function srProviderOptions(){
  return Object.entries(AI_PROVIDERS).map(([id, P]) => `<option value="${id}">${esc(P.label)}</option>`).join("")
    + (settings.ai.customs || []).map(c => `<option value="${c.id}">${esc(c.label || "My service")} (added by you)</option>`).join("")
    + `<option value="__add">+ Add another service…</option>`;
}
function srSetKey(prov, v){ if (settings.ai.remember) { settings.ai.keys[prov] = v; SR.sessionKeys[prov] = ""; } else { SR.sessionKeys[prov] = v; settings.ai.keys[prov] = ""; } }
function srWire(){
  $("#aiProvider").onchange = e => {
    if (e.target.value === "__add") {
      const c = { id: "c" + Date.now().toString(36), label: "My service " + ((settings.ai.customs || []).length + 1) };
      (settings.ai.customs = settings.ai.customs || []).push(c); settings.ai.provider = c.id; saveSettings(); srRenderSettings();
      toast("Name it, enter its base URL and key, then Load models"); $("#aiName").focus(); return;
    }
    settings.ai.provider = e.target.value; saveSettings(); srRenderSettings();
  };
  $("#aiName").onchange = e => { const c = (settings.ai.customs || []).find(x => x.id === aiProv()); if (c) { c.label = e.target.value.trim() || c.label; saveSettings(); srRenderSettings(); } };
  $("#aiDelService").onclick = () => {
    const id = aiProv(); settings.ai.customs = (settings.ai.customs || []).filter(x => x.id !== id);
    delete settings.ai.keys[id]; delete settings.ai.models[id]; if (settings.ai.bases) delete settings.ai.bases[id];
    settings.ai.provider = "gemini"; saveSettings(); srRenderSettings(); toast("Service removed");
  };
  $("#aiSave").onclick = () => {
    const v = $("#aiKey").value.trim(); let prov = aiProv();
    if (!v) { toast("Paste your API key first"); return; }
    const g = srGuessProvider(v);
    if (g && g !== prov) { prov = settings.ai.provider = g; toast(`That looks like a ${provName(g)} key, so the provider was switched to ${provName(g)}.`); } else toast("API key saved");
    srSetKey(prov, v); saveSettings(); srRenderSettings();
  };
  $("#aiRemove").onclick = () => { const prov = aiProv(); settings.ai.keys[prov] = ""; SR.sessionKeys[prov] = ""; saveSettings(); srRenderSettings(); toast("API key removed from this device"); };
  $("#aiRemember").onchange = e => {
    const keep = {}; for (const p in AI_PROVIDERS) keep[p] = srKey(p);
    settings.ai.remember = e.target.checked; for (const p in keep) srSetKey(p, keep[p]); saveSettings(); srRenderSettings();
  };
  $("#aiModelSel").onchange = e => {
    if (e.target.value === "__type") { $("#aiModel").hidden = false; $("#aiModel").focus(); return; }
    settings.ai.models[aiProv()] = e.target.value; saveSettings(); srRenderModels();
  };
  $("#aiModel").onchange = e => { settings.ai.models[aiProv()] = e.target.value.trim(); saveSettings(); srRenderModels(); };
  $("#aiBase").onchange = e => { (settings.ai.bases = settings.ai.bases || {})[aiProv()] = e.target.value.trim(); if (aiProv() === "custom") settings.ai.baseUrl = e.target.value.trim(); saveSettings(); };
  $("#aiMethod").onchange = e => { settings.ai.method = e.target.value; saveSettings(); };
  const listBtn = async (btn, label, ok) => {
    const prov = aiProv(), k = $("#aiKey").value.trim() || srKey(prov);
    if (!k && !provInfo(prov).editBase) { toast("Paste or save a key first"); return; }
    btn.disabled = true; btn.textContent = "Checking…";
    try { const ids = await srListModels(prov, k); ok(ids); }
    catch (e) { toast(e.message); } finally { btn.disabled = false; btn.textContent = label; }
  };
  $("#aiTest").onclick = () => listBtn($("#aiTest"), "Test key", ids => toast(`The key works (${ids.length} models available)`));
  $("#aiLoad").onclick = () => listBtn($("#aiLoad"), "Load models", ids => {
    settings.ai.loaded = settings.ai.loaded || {}; settings.ai.loaded[aiProv()] = ids; saveSettings(); srRenderModels();
    toast(`${ids.length} models loaded: pick one from the Model list`);
  });
  $("#srMethod").onchange = srMethodHint; $("#srGo").onclick = srGo; $("#srCancel").onclick = srClose;
  srRenderSettings();
}

// articFits() needs the piece in the active kit; the reader works on base ids, so check by type name
function articFitsType(a, id){
  const A = ARTICS[a]; if (!A) return false; if (!A.types) return id !== "hhp" && (id !== "kick" && id !== "kick2" || a === "accent");
  const type = Object.keys(BASE_IDS).find(t => BASE_IDS[t].includes(id)); return A.types.includes(type);
}
