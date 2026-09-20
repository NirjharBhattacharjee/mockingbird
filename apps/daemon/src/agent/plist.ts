import { homedir } from "node:os";
import { join } from "node:path";

export const AGENT_LABEL = "com.mockingbird.agent";

/** launchd's own PATH is /usr/bin:/bin:/usr/sbin:/sbin, which has no Homebrew. */
export const DEFAULT_PATH_ENTRIES = [
  "/opt/homebrew/bin",
  "/usr/local/bin",
  "/usr/bin",
  "/bin",
  "/usr/sbin",
  "/sbin",
];

export type AgentPaths = {
  home: string;
  plistPath: string;
  logDir: string;
  logPath: string;
};

export function agentPaths(home = homedir(), label = AGENT_LABEL): AgentPaths {
  const mockingbirdHome = process.env.MOCKINGBIRD_HOME ?? join(home, ".mockingbird");
  return {
    home,
    plistPath: join(home, "Library", "LaunchAgents", `${label}.plist`),
    logDir: join(mockingbirdHome, "logs"),
    logPath: join(mockingbirdHome, "logs", "agent.log"),
  };
}

export type PlistOptions = {
  label?: string;
  /** What launchd runs: the bun binary, then the agent entry point. */
  programArguments: string[];
  logPath: string;
  workingDirectory: string;
  /** Prepended to the default PATH, for tools found somewhere unusual. */
  pathEntries?: string[];
  environment?: Record<string, string>;
};

const xml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const stringTag = (value: string) => `<string>${xml(value)}</string>`;

export function plistFor(options: PlistOptions): string {
  const label = options.label ?? AGENT_LABEL;
  const path = [...new Set([...(options.pathEntries ?? []), ...DEFAULT_PATH_ENTRIES])].join(":");
  const environment = { PATH: path, ...options.environment };
  const args = options.programArguments.map((a) => `      ${stringTag(a)}`).join("\n");
  const env = Object.entries(environment)
    .map(([key, value]) => `      <key>${xml(key)}</key>\n      ${stringTag(value)}`)
    .join("\n");

  // KeepAlive is Crashed-only on purpose: a deliberate exit (no microphone, a
  // missing model) must stay exited rather than relaunch every ThrottleInterval
  // forever. ProcessType Interactive keeps launchd from throttling the CPU of a
  // job that has to answer a key press.
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    ${stringTag(label)}
    <key>ProgramArguments</key>
    <array>
${args}
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <dict>
      <key>Crashed</key>
      <true/>
    </dict>
    <key>ThrottleInterval</key>
    <integer>10</integer>
    <key>ProcessType</key>
    <string>Interactive</string>
    <key>LimitLoadToSessionType</key>
    <string>Aqua</string>
    <key>WorkingDirectory</key>
    ${stringTag(options.workingDirectory)}
    <key>StandardOutPath</key>
    ${stringTag(options.logPath)}
    <key>StandardErrorPath</key>
    ${stringTag(options.logPath)}
    <key>EnvironmentVariables</key>
    <dict>
${env}
    </dict>
  </dict>
</plist>
`;
}
