#!/usr/bin/env node
// npm run update — get the latest version from GitHub and rebuild, safely:
//   check for local changes → fetch → (nothing new? stop) → backup → stop auto-start service →
//   git pull --ff-only → npm ci → database schema (never deletes data) → build → start service again.
//   If the build fails, the previous version is put back automatically.
// Flags: --force (rebuild even when already up to date)
import "./lib/node-check.mjs";
import { writeFileSync } from "node:fs";
import path from "node:path";
import {
  BIN, BUILD_ENV_STAMP, ROOT, c, die, fail, git, heading, info, loadEnv, ok, port, portInUse, publicEnvHash, pushSchemaSafely, runNode, runNpm, warn,
} from "./lib/common.mjs";
import { makeBackup } from "./backup.mjs";
import { service } from "./service.mjs";

process.chdir(ROOT);
loadEnv();
const force = process.argv.includes("--force");
console.log(c.bold("TC Quoting Estimate — update"));

// ── 1. preconditions ────────────────────────────────────────────────────────────────────────────
if (git(["--version"]).code !== 0) die("Git is not installed (see docs/SELF-HOSTING.md → Prerequisites).");
if (git(["rev-parse", "--is-inside-work-tree"]).out !== "true") die("This folder is not a git clone, so it cannot update itself. Re-install with git clone (docs/SELF-HOSTING.md).");
const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]).out;
const upstream = git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
if (upstream.code !== 0) die(`The current branch (${branch}) does not track a GitHub branch. Run: git checkout main`);
const dirty = git(["status", "--porcelain", "--untracked-files=no"]).out;
if (dirty) {
  die(
    "Files that came from GitHub have been changed on this computer, so updating could lose those changes:\n  " +
      dirty.split("\n").join("\n  ") +
      "\n  Nothing was changed. To throw the local edits away and match GitHub:  git checkout -- .   then run npm run update again.",
  );
}

// ── 2. anything new? ────────────────────────────────────────────────────────────────────────────
info(`Checking GitHub (${upstream.out}) …`);
const f = git(["fetch", "--quiet"]);
if (f.code !== 0) die(`Could not reach GitHub:\n  ${f.err}\n  Check the internet connection and that this computer still has access to the repository (gh auth status).`);
const oldSha = git(["rev-parse", "HEAD"]).out;
const [ahead, behind] = git(["rev-list", "--left-right", "--count", `HEAD...${upstream.out}`]).out.split(/\s+/).map(Number);
if (ahead > 0) die(`This computer has ${ahead} commit(s) that are not on GitHub, so a fast-forward update is impossible. Nothing was changed. Ask your developer.`);
if (behind === 0 && !force) {
  ok(`Already up to date (${oldSha.slice(0, 7)}). Nothing to do.`);
  process.exit(0);
}
info(behind ? `${behind} new change(s) available.` : "Already up to date; rebuilding anyway (--force).");

// ── 3. backup + stop the server ─────────────────────────────────────────────────────────────────
heading("Backup");
await makeBackup();

heading("Stopping the server");
let restartService = false;
if (service.installed()) {
  if (service.running()) {
    service.stop();
    restartService = true;
  }
  for (let i = 0; i < 20 && (await portInUse()); i++) await new Promise((r) => setTimeout(r, 500));
}
if (await portInUse()) {
  die(
    `The server is still running on port ${port()}. Stop it first (Ctrl+C in the window running npm run serve), then run npm run update again.\n` +
      "  (Installing new files under a running server breaks it.) Nothing was changed apart from the backup.",
  );
}
ok("Server is stopped");

// ── 4. pull, install, migrate, build ────────────────────────────────────────────────────────────
async function rebuild() {
  const ci = await runNpm(["ci", "--no-audit", "--no-fund"]);
  if (ci.code !== 0) return "npm ci failed";
  if (!(await pushSchemaSafely())) return "database schema update was refused";
  const b = await runNode(BIN.next, ["build"], { env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" } });
  if (b.code !== 0) return "next build failed";
  writeFileSync(path.join(ROOT, BUILD_ENV_STAMP), publicEnvHash() + "\n");
  return null;
}

heading("Updating");
const pull = git(["pull", "--ff-only"]);
if (pull.code !== 0) {
  if (restartService) service.start();
  die(`git pull failed — nothing was changed:\n  ${pull.err || pull.out}`);
}
const newSha = git(["rev-parse", "HEAD"]).out;
ok(`Code updated ${oldSha.slice(0, 7)} → ${newSha.slice(0, 7)}`);
console.log(c.dim(git(["log", "--oneline", `${oldSha}..${newSha}`]).out.split("\n").slice(0, 15).map((l) => "    " + l).join("\n")));

const problem = await rebuild();
if (problem) {
  fail(`Update failed: ${problem}. Putting the previous version back …`);
  git(["reset", "--hard", oldSha]);
  const again = await rebuild();
  if (again) fail(`Could not rebuild the previous version either (${again}). Run npm run setup and check npm run doctor.`);
  else ok(`Previous version ${oldSha.slice(0, 7)} restored.`);
  if (restartService) service.start();
  process.exit(1);
}

// ── 5. restart ──────────────────────────────────────────────────────────────────────────────────
heading("Done");
if (restartService) {
  service.start();
  ok("Auto-start service restarted with the new version.");
} else if (service.installed()) {
  info("Auto-start is installed but was not running. Start it with: npm run service:start");
} else {
  warn(`Start the server again:  ${c.bold("npm run serve")}`);
}
