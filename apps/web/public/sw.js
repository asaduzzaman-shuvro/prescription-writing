/* RxPad offline app shell. The doctor app is a single page (/doctor) with hash routing, so caching
   that page plus Next's static assets and fonts is enough to open it with no network. Patient data
   lives in the browser SQLite managed by PowerSync, not in this cache. */
const CACHE = "rxpad-shell-v3";
const SHELL = ["/doctor", "/fonts/NotoSansBengali.ttf", "/fonts/NotoSans.ttf", "/manifest.webmanifest", "/icon.svg"];

const isAsset = (path) => path.startsWith("/_next/static/") || path.startsWith("/fonts/");

/** Cache the shell plus every build asset the /doctor page references. */
async function precache() {
  const c = await caches.open(CACHE);
  await c.addAll(SHELL);
  const html = await (await c.match("/doctor"))?.text();
  const urls = [...new Set((html ?? "").match(/\/_next\/static\/[^"'\s)\\]+/g) ?? [])];
  await Promise.all(urls.map((u) => c.add(u).catch(() => {})));
}

self.addEventListener("install", (e) => {
  e.waitUntil(precache().then(() => self.skipWaiting()));
});

// The page posts the resources it already loaded (before this worker controlled it) so they are cached too.
self.addEventListener("message", (e) => {
  if (e.data && e.data.clearShell) {
    e.waitUntil(caches.open(CACHE).then((c) => c.delete("/doctor")));
    return;
  }
  const urls = (e.data && e.data.cacheUrls) || [];
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      Promise.all(
        urls
          .map((u) => new URL(u, self.location.origin))
          .filter((u) => u.origin === self.location.origin && isAsset(u.pathname))
          .map((u) => c.match(u.pathname + u.search).then((hit) => hit || c.add(u.pathname + u.search).catch(() => {}))),
      ),
    ),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

async function pageScope() {
  try {
    if (!self.cookieStore) return null;
    const cookie = await self.cookieStore.get("rx_scope");
    return cookie && cookie.value ? cookie.value : "";
  } catch {
    return null;
  }
}

function rememberDoctor(res) {
  if (res.ok && !res.redirected) {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put("/doctor", copy));
  }
  return res;
}

async function doctorNavigate(req) {
  const cached = await caches.match("/doctor");
  const network = fetch(req).then(rememberDoctor);
  const scope = await pageScope();
  const cachedScope = cached ? cached.headers.get("x-rx-scope") || "" : "";
  const sameSignIn = scope != null && scope !== "" && cached && cachedScope === scope;
  if (!sameSignIn) {
    try {
      return await network;
    } catch {
      return cached || Response.error();
    }
  }
  // Localhost answers well under this. A slow shared host shows the last shell and refreshes the cache behind it.
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(cached.clone()), 800);
    network.then(
      (res) => {
        clearTimeout(timer);
        resolve(res.ok ? res : cached.clone());
      },
      () => {
        clearTimeout(timer);
        resolve(cached.clone());
      },
    );
  });
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Never cache API calls, auth or the sync endpoints.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/login")) return;

  // Doctor app page: use the cached shell when this sign-in matches and the server is slow.
  // A different user or chamber always waits for the network. Offline still falls back to the cache.
  if (req.mode === "navigate" && url.pathname.startsWith("/doctor")) {
    e.respondWith(doctorNavigate(req));
    return;
  }

  // Immutable build assets (JS, CSS, WASM, workers) and fonts: cache first.
  if (isAsset(url.pathname) || url.pathname === "/icon.svg") {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});
