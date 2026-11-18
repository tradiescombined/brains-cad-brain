// Pure generators for the auto-start definitions (no I/O, unit tested in service-defs.test.mjs).
//   macOS  : launchd LaunchAgent plists
//   Linux  : systemd --user units (server service, backup service + daily timer)
//   Windows: Task Scheduler XML (imported with `schtasks /Create /XML`)

export const DEFAULT_PREFIX = "com.brainscadbrain";

/** Names for every platform, derived from one prefix (BCB_SERVICE_LABEL_PREFIX). */
export function serviceNames(prefix = DEFAULT_PREFIX) {
  // com.brainscadbrain → brainscadbrain ; com.brainscadbrain.test → brainscadbrain-test
  const base = prefix.replace(/^com\./, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "brainscadbrain";
  return {
    launchd: { server: `${prefix}.server`, backup: `${prefix}.backup` },
    systemd: { server: `${base}.service`, backup: `${base}-backup.service`, timer: `${base}-backup.timer` },
    windows: { server: `\\${base}\\Server`, backup: `\\${base}\\Backup` },
  };
}

const xml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

// ---- macOS ------------------------------------------------------------------------------------
/**
 * @param {{label:string, nodePath:string, script:string, workDir:string, logFile:string,
 *          keepAlive?:boolean, dailyAt?:{hour:number, minute:number}, path?:string}} o
 */
export function launchdPlist(o) {
  const lines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">`,
    `<plist version="1.0">`,
    `<dict>`,
    `  <key>Label</key>`,
    `  <string>${xml(o.label)}</string>`,
    `  <key>ProgramArguments</key>`,
    `  <array>`,
    `    <string>${xml(o.nodePath)}</string>`,
    `    <string>${xml(o.script)}</string>`,
    `  </array>`,
    `  <key>WorkingDirectory</key>`,
    `  <string>${xml(o.workDir)}</string>`,
    `  <key>EnvironmentVariables</key>`,
    `  <dict>`,
    `    <key>PATH</key>`,
    `    <string>${xml(o.path ?? "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin")}</string>`,
    `  </dict>`,
    `  <key>StandardOutPath</key>`,
    `  <string>${xml(o.logFile)}</string>`,
    `  <key>StandardErrorPath</key>`,
    `  <string>${xml(o.logFile)}</string>`,
  ];
  if (o.keepAlive) {
    lines.push(`  <key>RunAtLoad</key>`, `  <true/>`, `  <key>KeepAlive</key>`, `  <true/>`, `  <key>ThrottleInterval</key>`, `  <integer>10</integer>`);
  }
  if (o.dailyAt) {
    lines.push(
      `  <key>RunAtLoad</key>`,
      `  <false/>`,
      `  <key>StartCalendarInterval</key>`,
      `  <dict>`,
      `    <key>Hour</key>`,
      `    <integer>${o.dailyAt.hour}</integer>`,
      `    <key>Minute</key>`,
      `    <integer>${o.dailyAt.minute}</integer>`,
      `  </dict>`,
    );
  }
  lines.push(`</dict>`, `</plist>`, ``);
  return lines.join("\n");
}

// ---- Linux ------------------------------------------------------------------------------------
/** systemd quoting for ExecStart arguments (spaces allowed inside double quotes; % must be doubled). */
const sdArg = (s) => `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/%/g, "%%")}"`;

/** @param {{nodePath:string, script:string, workDir:string, description:string}} o */
export function systemdServerUnit(o) {
  return [
    `[Unit]`,
    `Description=${o.description}`,
    `After=network-online.target`,
    `Wants=network-online.target`,
    ``,
    `[Service]`,
    `Type=simple`,
    `WorkingDirectory=${o.workDir}`,
    `ExecStart=${sdArg(o.nodePath)} ${sdArg(o.script)}`,
    `Restart=always`,
    `RestartSec=10`,
    ``,
    `[Install]`,
    `WantedBy=default.target`,
    ``,
  ].join("\n");
}

/** @param {{nodePath:string, script:string, workDir:string, description:string}} o */
export function systemdBackupUnit(o) {
  return [
    `[Unit]`,
    `Description=${o.description}`,
    ``,
    `[Service]`,
    `Type=oneshot`,
    `WorkingDirectory=${o.workDir}`,
    `ExecStart=${sdArg(o.nodePath)} ${sdArg(o.script)}`,
    ``,
  ].join("\n");
}

/** @param {{description:string, hour:number, minute:number}} o */
export function systemdTimer(o) {
  const hh = String(o.hour).padStart(2, "0");
  const mm = String(o.minute).padStart(2, "0");
  return [
    `[Unit]`,
    `Description=${o.description}`,
    ``,
    `[Timer]`,
    `OnCalendar=*-*-* ${hh}:${mm}:00`,
    `Persistent=true`,
    ``,
    `[Install]`,
    `WantedBy=timers.target`,
    ``,
  ].join("\n");
}

// ---- Windows ----------------------------------------------------------------------------------
/** Windows command-line quoting for one argument. */
const winArg = (s) => `"${String(s).replace(/"/g, '\\"')}"`;

/**
 * Task Scheduler XML. `kind: "server"` starts at boot and at logon (only one copy runs), restarts on
 * failure and has no time limit; `kind: "backup"` runs daily at `dailyAt` (and catches up if missed).
 * Runs as `userId` with S4U ("run whether user is logged on or not", no stored password), so no console
 * window appears and the server keeps running after you sign out.
 * @param {{kind:"server"|"backup", description:string, userId:string, nodePath:string, script:string,
 *          workDir:string, dailyAt?:{hour:number, minute:number}}} o
 */
export function windowsTaskXml(o) {
  const at = o.dailyAt ?? { hour: 2, minute: 0 };
  const start = `2026-01-01T${String(at.hour).padStart(2, "0")}:${String(at.minute).padStart(2, "0")}:00`;
  const triggers =
    o.kind === "server"
      ? [
          `    <BootTrigger>`,
          `      <Enabled>true</Enabled>`,
          `      <Delay>PT30S</Delay>`,
          `    </BootTrigger>`,
          `    <LogonTrigger>`,
          `      <Enabled>true</Enabled>`,
          `      <UserId>${xml(o.userId)}</UserId>`,
          `    </LogonTrigger>`,
        ]
      : [
          `    <CalendarTrigger>`,
          `      <StartBoundary>${start}</StartBoundary>`,
          `      <Enabled>true</Enabled>`,
          `      <ScheduleByDay>`,
          `        <DaysInterval>1</DaysInterval>`,
          `      </ScheduleByDay>`,
          `    </CalendarTrigger>`,
        ];
  return [
    `<?xml version="1.0" encoding="UTF-16"?>`,
    `<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">`,
    `  <RegistrationInfo>`,
    `    <Description>${xml(o.description)}</Description>`,
    `  </RegistrationInfo>`,
    `  <Triggers>`,
    ...triggers,
    `  </Triggers>`,
    `  <Principals>`,
    `    <Principal id="Author">`,
    `      <UserId>${xml(o.userId)}</UserId>`,
    `      <LogonType>S4U</LogonType>`,
    `      <RunLevel>LeastPrivilege</RunLevel>`,
    `    </Principal>`,
    `  </Principals>`,
    `  <Settings>`,
    `    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>`,
    `    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>`,
    `    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>`,
    `    <StartWhenAvailable>true</StartWhenAvailable>`,
    `    <AllowStartOnDemand>true</AllowStartOnDemand>`,
    `    <Enabled>true</Enabled>`,
    `    <ExecutionTimeLimit>${o.kind === "server" ? "PT0S" : "PT1H"}</ExecutionTimeLimit>`,
    ...(o.kind === "server"
      ? [`    <RestartOnFailure>`, `      <Interval>PT1M</Interval>`, `      <Count>999</Count>`, `    </RestartOnFailure>`]
      : []),
    `  </Settings>`,
    `  <Actions Context="Author">`,
    `    <Exec>`,
    `      <Command>${xml(o.nodePath)}</Command>`,
    `      <Arguments>${xml(winArg(o.script))}</Arguments>`,
    `      <WorkingDirectory>${xml(o.workDir)}</WorkingDirectory>`,
    `    </Exec>`,
    `  </Actions>`,
    `</Task>`,
    ``,
  ].join("\r\n");
}

/** UTF-16LE with BOM, the encoding schtasks expects for /XML files. */
export function utf16leWithBom(text) {
  return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]);
}
