import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore } from "@mockingbird/store";
import { type UninstallDeps, uninstall } from "../src/uninstall.ts";

const PROFILE =
  'alias ll="ls -l"\n\n# Added by the mockingbird installer\nexport PATH="$HOME/.local/bin:$PATH"\n';

/** A Mac after the curl install, inside a temp folder, and deps that record what they're asked. */
function installed({
  root,
  clean = true,
  answers = true,
}: {
  root?: string;
  clean?: boolean;
  answers?: boolean;
} = {}) {
  const home = mkdtempSync(join(tmpdir(), "mockingbird-uninstall-"));
  const mb = join(home, ".mockingbird");
  mkdirSync(join(mb, "models"), { recursive: true });
  const store = openStore(join(mb, "data.db"));
  store.addTerms([{ term: "Catppuccin", heard: "cat puck" }]);
  store.close();
  const plist = join(home, "Library", "LaunchAgents", "com.mockingbird.agent.plist");
  mkdirSync(join(plist, ".."), { recursive: true });
  writeFileSync(plist, "<plist/>");
  const clone = join(home, "mockingbird");
  mkdirSync(join(clone, "apps"), { recursive: true });
  mkdirSync(join(home, ".local", "bin"), { recursive: true });
  writeFileSync(
    join(home, ".local", "bin", "mockingbird"),
    "#!/bin/sh\n# Written by scripts/install.sh. Re-run it after moving the clone.\n",
  );
  writeFileSync(join(home, ".zshrc"), PROFILE);
  const calls: string[] = [];
  /** Records a call and succeeds, like the real command would. */
  const did = async (call: string) => {
    calls.push(call);
    return 0;
  };
  const logged: string[] = [];
  const deps: UninstallDeps = {
    home,
    mockingbirdHome: mb,
    root: root ?? clone,
    plistPath: plist,
    cleanupModel: "qwen3:4b",
    ask: (question) => {
      calls.push(`ask ${question}`);
      return answers;
    },
    log: (m) => logged.push(m),
    stopAgent: () => did("stop"),
    undoFn: () => did("fn --undo"),
    fnBackupPath: join(mb, "fn-key.json"),
    isClean: () => clean,
    ollamaRm: (m) => did(`ollama rm ${m}`),
    sizeOf: () => "1.1G",
  };
  return { home, mb, plist, clone, deps, calls, logged };
}

describe("uninstall", () => {
  test("a no removes nothing and stops nothing", async () => {
    const m = installed({ answers: false });
    expect(await uninstall([], m.deps)).toBe(0);
    expect(m.calls).toEqual(["ask Remove all of this? [y/N]"]);
    for (const p of [m.mb, m.plist, m.clone]) expect(existsSync(p)).toBe(true);
    expect(m.logged.at(-1)).toBe("Nothing was removed.");
  });

  test("removes everything the curl install put there, keeping the user's words", async () => {
    const m = installed();
    writeFileSync(join(m.mb, "fn-key.json"), '{"kind":"unset"}');
    expect(await uninstall([], m.deps)).toBe(0);
    for (const p of [m.mb, m.plist, m.clone, join(m.home, ".local", "bin", "mockingbird")]) {
      expect(existsSync(p)).toBe(false);
    }
    expect(readFileSync(join(m.home, ".zshrc"), "utf8")).toBe('alias ll="ls -l"\n\n');
    expect(readFileSync(join(m.home, "mockingbird-dictionary.txt"), "utf8")).toBe(
      "cat puck => Catppuccin\n",
    );
    expect(m.calls).toContain("stop");
    expect(m.calls).toContain("fn --undo");
    expect(m.calls).toContain("ollama rm qwen3:4b");
  });

  test("--yes keeps the shared model, and leaves a Homebrew or edited clone alone", async () => {
    const brew = installed({ root: "/opt/homebrew/Cellar/mockingbird/0.2.0/libexec" });
    expect(await uninstall(["--yes"], brew.deps)).toBe(0);
    expect(brew.calls.some((c) => c.startsWith("ask"))).toBe(false);
    expect(brew.calls.some((c) => c.startsWith("ollama"))).toBe(false);
    expect(existsSync(join(brew.home, "mockingbird-dictionary.txt"))).toBe(true);
    expect(brew.logged.join("\n")).toContain("brew uninstall mockingbird");

    const edited = installed({ clean: false });
    await uninstall(["--yes"], edited.deps);
    expect(existsSync(edited.clone)).toBe(true);
    expect(existsSync(edited.mb)).toBe(false);
    expect(edited.logged.join("\n")).toContain("was left alone");
  });
});
