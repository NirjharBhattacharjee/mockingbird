import { expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { retireDictation } from "../src/retire.ts";

function dictationMac() {
  const home = mkdtempSync(join(tmpdir(), "mb-retire-"));
  const mb = join(home, ".mockingbird");
  mkdirSync(join(mb, "bin", "mockingbird.app"), { recursive: true });
  const plist = join(home, "Library", "LaunchAgents", "com.mockingbird.agent.plist");
  mkdirSync(join(plist, ".."), { recursive: true });
  writeFileSync(plist, "<plist/>");
  const ran: string[] = [];
  const run = (argv: string[]) => {
    ran.push(argv.join(" "));
    return 0;
  };
  return { home, mb, plist, ran, run };
}

test("removes the agent and its app, puts Fn back, and boots the agent out last", () => {
  const m = dictationMac();
  writeFileSync(join(m.mb, "fn-key.json"), '{"kind":"taken","value":2,"action":"emoji"}');
  expect(retireDictation(m.home, m.mb, m.run)).toHaveLength(3);
  expect(existsSync(m.plist)).toBe(false);
  expect(existsSync(join(m.mb, "bin", "mockingbird.app"))).toBe(false);
  expect(existsSync(join(m.mb, "fn-key.json"))).toBe(false);
  expect(m.ran[0]).toBe("defaults write com.apple.HIToolbox AppleFnUsageType -int 2");
  expect(m.ran.at(-1)).toStartWith("launchctl bootout gui/");
});

test("a Fn that was never set goes back to unset", () => {
  const m = dictationMac();
  writeFileSync(join(m.mb, "fn-key.json"), '{"kind":"unset"}');
  retireDictation(m.home, m.mb, m.run);
  expect(m.ran[0]).toBe("defaults delete com.apple.HIToolbox AppleFnUsageType");
});

test("does nothing on a Mac that never had dictation", () => {
  const home = mkdtempSync(join(tmpdir(), "mb-retire-"));
  const ran: string[] = [];
  const run = (argv: string[]) => {
    ran.push(argv.join(" "));
    return 0;
  };
  expect(retireDictation(home, join(home, ".mockingbird"), run)).toEqual([]);
  expect(ran).toEqual([]);
});

test("keeps the Fn backup when macOS won't take the setting, to try again", () => {
  const m = dictationMac();
  writeFileSync(join(m.mb, "fn-key.json"), '{"kind":"taken","value":2}');
  const done = retireDictation(m.home, m.mb, (argv) => (argv[0] === "defaults" ? 1 : 0));
  expect(existsSync(join(m.mb, "fn-key.json"))).toBe(true);
  expect(done[0]).toStartWith("couldn't give the Fn key back");
});
