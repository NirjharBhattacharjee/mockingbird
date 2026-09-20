import { describe, expect, test } from "bun:test";
import { AGENT_LABEL, agentPaths, plistFor } from "../src/agent/plist.ts";

const render = (overrides = {}) =>
  plistFor({
    programArguments: ["/opt/homebrew/bin/bun", "/Users/me/mockingbird/apps/daemon/src/agent.ts"],
    logPath: "/Users/me/.mockingbird/logs/agent.log",
    workingDirectory: "/Users/me",
    ...overrides,
  });

describe("plistFor", () => {
  test("is valid plist XML naming the agent and its program", async () => {
    const xml = render();
    expect(xml).toStartWith('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain(`<string>${AGENT_LABEL}</string>`);
    expect(xml).toContain("<string>/opt/homebrew/bin/bun</string>");
    expect(xml).toContain("<string>/Users/me/mockingbird/apps/daemon/src/agent.ts</string>");

    // plutil is the same check `mockingbird start` runs before bootstrapping.
    const path = `/tmp/mockingbird-plist-${Bun.hash(xml)}.plist`;
    await Bun.write(path, xml);
    expect(await Bun.spawn(["plutil", "-lint", path], { stdout: "ignore" }).exited).toBe(0);
  });

  test("starts at login", () => {
    expect(render()).toContain("<key>RunAtLoad</key>\n    <true/>");
  });

  test("restarts on a crash but not on a deliberate exit", () => {
    // Plain KeepAlive would relaunch forever when there's no microphone.
    const xml = render();
    expect(xml).toContain("<key>KeepAlive</key>");
    expect(xml).toContain("<key>Crashed</key>");
    expect(xml).not.toContain("<key>SuccessfulExit</key>");
  });

  test("puts Homebrew on PATH, because launchd's PATH has no brew", () => {
    const xml = render();
    expect(xml).toContain("<key>PATH</key>");
    expect(xml).toMatch(/<string>[^<]*\/opt\/homebrew\/bin[^<]*<\/string>/);
  });

  test("puts an unusual bun directory ahead of the defaults, without duplicating", () => {
    const xml = render({ pathEntries: ["/custom/bin", "/opt/homebrew/bin"] });
    const path = xml.match(/<key>PATH<\/key>\s*<string>([^<]*)<\/string>/)?.[1] ?? "";
    expect(path.split(":")[0]).toBe("/custom/bin");
    expect(path.split(":").filter((p) => p === "/opt/homebrew/bin")).toHaveLength(1);
  });

  test("escapes characters that would break the XML", () => {
    const xml = render({ workingDirectory: "/Users/me/a & b <c>" });
    expect(xml).toContain("<string>/Users/me/a &amp; b &lt;c&gt;</string>");
  });

  test("sends both streams to the log launchd can reach", () => {
    const xml = render();
    expect(xml).toContain("<key>StandardOutPath</key>");
    expect(xml).toContain("<key>StandardErrorPath</key>");
    expect(xml.match(/\/Users\/me\/\.mockingbird\/logs\/agent\.log/g)).toHaveLength(2);
  });
});

describe("agentPaths", () => {
  test("puts the plist where launchd looks and the log under MOCKINGBIRD_HOME", () => {
    const paths = agentPaths("/Users/me");
    expect(paths.plistPath).toBe(`/Users/me/Library/LaunchAgents/${AGENT_LABEL}.plist`);
    expect(paths.logPath).toEndWith("/logs/agent.log");
    expect(paths.logDir).toBe(`${paths.logPath.slice(0, -"/agent.log".length)}`);
  });
});
