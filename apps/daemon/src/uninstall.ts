import { existsSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
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
  plistPath: string;
  cleanupModel: string;
  /** Asks a yes/no question; `fallback` is the answer for just Enter, or no terminal. */
  ask: (question: string, fallback: boolean) => boolean;
  log: (message: string) => void;
  stopAgent: () => Promise<number>;
  /** `mockingbird fn --undo`, when there's an Fn setting to give back. */
  undoFn: () => Promise<number>;
  fnBackupPath: string;
  /** Whether a clone has no local changes, so deleting it loses nothing. */
  isClean: (dir: string) => boolean;
  ollamaRm: (model: string) => Promise<number>;
  /** Human-readable size of a path, or "" if unknown. */
  sizeOf: (path: string) => string;
  /** Where zsh keeps .zshrc: ZDOTDIR as zsh sees it, or the home folder. */
  zdotdir?: string;
};

const isHomebrew = (root: string) => /\/(Cellar|opt)\/mockingbird(\/|$)/.test(root);

/**
 * `mockingbird uninstall` (#55): everything an install put on this Mac, after
 * one question. The user's dictionary gets its own question, the cleanup model
 * too since Ollama may serve other things, and the Homebrew tools are never
 * removed. The code goes last: it's what's running this.
 */
export async function uninstall(args: string[], deps: UninstallDeps): Promise<number> {
  const yes = args.includes("--yes");
  const home = deps.home ?? homedir();
  const { log, root } = deps;
  const ask = (q: string, fallback: boolean) => (yes ? fallback : deps.ask(q, fallback));

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
  const removeCode = !isHomebrew(root) && real(root) === real(installerClone) && deps.isClean(root);

  const items: [string, string][] = [
    ["the background agent", deps.plistPath],
    ["models, logs, the agent's runner and your dictionary", deps.mockingbirdHome],
  ];
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

  await deps.stopAgent();
  rmSync(deps.plistPath, { force: true });

  const fnTaken = existsSync(deps.fnBackupPath);
  if (fnTaken) await deps.undoFn();

  let words: ReturnType<typeof readDictionary> = [];
  try {
    words = readDictionary(deps.mockingbirdHome);
  } catch (error) {
    log(`Couldn't read your dictionary to keep a copy: ${error}`);
  }
  if (
    words.length > 0 &&
    ask(`Keep a copy of your ${words.length} dictionary words? [Y/n]`, true)
  ) {
    const copy = join(home, "mockingbird-dictionary.txt");
    writeFileSync(copy, `${words.map(formatEntry).join("\n")}\n`);
    log(
      `Your words are in ${copy}. To use them after a reinstall, move it to ` +
        "~/.mockingbird/dictionary.txt before `mockingbird start`.",
    );
  }
  rmSync(deps.mockingbirdHome, { recursive: true, force: true });

  for (const p of profiles) {
    writeFileSync(p, readFileSync(p, "utf8").replace(PROFILE_LINES, "\n"));
  }
  if (ownShim) rmSync(shim, { force: true });

  const kept: string[] = [];
  const modelGone =
    ask(
      `Remove the cleanup model ${deps.cleanupModel} from Ollama? Other programs may use it. [y/N]`,
      false,
    ) && (await deps.ollamaRm(deps.cleanupModel)) === 0;
  if (!modelGone) {
    kept.push(`The cleanup model is still in Ollama: \`ollama rm ${deps.cleanupModel}\`.`);
  }
  kept.push(
    "Bun, whisper-cpp, Ollama and ffmpeg are still installed, since other things use them: " +
      "`brew uninstall bun whisper-cpp ollama ffmpeg`.",
    "System Settings → Privacy & Security still lists mockingbird under Microphone, " +
      "Accessibility and Input Monitoring. Select it in each and click −.",
  );
  if (fnTaken) kept.push("Fn goes back to what it did before once you log out of your Mac.");
  if (isHomebrew(root)) {
    kept.push("The code and the command came from Homebrew: `brew uninstall mockingbird`.");
  } else if (!removeCode) {
    kept.push(
      `The code at ${root} was left alone: it isn't the installer's clone, or it has ` +
        "changes of yours. Delete it yourself if you're done with it.",
    );
  }

  log("\nmockingbird is uninstalled. Left on this Mac:");
  for (const line of kept) log(`  - ${line}`);
  // Last, since this is running from it.
  if (removeCode) rmSync(root, { recursive: true, force: true });
  return 0;
}
