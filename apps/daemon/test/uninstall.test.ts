import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore } from "@mockingbird/store";
import { clonePristine, type UninstallDeps, uninstall } from "../src/uninstall.ts";

/** Real git, with an identity so test commits work anywhere. */
const git = (args: string[]) => {
  const r = Bun.spawnSync(["git", "-c", "user.name=t", "-c", "user.email=t@t", ...args], {
    stderr: "ignore",
  });
  return r.exitCode === 0 ? r.stdout.toString().trim() : undefined;
};

/** A clone of a local origin, as the installer leaves it: everything pushed. */
function cloneAt(dir: string): string {
  const origin = `${dir}-origin.git`;
  git(["init", "-q", "--bare", "-b", "main", origin]);
  git(["clone", "-q", origin, dir]);
  writeFileSync(join(dir, ".gitignore"), "node_modules/\n.env\n");
  git(["-C", dir, "add", "."]);
  git(["-C", dir, "commit", "-q", "-m", "release"]);
  git(["-C", dir, "push", "-q", "origin", "main"]);
  mkdirSync(join(dir, "node_modules"));
  return dir;
}

const PROFILE =
  'alias ll="ls -l"\n\n# Added by the mockingbird installer\nexport PATH="$HOME/.local/bin:$PATH"\n';

/** A Mac after the curl install, inside a temp folder, and deps that record what they're asked. */
function installed({ root, answers = true }: { root?: string; answers?: boolean } = {}) {
  const home = mkdtempSync(join(tmpdir(), "mockingbird-uninstall-"));
  const mb = join(home, ".mockingbird");
  mkdirSync(join(mb, "models"), { recursive: true });
  const store = openStore(join(mb, "data.db"));
  store.addTerms([{ term: "Catppuccin", heard: "cat puck" }]);
  store.close();
  const clone = cloneAt(join(home, "mockingbird"));
  mkdirSync(join(home, ".local", "bin"), { recursive: true });
  writeFileSync(
    join(home, ".local", "bin", "mockingbird"),
    "#!/bin/sh\n# Written by scripts/install.sh. Re-run it after moving the clone.\n",
  );
  writeFileSync(join(home, ".zshrc"), PROFILE);
  const calls: string[] = [];
  const logged: string[] = [];
  const deps: UninstallDeps = {
    home,
    mockingbirdHome: mb,
    root: root ?? clone,
    ask: (question) => {
      calls.push(`ask ${question}`);
      return answers;
    },
    log: (m) => logged.push(m),
    retire: () => {
      calls.push("retire");
      return [];
    },
    git,
    sizeOf: () => "1.1G",
  };
  return { home, mb, clone, deps, calls, logged };
}

describe("uninstall", () => {
  test("a no removes nothing and stops nothing", async () => {
    const m = installed({ answers: false });
    expect(await uninstall([], m.deps)).toBe(0);
    expect(m.calls).toEqual(["ask Remove all of this? [y/N]"]);
    for (const p of [m.mb, m.clone]) expect(existsSync(p)).toBe(true);
    expect(m.logged.at(-1)).toBe("Nothing was removed.");
  });

  test("removes everything the curl install put there, keeping the user's words", async () => {
    const m = installed();
    expect(await uninstall([], m.deps)).toBe(0);
    for (const p of [m.mb, m.clone, join(m.home, ".local", "bin", "mockingbird")]) {
      expect(existsSync(p)).toBe(false);
    }
    expect(readFileSync(join(m.home, ".zshrc"), "utf8")).toBe('alias ll="ls -l"\n\n');
    expect(readFileSync(join(m.home, "mockingbird-dictionary.txt"), "utf8")).toBe(
      "cat puck => Catppuccin\n",
    );
    expect(m.calls).toContain("retire");
  });

  test("asks about recordings, and keeps them by default", async () => {
    const m = installed();
    mkdirSync(join(m.mb, "recordings"));
    writeFileSync(join(m.mb, "recordings", "2026-10-15-1430.m4a"), "audio");
    // Cut off by a crash, and still the user's.
    writeFileSync(join(m.mb, "recordings", "2026-10-15-1600.m4a.part"), "more");
    mkdirSync(join(m.home, "mockingbird-recordings")); // an earlier uninstall's
    expect(await uninstall(["--yes"], m.deps)).toBe(0);
    expect(existsSync(m.mb)).toBe(false);
    expect(
      readFileSync(join(m.home, "mockingbird-recordings-2", "2026-10-15-1430.m4a"), "utf8"),
    ).toBe("audio");
    expect(m.logged.some((l) => l.includes("2 recordings, which you'll be asked about"))).toBe(
      true,
    );
  });

  test("--yes asks nothing, and leaves a Homebrew or edited clone alone", async () => {
    const brew = installed({ root: "/opt/homebrew/Cellar/mockingbird/0.2.0/libexec" });
    expect(await uninstall(["--yes"], brew.deps)).toBe(0);
    expect(brew.calls.some((c) => c.startsWith("ask"))).toBe(false);
    expect(existsSync(join(brew.home, "mockingbird-dictionary.txt"))).toBe(true);
    expect(brew.logged.join("\n")).toContain("brew uninstall mockingbird");

    const edited = installed();
    writeFileSync(join(edited.clone, "notes.md"), "mine");
    await uninstall(["--yes"], edited.deps);
    expect(existsSync(edited.clone)).toBe(true);
    expect(existsSync(edited.mb)).toBe(false);
    expect(edited.logged.join("\n")).toContain("was left alone");
  });
});

describe("clonePristine", () => {
  const fresh = () => cloneAt(join(mkdtempSync(join(tmpdir(), "mockingbird-clone-")), "c"));

  test("an installer's clone, node_modules and all, is pristine", () => {
    expect(clonePristine(fresh(), git)).toBe(true);
  });

  // Real git, which is slow on Windows runners: over 5 s once.
  test("ignored files, a local commit or a stash are the user's work", () => {
    const ignored = fresh();
    writeFileSync(join(ignored, ".env"), "SECRET=1");
    expect(clonePristine(ignored, git)).toBe(false);

    const committed = fresh();
    writeFileSync(join(committed, "a.txt"), "a");
    git(["-C", committed, "add", "a.txt"]);
    git(["-C", committed, "commit", "-q", "-m", "mine"]);
    expect(clonePristine(committed, git)).toBe(false);

    const stashed = fresh();
    writeFileSync(join(stashed, ".gitignore"), "changed\n");
    git(["-C", stashed, "stash", "-q"]);
    expect(clonePristine(stashed, git)).toBe(false);

    expect(clonePristine("/nonexistent", git)).toBe(false);
  }, 20_000);
});

describe("uninstall stops before losing anything", () => {
  test("a dictionary that can't be read stops it before anything goes", async () => {
    const m = installed();
    writeFileSync(join(m.mb, "data.db"), "not a database");
    expect(await uninstall(["--yes"], m.deps)).toBe(1);
    expect(existsSync(join(m.mb, "data.db"))).toBe(true);
    expect(m.calls).not.toContain("retire");
  });

  test("a Fn setting that couldn't be given back stops it, keeping the backup", async () => {
    const m = installed();
    // What retireDictation leaves when `defaults write` fails.
    writeFileSync(join(m.mb, "fn-key.json"), '{"kind":"taken","value":2}');
    expect(await uninstall(["--yes"], m.deps)).toBe(1);
    expect(existsSync(join(m.mb, "fn-key.json"))).toBe(true);
    expect(m.logged.join("\n")).toContain("Fn couldn't be given back");
  });

  test("an old agent that can't be removed stops it", async () => {
    const m = installed();
    m.deps.retire = () => {
      throw new Error("EACCES");
    };
    expect(await uninstall(["--yes"], m.deps)).toBe(1);
    expect(existsSync(m.mb)).toBe(true);
    expect(m.logged.join("\n")).toContain("couldn't be removed, so nothing else was");
  });

  test("a dictionary.txt that can't be imported stops it too", async () => {
    const m = installed();
    // A folder by that name: it can't be read as text.
    mkdirSync(join(m.mb, "dictionary.txt"));
    expect(await uninstall(["--yes"], m.deps)).toBe(1);
    expect(existsSync(join(m.mb, "dictionary.txt"))).toBe(true);
    expect(m.calls).not.toContain("retire");
  });

  test("keeps words not imported yet, and never overwrites an earlier copy", async () => {
    const m = installed();
    writeFileSync(join(m.mb, "dictionary.txt"), "Nirjhar\n");
    writeFileSync(join(m.home, "mockingbird-dictionary.txt"), "from last time\n");
    await uninstall(["--yes"], m.deps);
    expect(readFileSync(join(m.home, "mockingbird-dictionary.txt"), "utf8")).toBe(
      "from last time\n",
    );
    expect(readFileSync(join(m.home, "mockingbird-dictionary-2.txt"), "utf8")).toBe(
      "cat puck => Catppuccin\nNirjhar\n",
    );
  });

  test("if the data folder can't go, the command and code stay to run it again", async () => {
    const m = installed();
    // A NUL byte: no path like it can ever be removed.
    m.deps.mockingbirdHome = join(m.home, "missing", "..", "\0bad");
    expect(await uninstall(["--yes"], m.deps)).toBe(1);
    expect(existsSync(m.clone)).toBe(true);
    expect(existsSync(join(m.home, ".local", "bin", "mockingbird"))).toBe(true);
    expect(m.logged.join("\n")).toContain("so you can run this again");
  });
});
