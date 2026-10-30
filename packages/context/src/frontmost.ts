import { existsSync } from "node:fs";

/** `path` is where the app bundle lives, when macOS says. */
export type FrontmostApp = { bundleId: string; name: string; path?: string };

/** Parses `lsappinfo info` output lines like `"CFBundleIdentifier"="com.apple.Terminal"`. */
export function parseAppInfo(output: string): FrontmostApp | undefined {
  const value = (key: string) =>
    new RegExp(`"${key}"\\s*=\\s*"([^"]*)"`).exec(output)?.[1] ?? undefined;
  const bundleId = value("CFBundleIdentifier");
  if (!bundleId) return undefined;
  const path = value("LSBundlePath");
  return { bundleId, name: value("LSDisplayName") ?? bundleId, ...(path && { path }) };
}

async function run(args: string[]): Promise<string> {
  const proc = Bun.spawn(args, { stdin: "ignore", stdout: "pipe", stderr: "ignore" });
  const [stdout] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  return stdout.trim();
}

/**
 * The app currently in front. Uses `lsappinfo`, which needs no permission —
 * unlike System Events, which would require Accessibility.
 */
export async function frontmostApp(): Promise<FrontmostApp | undefined> {
  const asn = await run(["lsappinfo", "front"]);
  if (!asn) return undefined;
  return parseAppInfo(
    await run([
      "lsappinfo",
      "info",
      "-only",
      "bundleid",
      "-only",
      "name",
      "-only",
      "bundlepath",
      asn,
    ]),
  );
}

const TERMINAL_BUNDLE_IDS = new Set([
  "com.apple.Terminal",
  "com.googlecode.iterm2",
  "com.mitchellh.ghostty",
  "net.kovidgoyal.kitty",
  "io.alacritty",
  "co.zeit.hyper",
  "dev.warp.Warp-Stable",
  "com.github.wez.wezterm",
]);

/** Terminals get command-friendly formatting (no trailing period). */
export function isTerminal(app: FrontmostApp | undefined): boolean {
  return app !== undefined && TERMINAL_BUNDLE_IDS.has(app.bundleId);
}

const BROWSER_BUNDLE_IDS = new Set([
  "com.apple.Safari",
  "com.apple.SafariTechnologyPreview",
  "com.google.Chrome",
  "com.google.Chrome.beta",
  "com.google.Chrome.dev",
  "com.google.Chrome.canary",
  "org.chromium.Chromium",
  "company.thebrowser.Browser", // Arc
  "company.thebrowser.dia",
  "com.brave.Browser",
  "com.microsoft.edgemac",
  "com.vivaldi.Vivaldi",
  "com.operasoftware.Opera",
  "org.mozilla.firefox",
  "app.zen-browser.zen",
]);

/**
 * Browsers. Chrome switches its accessibility on at the first accessibility
 * read, and Google Docs rebuilds its editor when that happens, so typing right
 * after a first read was lost (#32).
 */
export function isBrowser(app: FrontmostApp | undefined): boolean {
  return app !== undefined && BROWSER_BUNDLE_IDS.has(app.bundleId);
}

/** QtWebEngine apps that don't ship it where `isQtWebEngineApp` looks. */
const QT_WEB_ENGINE_BUNDLE_IDS = new Set([
  "net.ankiweb.anki", // PyQt, under Contents/Resources/app_packages
]);

/**
 * Apps with QtWebEngine, the Chromium inside Qt, which keeps only the last
 * character of a key event that carries several (#117, #119). Text goes in
 * one character at a time there. Plain Qt text boxes take the whole string.
 */
export function isQtWebEngineApp(app: FrontmostApp | undefined): boolean {
  if (app === undefined) return false;
  if (QT_WEB_ENGINE_BUNDLE_IDS.has(app.bundleId)) return true;
  return (
    app.path !== undefined &&
    existsSync(`${app.path}/Contents/Frameworks/QtWebEngineCore.framework`)
  );
}

/**
 * Editors with a terminal built in. Which pane has focus can't be seen from
 * outside, so the whole app is treated as one that may run what's typed.
 */
const TERMINAL_HOST_BUNDLE_IDS = new Set([
  "com.microsoft.VSCode",
  "com.microsoft.VSCodeInsiders",
  "com.vscodium",
  "com.todesktop.230313mzl4w4u92", // Cursor
  "com.exafunction.windsurf",
  "dev.zed.Zed",
  "dev.zed.Zed-Preview",
  "com.panic.Nova",
]);

/**
 * Whether a Return typed into this app might run a command: a terminal, or an
 * editor that hosts one. A dictated list's line breaks are flattened to spaces
 * there, since a terminal takes Shift+Return as Return.
 */
export function mayRunCommands(app: FrontmostApp | undefined): boolean {
  if (app === undefined) return true;
  return (
    isTerminal(app) ||
    TERMINAL_HOST_BUNDLE_IDS.has(app.bundleId) ||
    // Every JetBrains IDE has a terminal tool window.
    app.bundleId.startsWith("com.jetbrains.") ||
    app.bundleId.startsWith("com.google.android.studio")
  );
}
