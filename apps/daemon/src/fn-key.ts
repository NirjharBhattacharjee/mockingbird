import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * macOS keeps its own action on the Fn/🌐 key — by default it opens the emoji
 * picker. Both of us act on the same press: mockingbird starts a recording and
 * macOS opens the picker, which takes the keyboard, so the dictation lands in
 * the picker's search field instead of the app you were typing into. Holds are
 * unaffected, because the system action fires on a tap; taps and hands-free
 * mode are what break.
 *
 * mockingbird cannot take the key. Measured on macOS 26, all three routes fail:
 * an active event tap consuming Fn doesn't suppress the picker (the action is
 * handled below a session tap), a `hidutil` remap of the Globe key doesn't
 * either, and restarting the text-input agents doesn't make a new setting
 * apply. The only thing that works is the setting itself, which is why this
 * file writes it rather than trying to out-clever it — and why the change needs
 * a logout to take hold.
 *
 * It's a system-wide setting the user may rely on (input switching, emoji,
 * Apple Dictation), so it's only ever changed by an explicit `mockingbird fn`,
 * which saves the old value first so `mockingbird fn --undo` can put it back.
 */

const DOMAIN = "com.apple.HIToolbox";
const KEY = "AppleFnUsageType";

/** `Press 🌐 key to` in System Settings → Keyboard. */
export const FN_ACTIONS: Record<number, string> = {
  0: "Do Nothing",
  1: "Change Input Source",
  2: "Show Emoji & Symbols",
  3: "Start Dictation",
};

export type FnUsage =
  /** Nothing bound: taps are ours alone. */
  | { kind: "free" }
  /** macOS acts on the key too, and will win the focus. */
  | { kind: "taken"; value: number; action: string }
  /** Never set, so macOS uses a default we can't read. */
  | { kind: "unset" };

export const FN_PANE = "x-apple.systempreferences:com.apple.preference.keyboard";

/** Parses `defaults read com.apple.HIToolbox AppleFnUsageType`. */
export function parseFnUsage(stdout: string, ok: boolean): FnUsage {
  if (!ok) return { kind: "unset" };
  const value = Number.parseInt(stdout.trim(), 10);
  if (Number.isNaN(value)) return { kind: "unset" };
  if (value === 0) return { kind: "free" };
  return { kind: "taken", value, action: FN_ACTIONS[value] ?? `setting ${value}` };
}

/** The argv that reads the setting. Separate so the command is testable. */
export function fnReadArgv(): string[] {
  return ["defaults", "read", DOMAIN, KEY];
}

/** The argv that binds Fn to nothing, leaving the key to us. */
export function fnWriteArgv(): string[] {
  return ["defaults", "write", DOMAIN, KEY, "-int", "0"];
}

/** Removes the setting, for restoring a machine that never had one. */
export function fnDeleteArgv(): string[] {
  return ["defaults", "delete", DOMAIN, KEY];
}

/** Puts back a specific action. */
export function fnRestoreArgv(value: number): string[] {
  return ["defaults", "write", DOMAIN, KEY, "-int", String(value)];
}

type Spawn = (cmd: string[]) => { stdout: ReadableStream | null; exited: Promise<number> };

const defaultSpawn: Spawn = (cmd) => Bun.spawn(cmd, { stdout: "pipe", stderr: "ignore" });

export async function readFnUsage(spawn: Spawn = defaultSpawn): Promise<FnUsage> {
  try {
    const proc = spawn(fnReadArgv());
    const [stdout, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
    return parseFnUsage(stdout, code === 0);
  } catch {
    return { kind: "unset" };
  }
}

export type FnClaim =
  /** Fn was already ours; nothing to do. */
  | { kind: "already" }
  /** We took it. macOS won't notice until the next login. */
  | { kind: "claimed"; from: string }
  | { kind: "failed"; reason: string };

async function runQuiet(spawn: Spawn, argv: string[]): Promise<string | undefined> {
  try {
    const proc = spawn(argv);
    return (await proc.exited) === 0 ? undefined : `${argv.slice(0, 2).join(" ")} failed`;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/** The setting as it was before the first claim, as saved at `backupPath`. */
export function readFnBackup(backupPath: string): FnUsage | undefined {
  try {
    const saved = JSON.parse(readFileSync(backupPath, "utf8")) as FnUsage;
    if (saved.kind === "unset" || (saved.kind === "taken" && Number.isInteger(saved.value))) {
      return saved;
    }
  } catch {}
  return undefined;
}

/**
 * Binds Fn to nothing, so the key is only ever dictation. The write lands on
 * disk immediately but running processes keep the old value — measured: neither
 * restarting cfprefsd nor the text-input agents makes them re-read it — so the
 * caller has to tell the user to log out. It survives reboots.
 *
 * The previous value goes to `backupPath` first, and only if nothing is saved
 * there already: a second claim after the user put Fn back by hand must not
 * replace the original with our own 0.
 */
export async function claimFnKey(
  backupPath: string,
  spawn: Spawn = defaultSpawn,
): Promise<FnClaim> {
  const before = await readFnUsage(spawn);
  if (before.kind === "free") return { kind: "already" };
  if (!existsSync(backupPath)) {
    try {
      mkdirSync(dirname(backupPath), { recursive: true, mode: 0o700 });
      writeFileSync(backupPath, JSON.stringify(before), { mode: 0o600 });
    } catch (error) {
      // No backup means no undo, so don't change anything.
      return {
        kind: "failed",
        reason: `couldn't save the current setting: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
  const failed = await runQuiet(spawn, fnWriteArgv());
  if (failed) return { kind: "failed", reason: failed };
  // Trust the read-back rather than the exit code: a write that didn't stick is
  // worse than one that failed loudly, because nothing would say so.
  const after = await readFnUsage(spawn);
  if (after.kind !== "free") return { kind: "failed", reason: "the setting didn't stick" };
  return { kind: "claimed", from: before.kind === "taken" ? before.action : "its default" };
}

export type FnRestore =
  /** No `mockingbird fn` to undo. */
  { kind: "nothing" } | { kind: "restored"; to: string } | { kind: "failed"; reason: string };

/** Puts back whatever `claimFnKey` replaced, then forgets the backup. */
export async function restoreFnKey(
  backupPath: string,
  spawn: Spawn = defaultSpawn,
): Promise<FnRestore> {
  const saved = readFnBackup(backupPath);
  if (!saved) return { kind: "nothing" };
  if (saved.kind === "taken") {
    const failed = await runQuiet(spawn, fnRestoreArgv(saved.value));
    if (failed) return { kind: "failed", reason: failed };
  } else {
    // Deleting a key that's already gone fails, and is the state we want.
    await runQuiet(spawn, fnDeleteArgv());
  }
  const after = await readFnUsage(spawn);
  const matches =
    saved.kind === "taken"
      ? after.kind === "taken" && after.value === saved.value
      : after.kind === "unset";
  if (!matches) return { kind: "failed", reason: "the setting didn't stick" };
  rmSync(backupPath, { force: true });
  return { kind: "restored", to: saved.kind === "taken" ? saved.action : "the macOS default" };
}

/**
 * What to tell the user, or undefined when the key is ours. `unset` says
 * nothing: macOS picks the default per machine, so a warning there would be a
 * guess, and the tap modes are the only thing it can affect.
 */
export function fnConflict(usage: FnUsage): string | undefined {
  if (usage.kind !== "taken") return undefined;
  return (
    `macOS opens ${usage.action} when you tap Fn, which takes the keyboard before\n` +
    `mockingbird can type. Holding Fn still works; tapping won't until Fn is bound\n` +
    `to nothing — run \`mockingbird fn\`, or set System Settings → Keyboard →\n` +
    `"Press 🌐 key to" to Do Nothing.`
  );
}

/**
 * What `start` and `restart` say about Fn. Unlike `fnConflict`, an unset key
 * gets a hint too: those commands are where a new user is, and on most Macs the
 * unset default is the emoji picker. Never changes the setting itself.
 */
export function fnAdvice(usage: FnUsage): string | undefined {
  if (usage.kind === "unset") {
    return (
      "If tapping Fn opens the emoji picker or Apple's dictation, run `mockingbird fn`\n" +
      "to bind it to dictation only (`mockingbird fn --undo` puts it back)."
    );
  }
  return fnConflict(usage);
}

/** What to print after claiming the key. */
export function claimMessage(claim: FnClaim): string {
  switch (claim.kind) {
    case "already":
      return "Fn is bound to nothing, so it's dictation only.";
    case "claimed":
      return (
        `Fn was opening ${claim.from}; it's now bound to nothing.\n` +
        `macOS only reads that at login, so log out and back in (or restart) before\n` +
        `tapping Fn. Holding Fn works already. To put it back: \`mockingbird fn --undo\`.`
      );
    case "failed":
      return (
        `Couldn't bind Fn to nothing (${claim.reason}). Set it by hand in\n` +
        `System Settings → Keyboard → "Press 🌐 key to" → Do Nothing.`
      );
  }
}

/** What to print after restoring the key. */
export function restoreMessage(result: FnRestore): string {
  switch (result.kind) {
    case "nothing":
      return (
        "mockingbird hasn't changed the Fn key, so there's nothing to undo. It's set in\n" +
        'System Settings → Keyboard → "Press 🌐 key to".'
      );
    case "restored":
      return (
        `Fn is back to ${result.to}. macOS only reads that at login, so log out and\n` +
        "back in (or restart) for it to take effect."
      );
    case "failed":
      return (
        `Couldn't put Fn back (${result.reason}). Set it by hand in\n` +
        'System Settings → Keyboard → "Press 🌐 key to".'
      );
  }
}
