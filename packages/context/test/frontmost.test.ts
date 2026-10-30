import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  frontmostApp,
  isBrowser,
  isQtWebEngineApp,
  isTerminal,
  mayRunCommands,
  parseAppInfo,
} from "../src/index.ts";

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

  test("reads where the app bundle lives", () => {
    const output =
      '"LSBundlePath"="/Applications/OBS.app"\n"CFBundleIdentifier"="com.obsproject.obs-studio"';
    expect(parseAppInfo(output)?.path).toBe("/Applications/OBS.app");
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

describe("isBrowser", () => {
  test("recognizes browsers, which get an early accessibility read", () => {
    expect(isBrowser({ bundleId: "com.google.Chrome", name: "Google Chrome" })).toBe(true);
    expect(isBrowser({ bundleId: "com.apple.Safari", name: "Safari" })).toBe(true);
    expect(isBrowser({ bundleId: "com.microsoft.Word", name: "Microsoft Word" })).toBe(false);
    expect(isBrowser(undefined)).toBe(false);
  });
});

describe("isQtWebEngineApp", () => {
  test("recognizes QtWebEngine apps, which take one character per key event", () => {
    expect(isQtWebEngineApp({ bundleId: "net.ankiweb.anki", name: "Anki" })).toBe(true);
    expect(isQtWebEngineApp({ bundleId: "com.apple.TextEdit", name: "TextEdit" })).toBe(false);
    expect(isQtWebEngineApp(undefined)).toBe(false);
  });

  test("spots a QtWebEngine app from the framework in its bundle", () => {
    const qt = join(mkdtempSync(join(tmpdir(), "qt-")), "Some.app");
    mkdirSync(join(qt, "Contents/Frameworks/QtWebEngineCore.framework"), { recursive: true });
    expect(isQtWebEngineApp({ bundleId: "org.example.qt", name: "Some", path: qt })).toBe(true);
    expect(isQtWebEngineApp({ bundleId: "org.example.qt", name: "Some", path: tmpdir() })).toBe(
      false,
    );
  });
});

describe.skipIf(!process.env.MOCKINGBIRD_INTEGRATION)("frontmostApp (integration)", () => {
  test("reports some app", async () => {
    const app = await frontmostApp();
    expect(app?.bundleId).toMatch(/^[\w.-]+$/);
    expect(app?.name.length).toBeGreaterThan(0);
  });
});

describe("mayRunCommands", () => {
  test("terminals and editors with a built-in terminal", () => {
    expect(mayRunCommands({ bundleId: "com.apple.Terminal", name: "Terminal" })).toBe(true);
    expect(mayRunCommands({ bundleId: "com.microsoft.VSCode", name: "Code" })).toBe(true);
    expect(mayRunCommands({ bundleId: "com.jetbrains.intellij", name: "IntelliJ IDEA" })).toBe(
      true,
    );
    expect(mayRunCommands(undefined)).toBe(true);
  });

  test("ordinary apps", () => {
    expect(mayRunCommands({ bundleId: "com.tinyspeck.slackmacgap", name: "Slack" })).toBe(false);
    expect(mayRunCommands({ bundleId: "com.apple.Notes", name: "Notes" })).toBe(false);
  });
});
