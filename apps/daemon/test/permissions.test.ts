import { describe, expect, test } from "bun:test";
import { askForPermissions, type Permission, permissionHelp } from "../src/permissions.ts";

describe("askForPermissions", () => {
  const record = (missing: [Permission, ...Permission[]]) => {
    const calls: string[] = [];
    askForPermissions(
      missing,
      {
        "input-monitoring": () => calls.push("request input-monitoring"),
        accessibility: () => calls.push("request accessibility"),
      },
      (cmd) => calls.push(cmd.join(" ")),
    );
    return calls;
  };

  test("requests each missing permission in order, then opens the first one's pane", () => {
    expect(record(["input-monitoring", "accessibility"])).toEqual([
      "request input-monitoring",
      "request accessibility",
      "open x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent",
    ]);
  });

  test("opens Accessibility when it's the only one missing", () => {
    expect(record(["accessibility"])).toEqual([
      "request accessibility",
      "open x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
    ]);
  });
});

describe("permissionHelp", () => {
  test("names the app and the one permission it needs", () => {
    const help = permissionHelp(["input-monitoring"], "Ghostty");
    expect(help).toContain("Ghostty needs Input Monitoring (for the Fn key).");
    expect(help).toContain("System Settings is open at Input Monitoring.");
    expect(help).toContain("Switch on Ghostty");
    expect(help).toContain("Enter still works meanwhile");
  });

  test("lists both, opening the first and pointing to the second", () => {
    const help = permissionHelp(["input-monitoring", "accessibility"], "Terminal");
    expect(help).toContain(
      "Input Monitoring (for the Fn key) and Accessibility (to type into other apps)",
    );
    expect(help).toContain(
      "open at Input Monitoring; Accessibility is in the same Privacy & Security list.",
    );
  });

  test("falls back to 'your terminal', and says text is still printed without typing", () => {
    const help = permissionHelp(["accessibility"]);
    expect(help).toContain("your terminal needs Accessibility");
    expect(help).toContain("text is printed here meanwhile");
  });
});
