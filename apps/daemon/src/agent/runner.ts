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
import { AGENT_LABEL, agentPaths } from "./plist.ts";

/**
 * macOS names a permission after the program that asks for it, so running the
 * agent as `bun` puts "bun" in the Privacy lists — and grants every other bun
 * script the same right to type into any app. Our own copy of the bun binary,
 * inside a small app bundle signed as `com.mockingbird.agent`, is a separate
 * identity. The bundle is what gives it a name and the logo in Login Items and
 * the Privacy lists; a bare executable only ever gets the generic icon.
 *
 * It also holds still. Editing our TypeScript doesn't change it, and neither
 * does `brew upgrade bun` until the next `start`, so the grants survive both.
 */
export function appPath(home?: string): string {
  return join(dirname(agentPaths(home).logDir), "bin", "mockingbird.app");
}

/** The executable launchd runs, inside the bundle. */
export const executableIn = (app: string) => join(app, "Contents", "MacOS", "mockingbird");

export function runnerPath(home?: string): string {
  return executableIn(appPath(home));
}

const ICON = join(import.meta.dir, "AppIcon.icns");

/**
 * LSUIElement keeps it out of the Dock. The microphone line is the reason the
 * permission prompt shows; without one, macOS refuses the microphone outright.
 */
const INFO_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>CFBundleIdentifier</key>
    <string>${AGENT_LABEL}</string>
    <key>CFBundleName</key>
    <string>mockingbird</string>
    <key>CFBundleExecutable</key>
    <string>mockingbird</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>LSUIElement</key>
    <true/>
    <key>NSMicrophoneUsageDescription</key>
    <string>mockingbird listens while you hold Fn, and types what you said.</string>
  </dict>
</plist>
`;

/** LaunchServices, which System Settings asks for an app's name and icon. */
const LSREGISTER =
  "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";

const sourceMarker = (app: string) => `${app}.source`;

/**
 * Identity of the bun we copied and of the bundle around it, so we can tell
 * when either has moved on.
 */
function describe(path: string): string {
  const s = statSync(path);
  return `${realpathSync(path)}\n${s.size}\n${Math.round(s.mtimeMs)}\n${Bun.hash(INFO_PLIST + statSync(ICON).size)}\n`;
}

export type EnsureRunnerOptions = {
  /** The bun binary to copy. */
  source?: string;
  /** The app bundle to build. */
  app?: string;
  /** Injected in tests. Runs codesign and lsregister; returns the exit code. */
  run?: (cmd: string[]) => number;
};

export type EnsureRunnerResult = {
  /** The executable inside the bundle. */
  path: string;
  /** The bundle, which is what to pick when adding it to a Privacy list by hand. */
  app: string;
  /** Whether the binary was just created or replaced, so grants need redoing. */
  installed: boolean;
  /** Why signing didn't happen, when it didn't. */
  unsigned?: string;
};

const defaultRun = (cmd: string[]): number => {
  const proc = Bun.spawnSync(cmd, { stdout: "ignore", stderr: "pipe" });
  return proc.exitCode;
};

/**
 * Puts `~/.mockingbird/bin/mockingbird.app` in place: bun copied in as its
 * executable, with the Info.plist and the logo, signed as one bundle. Does
 * nothing when it's already current.
 */
export function ensureRunner(options: EnsureRunnerOptions = {}): EnsureRunnerResult {
  const source = options.source ?? process.execPath;
  const app = options.app ?? appPath();
  const path = executableIn(app);
  const marker = sourceMarker(app);
  const wanted = describe(source);

  let current: string | undefined;
  try {
    current = readFileSync(marker, "utf8");
    statSync(path);
  } catch {
    current = undefined;
  }
  if (current === wanted) return { path, app, installed: false };

  mkdirSync(dirname(app), { recursive: true, mode: 0o700 });

  // Built beside the destination and moved in. An agent running from the old
  // bundle keeps its open file; the new bundle is there for the next start.
  const staged = `${app}.new`;
  const run = options.run ?? defaultRun;
  let code: number;
  rmSync(staged, { recursive: true, force: true });
  try {
    mkdirSync(dirname(executableIn(staged)), { recursive: true });
    mkdirSync(join(staged, "Contents", "Resources"));
    copyFileSync(source, executableIn(staged));
    chmodSync(executableIn(staged), 0o755);
    writeFileSync(join(staged, "Contents", "Info.plist"), INFO_PLIST);
    copyFileSync(ICON, join(staged, "Contents", "Resources", "AppIcon.icns"));
    // Signing the bundle binds the Info.plist and icon to the identifier. A
    // failure leaves bun's own signature, which still runs, so it costs the
    // name and icon, not the feature.
    code = run(["codesign", "--sign", "-", "--force", staged]);
    rmSync(app, { recursive: true, force: true });
    renameSync(staged, app);
  } finally {
    rmSync(staged, { recursive: true, force: true });
  }
  // Tells System Settings where to find the name and icon. Best effort.
  run([LSREGISTER, "-f", app]);
  // The runner from before the bundle. Its grants don't carry over anyway.
  const old = join(dirname(app), "mockingbird");
  rmSync(old, { force: true });
  rmSync(`${old}.source`, { force: true });

  // The marker says this copy is current, so it's only written once the copy
  // really is. Writing it after a failed signing would make every later start
  // skip the retry, and the agent would stay unnamed in the Privacy panes
  // until bun itself changed.
  if (code === 0) writeFileSync(marker, wanted);
  return {
    path,
    app,
    installed: true,
    ...(code === 0 ? {} : { unsigned: `codesign exited with ${code}` }),
  };
}
