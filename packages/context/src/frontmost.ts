export type FrontmostApp = { bundleId: string; name: string };

/** Parses `lsappinfo info` output lines like `"CFBundleIdentifier"="com.apple.Terminal"`. */
export function parseAppInfo(output: string): FrontmostApp | undefined {
  const value = (key: string) =>
    new RegExp(`"${key}"\\s*=\\s*"([^"]*)"`).exec(output)?.[1] ?? undefined;
  const bundleId = value("CFBundleIdentifier");
  if (!bundleId) return undefined;
  return { bundleId, name: value("LSDisplayName") ?? bundleId };
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
  return parseAppInfo(await run(["lsappinfo", "info", "-only", "bundleid", "-only", "name", asn]));
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
