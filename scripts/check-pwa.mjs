// Headless installability check against a running app: `BASE_URL=http://127.0.0.1:3000 npm run check:pwa`.
// Verifies what a browser needs to offer "install": a manifest with name, standalone display,
// start_url and 192/512 PNG icons that load; a service worker served as JavaScript with a fetch
// handler; the apple-touch-icon; and the offline fallback page.
const base = (process.env.BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const problems = [];
const check = (ok, message) => ok || problems.push(message);
const get = (path) => fetch(base + path, { redirect: "manual" });

const manifestRes = await get("/manifest.webmanifest");
check(manifestRes.status === 200, `manifest: HTTP ${manifestRes.status}`);
const manifest = manifestRes.ok ? await manifestRes.json() : {};
check(Boolean(manifest.name), "manifest: name missing");
check(manifest.display === "standalone", "manifest: display must be standalone");
check(manifest.start_url === "/", "manifest: start_url must be /");
check(manifest.lang === "fr", "manifest: lang must be fr");
for (const size of ["192x192", "512x512"]) check((manifest.icons ?? []).some((i) => i.sizes === size && i.type === "image/png"), `manifest: no ${size} PNG icon`);
check((manifest.icons ?? []).some((i) => i.purpose === "maskable"), "manifest: no maskable icon");
for (const icon of manifest.icons ?? []) {
  const res = await get(icon.src);
  check(res.status === 200 && (res.headers.get("content-type") ?? "").includes("image/png"), `icon ${icon.src}: HTTP ${res.status}`);
}

const sw = await get("/sw.js");
const swText = sw.ok ? await sw.text() : "";
check(sw.status === 200 && (sw.headers.get("content-type") ?? "").includes("javascript"), `sw.js: HTTP ${sw.status}`);
check(swText.includes('addEventListener("fetch"'), "sw.js: no fetch handler");
check(swText.includes('addEventListener("push"'), "sw.js: no push handler");
check(/no-cache|no-store/.test(sw.headers.get("cache-control") ?? ""), "sw.js: must be served with Cache-Control no-cache");

check((await get("/offline.html")).status === 200, "offline.html missing");

const page = await fetch(base + "/connexion");
const html = await page.text();
check(html.includes('rel="manifest"'), "page: no <link rel=manifest>");
check(html.includes('rel="apple-touch-icon"'), "page: no apple-touch-icon");

if (problems.length) {
  console.error(`PWA check failed:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log("PWA check passed: manifest, icons, service worker, offline page");
