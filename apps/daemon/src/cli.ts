import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { checkInputMonitoring } from "@mockingbird/hotkey";
import { checkTypingAccess } from "@mockingbird/inject";
import {
  agentStatus,
  type Launchctl,
  type LaunchctlResult,
  restartArgv,
  runAll,
  runLaunchctl,
  settle,
  startArgv,
  stopArgv,
} from "./agent/launchctl.ts";
import { AGENT_LABEL, agentPaths, plistFor } from "./agent/plist.ts";
import { ensureRunner, runnerPath } from "./agent/runner.ts";
import {
  claimFnKey,
  claimMessage,
  fnAdvice,
  fnConflict,
  readFnBackup,
  readFnUsage,
  restoreFnKey,
  restoreMessage,
} from "./fn-key.ts";
import { main as listenMain } from "./listen.ts";
import { openPermissionPane, paneFor } from "./permissions.ts";
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
  fn           bind Fn to dictation only, so macOS stops opening the picker
               (\`mockingbird fn --undo\` puts back the previous setting)
  listen       run in this terminal instead, with a live status line
  transcribe   turn a recording into text
  type         check typing permission, or type some text
  -h, --help   show this help

Run a command with --help for its own options, e.g. \`mockingbird listen --help\`.`;

class UsageError extends Error {}

const log = (message: string) => console.error(message);

/** Where `mockingbird fn` keeps the Fn setting it replaced, for `--undo`. */
function fnBackupPath(): string {
  return join(dirname(agentPaths().logDir), "fn-key.json");
}

/** The Fn hint for `start` and `restart`, if any. Reads the setting, never writes it. */
async function logFnAdvice(): Promise<void> {
  const advice = fnAdvice(await readFnUsage());
  if (advice) log(`\n${advice}`);
}

async function fn(args: string[]): Promise<number> {
  const [flag, ...extra] = args;
  if (extra.length > 0 || (flag !== undefined && flag !== "--undo")) {
    throw new UsageError(`\`mockingbird fn\` takes only --undo, not "${args.join(" ")}"`);
  }
  if (flag === "--undo") {
    const result = await restoreFnKey(fnBackupPath());
    log(restoreMessage(result));
    return result.kind === "failed" ? 1 : 0;
  }
  const claim = await claimFnKey(fnBackupPath());
  log(claimMessage(claim));
  return claim.kind === "failed" ? 1 : 0;
}

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

function agentProgram(runner: string): string[] {
  return [runner, join(dirname(Bun.fileURLToPath(import.meta.url)), "agent.ts")];
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

  // Our own copy of bun, named mockingbird, so that's the name macOS shows.
  const runner = ensureRunner();
  if (runner.unsigned) {
    log(`note: couldn't rename the agent for System Settings (${runner.unsigned}).`);
  }
  writeFileSync(
    paths.plistPath,
    plistFor({
      programArguments: agentProgram(runner.path),
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

  // Where the log ends now, so we read this run's startup line and not an old one.
  const since = await Bun.file(paths.logPath)
    .text()
    .then((t) => t.length)
    .catch(() => 0);
  const uid = process.getuid?.() ?? 0;
  const steps = startArgv(uid, paths.plistPath);
  const tolerate = (step: string[], result: LaunchctlResult) =>
    // Already bootstrapped from a previous start; kickstart below restarts it.
    step[0] === "bootstrap" && /already|service already loaded|5:/i.test(result.stderr);
  await runAll(steps, run, tolerate);
  // A bootout still draining from an earlier `stop` can remove the job we just
  // bootstrapped, so confirm it survived rather than trusting the exit codes.
  if (!(await settle(uid, "loaded", run, 3_000))) {
    await runAll(steps, run, tolerate);
    if (!(await settle(uid, "loaded", run, 5_000))) {
      throw new Error(
        `launchd accepted the agent but it isn't loaded. See \`launchctl print gui/$UID/${AGENT_LABEL}\` and ${paths.logPath}.`,
      );
    }
  }
  log("mockingbird is running, and will start again at every login.");
  log(`Logs: ${paths.logPath}`);

  // Whether *this* process can see the Fn key says nothing about the agent:
  // macOS grants these per responsible process, and under launchd that is bun
  // rather than the terminal. So report the agent's own verdict, not ours.
  const missing = await agentVerdict(paths.logPath, since);
  if (missing === undefined) {
    log("\nThe agent hasn't reported in yet. Try `mockingbird status` in a moment.");
    return 0;
  }
  if (missing.length === 0) {
    log("\nFn and typing are allowed. Hold Fn anywhere and speak.");
    // macOS's own Fn action steals the keyboard on a tap (see fn-key.ts), but
    // it's a system-wide setting, so only point at `mockingbird fn`.
    await logFnAdvice();
    return 0;
  }
  log(
    `\nThe agent can't use ${missing.join(" or ")} yet. macOS grants these to the\n` +
      `program launchd runs — listed as "mockingbird", at:\n\n` +
      `  ${runner.path}\n\n` +
      `Switch it on under Privacy & Security → ${missing.join(" and ")} (click + and\n` +
      `add it if it isn't listed), then run \`mockingbird restart\`.`,
  );
  openPermissionPane(paneFor(missing[0] ?? "Accessibility"));
  await logFnAdvice();
  return 0;
}

/**
 * The agent's own permission line from its log, named as System Settings panes.
 * Undefined when it hasn't got that far yet.
 */
export async function agentVerdict(
  logPath: string,
  since: number,
  timeoutMs = 15_000,
  now = () => Date.now(),
): Promise<string[] | undefined> {
  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    const text = await Bun.file(logPath)
      .text()
      .catch(() => "");
    // The "checks:" line, not the earlier "permissions:" one: it comes after
    // the microphone probe, so it's the only one that knows about all three.
    const line = text
      .slice(since)
      .split("\n")
      .find((l) => l.includes("checks: Fn "));
    if (line) {
      const missing: string[] = [];
      if (line.includes("Fn MISSING")) missing.push("Input Monitoring");
      if (line.includes("typing MISSING")) missing.push("Accessibility");
      if (line.includes("microphone SILENT")) missing.push("Microphone");
      return missing;
    }
    await Bun.sleep(250);
  }
  return undefined;
}

/** Exported for tests, which supply their own launchctl and a short settle. */
export async function stop(run: Launchctl = runLaunchctl, settleMs?: number): Promise<number> {
  const uid = process.getuid?.() ?? 0;
  await runAll(
    stopArgv(uid),
    run,
    (step, result) =>
      // Nothing to boot out is the state we wanted anyway.
      step[0] === "bootout" && /Could not find|No such process/i.test(result.stderr),
  );
  // bootout is asynchronous; returning early makes a following `start` race it.
  if (!(await settle(uid, "gone", run, settleMs))) {
    log(
      "launchd is still unloading the agent, so it may still be listening for Fn.\n" +
        "It won't come back at login. Check `mockingbird status` before `mockingbird start`.",
    );
    return 1;
  }
  log("mockingbird is stopped, and won't come back at login until `mockingbird start`.");
  if (readFnBackup(fnBackupPath())) {
    log("Fn is still bound to nothing. Run `mockingbird fn --undo` to give it back to macOS.");
  }
  return 0;
}

async function restart(run: Launchctl = runLaunchctl): Promise<number> {
  const uid = process.getuid?.() ?? 0;
  await runAll(restartArgv(uid), run);
  log("mockingbird restarted.");
  await logFnAdvice();
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

  const conflict = fnConflict(await readFnUsage());
  if (conflict) console.log(`\n${conflict}`);
  if (state === "running") {
    console.log(
      "\nIf Fn does nothing, the agent is missing a permission even though this terminal has it:\n" +
        `grant them to "mockingbird" (${runnerPath()}) and run \`mockingbird restart\`.`,
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
    case "fn":
      return fn(rest);
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
