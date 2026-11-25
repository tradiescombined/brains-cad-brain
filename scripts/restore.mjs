#!/usr/bin/env node
// npm run restore -- <backup file>
//   Replaces the live database with a backup. Refuses while the server is running (stop it first:
//   Ctrl+C, or npm run service:stop). Takes a safety backup of the current database first
//   (backups/bcb-…-before-restore.db), checks the backup file, swaps it in, then applies the current
//   schema (non-destructively) in case the backup is from an older version.
//   The <file> can be a full path or just a name from the backups/ folder. `npm run restore` alone lists them.
import "./lib/node-check.mjs";
import { copyFileSync, existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { BACKUP_RE, ROOT, c, dbFilePath, die, info, loadEnv, ok, port, portInUse, pushSchemaSafely } from "./lib/common.mjs";
import { BACKUP_DIR, checkSqliteFile, makeBackup } from "./backup.mjs";

process.chdir(ROOT);
loadEnv();

const arg = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!arg) {
  const list = existsSync(BACKUP_DIR) ? readdirSync(BACKUP_DIR).filter((n) => BACKUP_RE.test(n)).sort().reverse() : [];
  console.log("Usage: npm run restore -- <backup file>\n");
  console.log(list.length ? `Backups in ${BACKUP_DIR} (newest first):\n  ${list.slice(0, 15).join("\n  ")}` : "No backups found in backups/.");
  process.exit(1);
}

const candidates = [path.resolve(process.env.INIT_CWD || ROOT, arg), path.resolve(ROOT, arg), path.join(BACKUP_DIR, arg)];
const src = candidates.find((p) => existsSync(p) && statSync(p).isFile());
if (!src) die(`Backup file not found: ${arg}\n  Looked in:\n    ${[...new Set(candidates)].join("\n    ")}`);

const target = dbFilePath();
if (!target) die("DATABASE_URL points at a hosted database; restore it with your provider's tools.");
if (path.resolve(src) === path.resolve(target)) die("That file IS the live database.");

// 1. The server must be stopped: replacing the file under a running server corrupts what it has open.
if (await portInUse()) {
  die(
    `The server is running on port ${port()}. Stop it first, then run the restore again:\n` +
      "  • started with npm run serve → press Ctrl+C in that window\n" +
      "  • auto-start installed       → npm run service:stop   (and npm run service:start afterwards)",
  );
}

// 2. Is it really a healthy TC Quoting Estimate database?
const header = readFileSync(src).subarray(0, 16).toString("latin1");
if (header !== "SQLite format 3\0") die(`${src} is not a SQLite database file.`);
const problem = await checkSqliteFile(src);
if (problem) die(`${src} is damaged: ${problem}`);
ok(`Backup checked: ${src}`);

// 3. Safety copy of what is there now.
if (existsSync(target)) {
  const safety = await makeBackup({ suffix: "-before-restore", quiet: true });
  ok(`Safety backup of the current database: ${safety}`);
}

// 4. Swap. Stale -wal/-shm files belong to the old database and must go with it.
for (const ext of ["-wal", "-shm", "-journal"]) rmSync(target + ext, { force: true });
copyFileSync(src, target);
ok(`Restored into ${target}`);

// 5. Bring an older backup up to the current schema (adds new tables/columns; never deletes).
info("Applying the current database schema …");
if (!(await pushSchemaSafely())) process.exit(1);
console.log(`\n${c.bold("Restore complete.")} Start the server again (npm run serve, or npm run service:start).`);
