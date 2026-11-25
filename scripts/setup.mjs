#!/usr/bin/env node
// npm run setup — first install AND safe re-run. Steps:
//   1. Node version check           4. data/, logs/, backups/ folders
//   2. npm ci (only if needed)      5. database schema (never deletes data)
//   3. .env (only if missing)       6. starter data (only into an empty database)
//                                   7. production build (skipped while the server is running)
// Flags: --skip-build
import "./lib/node-check.mjs";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import {
  BIN, BUILD_ENV_STAMP, ROOT, c, clerkKeys, bypassVars, dbFilePath, dbUrl, die, heading, info, loadEnv, ok, openDb,
  port, portInUse, publicEnvHash, pushSchemaSafely, runNode, runNpm, warn,
} from "./lib/common.mjs";

process.chdir(ROOT);
const skipBuild = process.argv.includes("--skip-build");
console.log(c.bold("TC Quoting Estimate — setup") + c.dim(`  (${ROOT})`));

// 1 ── Node ───────────────────────────────────────────────────────────────────────────────────────
ok(`Node.js ${process.versions.node}`);

// 2 ── dependencies ───────────────────────────────────────────────────────────────────────────────
heading("Dependencies");
const lockHash = createHash("sha256").update(readFileSync(path.join(ROOT, "package-lock.json"))).digest("hex");
const stamp = path.join(ROOT, "node_modules", ".bcb-lock-hash");
const installed = existsSync(stamp) && readFileSync(stamp, "utf8").trim() === lockHash && existsSync(BIN.next);
if (installed) ok("Already installed (package-lock.json unchanged)");
else {
  info("Installing exact versions from package-lock.json (npm ci) — this can take a few minutes …");
  const r = await runNpm(["ci", "--no-audit", "--no-fund"]);
  if (r.code !== 0) die("npm ci failed (see above). Check your internet connection and try again.");
  writeFileSync(stamp, lockHash + "\n");
  ok("Dependencies installed");
}

// 3 ── .env ───────────────────────────────────────────────────────────────────────────────────────
heading("Settings file (.env)");
const envPath = path.join(ROOT, ".env");
if (existsSync(envPath)) ok(".env already exists — left unchanged");
else {
  copyFileSync(path.join(ROOT, ".env.example"), envPath);
  ok("Created .env from .env.example (no secrets are generated: the app needs none of its own)");
}
loadEnv();
const bad = bypassVars();
if (bad.length) warn(`${bad.join(" and ")} is set in your environment/.env. Remove it — it is for automated tests only, and npm run serve will refuse to start.`);

// 4 ── folders ────────────────────────────────────────────────────────────────────────────────────
for (const d of ["data", "logs", "backups"]) mkdirSync(path.join(ROOT, d), { recursive: true });
const dbFile = dbFilePath();
if (dbFile) mkdirSync(path.dirname(dbFile), { recursive: true });

// 5 ── schema ─────────────────────────────────────────────────────────────────────────────────────
heading("Database");
info(dbFile ? `SQLite file: ${dbFile}` : `Hosted database: ${dbUrl().replace(/\?.*$/, "")}`);
if (!(await pushSchemaSafely())) process.exit(1);

// 6 ── starter data ───────────────────────────────────────────────────────────────────────────────
const client = await openDb(dbUrl());
const { rows } = await client.execute("SELECT count(*) AS n FROM business_settings");
client.close();
if (Number(rows[0].n) > 0) ok("Database already has data — starter data not added");
else {
  info("Empty database: adding starter data (tax rates, lists, a starter price list, one sample client/estimate) …");
  const r = await runNode(BIN.tsx, ["scripts/seed.ts"]);
  if (r.code !== 0) die("Adding starter data failed (see above).");
  ok("Starter data added. The first person to sign in becomes the Owner.");
}

// 7 ── build ──────────────────────────────────────────────────────────────────────────────────────
heading("Build");
if (skipBuild) warn("Skipped (--skip-build)");
else if (await portInUse()) {
  warn(
    `Something is running on port ${port()} (probably TC Quoting Estimate itself). Building now would break the running site, so the build was skipped.\n` +
      "  Stop the server (Ctrl+C in its window, or npm run service:stop) and run npm run setup again.",
  );
} else {
  info("Building the production app (next build) — usually 1–3 minutes …");
  const r = await runNode(BIN.next, ["build"], { env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" } });
  if (r.code !== 0) die("The build failed (see above).");
  writeFileSync(path.join(ROOT, BUILD_ENV_STAMP), publicEnvHash() + "\n");
  ok("Built");
}

// ── summary ──────────────────────────────────────────────────────────────────────────────────────
heading("Done");
const keys = clerkKeys();
if (!keys.publishable || !keys.secret) {
  warn(
    "Sign-in is not configured yet: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY are empty in .env.\n" +
      "  Paste your Clerk keys into .env (see docs/SELF-HOSTING.md → Sign-in), then run npm run setup again\n" +
      "  (the publishable key is built into the app, so a rebuild is needed after changing it).",
  );
} else ok(`Clerk keys found (${keys.mode === "live" ? "production" : keys.mode === "test" ? "development" : "unknown"} instance)`);
console.log(`\nStart the server with:  ${c.bold("npm run serve")}   then open http://localhost:${port()}`);
console.log(`Check everything with:  ${c.bold("npm run doctor")}`);
