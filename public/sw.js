// Global Sales Coach Service Worker（最小可用 PWA 壳）
// 策略：静态资源缓存优先；API/鉴权请求永远走网络，不缓存。
const CACHE = "gsc-shell-v1";
const SHELL = ["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // API / 鉴权 / 外部资源：不缓存，直接网络
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/") || url.origin !== self.location.origin) {
    return;
  }
  // 同源页面/静态：网络优先，失败回退缓存（离线可看壳）
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match("/"))),
  );
});
