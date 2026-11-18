// Shared helpers for the self-hosting scripts (setup, serve, update, backup, restore, service, doctor).
// Node built-ins only: these scripts must run before `npm ci` has installed anything.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createConnection } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as util from "node:util"; // namespace import: an old Node must reach the version check, not a link error

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const MIN_NODE_MAJOR = 22;
export const isWindows = process.platform === "win32";

// ---- output ------------------------------------------------------------------------------------
const useColour = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (s) => (useColour ? `\x1b[${code}m${s}\x1b[0m` : s);
export const c = { bold: paint(1), dim: paint(2), red: paint(31), green: paint(32), yellow: paint(33), cyan: paint(36) };
export const ok = (msg) => console.log(`${c.green("✔")} ${msg}`);
export const info = (msg) => console.log(`${c.cyan("•")} ${msg}`);
export const warn = (msg) => console.log(`${c.yellow("!")} ${msg}`);
export const fail = (msg) => console.error(`${c.red("✘")} ${msg}`);
export const heading = (msg) => console.log(`\n${c.bold(msg)}`);

/** Prints the message and exits non-zero. */
export function die(msg, code = 1) {
  fail(msg);
  process.exit(code);
}

// ---- environment -------------------------------------------------------------------------------
/** The env files Next.js reads for `next start`/`next build`, lowest priority first. */
export const ENV_FILES = [".env", ".env.production", ".env.local", ".env.production.local"];

/**
 * Loads the same env files Next.js does (production mode) into process.env. Variables already set in
 * the real environment win, exactly like Next.js. Returns the names of the files that were found.
 */
export function loadEnv(root = ROOT) {
  const merged = {};
  const found = [];
  for (const f of ENV_FILES) {
    const p = path.join(root, f);
    if (!existsSync(p)) continue;
    found.push(f);
    Object.assign(merged, util.parseEnv(readFileSync(p, "utf8")));
  }
  for (const [k, v] of Object.entries(merged)) if (process.env[k] === undefined) process.env[k] = v;
  return found;
}

/** `~/x` → `<home>/x` (.env files are not processed by a shell, so `~` would otherwise be literal). */
export function expandHome(p, home = process.env.HOME || process.env.USERPROFILE || "") {
  if (!p) return p;
  return p === "~" ? home : /^~[\\/]/.test(p) ? path.join(home, p.slice(2)) : p;
}
/** The extra backup folder from BCB_BACKUP_DIR, or "" when not set. */
export const extraBackupDir = () => expandHome((process.env.BCB_BACKUP_DIR || "").trim());

export const port = () => Number(process.env.PORT || 3000);
export const host = () => process.env.HOST || "0.0.0.0";

/** Clerk keys present (non-empty)? Returns { publishable, secret, mode } where mode is test/live/null. */
export function clerkKeys(env = process.env) {
  const publishable = (env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || "").trim();
  const secret = (env.CLERK_SECRET_KEY || "").trim();
  const mode = publishable.startsWith("pk_live_") ? "live" : publishable.startsWith("pk_test_") ? "test" : null;
  return { publishable: !!publishable, secret: !!secret, mode };
}

/** A non-empty test-bypass variable on a server is always a mistake. Returns the offending names. */
export function bypassVars(env = process.env) {
  return ["BCB_AUTH_BYPASS", "BCB_ALLOW_TEST_BYPASS"].filter((k) => (env[k] ?? "").trim() !== "");
}

/** Hash of the NEXT_PUBLIC_* values: they are baked into the build, so a change means "rebuild". */
export function publicEnvHash(env = process.env) {
  const pairs = Object.keys(env)
    .filter((k) => k.startsWith("NEXT_PUBLIC_"))
    .sort()
    .map((k) => `${k}=${env[k]}`);
  return createHash("sha256").update(pairs.join("\n")).digest("hex").slice(0, 16);
}
export const BUILD_ENV_STAMP = path.join(".next", "bcb-public-env.hash");

// ---- database ----------------------------------------------------------------------------------
export const dbUrl = () => process.env.DATABASE_URL || "file:./data/bcb.db";

/** Absolute path of the SQLite file for a `file:` DATABASE_URL, or null for a hosted (libsql://) DB. */
export function dbFilePath(url = dbUrl(), root = ROOT) {
  if (!url.startsWith("file:")) return null;
  let p = url.slice("file:".length);
  if (p.startsWith("//")) p = p.slice(2); // file:///abs/path
  if (isWindows && /^\/[A-Za-z]:/.test(p)) p = p.slice(1); // file:///C:/...
  return path.resolve(root, p);
}

/** Opens @libsql/client from the project's node_modules (needs `npm ci` first). */
export async function openDb(url) {
  const { createRequire } = await import("node:module");
  const require = createRequire(path.join(ROOT, "package.json"));
  let mod;
  try {
    mod = require("@libsql/client");
  } catch {
    die("Dependencies are not installed yet. Run:  npm run setup");
  }
  return mod.createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
}

// ---- backups -----------------------------------------------------------------------------------
const pad = (n) => String(n).padStart(2, "0");
/** `bcb-YYYY-MM-DD-HHmm.db` (local time), with an optional suffix such as `-before-restore`. */
export function backupFileName(date = new Date(), suffix = "") {
  return `bcb-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${suffix}.db`;
}
export const BACKUP_RE = /^bcb-\d{4}-\d{2}-\d{2}-\d{4}[\w-]*\.db$/;

/** Given backup file names, returns the ones to delete so that only the newest `keep` remain. */
export function backupsToPrune(names, keep) {
  // Oldest first: by the timestamp in the name, then (same minute) plain name before its -2, -3 … copies.
  const key = (n) => {
    const m = /^bcb-(\d{4}-\d{2}-\d{2}-\d{4})(.*)\.db$/.exec(n);
    const counter = /-(\d+)$/.exec(m[2]);
    return [m[1], counter ? Number(counter[1]) : 1, m[2]];
  };
  const sorted = names
    .filter((n) => BACKUP_RE.test(n))
    .sort((a, b) => {
      const [ta, ca, sa] = key(a);
      const [tb, cb, sb] = key(b);
      return ta < tb ? -1 : ta > tb ? 1 : ca - cb || (sa < sb ? -1 : sa > sb ? 1 : 0);
    });
  return keep > 0 && sorted.length > keep ? sorted.slice(0, sorted.length - keep) : [];
}

// ---- processes ---------------------------------------------------------------------------------
/** Path of a package's JS entry for running with `node` directly (works the same on every OS). */
export const BIN = {
  next: path.join(ROOT, "node_modules", "next", "dist", "bin", "next"),
  drizzleKit: path.join(ROOT, "node_modules", "drizzle-kit", "bin.cjs"),
  tsx: path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs"),
};

/**
 * Runs a command, streaming output (unless `capture`). Resolves { code, out }. Never throws for a
 * non-zero exit; callers decide.
 */
export function run(cmd, args, { capture = false, env = process.env, cwd = ROOT, shell = false } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, env, shell, stdio: capture ? ["ignore", "pipe", "pipe"] : ["ignore", "inherit", "inherit"] });
    let out = "";
    if (capture) {
      child.stdout.on("data", (d) => (out += d));
      child.stderr.on("data", (d) => (out += d));
    }
    child.on("error", (e) => resolve({ code: 127, out: out + String(e) }));
    child.on("close", (code) => resolve({ code: code ?? 1, out }));
  });
}

/** `node <file> ...args` with the current Node binary. */
export const runNode = (file, args = [], opts) => run(process.execPath, [file, ...args], opts);

/** npm, found the same way on every OS (npm_execpath is set when we were started by `npm run`). */
export function runNpm(args, opts) {
  const npmCli = process.env.npm_execpath;
  if (npmCli && /npm-cli\.js$/.test(npmCli)) return run(process.execPath, [npmCli, ...args], opts);
  return run(isWindows ? "npm.cmd" : "npm", args, { ...opts, shell: isWindows });
}

/** Synchronous git helper: { code, out } with trimmed stdout. */
export function git(args, { cwd = ROOT } = {}) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.error) return { code: 127, out: "", err: String(r.error) };
  return { code: r.status ?? 1, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}

/** True when something accepts TCP connections on the port (i.e. a server is running). */
export function portInUse(p = port(), h = host()) {
  const target = !h || h === "0.0.0.0" || h === "::" ? "127.0.0.1" : h;
  return new Promise((resolve) => {
    const sock = createConnection({ port: p, host: target });
    const done = (v) => {
      sock.destroy();
      resolve(v);
    };
    sock.setTimeout(1500, () => done(false));
    sock.once("connect", () => done(true));
    sock.once("error", () => done(false));
  });
}

export function nodeMajor(version = process.versions.node) {
  return Number(version.split(".")[0]);
}

/**
 * Applies the Drizzle schema to the database WITHOUT ever deleting data. drizzle-kit refuses to ask
 * its data-loss question when it has no terminal and exits, so a change that would drop a table or
 * column is reported and nothing is applied. Returns true on success.
 */
export async function pushSchemaSafely() {
  if (!existsSync(BIN.drizzleKit)) die("drizzle-kit is not installed. Run:  npm run setup");
  const r = await runNode(BIN.drizzleKit, ["push"], { capture: true });
  const out = r.out.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
  if (r.code === 0 && /Changes applied|No changes detected/.test(out)) {
    ok(/No changes detected/.test(out) ? "Database schema already up to date" : "Database schema updated");
    return true;
  }
  if (/data-loss|DATA LOSS|Interactive prompts require a TTY|rename/i.test(out)) {
    fail(
      "The database schema change would delete or rename existing data, so it was NOT applied.\n" +
        "  Nothing was changed. Make a backup (npm run backup) and ask your developer to migrate it.\n" +
        "  drizzle-kit said:\n    " +
        out.trim().split("\n").slice(-12).join("\n    "),
    );
    return false;
  }
  fail(`Applying the database schema failed:\n${out}`);
  return false;
}

export function readJson(p) {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}
