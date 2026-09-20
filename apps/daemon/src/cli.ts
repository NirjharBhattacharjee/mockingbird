import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { checkInputMonitoring } from "@mockingbird/hotkey";
import { checkTypingAccess } from "@mockingbird/inject";
import {
  agentStatus,
  type Launchctl,
  restartArgv,
  runAll,
  runLaunchctl,
  startArgv,
  stopArgv,
} from "./agent/launchctl.ts";
import { AGENT_LABEL, agentPaths, plistFor } from "./agent/plist.ts";
import { main as listenMain } from "./listen.ts";
import { main as transcribeMain } from "./transcribe.ts";
import { main as typeMain } from "./type.ts";

const USAGE = `Usage: mockingbird <command> [options]

Dictation for macOS. Hold Fn, speak, and the text is typed into whatever app
is in front of you.

Commands:
  start        run in the background, now and at every login
  stop         stop, and stay stopped across reboots
  restart      restart the background agent (after granting a permission)
  status       whether it's running, and what it can see
  listen       run in this terminal instead, with a live status line
  transcribe   turn a recording into text
  type         check typing permission, or type some text
  -h, --help   show this help

Run a command with --help for its own options, e.g. \`mockingbird listen --help\`.`;

class UsageError extends Error {}

const log = (message: string) => console.error(message);

/**
 * The path to name for bun. `process.execPath` is the versioned Cellar binary,
 * which `brew upgrade` deletes, taking the agent with it; the Homebrew symlink
 * keeps working. macOS resolves either to the same file when recording a
 * Privacy grant, so this costs nothing and survives an upgrade.
 */
export function bunPath(exec = process.execPath, which = (n: string) => Bun.which(n)): string {
  const link = which("bun");
  if (!link) return exec;
  try {
    return realpathSync(link) === realpathSync(exec) ? link : exec;
  } catch {
    return exec;
  }
}

function agentProgram(): string[] {
  return [bunPath(), join(dirname(Bun.fileURLToPath(import.meta.url)), "agent.ts")];
}

async function lint(plistPath: string): Promise<void> {
  const proc = Bun.spawn(["plutil", "-lint", plistPath], { stdout: "pipe", stderr: "pipe" });
  if ((await proc.exited) !== 0) {
    throw new Error(
      `the generated ${plistPath} isn't valid: ${await new Response(proc.stderr).text()}`,
    );
  }
}

async function start(run: Launchctl = runLaunchctl): Promise<number> {
  const paths = agentPaths();
  // launchd refuses to bootstrap ("Input/output error") when it can't open the
  // log, so the directory has to exist first.
  mkdirSync(paths.logDir, { recursive: true, mode: 0o700 });
  mkdirSync(dirname(paths.plistPath), { recursive: true });
  writeFileSync(
    paths.plistPath,
    plistFor({
      programArguments: agentProgram(),
      logPath: paths.logPath,
      workingDirectory: paths.home,
      pathEntries: [dirname(bunPath())],
      ...(process.env.MOCKINGBIRD_HOME
        ? { environment: { MOCKINGBIRD_HOME: process.env.MOCKINGBIRD_HOME } }
        : {}),
    }),
    { mode: 0o600 },
  );
  await lint(paths.plistPath);

  const uid = process.getuid?.() ?? 0;
  await runAll(
    startArgv(uid, paths.plistPath),
    run,
    (step, result) =>
      // Already bootstrapped from a previous start; kickstart below restarts it.
      step[0] === "bootstrap" && /already|service already loaded|5:/i.test(result.stderr),
  );
  log("mockingbird is running, and will start again at every login.");
  log(`Logs: ${paths.logPath}`);
  const missing = permissionsMissing();
  if (missing.length > 0) {
    log(
      `\nFn and typing need permission. macOS grants these to the binary launchd runs:\n` +
        `  ${bunPath()}\n` +
        `Add it under System Settings → Privacy & Security → ${missing.join(" and ")},\n` +
        `then run \`mockingbird restart\`.`,
    );
  }
  return 0;
}

async function stop(run: Launchctl = runLaunchctl): Promise<number> {
  const uid = process.getuid?.() ?? 0;
  await runAll(
    stopArgv(uid),
    run,
    (step, result) =>
      // Nothing to boot out is the state we wanted anyway.
      step[0] === "bootout" && /Could not find|No such process/i.test(result.stderr),
  );
  log("mockingbird is stopped, and won't come back at login until `mockingbird start`.");
  return 0;
}

async function restart(run: Launchctl = runLaunchctl): Promise<number> {
  const uid = process.getuid?.() ?? 0;
  await runAll(restartArgv(uid), run);
  log("mockingbird restarted.");
  return 0;
}

/** Named for the System Settings panes, because that's where the user is going. */
function permissionsMissing(): string[] {
  const missing: string[] = [];
  if (checkInputMonitoring() !== "granted") missing.push("Input Monitoring");
  if (!checkTypingAccess()) missing.push("Accessibility");
  return missing;
}

async function status(run: Launchctl = runLaunchctl): Promise<number> {
  const paths = agentPaths();
  const uid = process.getuid?.() ?? 0;
  const { state, pid, lastExitCode } = await agentStatus(uid, run);
  const described: Record<typeof state, string> = {
    "not-installed": "not installed — run `mockingbird start`",
    stopped: "stopped — run `mockingbird start`",
    running: `running (pid ${pid})`,
    crashed: `crashed (exit ${lastExitCode}) — see the log`,
    exited: "exited — see the log",
  };
  console.log(`agent:  ${described[state]}`);
  console.log(`label:  ${AGENT_LABEL}`);
  console.log(`logs:   ${paths.logPath}`);

  // These report what *this* process can see. The agent runs under launchd with
  // a different responsible process, so its own grants can differ.
  const missing = permissionsMissing();
  console.log(
    `this terminal: ${missing.length === 0 ? "Fn and typing allowed" : `missing ${missing.join(", ")}`}`,
  );
  if (state === "running") {
    console.log(
      "\nIf Fn does nothing, the agent is missing a permission even though this terminal has it:\n" +
        `grant them to ${bunPath()} and run \`mockingbird restart\`.`,
    );
  }
  return 0;
}

export async function main(argv: string[] = Bun.argv.slice(2)): Promise<number> {
  const [command, ...rest] = argv;
  switch (command) {
    case undefined:
    case "-h":
    case "--help":
    case "help":
      console.log(USAGE);
      return 0;
    case "start":
      return start();
    case "stop":
      return stop();
    case "restart":
      return restart();
    case "status":
      return status();
    case "listen":
      return listenMain(rest);
    case "transcribe":
      return transcribeMain(rest);
    case "type":
      return typeMain(rest);
    default:
      throw new UsageError(`unknown command "${command}"`);
  }
}

if (import.meta.main) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      if (error instanceof UsageError) {
        log(`error: ${error.message}\n\n${USAGE}`);
        process.exit(2);
      }
      log(`error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    },
  );
}
