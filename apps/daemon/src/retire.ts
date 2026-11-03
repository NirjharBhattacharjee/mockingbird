import { existsSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { mockingbirdHome } from "./runtime.ts";

/**
 * Removes what dictation (v0.3.2 and earlier) left on a Mac: the launchd
 * agent, its runner app, and the Fn setting `mockingbird fn` changed, put
 * back as it was. Safe to run when none of it is there. Returns what it did.
 */
export function retireDictation(
  home = homedir(),
  mb = mockingbirdHome(),
  run = (argv: string[]) => Bun.spawnSync(argv, { stdout: "ignore", stderr: "ignore" }).exitCode,
): string[] {
  const done: string[] = [];
  const backup = join(mb, "fn-key.json");
  if (existsSync(backup)) {
    try {
      const saved = JSON.parse(readFileSync(backup, "utf8")) as { kind: string; value?: number };
      const key = ["com.apple.HIToolbox", "AppleFnUsageType"];
      let restored = true;
      if (saved.kind === "taken" && Number.isInteger(saved.value)) {
        restored = run(["defaults", "write", ...key, "-int", String(saved.value)]) === 0;
      } else {
        // Fails when the key is already gone, which is the goal.
        run(["defaults", "delete", ...key]);
      }
      if (restored) {
        rmSync(backup, { force: true });
        done.push("gave the Fn key back to macOS (it applies after you log out)");
      } else {
        // The backup stays, so the next run tries again.
        done.push("couldn't give the Fn key back; set it in System Settings → Keyboard");
      }
    } catch {
      // A backup that can't be read is left for the user; Fn is in System Settings → Keyboard.
    }
  }
  const app = join(mb, "bin", "mockingbird.app");
  if (existsSync(app)) {
    run([
      "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister",
      "-u",
      app,
    ]);
    rmSync(app, { recursive: true, force: true });
    done.push(`removed ${app}`);
  }
  const plist = join(home, "Library", "LaunchAgents", "com.mockingbird.agent.plist");
  if (existsSync(plist)) {
    rmSync(plist, { force: true });
    done.push("removed the dictation agent");
    // Last: when launchd runs this as the old agent, bootout ends this process.
    run(["launchctl", "bootout", `gui/${process.getuid?.() ?? 0}/com.mockingbird.agent`]);
  }
  return done;
}
