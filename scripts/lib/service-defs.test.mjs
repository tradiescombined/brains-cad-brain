import { describe, expect, it } from "vitest";
import { backupFileName, backupsToPrune, bypassVars, clerkKeys, dbFilePath, expandHome, publicEnvHash } from "./common.mjs";
import {
  launchdPlist, serviceNames, systemdBackupUnit, systemdServerUnit, systemdTimer, utf16leWithBom, windowsTaskXml,
} from "./service-defs.mjs";

const repo = "/Users/me/Brains Cad & Co/brains-cad-brain";

describe("serviceNames", () => {
  it("derives every platform's names from one prefix", () => {
    expect(serviceNames()).toEqual({
      launchd: { server: "com.brainscadbrain.server", backup: "com.brainscadbrain.backup" },
      systemd: { server: "brainscadbrain.service", backup: "brainscadbrain-backup.service", timer: "brainscadbrain-backup.timer" },
      windows: { server: "\\brainscadbrain\\Server", backup: "\\brainscadbrain\\Backup" },
    });
    const t = serviceNames("com.brainscadbrain.test");
    expect(t.launchd.server).toBe("com.brainscadbrain.test.server");
    expect(t.systemd.timer).toBe("brainscadbrain-test-backup.timer");
    expect(t.windows.backup).toBe("\\brainscadbrain-test\\Backup");
  });
});

describe("launchdPlist", () => {
  const base = { label: "com.brainscadbrain.server", nodePath: "/opt/homebrew/bin/node", script: `${repo}/scripts/serve.mjs`, workDir: repo, logFile: `${repo}/logs/service-server.log` };

  it("server: KeepAlive + RunAtLoad, XML-escaped paths", () => {
    const p = launchdPlist({ ...base, keepAlive: true });
    expect(p).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>\n<!DOCTYPE plist/);
    expect(p).toContain("<key>KeepAlive</key>\n  <true/>");
    expect(p).toContain("<key>RunAtLoad</key>\n  <true/>");
    expect(p).toContain("<string>/Users/me/Brains Cad &amp; Co/brains-cad-brain/scripts/serve.mjs</string>");
    expect(p).not.toContain("StartCalendarInterval");
    expect(p).not.toMatch(/& Co/);
  });

  it("backup: daily at 02:00, not at load, no KeepAlive", () => {
    const p = launchdPlist({ ...base, label: "com.brainscadbrain.backup", dailyAt: { hour: 2, minute: 0 } });
    expect(p).toContain("<key>StartCalendarInterval</key>\n  <dict>\n    <key>Hour</key>\n    <integer>2</integer>\n    <key>Minute</key>\n    <integer>0</integer>");
    expect(p).toContain("<key>RunAtLoad</key>\n  <false/>");
    expect(p).not.toContain("KeepAlive");
  });
});

describe("systemd units", () => {
  const o = { nodePath: "/usr/bin/node", script: "/srv/bcb 100%/scripts/serve.mjs", workDir: "/srv/bcb 100%", description: "Brains Cad Brain web server" };

  it("server unit restarts forever and starts with the user manager", () => {
    const u = systemdServerUnit(o);
    expect(u).toContain("[Service]\nType=simple\nWorkingDirectory=/srv/bcb 100%\n");
    expect(u).toContain('ExecStart="/usr/bin/node" "/srv/bcb 100%%/scripts/serve.mjs"');
    expect(u).toContain("Restart=always");
    expect(u).toContain("WantedBy=default.target");
  });

  it("backup is a oneshot service with a persistent daily timer", () => {
    expect(systemdBackupUnit({ ...o, script: "/srv/b/scripts/backup.mjs" })).toContain("Type=oneshot");
    const t = systemdTimer({ description: "Nightly", hour: 2, minute: 0 });
    expect(t).toContain("OnCalendar=*-*-* 02:00:00");
    expect(t).toContain("Persistent=true");
    expect(t).toContain("WantedBy=timers.target");
  });
});

describe("windowsTaskXml", () => {
  const o = { userId: "DESKTOP-1\\Kolin", nodePath: "C:\\Program Files\\nodejs\\node.exe", workDir: "C:\\Users\\Kolin\\brains-cad-brain", description: "BCB <server>" };

  it("server: boot + logon triggers, one instance, restart on failure, no time limit, S4U", () => {
    const x = windowsTaskXml({ ...o, kind: "server", script: "C:\\Users\\Kolin\\brains-cad-brain\\scripts\\serve.mjs" });
    expect(x.startsWith('<?xml version="1.0" encoding="UTF-16"?>\r\n<Task version="1.2"')).toBe(true);
    expect(x).toContain("<BootTrigger>");
    expect(x).toContain("<LogonTrigger>\r\n      <Enabled>true</Enabled>\r\n      <UserId>DESKTOP-1\\Kolin</UserId>");
    expect(x).toContain("<LogonType>S4U</LogonType>");
    expect(x).toContain("<MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>");
    expect(x).toContain("<ExecutionTimeLimit>PT0S</ExecutionTimeLimit>");
    expect(x).toContain("<RestartOnFailure>");
    expect(x).toContain("<Command>C:\\Program Files\\nodejs\\node.exe</Command>");
    expect(x).toContain("<Arguments>&quot;C:\\Users\\Kolin\\brains-cad-brain\\scripts\\serve.mjs&quot;</Arguments>");
    expect(x).toContain("<WorkingDirectory>C:\\Users\\Kolin\\brains-cad-brain</WorkingDirectory>");
    expect(x).toContain("<Description>BCB &lt;server&gt;</Description>");
  });

  it("backup: daily calendar trigger at the given time, catches up when missed", () => {
    const x = windowsTaskXml({ ...o, kind: "backup", script: "C:\\x\\scripts\\backup.mjs", dailyAt: { hour: 2, minute: 0 } });
    expect(x).toContain("<StartBoundary>2026-01-01T02:00:00</StartBoundary>");
    expect(x).toContain("<DaysInterval>1</DaysInterval>");
    expect(x).toContain("<StartWhenAvailable>true</StartWhenAvailable>");
    expect(x).not.toContain("<BootTrigger>");
    expect(x).not.toContain("<RestartOnFailure>");
  });

  it("is written as UTF-16LE with a BOM", () => {
    const b = utf16leWithBom("<a/>");
    expect([...b.subarray(0, 4)]).toEqual([0xff, 0xfe, 0x3c, 0x00]);
  });
});

describe("backup helpers", () => {
  it("names backups bcb-YYYY-MM-DD-HHmm.db in local time", () => {
    expect(backupFileName(new Date(2026, 10, 8, 2, 5))).toBe("bcb-2026-11-08-0205.db");
    expect(backupFileName(new Date(2026, 0, 1, 23, 59), "-before-restore")).toBe("bcb-2026-01-01-2359-before-restore.db");
  });

  it("prunes only our backup files, oldest first, keeping the newest N", () => {
    const names = ["bcb-2026-11-03-0200.db", "notes.txt", "bcb-2026-11-01-0200.db", "bcb-2026-11-02-0200-before-restore.db", "bcb-2026-11-04-0200.db", "other.db"];
    expect(backupsToPrune(names, 2)).toEqual(["bcb-2026-11-01-0200.db", "bcb-2026-11-02-0200-before-restore.db"]);
    expect(backupsToPrune(names, 10)).toEqual([]);
    expect(backupsToPrune(names, 0)).toEqual([]);
  });

  it("treats same-minute copies (-2, -3 …) as newer than the first one", () => {
    const names = ["bcb-2026-11-18-1729-3.db", "bcb-2026-11-18-1729.db", "bcb-2026-11-18-1729-2.db", "bcb-2026-11-18-1730.db", "bcb-2026-11-18-1729-10.db"];
    expect(backupsToPrune(names, 2)).toEqual(["bcb-2026-11-18-1729.db", "bcb-2026-11-18-1729-2.db", "bcb-2026-11-18-1729-3.db"]);
  });
});

describe("env helpers", () => {
  it("resolves the SQLite file for file: URLs only", () => {
    expect(dbFilePath("file:./data/bcb.db", "/srv/app")).toBe("/srv/app/data/bcb.db");
    expect(dbFilePath("file:/var/bcb.db", "/srv/app")).toBe("/var/bcb.db");
    expect(dbFilePath("libsql://x.turso.io", "/srv/app")).toBeNull();
  });

  it("expands ~ in folder settings (.env is not processed by a shell)", () => {
    expect(expandHome("~/Library/Mobile Documents/com~apple~CloudDocs/BrainsCadBrain-backups", "/Users/kolin")).toBe(
      "/Users/kolin/Library/Mobile Documents/com~apple~CloudDocs/BrainsCadBrain-backups",
    );
    expect(expandHome("/Volumes/USB/bcb", "/Users/kolin")).toBe("/Volumes/USB/bcb");
    expect(expandHome("~", "/Users/kolin")).toBe("/Users/kolin");
  });

  it("flags any non-empty test-bypass variable", () => {
    expect(bypassVars({})).toEqual([]);
    expect(bypassVars({ BCB_AUTH_BYPASS: "" })).toEqual([]);
    expect(bypassVars({ BCB_AUTH_BYPASS: "0", BCB_ALLOW_TEST_BYPASS: "1" })).toEqual(["BCB_AUTH_BYPASS", "BCB_ALLOW_TEST_BYPASS"]);
  });

  it("recognises Clerk key types", () => {
    expect(clerkKeys({})).toEqual({ publishable: false, secret: false, mode: null });
    expect(clerkKeys({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_x", CLERK_SECRET_KEY: "sk_live_y" })).toEqual({ publishable: true, secret: true, mode: "live" });
    expect(clerkKeys({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_x" }).mode).toBe("test");
  });

  it("changes the build stamp only when NEXT_PUBLIC_* values change", () => {
    const a = publicEnvHash({ NEXT_PUBLIC_A: "1", SECRET: "x" });
    expect(publicEnvHash({ NEXT_PUBLIC_A: "1", SECRET: "y" })).toBe(a);
    expect(publicEnvHash({ NEXT_PUBLIC_A: "2", SECRET: "x" })).not.toBe(a);
  });
});
