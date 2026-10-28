/* QIS — 오프라인 실행용 서비스 워커
   · 앱 파일(index.html 등): 인터넷이 되면 항상 최신을 받아 쓰고(받은 것은 저장), 안 되면 저장해 둔 것으로 실행
   · 글꼴(Google Fonts): 한 번 받으면 저장해 두고 씀
   · 데이터는 여기서 다루지 않음 (브라우저 저장소 · 지정 폴더에 앱이 직접 저장) */
const VER = 'qms-v0.4.4';                 // 앱을 크게 바꿨을 때만 올리면 됨 (예: qms-v1)
const SHELL = ['./', './index.html', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/favicon-32.png',
  './lib/sql-wasm.js', './lib/sql-wasm.wasm'];   // SQLite 엔진 (QIS.sqlite 만들기) — 오프라인에서도 동작
const FONT_CACHE = 'qms-fonts';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VER).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== VER && k !== FONT_CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// 인터넷 우선 (3초 안에 응답 없으면 저장본)
function networkFirst(req) {
  return caches.open(VER).then(cache => new Promise(resolve => {
    let done = false;
    const fallback = () => cache.match(req, { ignoreSearch: true })
      .then(r => r || cache.match('./index.html'))
      .then(r => { if (!done) { done = true; resolve(r || new Response('오프라인 — 앱 파일이 아직 저장되지 않았습니다', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })); } });
    const t = setTimeout(fallback, 3000);
    // 브라우저 HTTP 캐시(GitHub Pages는 10분)를 건너뛰고 서버에 새 버전이 있는지 확인
    fetch(req, { cache: 'no-cache' }).then(res => {
      if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
      clearTimeout(t);
      if (!done) { done = true; resolve(res); }
    }).catch(() => { clearTimeout(t); fallback(); });
  }));
}
// 저장본 우선 (글꼴)
function cacheFirst(req) {
  return caches.open(FONT_CACHE).then(cache => cache.match(req).then(hit => hit || fetch(req).then(res => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()).catch(() => {});
    return res;
  }).catch(() => hit)));
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') { e.respondWith(cacheFirst(req)); return; }
  if (url.origin !== self.location.origin) return;
  e.respondWith(networkFirst(req));
});
