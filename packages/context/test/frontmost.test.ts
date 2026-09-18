import { describe, expect, test } from "bun:test";
import { frontmostApp, isTerminal, parseAppInfo } from "../src/index.ts";

describe("parseAppInfo", () => {
  test("reads bundle id and name", () => {
    const output = '"CFBundleIdentifier"="com.microsoft.VSCode"\n"LSDisplayName"="Code"';
    expect(parseAppInfo(output)).toEqual({ bundleId: "com.microsoft.VSCode", name: "Code" });
  });

  test("falls back to the bundle id when there's no display name", () => {
    expect(parseAppInfo('"CFBundleIdentifier"="com.apple.Terminal"')).toEqual({
      bundleId: "com.apple.Terminal",
      name: "com.apple.Terminal",
    });
  });

  test("returns nothing when the app has no bundle id", () => {
    expect(parseAppInfo('"LSDisplayName"="Some Helper"')).toBeUndefined();
    expect(parseAppInfo("")).toBeUndefined();
  });
});

describe("isTerminal", () => {
  test("recognizes terminals, not other apps", () => {
    expect(isTerminal({ bundleId: "com.apple.Terminal", name: "Terminal" })).toBe(true);
    expect(isTerminal({ bundleId: "com.mitchellh.ghostty", name: "Ghostty" })).toBe(true);
    expect(isTerminal({ bundleId: "com.tinyspeck.slackmacgap", name: "Slack" })).toBe(false);
    expect(isTerminal(undefined)).toBe(false);
  });
});

describe.skipIf(!process.env.MOCKINGBIRD_INTEGRATION)("frontmostApp (integration)", () => {
  test("reports some app", async () => {
    const app = await frontmostApp();
    expect(app?.bundleId).toMatch(/^[\w.-]+$/);
    expect(app?.name.length).toBeGreaterThan(0);
  });
});
