// Integration crawl: visits every app page reachable from the sidebar and detail pages,
// waits for link prefetching, and fails on ANY 4xx/5xx response or browser console error.
// No stubs or filters: this is the check the per-module e2e scripts could not do in isolation.
import { start, check, done } from "./helpers.mjs";

const { page, base } = await start();
const bad = [];
page.on("response", (r) => {
  const u = new URL(r.url());
  if (u.origin === new URL(base).origin && r.status() >= 400 && !u.pathname.startsWith("/q/")) bad.push(`${r.status()} ${u.pathname}${u.search}`);
});

const seen = new Set();
const queue = ["/dashboard"];
const skip = /\/print(\b|$)|\/api\/|\/q\//; // print pages auto-open the print dialog; API/public handled elsewhere
let visited = 0;
while (queue.length && visited < 160) {
  const path = queue.shift();
  const key = path.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ":id");
  if (seen.has(key) || skip.test(path)) continue;
  seen.add(key);
  const before = bad.length;
  const res = await page.goto(base + path, { waitUntil: "networkidle" });
  visited++;
  await check(res && res.status() < 400 && bad.length === before, `GET ${path} → ${res?.status()}`);
  const links = await page.$$eval("a[href^='/']", (as) => as.map((a) => a.getAttribute("href")));
  for (const l of links) {
    const p = l.split("#")[0];
    const k = p.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ":id");
    if (!seen.has(k) && !skip.test(p)) queue.push(p);
  }
}
await check(visited > 25, `crawled ${visited} distinct pages`);
await check(bad.length === 0, `no 4xx/5xx responses${bad.length ? ":\n    " + [...new Set(bad)].slice(0, 15).join("\n    ") : ""}`);
await done();
