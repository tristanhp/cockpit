// Cockpit service worker: an offline shell and push notifications. Hand-written and small.
// Never caches /api/ responses: they are authenticated.
const VERSION = "v1";
const STATIC = `cockpit-static-${VERSION}`;
const PAGES = `cockpit-pages-${VERSION}`;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC).then((c) => c.addAll(["/offline.html", "/icons/icon-192.png"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => ![STATIC, PAGES].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  // Build output and icons never change under the same URL: cache first.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            // Clone before the page consumes the body.
            const copy = res.clone();
            if (res.ok) event.waitUntil(caches.open(STATIC).then((c) => c.put(req, copy)));
            return res;
          }),
      ),
    );
    return;
  }

  // Pages: the network first; keep the last Aujourd'hui for reading offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          if (res.ok && !res.redirected && url.pathname === "/" && !url.search) event.waitUntil(caches.open(PAGES).then((c) => c.put("/", copy)));
          return res;
        })
        .catch(async () => (url.pathname === "/" && (await caches.match("/", { cacheName: PAGES }))) || caches.match("/offline.html")),
    );
  }
});

self.addEventListener("push", (event) => {
  let data = { title: "Cockpit", body: "", url: "/" };
  try {
    data = { ...data, ...event.data.json() };
  } catch {}
  event.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", data: { url: data.url }, tag: data.url }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((all) => {
      const open = all.find((c) => c.url.startsWith(self.location.origin));
      if (open) return open.navigate(target).then((c) => c && c.focus());
      return self.clients.openWindow(target);
    }),
  );
});
