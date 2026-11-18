#!/usr/bin/env node
// npm run backup — consistent snapshot of the SQLite database, safe while the server is running.
//   → backups/bcb-YYYY-MM-DD-HHmm.db, keeping the newest BCB_BACKUP_KEEP (default 30).
//   If BCB_BACKUP_DIR is set (e.g. a Dropbox / OneDrive / iCloud / USB folder), the snapshot is also
//   copied there, with the same retention.
// Also exports `makeBackup()` for update.mjs and restore.mjs.
import "./lib/node-check.mjs";
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROOT, backupFileName, backupsToPrune, dbFilePath, dbUrl, die, extraBackupDir, info, loadEnv, ok, openDb, warn } from "./lib/common.mjs";

export const BACKUP_DIR = path.join(ROOT, "backups");

function uniquePath(dir, name) {
  let p = path.join(dir, name);
  for (let i = 2; existsSync(p); i++) p = path.join(dir, name.replace(/\.db$/, `-${i}.db`));
  return p;
}

function prune(dir, keep) {
  const removed = backupsToPrune(readdirSync(dir), keep);
  for (const f of removed) rmSync(path.join(dir, f), { force: true });
  return removed.length;
}

/** Checks a SQLite file opens and passes `PRAGMA integrity_check`. Returns null or an error string. */
export async function checkSqliteFile(file) {
  const client = await openDb("file:" + file.replace(/\\/g, "/"));
  try {
    const r = await client.execute("PRAGMA integrity_check");
    const v = String(Object.values(r.rows[0] ?? {})[0] ?? "");
    return v === "ok" ? null : `integrity check said: ${v}`;
  } catch (e) {
    return String(e?.message ?? e);
  } finally {
    client.close();
  }
}

/** Writes a snapshot and returns its path. `suffix` e.g. "-before-restore". */
export async function makeBackup({ suffix = "", quiet = false } = {}) {
  const src = dbFilePath();
  if (!src) die("DATABASE_URL points at a hosted database; back it up with your provider's tools (this script backs up a local SQLite file).");
  if (!existsSync(src)) die(`No database file at ${src} — nothing to back up. (Run npm run setup first.)`);
  mkdirSync(BACKUP_DIR, { recursive: true });
  const dest = uniquePath(BACKUP_DIR, backupFileName(new Date(), suffix));

  // VACUUM INTO writes a complete, consistent copy even while the server is writing (unlike copying
  // the file, which can catch it half-way through a transaction or miss data still in the -wal file).
  const client = await openDb(dbUrl());
  try {
    await client.execute({ sql: "VACUUM INTO ?", args: [dest] });
  } finally {
    client.close();
  }
  const problem = await checkSqliteFile(dest);
  if (problem) {
    rmSync(dest, { force: true });
    die(`The backup failed its check (${problem}). Nothing was kept.`);
  }
  const keep = Math.max(1, Number(process.env.BCB_BACKUP_KEEP || 30));
  const mb = (statSync(dest).size / 1024 / 1024).toFixed(1);
  if (!quiet) ok(`Backup written: ${dest} (${mb} MB, verified)`);
  const pruned = prune(BACKUP_DIR, keep);
  if (pruned && !quiet) info(`Removed ${pruned} old backup(s); keeping the newest ${keep}.`);

  const extra = extraBackupDir();
  if (extra) {
    try {
      mkdirSync(extra, { recursive: true });
      const copy = uniquePath(extra, path.basename(dest));
      copyFileSync(dest, copy);
      prune(extra, keep);
      if (!quiet) ok(`Copied to ${copy}`);
    } catch (e) {
      warn(`Could not copy the backup to BCB_BACKUP_DIR (${extra}): ${e.message}. The local backup is fine.`);
      process.exitCode = 2;
    }
  }
  return dest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.chdir(ROOT);
  loadEnv();
  await makeBackup();
}
