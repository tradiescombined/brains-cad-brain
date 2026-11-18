#!/usr/bin/env node
// npm run serve — runs the production server (`next start`) with safety checks.
//   PORT (default 3000) and HOST (default 0.0.0.0 = reachable from other computers on the network)
//   come from the environment or .env. Output goes to logs/server-YYYY-MM.log (and the terminal).
// Next.js runs inside this same process (no child), so stopping this process always stops the site —
// important for the auto-start services on every OS.
import "./lib/node-check.mjs";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  BIN, BUILD_ENV_STAMP, ROOT, bypassVars, c, clerkKeys, dbFilePath, die, host, loadEnv, port, portInUse, publicEnvHash,
} from "./lib/common.mjs";

process.chdir(ROOT);
loadEnv();
// Warnings go to stderr so they also show when stdout is not a terminal (services, `> file`).
const warnErr = (msg) => console.error(`${c.yellow("!")} ${msg}`);

// ── logging ─────────────────────────────────────────────────────────────────────────────────────
const logDir = path.join(ROOT, "logs");
mkdirSync(logDir, { recursive: true });
const month = new Date().toISOString().slice(0, 7);
const logFile = path.join(logDir, `server-${month}.log`);
// Keep 12 months of server logs.
for (const f of readdirSync(logDir).filter((n) => /^server-\d{4}-\d{2}\.log$/.test(n)).sort().slice(0, -12)) rmSync(path.join(logDir, f), { force: true });
const toTerminal = process.stdout.isTTY; // under a service, stdout is not a terminal: the log file is enough
for (const stream of [process.stdout, process.stderr]) {
  const original = stream.write.bind(stream);
  stream.write = (chunk, ...rest) => {
    try {
      appendFileSync(logFile, typeof chunk === "string" ? chunk.replace(/\x1b\[[0-9;]*m/g, "") : chunk);
    } catch {}
    return toTerminal || stream === process.stderr ? original(chunk, ...rest) : true;
  };
}
console.log(`\n=== ${new Date().toISOString()} starting Brains Cad Brain (pid ${process.pid}) ===`);

// ── safety checks ───────────────────────────────────────────────────────────────────────────────
const bad = bypassVars();
if (bad.length) {
  die(
    `Refusing to start: ${bad.join(" and ")} is set.\n` +
      "  That switch turns sign-in OFF (anyone could use the app as the Owner). It exists only for the\n" +
      "  automated browser tests. Delete the line from .env / .env.local (or your shell/service environment)\n" +
      "  and start again.",
  );
}
if (!existsSync(path.join(ROOT, ".next", "BUILD_ID")) || !existsSync(BIN.next)) {
  die("The app has not been built yet. Run:  npm run setup");
}
const dbFile = dbFilePath();
if (dbFile && !existsSync(dbFile)) die(`Database file not found: ${dbFile}\n  Run npm run setup (or restore a backup: npm run restore -- <file>).`);

const keys = clerkKeys();
if (!keys.publishable || !keys.secret) {
  warnErr(
    c.bold("Sign-in is NOT configured") +
      ": NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and/or CLERK_SECRET_KEY are empty.\n" +
      "  The server will start, but every page will show an error until you add the Clerk keys to .env,\n" +
      "  run npm run setup (rebuild) and restart. See docs/SELF-HOSTING.md → Sign-in.",
  );
} else if (keys.mode === "test") {
  console.log(c.dim("Clerk development keys: fine for use on your local network (option A)."));
}
const stampPath = path.join(ROOT, BUILD_ENV_STAMP);
if (existsSync(stampPath) && readFileSync(stampPath, "utf8").trim() !== publicEnvHash()) {
  warnErr("NEXT_PUBLIC_* settings in .env changed since the last build, so sign-in will NOT work with the new values yet. Run npm run setup (rebuilds) and restart.");
}

const p = port();
const h = host();
if (await portInUse(p, h)) {
  die(
    `Port ${p} is already in use — Brains Cad Brain (or another program) is already running.\n` +
      "  If you installed auto-start, it is probably that: npm run service:status. Or pick another port: PORT=3001 in .env.",
  );
}

// ── start Next.js in this process ───────────────────────────────────────────────────────────────
process.env.NEXT_TELEMETRY_DISABLED = "1";
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    console.log(`=== ${new Date().toISOString()} stopping (${sig}) ===`);
    process.exit(0);
  });
}
process.on("exit", (code) => {
  if (code) console.error(`=== server exited with code ${code} — see ${logFile} ===`);
});
console.log(`Listening on ${h}:${p}. Open http://localhost:${p}${h === "0.0.0.0" ? " (or http://<this computer's IP>:" + p + " from another device)" : ""}`);
console.log(`Log file: ${logFile}`);
process.argv = [process.execPath, BIN.next, "start", "-p", String(p), "-H", h];
await import(pathToFileURL(BIN.next).href);
