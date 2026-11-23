/* Service worker: lets the app open offline after the first visit.
 * Network first, so a new version on GitHub Pages is picked up as soon as you're online;
 * the cached copy is only used when there's no connection.
 * Bump CACHE when you add or rename files. */
const CACHE = "drum-practice-v5";
const FILES = [
  "./", "index.html", "css/styles.css", "manifest.webmanifest", "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png",
  "js/data.js", "js/storage.js", "js/lessons.js", "js/util.js", "js/kits.js", "js/audio.js", "js/song.js", "js/kit.js", "js/engine.js",
  "js/sheet.js", "js/midi.js", "js/mic.js", "js/importers.js", "js/library.js", "js/sheetreader.js", "js/track.js", "js/audioreader.js", "js/artic.js", "js/editor.js", "js/rudiments.js", "js/progress.js", "js/layout.js", "js/today.js", "js/app.js",
  "vendor/pdfjs/pdf.min.js", "vendor/pdfjs/pdf.worker.min.js"
];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  // "no-cache" makes the browser check GitHub for a newer file instead of using its own saved copy
  e.respondWith(fetch(e.request, { cache: "no-cache" }).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true })));
});
