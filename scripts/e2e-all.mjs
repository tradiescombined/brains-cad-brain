#!/usr/bin/env node
// One-command browser test run: build, fresh temp DB, `next start` on a free port, every e2e suite
// in sequence TWICE (alphabetical, then reversed) against the same DB to prove the suites are
// order-independent, then a summary table. Exits non-zero on any failure.
//
//   npm run e2e:all                     # full run
//   npm run e2e:all -- --skip-build     # reuse the existing .next build
//   npm run e2e:all -- leads estimates  # only suites whose file name contains one of these words
//
// The database is always a throwaway copy in the OS temp dir (DATABASE_URL=file:<tmp>/bcb.db);
// data/bcb.db is never touched.
import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const skipBuild = args.includes("--skip-build");
const filters = args.filter((a) => !a.startsWith("--"));
const bin = (name) => path.join(root, "node_modules", ".bin", name);

const tmp = mkdtempSync(path.join(tmpdir(), "bcb-e2e-"));
const dbUrl = `file:${path.join(tmp, "bcb.db")}`;
// BCB_AUTH_BYPASS: suites run without real Google/Apple OAuth (see README). auth.e2e.mjs skips itself.
// `next start` is a production build, where the bypass is only honoured with BCB_ALLOW_TEST_BYPASS=1 as
// well (src/lib/auth-bypass.ts).
const env = { ...process.env, DATABASE_URL: dbUrl, NEXT_TELEMETRY_DISABLED: "1", BCB_AUTH_BYPASS: "1", BCB_ALLOW_TEST_BYPASS: "1" };
delete env.DATABASE_AUTH_TOKEN; // never point a test run at a hosted DB

let server = null;
let cleanedUp = false;
function cleanup() {
  if (cleanedUp) return;
  cleanedUp = true;
  if (server && server.exitCode === null) {
    try { process.kill(-server.pid, "SIGTERM"); } catch {}
  }
  rmSync(tmp, { recursive: true, force: true });
}
process.on("exit", cleanup);
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { cleanup(); process.exit(130); });

function run(cmd, cmdArgs, { quiet = false, extraEnv = {} } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, cmdArgs, { cwd: root, env: { ...env, ...extraEnv }, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    const onData = (d) => { out += d; if (!quiet) process.stdout.write(d); };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("close", (code) => resolve({ code: code ?? 1, out }));
  });
}

async function step(label, cmd, cmdArgs) {
  const t = Date.now();
  process.stdout.write(`▶ ${label} … `);
  const r = await run(cmd, cmdArgs, { quiet: true });
  if (r.code !== 0) {
    console.log("FAILED\n" + r.out);
    cleanup();
    process.exit(1);
  }
  console.log(`ok (${((Date.now() - t) / 1000).toFixed(1)}s)`);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function waitReady(base, ms = 60000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error("next start exited early");
    try {
      const r = await fetch(base + "/dashboard");
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`server not ready after ${ms / 1000}s`);
}

// ---- setup -------------------------------------------------------------------------------------
console.log(`DB: ${dbUrl}`);
await step("reset temp database (schema)", bin("drizzle-kit"), ["push", "--force"]);
await step("seed temp database", bin("tsx"), ["scripts/seed.ts"]);
// The server and the suites' own fixture/cleanup queries open the same SQLite file from different
// processes. WAL lets readers and a writer coexist instead of failing with SQLITE_BUSY.
await step("enable WAL on temp database", process.execPath, [
  "-e",
  `require("@libsql/client").createClient({ url: process.env.DATABASE_URL }).execute("PRAGMA journal_mode = WAL").then(() => process.exit(0), (e) => { console.error(e); process.exit(1); })`,
]);
if (!skipBuild) await step("next build", bin("next"), ["build"]);

const port = await freePort();
const base = `http://127.0.0.1:${port}`;
let serverLog = "";
server = spawn(bin("next"), ["start", "-p", String(port), "-H", "127.0.0.1"], { cwd: root, env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));
process.stdout.write(`▶ next start on ${base} … `);
try {
  await waitReady(base);
} catch (e) {
  console.log(`FAILED: ${e.message}\n${serverLog}`);
  cleanup();
  process.exit(1);
}
console.log("ready");

// ---- suites ------------------------------------------------------------------------------------
let suites = readdirSync(path.join(root, "e2e")).filter((f) => f.endsWith(".e2e.mjs")).sort();
if (filters.length) suites = suites.filter((f) => filters.some((w) => f.includes(w)));
if (!suites.length) {
  console.log("No suites matched.");
  cleanup();
  process.exit(1);
}
const orders = [
  { name: "pass 1 (alphabetical)", list: suites },
  { name: "pass 2 (reversed)", list: [...suites].reverse() },
];

const results = [];
for (const order of orders) {
  console.log(`\n════ ${order.name} ════`);
  for (const file of order.list) {
    console.log(`\n── ${file}`);
    const t = Date.now();
    const r = await run(process.execPath, [path.join("e2e", file)], { extraEnv: { BASE_URL: base } });
    const m = [...r.out.matchAll(/^(\d+) passed, (\d+) failed$/gm)].pop();
    results.push({
      pass: order.name.split(" ")[0] + " " + order.name.split(" ")[1],
      suite: file.replace(".e2e.mjs", ""),
      passed: m ? Number(m[1]) : 0,
      failed: m ? Number(m[2]) : null,
      code: r.code,
      secs: (Date.now() - t) / 1000,
    });
  }
}

cleanup();
if (results.some((r) => r.code !== 0)) {
  const errs = serverLog.split("\n").filter((l) => /error|SQLITE|unhandled|⨯/i.test(l));
  if (errs.length) console.log(`\nServer errors logged during the run (last 30):\n  ${errs.slice(-30).join("\n  ")}`);
}

// ---- summary -----------------------------------------------------------------------------------
const rows = results.map((r) => [
  r.pass,
  r.suite,
  String(r.passed),
  r.failed === null ? "?" : String(r.failed),
  r.code === 0 ? "PASS" : "FAIL",
  r.secs.toFixed(1) + "s",
]);
const head = ["Pass", "Suite", "Checks ok", "Failed", "Result", "Time"];
const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
const line = (cells) => "| " + cells.map((c, i) => (i >= 2 && i !== 4 ? c.padStart(widths[i]) : c.padEnd(widths[i]))).join(" | ") + " |";
console.log("\n" + line(head));
console.log("|" + widths.map((w) => "-".repeat(w + 2)).join("|") + "|");
for (const r of rows) console.log(line(r));
const failedRuns = results.filter((r) => r.code !== 0);
const totalChecks = results.reduce((s, r) => s + r.passed, 0);
console.log(
  `\n${results.length - failedRuns.length}/${results.length} suite runs passed, ${totalChecks} checks ok` +
    (failedRuns.length ? `; FAILED: ${failedRuns.map((r) => `${r.suite} (${r.pass})`).join(", ")}` : ""),
);
process.exit(failedRuns.length ? 1 : 0);
