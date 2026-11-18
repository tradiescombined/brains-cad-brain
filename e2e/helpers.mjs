// Shared end-to-end helpers. Usage in e2e/<module>.e2e.mjs:
//   import { start, check, done } from "./helpers.mjs";
//   const { page, base } = await start();            // BASE_URL env, default http://localhost:3000
//   await page.goto(base + "/leads"); await check(page.getByRole("heading", { name: "Leads" }).isVisible(), "leads heading");
//   await done();
// Run: BASE_URL=http://localhost:31xx node e2e/<module>.e2e.mjs
import { chromium } from "playwright-core";

const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
let browser, failures = 0, passes = 0;
const consoleErrors = [];

export async function start() {
  browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
  page.on("pageerror", (e) => consoleErrors.push(String(e)));
  page.on("dialog", (d) => d.dismiss());
  page.setDefaultTimeout(15000);
  return { page, browser, base: process.env.BASE_URL ?? "http://localhost:3000" };
}

export async function check(cond, label) {
  try {
    const ok = await cond;
    if (ok) { passes++; console.log("  ✓", label); }
    else { failures++; console.log("  ✗", label); }
  } catch (e) {
    failures++; console.log("  ✗", label, "-", String(e).split("\n")[0]);
  }
}

export async function done() {
  const real = consoleErrors.filter((e) => !/favicon|Download the React DevTools/.test(e));
  if (real.length) { failures++; console.log("  ✗ browser console errors:\n   ", real.slice(0, 10).join("\n    ")); }
  console.log(`\n${passes} passed, ${failures} failed`);
  await browser?.close();
  process.exit(failures ? 1 : 0);
}
