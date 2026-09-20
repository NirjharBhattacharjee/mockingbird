import { AGENT_LABEL } from "./plist.ts";

export type LaunchctlResult = { code: number; stdout: string; stderr: string };
export type Launchctl = (args: string[]) => Promise<LaunchctlResult>;

/** `launchctl print` exits with this when the service isn't loaded. */
const NO_SUCH_SERVICE = 113;

export const runLaunchctl: Launchctl = async (args) => {
  const proc = Bun.spawn(["launchctl", ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, stdout, stderr };
};

export const domain = (uid: number) => `gui/${uid}`;
export const target = (uid: number, label = AGENT_LABEL) => `${domain(uid)}/${label}`;

/**
 * `enable` comes first because kickstart fails on a disabled service, and
 * `stop` disables before booting out because the disabled flag is what
 * survives a reboot — the plist stays on disk with RunAtLoad set.
 */
export const startArgv = (uid: number, plistPath: string, label = AGENT_LABEL) => [
  ["enable", target(uid, label)],
  ["bootstrap", domain(uid), plistPath],
  ["kickstart", target(uid, label)],
];

export const stopArgv = (uid: number, label = AGENT_LABEL) => [
  ["disable", target(uid, label)],
  ["bootout", target(uid, label)],
];

export const restartArgv = (uid: number, label = AGENT_LABEL) => [
  ["kickstart", "-k", target(uid, label)],
];

export type PrintInfo = {
  pid?: number;
  state?: string;
  lastExitCode?: number;
};

/** Pulls the few fields we need out of `launchctl print`'s indented dump. */
export function parsePrint(stdout: string): PrintInfo {
  const info: PrintInfo = {};
  const pid = stdout.match(/^\s*pid\s*=\s*(\d+)/m);
  if (pid?.[1]) info.pid = Number(pid[1]);
  const state = stdout.match(/^\s*state\s*=\s*(\S+)/m);
  if (state?.[1]) info.state = state[1];
  // macOS has called this both "last exit code" and "last exit status".
  const exit = stdout.match(/^\s*last exit (?:code|status)\s*=\s*(-?\d+)/m);
  if (exit?.[1]) info.lastExitCode = Number(exit[1]);
  return info;
}

/** Whether `launchctl print-disabled` lists this label as disabled. */
export function parseDisabled(stdout: string, label = AGENT_LABEL): boolean {
  const line = stdout
    .split("\n")
    .find((l) => l.includes(`"${label}"`) || l.trim().startsWith(`${label} `));
  if (!line) return false;
  return /=>\s*(true|disabled)\s*$/.test(line.trim());
}

export type AgentState = "not-installed" | "stopped" | "running" | "crashed" | "exited";

export type AgentStatus = {
  state: AgentState;
  pid?: number;
  lastExitCode?: number;
};

export async function agentStatus(
  uid: number,
  run: Launchctl = runLaunchctl,
  label = AGENT_LABEL,
): Promise<AgentStatus> {
  const printed = await run(["print", target(uid, label)]);
  const disabled = parseDisabled((await run(["print-disabled", domain(uid)])).stdout, label);
  if (printed.code === NO_SUCH_SERVICE || /Could not find service/i.test(printed.stderr)) {
    return { state: disabled ? "stopped" : "not-installed" };
  }
  if (printed.code !== 0) return { state: "not-installed" };

  const info = parsePrint(printed.stdout);
  if (info.pid !== undefined) return { state: "running", pid: info.pid };
  if (disabled) return { state: "stopped", lastExitCode: info.lastExitCode };
  if (info.lastExitCode !== undefined && info.lastExitCode !== 0) {
    return { state: "crashed", lastExitCode: info.lastExitCode };
  }
  return { state: "exited", lastExitCode: info.lastExitCode };
}

/** Runs a list of argv in order, stopping at the first real failure. */
export async function runAll(
  steps: string[][],
  run: Launchctl = runLaunchctl,
  /** Exit codes to treat as success, e.g. booting out something not loaded. */
  tolerate: (step: string[], result: LaunchctlResult) => boolean = () => false,
): Promise<void> {
  for (const step of steps) {
    const result = await run(step);
    if (result.code === 0 || tolerate(step, result)) continue;
    const detail = (result.stderr || result.stdout).trim();
    throw new Error(
      `launchctl ${step.join(" ")} failed (${result.code})${detail ? `: ${detail}` : ""}`,
    );
  }
}
