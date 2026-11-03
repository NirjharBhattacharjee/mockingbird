import {
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { formatEntry, readDictionary } from "./dictionary.ts";

/** The lines scripts/install.sh adds to a shell profile, exactly. */
const PROFILE_LINES =
  '\n# Added by the mockingbird installer\nexport PATH="$HOME/.local/bin:$PATH"\n';

/** The first line the installer writes into ~/.local/bin/mockingbird. */
const SHIM_MARK = "# Written by scripts/install.sh";

export type UninstallDeps = {
  home?: string;
  /** ~/.mockingbird, or MOCKINGBIRD_HOME. */
  mockingbirdHome: string;
  /** The folder the engine runs from: a clone, or Homebrew's. */
  root: string;
  /** Asks a yes/no question; `fallback` is the answer for just Enter, or no terminal. */
  ask: (question: string, fallback: boolean) => boolean;
  log: (message: string) => void;
  /** Removes what dictation left (retire.ts): its agent, runner app and Fn setting. */
  retire: () => string[];
  /** Runs git; its output, or undefined when it fails. */
  git: (args: string[]) => string | undefined;
  /** Human-readable size of a path, or "" if unknown. */
  sizeOf: (path: string) => string;
  /** Where zsh keeps .zshrc: ZDOTDIR as zsh sees it, or the home folder. */
  zdotdir?: string;
};

const isHomebrew = (root: string) => /\/(Cellar|opt)\/mockingbird(\/|$)/.test(root);

/**
 * Whether deleting a clone can lose nothing of the user's: no changes, no
 * files git ignores other than what `bun install` and the Go build make, no
 * stash, and no commit that isn't on a remote branch or a tag. Anything
 * uncertain counts as not pristine, and the clone is left alone.
 */
export function clonePristine(dir: string, git: UninstallDeps["git"]): boolean {
  const status = git(["-C", dir, "status", "--porcelain", "--ignored"]);
  if (status === undefined) return false;
  const theirs = status
    .split("\n")
    .filter((l) => l && !/^!! (.*\/)?node_modules\/$/.test(l) && l !== "!! apps/cli/mockingbird");
  return (
    theirs.length === 0 &&
    !!git(["-C", dir, "for-each-ref", "--contains", "HEAD", "refs/remotes", "refs/tags"]) &&
    git(["-C", dir, "log", "--branches", "--not", "--remotes", "--tags", "--oneline"]) === "" &&
    git(["-C", dir, "stash", "list"]) === ""
  );
}

/** `path`, or the first of `stem-2.txt`, `stem-3.txt`… that doesn't exist yet. */
function freshName(path: string): string {
  let n = 1;
  let candidate = path;
  while (existsSync(candidate)) candidate = path.replace(/\.txt$/, `-${++n}.txt`);
  return candidate;
}

/**
 * `mockingbird uninstall` (#55): everything an install put on this Mac, after
 * one question. The user's dictionary gets its own question, and the Homebrew
 * tools are never removed. Anything that can lose the user's data stops it before anything is
 * deleted; after that, each removal is tried on its own and failures are
 * reported at the end. The code goes last: it's what's running this.
 */
export async function uninstall(args: string[], deps: UninstallDeps): Promise<number> {
  const yes = args.includes("--yes");
  const home = deps.home ?? homedir();
  const { log, root, mockingbirdHome: mb } = deps;
  const ask = (q: string, fallback: boolean) => (yes ? fallback : deps.ask(q, fallback));

  // Read the user's words first: if they can't be read, nothing is touched.
  let words: string[];
  // Reading also moves a dictionary.txt not yet imported into data.db.
  try {
    words = readDictionary(mb).map(formatEntry);
    // Still there means its import failed, and its words aren't in `words`.
    if (existsSync(join(mb, "dictionary.txt")))
      throw new Error("dictionary.txt couldn't be imported");
  } catch (error) {
    log(`Couldn't read your dictionary in ${mb}, so nothing was removed: ${error}`);
    return 1;
  }

  const installerClone = process.env.MOCKINGBIRD_DIR ?? join(home, "mockingbird");
  const shim = join(home, ".local", "bin", "mockingbird");
  const ownShim = existsSync(shim) && readFileSync(shim, "utf8").includes(SHIM_MARK);
  const profiles = [
    join(deps.zdotdir ?? home, ".zshrc"),
    join(home, ".bash_profile"),
    join(home, ".bash_login"),
    join(home, ".profile"),
  ].filter((p) => existsSync(p) && readFileSync(p, "utf8").includes(PROFILE_LINES));
  const real = (p: string) => (existsSync(p) ? realpathSync(p) : p);
  const removeCode =
    !isHomebrew(root) && real(root) === real(installerClone) && clonePristine(root, deps.git);

  const items: [string, string][] = [["models and your dictionary", mb]];
  // Recordings (#89), from the dictation-era recorder, are kept unless the
  // user says otherwise, asked below.
  const recordings = join(mb, "recordings");
  const recorded = existsSync(recordings)
    ? readdirSync(recordings).filter((n) => /\.m4a(\.part)?$/.test(n)).length
    : 0;
  if (recorded) items.push([`${recorded} recordings, which you'll be asked about`, recordings]);
  if (removeCode) items.push(["the code", root]);
  if (ownShim) items.push(["the mockingbird command", shim]);
  for (const p of profiles) items.push(["the PATH line the installer added", p]);
  log("This removes:");
  for (const [what, path] of items) {
    const size = deps.sizeOf(path);
    log(`  ${what}: ${path}${size ? ` (${size})` : ""}`);
  }
  if (!yes && !deps.ask("Remove all of this? [y/N]", false)) {
    log("Nothing was removed.");
    return 0;
  }

  const failed: string[] = [];
  const attempt = (what: string, remove: () => void): boolean => {
    try {
      remove();
      return true;
    } catch (error) {
      failed.push(`${what}: ${error instanceof Error ? error.message : error}`);
      return false;
    }
  };

  // Fn's backup is in the folder about to go, so this runs first.
  attempt("dictation's background agent", () => {
    for (const line of deps.retire()) log(line);
  });
  const fnBackup = join(mb, "fn-key.json");
  if (existsSync(fnBackup)) {
    log(
      `Fn couldn't be given back, so nothing else was removed. Set Fn in System Settings → ` +
        `Keyboard, delete ${fnBackup}, and run this again.`,
    );
    return 1;
  }
  let dataSafe = true;
  if (
    words.length > 0 &&
    ask(`Keep a copy of your ${words.length} dictionary words? [Y/n]`, true)
  ) {
    const copy = freshName(join(home, "mockingbird-dictionary.txt"));
    dataSafe = attempt(copy, () => writeFileSync(copy, `${words.join("\n")}\n`));
    if (dataSafe) {
      log(
        `Your words are in ${copy}. To use them after a reinstall, move it to ` +
          "~/.mockingbird/dictionary.txt.",
      );
    }
  }
  if (recorded && ask(`Keep your ${recorded} recordings? [Y/n]`, true)) {
    let kept = join(home, "mockingbird-recordings");
    for (let n = 2; existsSync(kept); n++) kept = `${join(home, "mockingbird-recordings")}-${n}`;
    dataSafe &&= attempt(kept, () => renameSync(recordings, kept));
    if (dataSafe) log(`Your recordings are in ${kept}.`);
  }
  // A copy that couldn't be written means the originals stay.
  const mbGone = dataSafe && attempt(mb, () => rmSync(mb, { recursive: true, force: true }));
  if (!dataSafe) {
    failed.push(`${mb} was kept, since your words or recordings couldn't be copied out of it`);
  }
  // While anything of it is left, keep the command and the code that runs it,
  // so this can be run again.
  if (mbGone) {
    for (const p of profiles) {
      attempt(p, () => writeFileSync(p, readFileSync(p, "utf8").replace(PROFILE_LINES, "\n")));
    }
    if (ownShim) attempt(shim, () => rmSync(shim, { force: true }));
  }

  const kept: string[] = [
    "Bun, whisper-cpp and ffmpeg are still installed, since other things use them: " +
      "`brew uninstall bun whisper-cpp ffmpeg`.",
    "If you used dictation (v0.3.2 and earlier), System Settings → Privacy & Security may " +
      "still list mockingbird under Microphone, Accessibility and Input Monitoring. Select it " +
      "in each and click −.",
  ];
  if (isHomebrew(root)) {
    kept.push("The code and the command came from Homebrew: `brew uninstall mockingbird`.");
  } else if (!removeCode || !mbGone) {
    kept.push(
      mbGone
        ? `The code at ${root} was left alone: it isn't the installer's clone, or it may ` +
            "hold work of yours (changes, ignored files, a stash or unpushed commits)."
        : `The code at ${root} and the command were kept, so you can run this again.`,
    );
  }

  // The last removal, since this is running from it, but before the report so
  // a failure shows in it. Every module is loaded by now.
  if (mbGone && removeCode) attempt(root, () => rmSync(root, { recursive: true, force: true }));

  log(`\nmockingbird is ${failed.length ? "partly " : ""}uninstalled. Left on this Mac:`);
  for (const line of kept) log(`  - ${line}`);
  if (failed.length) {
    log("These couldn't be removed:");
    for (const line of failed) log(`  - ${line}`);
  }
  return failed.length ? 1 : 0;
}
