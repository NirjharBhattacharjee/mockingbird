/** macOS's sandbox, and a profile that allows everything but the network. */
const SANDBOX = "/usr/bin/sandbox-exec";
const NO_NETWORK = "(version 1)(allow default)(deny network*)";

/**
 * What the motion runner starts under so it has no network (#157): macOS's
 * sandbox-exec; on Linux a user and network namespace (`unshare -rn`) where
 * the kernel allows one, as Ubuntu's AppArmor may not; on Windows nothing.
 * Chrome blocks the network itself on every OS (packages/motion/src/chrome.ts),
 * so this is the second wall, and the only one for a canvas script.
 */
export function noNetwork(
  platform: string = process.platform,
  canUnshare = () => {
    try {
      return Bun.spawnSync(["unshare", "-rn", "true"], { stderr: "ignore" }).exitCode === 0;
    } catch {
      return false; // no unshare
    }
  },
): string[] {
  if (platform === "darwin") return [SANDBOX, "-p", NO_NETWORK];
  if (platform === "linux" && canUnshare()) return ["unshare", "-rn"];
  return [];
}
