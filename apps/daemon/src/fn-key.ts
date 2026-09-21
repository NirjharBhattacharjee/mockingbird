/**
 * macOS has its own action bound to the Fn/🌐 key — by default it opens the
 * emoji picker. Our event tap is listen-only (docs/SECURITY_PRIVACY.md §4), so
 * it watches that key without consuming it, and macOS acts on the same press we
 * do. A hold is unaffected, but every tap opens the picker, which takes key
 * focus and swallows the dictation that follows. There is no API to suppress
 * it, so the setting has to change; all we can do is notice and say so.
 */

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

export async function readFnUsage(
  spawn = (cmd: string[]) => Bun.spawn(cmd, { stdout: "pipe", stderr: "ignore" }),
): Promise<FnUsage> {
  try {
    const proc = spawn(["defaults", "read", "com.apple.HIToolbox", "AppleFnUsageType"]);
    const [stdout, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
    return parseFnUsage(stdout, code === 0);
  } catch {
    return { kind: "unset" };
  }
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
    `mockingbird can type. Holding Fn still works; tapping won't until you set\n` +
    `System Settings → Keyboard → "Press 🌐 key to" to Do Nothing.`
  );
}
