import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { agentPaths } from "./plist.ts";

/**
 * macOS names a permission after the program that asks for it, so running the
 * agent as `bun` puts "bun" in the Privacy lists — and grants every other bun
 * script the same right to type into any app. Our own copy of the bun binary,
 * named and signed `mockingbird`, is a separate identity: the lists say
 * mockingbird, and bun itself needs no permission at all.
 *
 * It also holds still. Editing our TypeScript doesn't change this file, and
 * neither does `brew upgrade bun`, so the grants survive both.
 */
export function runnerPath(home?: string): string {
  return join(dirname(agentPaths(home).logDir), "bin", "mockingbird");
}

const sourceMarker = (runner: string) => `${runner}.source`;

/** Identity of the bun we copied, so we can tell when it has moved on. */
function describe(path: string): string {
  const s = statSync(path);
  return `${realpathSync(path)}\n${s.size}\n${Math.round(s.mtimeMs)}\n`;
}

export type EnsureRunnerOptions = {
  /** The bun binary to copy. */
  source?: string;
  destination?: string;
  /** Injected in tests. Returns the exit code. */
  sign?: (cmd: string[]) => number;
};

export type EnsureRunnerResult = {
  path: string;
  /** Whether the binary was just created or replaced, so grants need redoing. */
  installed: boolean;
  /** Why signing didn't happen, when it didn't. */
  unsigned?: string;
};

const defaultSign = (cmd: string[]): number => {
  const proc = Bun.spawnSync(cmd, { stdout: "ignore", stderr: "pipe" });
  return proc.exitCode;
};

/**
 * Puts `~/.mockingbird/bin/mockingbird` in place, copying bun and re-signing
 * it under our own identifier. Does nothing when the copy is already current.
 */
export function ensureRunner(options: EnsureRunnerOptions = {}): EnsureRunnerResult {
  const source = options.source ?? process.execPath;
  const destination = options.destination ?? runnerPath();
  const marker = sourceMarker(destination);
  const wanted = describe(source);

  let current: string | undefined;
  try {
    current = readFileSync(marker, "utf8");
    statSync(destination);
  } catch {
    current = undefined;
  }
  if (current === wanted) return { path: destination, installed: false };

  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });

  // Built beside the destination and moved in, because writing over the file
  // an agent is currently running fails with ETXTBSY. A rename leaves that
  // process on the old inode and puts the new copy in place for the next start.
  const staged = `${destination}.new`;
  const sign = options.sign ?? defaultSign;
  let code: number;
  try {
    copyFileSync(source, staged);
    chmodSync(staged, 0o755);
    // Re-signing is what changes the name macOS shows. A copy keeps bun's own
    // ad-hoc signature and still runs, so a failure here costs the name, not
    // the feature.
    code = sign(["codesign", "--sign", "-", "--identifier", "mockingbird", "--force", staged]);
    renameSync(staged, destination);
  } finally {
    rmSync(staged, { force: true });
  }

  // The marker says this copy is current, so it's only written once the copy
  // really is. Writing it after a failed signing would make every later start
  // skip the retry, and the agent would stay listed as "bun" in the Privacy
  // panes until bun itself changed.
  if (code === 0) writeFileSync(marker, wanted);
  return {
    path: destination,
    installed: true,
    ...(code === 0 ? {} : { unsigned: `codesign exited with ${code}` }),
  };
}
