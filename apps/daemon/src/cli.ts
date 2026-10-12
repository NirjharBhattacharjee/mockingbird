import { existsSync, mkdirSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { checkInputMonitoring } from "@mockingbird/hotkey";
import { checkTypingAccess } from "@mockingbird/inject";
import {
  agentStatus,
  type Launchctl,
  type LaunchctlResult,
  runAll,
  runLaunchctl,
  settle,
  startArgv,
  stopArgv,
} from "./agent/launchctl.ts";
import { AGENT_LABEL, agentPaths, plistFor } from "./agent/plist.ts";
import { appPath, ensureRunner, unregisterApp } from "./agent/runner.ts";
import { main as dictionaryMain } from "./dictionary.ts";
import {
  claimFnKey,
  claimMessage,
  type FnUsage,
  fnAdvice,
  fnConflict,
  readFnBackup,
  readFnUsage,
  restoreFnKey,
  restoreMessage,
} from "./fn-key.ts";
import { main as listenMain } from "./listen.ts";
import { modelsCommand, pullModels } from "./models.ts";
import { openPermissionPane, paneFor } from "./permissions.ts";
import { DEFAULT_LLM_MODEL, mockingbirdHome } from "./runtime.ts";
import { main as transcribeMain } from "./transcribe.ts";
import { main as typeMain } from "./type.ts";
import { uninstall } from "./uninstall.ts";

/** The commands, for `--help` and the Go command's home screen (`help --json`). */
export const COMMANDS: { name: string; summary: string }[] = [
  { name: "start", summary: "run in the background, now and at every login" },
  { name: "stop", summary: "stop, and stay stopped across reboots" },
  { name: "restart", summary: "restart the background agent (after granting a permission)" },
  { name: "status", summary: "whether it's running, and what it can see" },
  {
    name: "fn",
    summary:
      "bind Fn to dictation only, so macOS stops opening the picker\n(`mockingbird fn --undo` puts back the previous setting)",
  },
  { name: "dictionary", summary: "list, add and remove words it should spell right" },
  {
    name: "models",
    summary:
      "the cleanup models Ollama has, with their scores\n(`mockingbird models use <name>` switches)",
  },
  {
    name: "models pull",
    summary: "download the speech and cleanup models (the only command\nthat uses the network)",
  },
  { name: "listen", summary: "run in this terminal instead, with a live status line" },
  { name: "transcribe", summary: "turn a recording into text" },
  { name: "type", summary: "check typing permission, or type some text" },
  { name: "setup", summary: "walk through the permissions, Fn and a test dictation" },
  { name: "uninstall", summary: "remove mockingbird and what it installed (asks first)" },
];

const USAGE = `Usage: mockingbird <command> [options]

Dictation for macOS. Hold Fn, speak, and the text is typed into whatever app
is in front of you.

Commands:
${[...COMMANDS, { name: "-h, --help", summary: "show this help" }]
  .map(
    ({ name, summary }) => `  ${name.padEnd(13)}${summary.replaceAll("\n", `\n${" ".repeat(15)}`)}`,
  )
  .join("\n")}

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

/**
 * `models pull`, with the downloads drawn on one line that redraws in place
 * on a terminal. When the installer sets MOCKINGBIRD_PROGRESS, the same line
 * also goes to that file, which the install shows in place of its clock.
 */
async function pullWithProgress(): Promise<number> {
  let file = process.env.MOCKINGBIRD_PROGRESS;
  let drawn = false;
  const clear = () => {
    if (drawn) process.stderr.write("\r\x1b[K");
    drawn = false;
  };
  try {
    return await pullModels({
      log: (message) => {
        clear();
        log(message);
      },
      progress: (line) => {
        if (file) {
          // Renamed into place, so the installer never reads half a line. The
          // file is only for show: if it can't be written, the downloads go on.
          try {
            writeFileSync(`${file}.tmp`, line);
            renameSync(`${file}.tmp`, file);
          } catch (error) {
            log(`not showing progress: ${error instanceof Error ? error.message : error}`);
            file = undefined;
          }
        }
        if (process.stderr.isTTY) {
          process.stderr.write(`\r\x1b[K${line}`);
          drawn = line !== "";
        }
      },
    });
  } finally {
    clear();
  }
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

/**
 * The agent's entry point, as launchd should name it. Bun resolves symlinks in
 * `import.meta.url`, so under Homebrew that is the versioned Cellar folder,
 * which `brew upgrade` deletes. The Homebrew shim sets MOCKINGBIRD_ROOT to the
 * unversioned `opt` path instead, which always points at the current version.
 */
export function agentEntry(
  root = process.env.MOCKINGBIRD_ROOT,
  here = dirname(Bun.fileURLToPath(import.meta.url)),
): string {
  return root ? join(root, "apps", "daemon", "src", "agent.ts") : join(here, "agent.ts");
}

/** The MOCKINGBIRD_* settings from the shell that ran `start`; launchd passes nothing else on. */
export function agentEnvironment(env = process.env): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter(
      (e): e is [string, string] => e[0].startsWith("MOCKINGBIRD_") && e[1] !== undefined,
    ),
  );
}

function agentProgram(runner: string): string[] {
  return [runner, agentEntry()];
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

  // Our own copy of bun in mockingbird.app, so macOS shows our name and logo.
  const runner = ensureRunner();
  if (runner.unsigned) {
    log(`note: couldn't rename the agent for System Settings (${runner.unsigned}).`);
  }
  if (runner.installed) {
    log(
      "note: mockingbird.app was rebuilt, which macOS treats as a new program, so it\n" +
        "may ask for the microphone, Accessibility and Input Monitoring again. An older\n" +
        '"mockingbird" entry without the logo can be removed from those lists.',
    );
  }
  writeFileSync(
    paths.plistPath,
    plistFor({
      programArguments: agentProgram(runner.path),
      logPath: paths.logPath,
      workingDirectory: paths.home,
      pathEntries: [dirname(bunPath())],
      environment: agentEnvironment(),
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
      `  ${runner.app}\n\n` +
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
// The agent's "checks:" line, not its earlier "permissions:" one: it comes
// after the microphone probe, so it's the only one that knows about all three.
const CHECKS = "checks: Fn ";

/** The permissions a "checks:" line from the agent's log says are missing. */
export function missingFrom(line: string): string[] {
  const missing: string[] = [];
  if (line.includes("Fn MISSING")) missing.push("Input Monitoring");
  if (line.includes("typing MISSING")) missing.push("Accessibility");
  if (line.includes("microphone SILENT")) missing.push("Microphone");
  return missing;
}

/**
 * `status --json`, which the Go command's home screen shows. `missing` is
 * what the running agent last reported, from its log: the agent's own
 * grants, which can differ from this terminal's. It's null when the agent
 * isn't running or hasn't reported yet. `fnAction` is set when tapping Fn
 * opens something in macOS.
 */
export async function agentState(
  run: Launchctl = runLaunchctl,
  logPath = agentPaths().logPath,
  fnUsage: () => Promise<FnUsage> = () => readFnUsage(),
) {
  const { state } = await agentStatus(process.getuid?.() ?? 0, run);
  // The whole log: the agent writes its checks once, at start, and trims the
  // log to nothing past 1 MB before that, so it's never big.
  const log = await Bun.file(logPath)
    .text()
    .catch(() => "");
  // Only this run's checks: each run starts with a "permissions:" line, and a
  // restarted agent hasn't reported until a "checks:" line follows it.
  const lines = log.split("\n");
  const thisRun = lines.findLastIndex((l) => l.includes("permissions: Fn "));
  const line = lines.slice(Math.max(0, thisRun)).findLast((l) => l.includes(CHECKS));
  const fn = await fnUsage();
  return {
    agent: state,
    missing: state === "running" && line ? missingFrom(line) : null,
    fnAction: fn.kind === "taken" ? fn.action : null,
  };
}

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
    const line = text
      .slice(since)
      .split("\n")
      .find((l) => l.includes(CHECKS));
    if (line) return missingFrom(line);
    await Bun.sleep(250);
  }
  return undefined;
}

/** Boots the agent out and waits until launchd has let go of it. */
async function unload(run: Launchctl, settleMs?: number): Promise<boolean> {
  const uid = process.getuid?.() ?? 0;
  await runAll(
    stopArgv(uid),
    run,
    (step, result) =>
      // Nothing to boot out is the state we wanted anyway.
      step[0] === "bootout" && /Could not find|No such process/i.test(result.stderr),
  );
  // bootout is asynchronous; returning early makes a following `start` race it.
  return settle(uid, "gone", run, settleMs);
}

/** Exported for tests, which supply their own launchctl and a short settle. */
export async function stop(run: Launchctl = runLaunchctl, settleMs?: number): Promise<number> {
  if (!(await unload(run, settleMs))) {
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

/**
 * A full unload and `start`, not `kickstart -k`: launchd reads the plist only
 * when it loads the job, and `start` rewrites it with the current settings.
 */
async function restart(run: Launchctl = runLaunchctl): Promise<number> {
  if (!(await unload(run))) {
    log("launchd is still unloading the agent. Run `mockingbird start` in a moment.");
    return 1;
  }
  return start(run);
}

const SETUP_BY_HAND = `The guided setup needs a terminal. By hand:

  1. mockingbird start
  2. Allow "mockingbird" in System Settings → Privacy & Security under Input
     Monitoring, Accessibility and Microphone, then mockingbird restart.
     mockingbird status says what's still missing.
  3. If tapping Fn opens the emoji picker: mockingbird fn, then log out of
     your Mac and back in.
  4. Click into any text box, hold Fn, say something, and let go.`;

/**
 * What a dictation's log line says happened, for `setup await-dictation`:
 * typed, nothing heard, or not typed and why. Undefined for any other line.
 */
export function dictationOutcome(
  line: string,
): { outcome: "typed" | "no-speech" | "not-typed"; detail: string } | undefined {
  const typed = line.match(/ typed (\d+) characters$/);
  if (typed) return { outcome: "typed", detail: `${typed[1]} characters` };
  if (line.endsWith(" no speech detected")) return { outcome: "no-speech", detail: "" };
  const not = line.match(/ not typed \(\d+ characters\): (.*)$/);
  if (not) return { outcome: "not-typed", detail: not[1] ?? "" };
  return undefined;
}

/**
 * `setup`. The Go command draws the guided flow and calls the two helpers
 * below; run on its own, this prints the same steps as text.
 *   setup open <pane>        opens System Settings at that Privacy pane
 *   setup await-dictation    waits for the agent's next dictation, then
 *                            prints its outcome as JSON
 */
async function setup(args: string[], logPath = agentPaths().logPath): Promise<number> {
  const [step, ...more] = args;
  if (step === "open" && more.length > 0) {
    openPermissionPane(paneFor(more.join(" ")));
    return 0;
  }
  if (step === "await-dictation") {
    // statSync, not Bun.file().size, which isn't valid before a read.
    const from = existsSync(logPath) ? statSync(logPath).size : 0;
    const deadline = Date.now() + 120_000;
    // Stops when the setup that asked has gone (this is reparented to
    // launchd, pid 1), rather than waiting out the two minutes on its own.
    while (Date.now() < deadline && process.ppid !== 1) {
      await Bun.sleep(250);
      const fresh = await Bun.file(logPath)
        .slice(from)
        .text()
        .catch(() => "");
      for (const line of fresh.split("\n")) {
        const outcome = dictationOutcome(line);
        if (outcome) {
          console.log(JSON.stringify(outcome));
          return 0;
        }
      }
    }
    console.log(JSON.stringify({ outcome: "timeout", detail: "" }));
    return 1;
  }
  if (step !== undefined) throw new UsageError(`unknown setup step "${step}"`);
  console.log(SETUP_BY_HAND);
  return 0;
}

/** `uninstall` with the real agent, Fn, git, Ollama and du behind it. */
function uninstallHere(args: string[]): Promise<number> {
  if (args.some((a) => a !== "--yes")) {
    throw new UsageError("`mockingbird uninstall` takes only --yes");
  }
  const out = (argv: string[]) => {
    const r = Bun.spawnSync(argv, { stderr: "ignore" });
    return r.exitCode === 0 ? r.stdout.toString().trim() : undefined;
  };
  return uninstall(args, {
    mockingbirdHome: mockingbirdHome(),
    root:
      process.env.MOCKINGBIRD_ROOT ??
      realpathSync(join(dirname(Bun.fileURLToPath(import.meta.url)), "..", "..", "..")),
    plistPath: agentPaths().plistPath,
    cleanupModel: process.env.MOCKINGBIRD_LLM_MODEL ?? DEFAULT_LLM_MODEL,
    ask: (question, fallback) => {
      const answer = prompt(question)?.trim();
      return answer ? /^y/i.test(answer) : fallback;
    },
    log,
    stopAgent: () => stop(),
    undoFn: () => fn(["--undo"]),
    fnBackupPath: fnBackupPath(),
    git: (args) => out(["git", ...args]),
    ollamaRm: (model) => Bun.spawn(["ollama", "rm", model], { stdout: "inherit" }).exited,
    sizeOf: (path) => out(["du", "-sh", path])?.split("\t")[0] ?? "",
    unregisterApp,
    // biome-ignore lint/suspicious/noTemplateCurlyInString: zsh expands it, not JS.
    zdotdir: out(["zsh", "-c", 'printf %s "${ZDOTDIR:-$HOME}"']),
  });
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
        `grant them to "mockingbird" (${appPath()}) and run \`mockingbird restart\`.`,
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
      if (command === "help" && rest[0] === "--json") {
        console.log(JSON.stringify({ commands: COMMANDS, status: await agentState() }));
        return 0;
      }
      console.log(USAGE);
      return 0;
    case "start":
      return start();
    case "stop":
      return stop();
    case "restart":
      return restart();
    case "status":
      if (rest[0] === "--json") {
        console.log(JSON.stringify(await agentState()));
        return 0;
      }
      return status();
    case "fn":
      return fn(rest);
    case "models":
      if (rest.length === 1 && rest[0] === "pull") return pullWithProgress();
      return modelsCommand(rest, { restart: () => restart() });
    case "dictionary":
      return dictionaryMain(rest);
    case "listen":
      return listenMain(rest);
    case "transcribe":
      return transcribeMain(rest);
    case "type":
      return typeMain(rest);
    case "setup":
      return setup(rest);
    case "uninstall":
      return uninstallHere(rest);
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
