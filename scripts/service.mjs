#!/usr/bin/env node
// npm run service:install | service:uninstall | service:start | service:stop | service:status
//   Auto-start the server when the computer starts (restarting it if it crashes) + a nightly backup at 2am.
//     macOS   launchd LaunchAgents in ~/Library/LaunchAgents
//     Linux   systemd user units in ~/.config/systemd/user (+ "linger" so they run without a login)
//     Windows Task Scheduler tasks \brainscadbrain\Server and \brainscadbrain\Backup
//   Testing / previewing:  --dry-run (or BCB_SERVICE_DRY_RUN=1) writes the files but loads nothing;
//   --platform=linux|darwin|win32 (dry-run only) generates another OS's files.
//   Overrides: BCB_SERVICE_LABEL_PREFIX (default com.brainscadbrain), BCB_LAUNCHAGENTS_DIR,
//   BCB_SYSTEMD_USER_DIR, BCB_WINDOWS_TASK_DIR (where the XML is written before import).
import "./lib/node-check.mjs";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROOT, c, die, heading, info, isWindows, ok, warn } from "./lib/common.mjs";
import {
  DEFAULT_PREFIX, launchdPlist, serviceNames, systemdBackupUnit, systemdServerUnit, systemdTimer, utf16leWithBom, windowsTaskXml,
} from "./lib/service-defs.mjs";

const BACKUP_AT = { hour: 2, minute: 0 };

/**
 * The `node` found on PATH when it is the same program as the one running now. process.execPath is
 * often a versioned path (e.g. Homebrew's /opt/homebrew/Cellar/node/25.6.1/bin/node) that disappears
 * when Node is upgraded; /opt/homebrew/bin/node keeps working.
 */
function stableNodePath() {
  const exe = isWindows ? "node.exe" : "node";
  let real;
  try {
    real = realpathSync(process.execPath);
  } catch {
    return process.execPath;
  }
  for (const dir of (process.env.PATH || "").split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, exe);
    try {
      if (existsSync(candidate) && realpathSync(candidate) === real) return candidate;
    } catch {}
  }
  return process.execPath;
}

function settings(argv = process.argv.slice(2)) {
  const dryRun = argv.includes("--dry-run") || process.env.BCB_SERVICE_DRY_RUN === "1";
  const platArg = argv.find((a) => a.startsWith("--platform="))?.split("=")[1];
  if (platArg && !dryRun) die("--platform only works together with --dry-run.");
  const platform = platArg || process.platform;
  const prefix = process.env.BCB_SERVICE_LABEL_PREFIX || DEFAULT_PREFIX;
  const home = os.homedir();
  return {
    dryRun,
    platform,
    names: serviceNames(prefix),
    nodePath: stableNodePath(),
    serverScript: path.join(ROOT, "scripts", "serve.mjs"),
    backupScript: path.join(ROOT, "scripts", "backup.mjs"),
    launchAgentsDir: process.env.BCB_LAUNCHAGENTS_DIR || path.join(home, "Library", "LaunchAgents"),
    systemdDir: process.env.BCB_SYSTEMD_USER_DIR || path.join(home, ".config", "systemd", "user"),
    windowsTaskDir: process.env.BCB_WINDOWS_TASK_DIR || null,
  };
}

function sh(cmd, args, { quiet = false } = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  const res = { code: r.error ? 127 : (r.status ?? 1), out: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() };
  if (!quiet) console.log(c.dim(`  $ ${cmd} ${args.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(" ")}${res.code ? `   → exit ${res.code}` : ""}`));
  return res;
}

// ---- macOS -------------------------------------------------------------------------------------
const mac = {
  files(s) {
    return {
      server: path.join(s.launchAgentsDir, `${s.names.launchd.server}.plist`),
      backup: path.join(s.launchAgentsDir, `${s.names.launchd.backup}.plist`),
    };
  },
  domain: () => `gui/${process.getuid?.() ?? 501}`,
  install(s) {
    const f = mac.files(s);
    mkdirSync(s.launchAgentsDir, { recursive: true });
    mkdirSync(path.join(ROOT, "logs"), { recursive: true });
    const common = { nodePath: s.nodePath, workDir: ROOT, path: `${path.dirname(s.nodePath)}:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin` };
    writeFileSync(f.server, launchdPlist({ ...common, label: s.names.launchd.server, script: s.serverScript, logFile: path.join(ROOT, "logs", "service-server.log"), keepAlive: true }));
    writeFileSync(f.backup, launchdPlist({ ...common, label: s.names.launchd.backup, script: s.backupScript, logFile: path.join(ROOT, "logs", "service-backup.log"), dailyAt: BACKUP_AT }));
    ok(`Wrote ${f.server}`);
    ok(`Wrote ${f.backup}`);
    if (s.dryRun) return info("Dry run: nothing was loaded into launchd.");
    for (const [label, file] of [[s.names.launchd.server, f.server], [s.names.launchd.backup, f.backup]]) {
      sh("launchctl", ["bootout", `${mac.domain()}/${label}`], { quiet: true }); // reload if already there
      const r = sh("launchctl", ["bootstrap", mac.domain(), file]);
      if (r.code) die(`launchctl could not load ${file}:\n${r.out}`);
    }
    ok("Loaded into launchd: the server starts now and whenever you log in; it restarts if it stops. Backup runs daily at 02:00.");
    warn("LaunchAgents run while you are logged in. On a dedicated server Mac turn on automatic login and stop it sleeping (see docs/SELF-HOSTING.md).");
  },
  uninstall(s) {
    const f = mac.files(s);
    if (!s.dryRun) for (const label of [s.names.launchd.server, s.names.launchd.backup]) sh("launchctl", ["bootout", `${mac.domain()}/${label}`]);
    for (const file of [f.server, f.backup]) if (existsSync(file)) { rmSync(file); ok(`Removed ${file}`); }
  },
  start(s) {
    const f = mac.files(s);
    if (!existsSync(f.server)) die("Auto-start is not installed. Run npm run service:install (or start by hand: npm run serve).");
    if (mac.running(s)) return ok("Already running.");
    const r = sh("launchctl", ["bootstrap", mac.domain(), f.server]);
    if (r.code) sh("launchctl", ["kickstart", `${mac.domain()}/${s.names.launchd.server}`]);
  },
  stop(s) {
    sh("launchctl", ["bootout", `${mac.domain()}/${s.names.launchd.server}`]);
    info("Stopped. It will start again at your next login (or: npm run service:start).");
  },
  running(s) {
    const r = sh("launchctl", ["print", `${mac.domain()}/${s.names.launchd.server}`], { quiet: true });
    return r.code === 0 && /state = running/.test(r.out);
  },
  installed: (s) => existsSync(mac.files(s).server),
  undo: () => "npm run service:uninstall   (or: launchctl bootout gui/$(id -u)/<label> and delete the two .plist files)",
};

// ---- Linux -------------------------------------------------------------------------------------
const linux = {
  files(s) {
    const n = s.names.systemd;
    return { server: path.join(s.systemdDir, n.server), backup: path.join(s.systemdDir, n.backup), timer: path.join(s.systemdDir, n.timer) };
  },
  install(s) {
    const f = linux.files(s);
    mkdirSync(s.systemdDir, { recursive: true });
    const common = { nodePath: s.nodePath, workDir: ROOT };
    writeFileSync(f.server, systemdServerUnit({ ...common, script: s.serverScript, description: "TC Quoting Estimate web server" }));
    writeFileSync(f.backup, systemdBackupUnit({ ...common, script: s.backupScript, description: "TC Quoting Estimate database backup" }));
    writeFileSync(f.timer, systemdTimer({ description: "Nightly TC Quoting Estimate backup", ...BACKUP_AT }));
    for (const file of Object.values(f)) ok(`Wrote ${file}`);
    if (s.dryRun) return info("Dry run: systemd was not touched.");
    sh("systemctl", ["--user", "daemon-reload"]);
    const a = sh("systemctl", ["--user", "enable", "--now", s.names.systemd.server]);
    const b = sh("systemctl", ["--user", "enable", "--now", s.names.systemd.timer]);
    if (a.code || b.code) die(`systemctl failed:\n${a.out}\n${b.out}`);
    const user = os.userInfo().username;
    const l = sh("loginctl", ["enable-linger", user]);
    if (l.code) warn(`Could not turn on "linger" (needed to start at boot without logging in). Run:  sudo loginctl enable-linger ${user}`);
    ok("Enabled: the server is running now, starts at boot and restarts if it stops. Backup runs daily at 02:00.");
    info(`Logs: journalctl --user -u ${s.names.systemd.server} -f   (and logs/server-*.log)`);
  },
  uninstall(s) {
    const f = linux.files(s);
    if (!s.dryRun) {
      sh("systemctl", ["--user", "disable", "--now", s.names.systemd.server]);
      sh("systemctl", ["--user", "disable", "--now", s.names.systemd.timer]);
    }
    for (const file of Object.values(f)) if (existsSync(file)) { rmSync(file); ok(`Removed ${file}`); }
    if (!s.dryRun) sh("systemctl", ["--user", "daemon-reload"]);
  },
  start: (s) => sh("systemctl", ["--user", "start", s.names.systemd.server]),
  stop: (s) => sh("systemctl", ["--user", "stop", s.names.systemd.server]),
  running: (s) => sh("systemctl", ["--user", "is-active", "--quiet", s.names.systemd.server], { quiet: true }).code === 0,
  installed: (s) => existsSync(linux.files(s).server),
  undo: () => "npm run service:uninstall   (or: systemctl --user disable --now <unit> and delete the unit files)",
};

// ---- Windows -----------------------------------------------------------------------------------
const windows = {
  userId: () => `${process.env.USERDOMAIN || os.hostname()}\\${process.env.USERNAME || os.userInfo().username}`,
  install(s) {
    const dir = s.windowsTaskDir || mkdtempSync(path.join(os.tmpdir(), "bcb-tasks-"));
    mkdirSync(dir, { recursive: true });
    const common = { userId: windows.userId(), nodePath: s.nodePath, workDir: ROOT };
    const defs = [
      { name: s.names.windows.server, file: path.join(dir, "server.xml"), xml: windowsTaskXml({ ...common, kind: "server", script: s.serverScript, description: "TC Quoting Estimate web server (npm run service:uninstall to remove)" }) },
      { name: s.names.windows.backup, file: path.join(dir, "backup.xml"), xml: windowsTaskXml({ ...common, kind: "backup", script: s.backupScript, dailyAt: BACKUP_AT, description: "TC Quoting Estimate nightly database backup" }) },
    ];
    for (const d of defs) {
      writeFileSync(d.file, utf16leWithBom(d.xml));
      ok(`Wrote ${d.file}`);
    }
    if (s.dryRun) return info("Dry run: nothing was registered with Task Scheduler.");
    for (const d of defs) {
      const r = sh("schtasks", ["/Create", "/TN", d.name, "/XML", d.file, "/F"]);
      if (r.code) {
        die(
          `schtasks could not create ${d.name}:\n${r.out}\n` +
            "  If it says 'Access is denied', open PowerShell with 'Run as administrator', cd to this folder and run npm run service:install again.",
        );
      }
    }
    if (!s.windowsTaskDir) rmSync(dir, { recursive: true, force: true });
    sh("schtasks", ["/Run", "/TN", s.names.windows.server]);
    ok("Registered: the server is starting now, starts when Windows starts and restarts if it stops. Backup runs daily at 02:00.");
  },
  uninstall(s) {
    if (s.dryRun) return info("Dry run: nothing to remove.");
    sh("schtasks", ["/End", "/TN", s.names.windows.server]);
    for (const n of [s.names.windows.server, s.names.windows.backup]) sh("schtasks", ["/Delete", "/TN", n, "/F"]);
  },
  start: (s) => sh("schtasks", ["/Run", "/TN", s.names.windows.server]),
  stop: (s) => sh("schtasks", ["/End", "/TN", s.names.windows.server]),
  running: (s) => /Running/i.test(sh("schtasks", ["/Query", "/TN", s.names.windows.server, "/FO", "LIST"], { quiet: true }).out),
  installed: (s) => sh("schtasks", ["/Query", "/TN", s.names.windows.server], { quiet: true }).code === 0,
  undo: () => "npm run service:uninstall   (or open Task Scheduler and delete the 'brainscadbrain' folder's tasks)",
};

function impl(platform) {
  if (platform === "darwin") return mac;
  if (platform === "linux") return linux;
  if (platform === "win32") return windows;
  die(`Auto-start is not supported on ${platform}. Start the server with npm run serve.`);
}

/** For update.mjs: is auto-start installed on this computer, and control it. */
export const service = {
  installed: () => { const s = settings([]); return impl(s.platform).installed(s); },
  running: () => { const s = settings([]); return impl(s.platform).running(s); },
  start: () => { const s = settings([]); impl(s.platform).start(s); },
  stop: () => { const s = settings([]); impl(s.platform).stop(s); },
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.chdir(ROOT);
  const cmd = process.argv[2];
  const s = settings();
  const p = impl(s.platform);
  const label = { darwin: "macOS (launchd)", linux: "Linux (systemd --user)", win32: "Windows (Task Scheduler)" }[s.platform];
  switch (cmd) {
    case "install":
      heading(`Installing auto-start + nightly backup — ${label}${s.dryRun ? " [dry run]" : ""}`);
      p.install(s);
      console.log(`\nTo undo: ${p.undo()}`);
      break;
    case "uninstall":
      heading(`Removing auto-start + nightly backup — ${label}${s.dryRun ? " [dry run]" : ""}`);
      p.uninstall(s);
      ok("Done. Your data, backups and .env are untouched.");
      break;
    case "start":
      p.start(s);
      break;
    case "stop":
      p.stop(s);
      break;
    case "status": {
      const inst = p.installed(s);
      console.log(`Auto-start installed: ${inst ? c.green("yes") : "no"}`);
      if (inst) console.log(`Server running under it: ${p.running(s) ? c.green("yes") : c.yellow("no")}`);
      break;
    }
    default:
      die("Usage: node scripts/service.mjs install|uninstall|start|stop|status [--dry-run] [--platform=darwin|linux|win32]");
  }
}
