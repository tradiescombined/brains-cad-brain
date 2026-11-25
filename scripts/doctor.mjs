#!/usr/bin/env node
// npm run doctor — health check. Read-only (apart from `git fetch`, which only downloads news).
// Exit code 1 if any check FAILED (warnings don't count).
import "./lib/node-check.mjs";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  BACKUP_RE, BIN, BUILD_ENV_STAMP, ROOT, bypassVars, c, clerkKeys, dbFilePath, dbUrl, extraBackupDir, git, host, loadEnv, openDb, port, portInUse, publicEnvHash,
} from "./lib/common.mjs";

process.chdir(ROOT);
const envFiles = loadEnv();
let failures = 0;
const row = (state, label, detail = "") => {
  const mark = { ok: c.green("OK  "), warn: c.yellow("WARN"), fail: c.red("FAIL"), info: c.cyan("INFO") }[state];
  if (state === "fail") failures++;
  console.log(`${mark}  ${label.padEnd(22)} ${detail}`);
};
const ago = (ms) => {
  const h = ms / 3600000;
  return h < 1 ? `${Math.round(ms / 60000)} min ago` : h < 48 ? `${h.toFixed(1)} h ago` : `${(h / 24).toFixed(1)} days ago`;
};

console.log(c.bold("TC Quoting Estimate — doctor") + c.dim(`  (${ROOT})\n`));

// Node
row("ok", "Node.js", process.versions.node);

// .env + keys
if (!existsSync(path.join(ROOT, ".env"))) row("fail", ".env", "missing — run npm run setup");
else row("ok", ".env", `present (also read: ${envFiles.filter((f) => f !== ".env").join(", ") || "none"})`);
const keys = clerkKeys();
if (!keys.publishable || !keys.secret) row("fail", "Clerk keys", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY / CLERK_SECRET_KEY empty — nobody can sign in");
else row("ok", "Clerk keys", keys.mode === "live" ? "production instance (pk_live_)" : keys.mode === "test" ? "development instance (pk_test_) — local network use" : "set (unrecognised format)");
const bad = bypassVars();
if (bad.length) row("fail", "Test bypass", `${bad.join(", ")} is set — remove it (serve refuses to start)`);
else row("ok", "Test bypass", "off");
if (process.env.BCB_OWNER_EMAIL) row("info", "Owner email", process.env.BCB_OWNER_EMAIL);

// Dependencies + build
if (!existsSync(BIN.next)) row("fail", "Dependencies", "not installed — run npm run setup");
else row("ok", "Dependencies", "installed");
const buildId = path.join(ROOT, ".next", "BUILD_ID");
if (!existsSync(buildId)) row("fail", "Build", "no production build — run npm run setup");
else {
  const built = statSync(buildId).mtime;
  const stamp = path.join(ROOT, BUILD_ENV_STAMP);
  const stale = existsSync(stamp) && readFileSync(stamp, "utf8").trim() !== publicEnvHash();
  row(stale ? "warn" : "ok", "Build", `built ${built.toLocaleString()}${stale ? " — NEXT_PUBLIC_* settings changed since; run npm run setup" : ""}`);
}

// Database
const file = dbFilePath();
try {
  if (file && !existsSync(file)) throw new Error(`no file at ${file} — run npm run setup`);
  const client = await openDb(dbUrl());
  const counts = {};
  for (const t of ["users", "clients", "estimates", "jobs", "invoices"]) {
    try {
      counts[t] = Number((await client.execute(`SELECT count(*) AS n FROM ${t}`)).rows[0].n);
    } catch {
      counts[t] = "?";
    }
  }
  const owner = (await client.execute("SELECT email, clerk_user_id FROM users WHERE role = 'Owner' AND active = 1 ORDER BY created_at LIMIT 1")).rows[0];
  client.close();
  const size = file ? ` (${(statSync(file).size / 1024 / 1024).toFixed(1)} MB)` : "";
  row("ok", "Database", `${file ?? dbUrl()}${size}`);
  row("info", "Records", Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", "));
  if (owner && !owner.clerk_user_id) row("warn", "Owner", "nobody has signed in yet — sign in now so YOU become the Owner");
} catch (e) {
  row("fail", "Database", String(e.message ?? e));
}

// Server
const p = port();
if (await portInUse(p)) {
  let detail = `something is listening on port ${p}`;
  try {
    const r = await fetch(`http://127.0.0.1:${p}/sign-in`, { redirect: "manual", signal: AbortSignal.timeout(8000) });
    detail = `serving on port ${p} (GET /sign-in → ${r.status})`;
    row(r.status === 200 ? "ok" : "warn", "Server", detail + (r.status === 200 ? "" : " — check logs/server-*.log"));
  } catch {
    row("warn", "Server", `${detail}, but it did not answer like TC Quoting Estimate`);
  }
} else row("warn", "Server", `not running (port ${p} free) — start with npm run serve`);
row("info", "Listen address", `${host()}:${p}`);

// Backups
const dir = path.join(ROOT, "backups");
// Newest last, by file time (same-minute names like -2/-3 don't sort chronologically as text).
const list = existsSync(dir)
  ? readdirSync(dir)
      .filter((n) => BACKUP_RE.test(n))
      .sort((a, b) => statSync(path.join(dir, a)).mtimeMs - statSync(path.join(dir, b)).mtimeMs)
  : [];
if (!list.length) row("warn", "Backups", "none yet — run npm run backup (and npm run service:install for nightly backups)");
else {
  const age = Date.now() - statSync(path.join(dir, list.at(-1))).mtimeMs;
  row(age > 36 * 3600000 ? "warn" : "ok", "Last backup", `${list.at(-1)} (${ago(age)}, ${list.length} kept)`);
}
const extraDir = extraBackupDir();
if (extraDir) {
  const n = existsSync(extraDir) ? readdirSync(extraDir).filter((f) => BACKUP_RE.test(f)).length : 0;
  row(existsSync(extraDir) ? "ok" : "warn", "Extra backup folder", extraDir + (existsSync(extraDir) ? ` (${n} backups)` : " (not created yet; the next backup creates it)"));
}

// Git
if (git(["rev-parse", "--is-inside-work-tree"]).out !== "true") row("warn", "Git", "not a git clone — npm run update won't work");
else {
  const head = git(["rev-parse", "--short", "HEAD"]).out;
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]).out;
  const dirty = git(["status", "--porcelain", "--untracked-files=no"]).out;
  const up = git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
  if (up.code !== 0) row("warn", "Git", `${branch} @ ${head}, no upstream branch`);
  else {
    const fetched = git(["fetch", "--quiet"]).code === 0;
    const [ahead, behind] = git(["rev-list", "--left-right", "--count", `HEAD...${up.out}`]).out.split(/\s+/).map(Number);
    const state = behind ? `${behind} update(s) available — npm run update` : "up to date";
    row(behind || ahead || !fetched ? "warn" : "ok", "Git", `${branch} @ ${head} vs ${up.out}: ${state}${ahead ? `, ${ahead} local commit(s)` : ""}${fetched ? "" : " (could not reach GitHub; showing last known)"}`);
  }
  if (dirty) row("warn", "Local changes", `${dirty.split("\n").length} file(s) edited on this computer — npm run update will refuse`);
}

console.log(failures ? `\n${c.red(`${failures} problem(s) found.`)} See docs/SELF-HOSTING.md → Troubleshooting.` : `\n${c.green("All essential checks passed.")}`);
process.exit(failures ? 1 : 0);
