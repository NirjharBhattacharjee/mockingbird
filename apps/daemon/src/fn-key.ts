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

/**
 * Binds Fn to nothing, so the key is only ever dictation. The write lands on
 * disk immediately but running processes keep the old value — measured: neither
 * restarting cfprefsd nor the text-input agents makes them re-read it — so the
 * caller has to tell the user to log out. It survives reboots, which is the
 * point.
 */
export async function claimFnKey(spawn: Spawn = defaultSpawn): Promise<FnClaim> {
  const before = await readFnUsage(spawn);
  if (before.kind === "free") return { kind: "already" };
  try {
    const proc = spawn(fnWriteArgv());
    if ((await proc.exited) !== 0) return { kind: "failed", reason: "defaults write failed" };
  } catch (error) {
    return { kind: "failed", reason: error instanceof Error ? error.message : String(error) };
  }
  // Trust the read-back rather than the exit code: a write that didn't stick is
  // worse than one that failed loudly, because nothing would say so.
  const after = await readFnUsage(spawn);
  if (after.kind !== "free") return { kind: "failed", reason: "the setting didn't stick" };
  return { kind: "claimed", from: before.kind === "taken" ? before.action : "its default" };
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

/** What to print after claiming the key. */
export function claimMessage(claim: FnClaim): string {
  switch (claim.kind) {
    case "already":
      return "Fn is bound to nothing, so it's dictation only.";
    case "claimed":
      return (
        `Fn was opening ${claim.from}; it's now bound to nothing, for good.\n` +
        `macOS only reads that at login, so log out and back in (or restart) before\n` +
        `tapping Fn. Holding Fn works already. To undo: System Settings → Keyboard →\n` +
        `"Press 🌐 key to".`
      );
    case "failed":
      return (
        `Couldn't bind Fn to nothing (${claim.reason}). Set it by hand in\n` +
        `System Settings → Keyboard → "Press 🌐 key to" → Do Nothing.`
      );
  }
}
