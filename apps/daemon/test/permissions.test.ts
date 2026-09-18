import { describe, expect, test } from "bun:test";
import { permissionHelp } from "../src/permissions.ts";

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
