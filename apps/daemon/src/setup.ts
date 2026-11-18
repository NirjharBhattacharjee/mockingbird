/**
 * `mockingbird doctor` checks every part and says how to fix what's broken;
 * `mockingbird setup` fixes it, asking first, then adds mockingbird to the
 * coding agents on this computer (#141). Both work from the same checks.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { type Agent, agents } from "./agents.ts";
import { readDictionary } from "./dictionary.ts";
import { playbooks } from "./guide.ts";
import { findChrome, MODEL_FILES, pinnedChrome } from "./models.ts";
import {
  ASR_MODEL_SETTING,
  ffmpegMissing,
  findAsrModel,
  findWhisperServer,
  mockingbirdHome,
  pinnedWhisper,
  savedSetting,
} from "./runtime.ts";
import { UsageError } from "./transcribe.ts";

export type Check = { name: string; ok: boolean; detail: string; fix?: string; needed: boolean };

export type SetupDeps = {
  home?: string;
  mbHome?: string;
  which?: (name: string) => string | null;
  run?: (argv: string[]) => { code: number; out: string };
  log?: (line: string) => void;
  ask?: (question: string, fallback: boolean) => boolean;
  /** `models pull`, with its progress shown. */
  pull?: () => Promise<number>;
  /** `models pull chrome`, with its progress shown. */
  pullChrome?: () => Promise<number>;
  env?: Record<string, string | undefined>;
  /** Stand-ins for process.platform and process.arch. */
  platform?: string;
  arch?: string;
};

export const SETUP_USAGE = `usage: mockingbird setup [--yes]

Installs what's missing (ffmpeg and whisper-cpp with Homebrew, the speech
models, the headless Chrome that captions and motion draw in), then adds
mockingbird to the coding agents on this computer. It asks before each step;
--yes answers yes to all of them.`;

export const DOCTOR_USAGE = `usage: mockingbird doctor [--json]

Checks every part mockingbird needs and says how to fix what's broken, then
lists the coding agents on this computer and whether each has mockingbird.
Exits 1 if something transcribe or render needs is missing.`;

/** Throws a UsageError for anything but \`allowed\`; true when help was asked for and printed. */
function helped(
  args: string[],
  allowed: string,
  usage: string,
  log: (line: string) => void,
): boolean {
  if (args.some((a) => a === "-h" || a === "--help")) {
    log(usage);
    return true;
  }
  const other = args.find((a) => a !== allowed);
  if (other) throw new UsageError(`unknown option "${other}"\n\n${usage}`);
  return false;
}

/** Runs a probe, killed at 10 s so a hung program can't hold up doctor. */
const runIt = (argv: string[]) => {
  try {
    const r = Bun.spawnSync(argv, { stderr: "pipe", timeout: 10_000, killSignal: "SIGKILL" });
    return { code: r.exitCode ?? 1, out: `${r.stdout}${r.stderr}` };
  } catch (error) {
    return { code: 127, out: error instanceof Error ? error.message : String(error) };
  }
};

/** The last line a failed command printed, or its exit code. */
const why = (r: { code: number; out: string }) =>
  r.out.trim().split("\n").at(-1) || `exit ${r.code}`;

/** The full path an agent's config should run: the `mockingbird` command the installer or Homebrew put in place. */
export function commandPath(deps: SetupDeps = {}): string | undefined {
  const which = deps.which ?? ((name: string) => Bun.which(name));
  const home = deps.home ?? homedir();
  // install.ps1's shim is on the user PATH, which a shell opened before the install doesn't see.
  const known = [
    join(home, ".local", "bin", "mockingbird"),
    join(deps.mbHome ?? mockingbirdHome(), "bin", "mockingbird.cmd"),
    "/opt/homebrew/bin/mockingbird",
  ];
  // Undefined when there's none: an agent's own PATH may not have a bare `mockingbird`.
  return which("mockingbird") ?? known.find((p) => existsSync(p));
}

/** Whether a pinned model is there and whole: the small VAD file is checked against its sha256. */
function modelThere(mb: string, file: string): boolean {
  const path = join(mb, "models", file);
  if (!existsSync(path)) return false;
  const pinned = MODEL_FILES.find((m) => m.file === file);
  if (!pinned) return true;
  // A big model by its size (hashing 1 GB on every doctor run is slow), the VAD by its sha256.
  if ((pinned.bytes ?? 0) > 50e6) return !pinned.bytes || statSync(path).size === pinned.bytes;
  try {
    return (
      new Bun.CryptoHasher("sha256").update(readFileSync(path)).digest("hex") === pinned.sha256
    );
  } catch {
    // Unreadable is as good as damaged: doctor reports it, setup fetches it again.
    return false;
  }
}

const gb = (bytes: number) => `${(bytes / 1e9).toFixed(1)} GB`;

/** Whether Claude Code still has the mockingbird-studio plugin from before v0.4.2, whose playbooks no longer match the engine (#256). */
export function oldPlugin(
  env: Record<string, string | undefined> = process.env,
  home = homedir(),
): boolean {
  const dir = env.CLAUDE_CONFIG_DIR || join(home, ".claude");
  try {
    const file = JSON.parse(readFileSync(join(dir, "plugins", "installed_plugins.json"), "utf8"));
    return Object.keys(file.plugins ?? {}).some((k) => k.startsWith("mockingbird-studio@"));
  } catch {
    return false;
  }
}

export const OLD_PLUGIN_FIX =
  "in Claude Code, `/plugin uninstall mockingbird-studio`, then `/plugin marketplace add NirjharBhattacharjee/mockingbird` and `/plugin install mockingbird@mockingbird`";

/** Every check, in the order `doctor` prints them. `needed` ones decide its exit code. */
export function checks(deps: SetupDeps = {}): Check[] {
  const which = deps.which ?? ((name: string) => Bun.which(name));
  const run = deps.run ?? runIt;
  const mb = deps.mbHome ?? mockingbirdHome();
  const brew = which("brew") ? "`brew install" : "install";
  const list: Check[] = [];

  const ffmpeg = which("ffmpeg");
  // Every encoder and filter the engine uses, as `status` checks them.
  // A listing from an ffmpeg that failed isn't trusted: it says why instead.
  let broken: string | undefined;
  const lacks = ffmpeg
    ? ffmpegMissing((what) => {
        const r = run(["ffmpeg", "-hide_banner", what]);
        if (r.code !== 0) broken ??= why(r);
        return r.out;
      })
    : [];
  // Homebrew's ffmpeg has them all; another one earlier on the PATH can hide it.
  const brewed = "/opt/homebrew/bin/ffmpeg";
  const hidden = !!ffmpeg && ffmpeg !== brewed && existsSync(brewed);
  list.push({
    name: "ffmpeg",
    needed: true,
    ok: !!ffmpeg && !broken && !lacks.length,
    detail: !ffmpeg
      ? "missing"
      : broken
        ? `${ffmpeg} won't run: ${broken}`
        : !lacks.length
          ? ffmpeg
          : `${ffmpeg} is built without ${lacks.join(", ")}, which the engine uses`,
    fix: hidden
      ? `put /opt/homebrew/bin before ${ffmpeg?.replace(/\/ffmpeg$/, "")} on your PATH, so Homebrew's ffmpeg is used`
      : `${brew} ffmpeg${brew.startsWith("`") ? "`" : ""}`,
  });
  // The one transcribe runs: the override, the pinned download, or the PATH's.
  const env = deps.env ?? process.env;
  const system = `${deps.platform ?? process.platform}-${deps.arch ?? process.arch}`;
  const whisper = findWhisperServer(env, mb, which, system);
  const pinned = pinnedWhisper(mb, system);
  const there = !!whisper && (existsSync(whisper) || !!which(whisper));
  // There isn't enough: a build for a newer glibc is there but can't load (#223).
  const help = there && whisper ? run([whisper, "--help"]) : undefined;
  const serverOverride = env.MOCKINGBIRD_WHISPER_SERVER;
  list.push({
    name: "whisper-server",
    needed: true,
    ok: !!help && help.code === 0,
    detail: !there
      ? serverOverride
        ? `${serverOverride} (MOCKINGBIRD_WHISPER_SERVER) isn't there`
        : "missing"
      : help && help.code !== 0
        ? `${whisper} won't start: ${why(help)}`
        : (whisper as string),
    // The override always wins, so downloading another wouldn't help.
    fix: serverOverride
      ? "point MOCKINGBIRD_WHISPER_SERVER at a whisper-server that runs, or unset it"
      : there
        ? "install a whisper-server built for this computer (`brew install whisper-cpp`, or build whisper.cpp) and set MOCKINGBIRD_WHISPER_SERVER to it"
        : pinned
          ? "`mockingbird models pull` (downloads whisper.cpp's build)"
          : `${brew} whisper-cpp${brew.startsWith("`") ? "`" : ""}`,
  });
  // The model transcribe would load: MOCKINGBIRD_ASR_MODEL, the saved
  // choice, or the default, as findAsrModel picks it.
  let speech: string;
  let speechOk = true;
  try {
    speech = basename(
      findAsrModel(
        join(mb, "models"),
        env.MOCKINGBIRD_ASR_MODEL,
        () => {},
        savedSetting(ASR_MODEL_SETTING, mb),
      ),
    );
    // A pinned model cut short (an empty file, a download stopped halfway) won't load.
    // A path (either separator) is outside models/; a bare name is in it.
    const inModels = !/[\\/]/.test(env.MOCKINGBIRD_ASR_MODEL ?? "");
    if (inModels && !modelThere(mb, speech)) throw new Error(`${speech} is damaged or incomplete`);
  } catch (error) {
    speechOk = false;
    speech = error instanceof Error ? (error.message.split("\n")[0] ?? "missing") : "missing";
  }
  list.push({
    name: "speech model",
    needed: true,
    ok: speechOk,
    detail: speech,
    fix: "`mockingbird models pull`, or set MOCKINGBIRD_ASR_MODEL to a model that's there",
  });
  const vad = modelThere(mb, "silero_vad.onnx");
  list.push({
    name: "speech detection model",
    needed: true,
    ok: vad,
    detail: vad ? "silero_vad.onnx" : "missing or damaged",
    fix: "`mockingbird models pull`",
  });
  let words: string;
  let readable = true;
  try {
    words = `${readDictionary(mb).length} words`;
  } catch (error) {
    readable = false;
    words = `data.db can't be read: ${error instanceof Error ? error.message : error}`;
  }
  list.push({
    name: "dictionary",
    needed: false,
    ok: readable,
    detail: words,
    fix: `move ${join(mb, "data.db")} aside; names are then spelled as heard`,
  });
  // Captions, `motion` and `music` all draw in the pinned Chrome (#145, #155, #170).
  const chrome = findChrome(deps.env ?? process.env, mb);
  // A MOCKINGBIRD_CHROME that can't run wins over the pinned one, so a download wouldn't fix it.
  const override = (deps.env ?? process.env).MOCKINGBIRD_CHROME;
  list.push({
    name: "chrome",
    needed: false,
    ok: !!chrome,
    detail:
      chrome ??
      (override
        ? `MOCKINGBIRD_CHROME is ${override}, which isn't a program that can run`
        : "missing: captions become plain subtitles, and motion and music can't run"),
    fix: override
      ? "point MOCKINGBIRD_CHROME at a Chrome that runs, or unset it"
      : "`mockingbird models pull chrome`",
  });
  const books = playbooks().length;
  list.push({
    name: "playbooks",
    needed: false,
    ok: books > 0,
    detail: books ? `${books}, for \`guide\`` : "the plugin/ folder is missing",
    fix: "reinstall mockingbird",
  });
  if (oldPlugin(deps.env ?? process.env, deps.home ?? homedir())) {
    list.push({
      name: "old plugin",
      needed: false,
      ok: false,
      detail:
        "Claude Code has the old mockingbird-studio plugin, whose playbooks don't match this engine",
      fix: OLD_PLUGIN_FIX,
    });
  }
  return list;
}

/** `mockingbird doctor`: each check, then each agent, then 0 if everything needed is there. */
export function doctor(args: string[], deps: SetupDeps = {}): number {
  const log = deps.log ?? ((line: string) => console.log(line));
  if (helped(args, "--json", DOCTOR_USAGE, log)) return 0;
  const all = checks(deps);
  const command = commandPath(deps);
  // Each agent's state comes from its own config, so they're listed either way.
  const found = agents(command ?? "mockingbird", deps);
  if (args.includes("--json")) {
    const agentList = found.map(({ name, where, registered }) => ({ name, where, registered }));
    log(JSON.stringify({ checks: all, agents: agentList }, null, 2));
  } else {
    const width =
      Math.max(...all.map((c) => c.name.length), ...found.map((a) => a.name.length)) + 2;
    for (const c of all) {
      log(`${c.ok ? "✓" : c.needed ? "✗" : "!"} ${c.name.padEnd(width)}${c.detail}`);
      if (!c.ok && c.fix) log(`  ${"".padEnd(width)}fix: ${c.fix}`);
    }
    for (const a of found) {
      log(
        `${a.registered ? "✓" : "!"} ${a.name.padEnd(width)}${a.registered ? "has mockingbird" : "doesn't have mockingbird yet: `mockingbird setup`"}`,
      );
    }
    if (!command) {
      log(
        `! ${"agents".padEnd(width)}the \`mockingbird\` command isn't on the PATH, so no agent can run it`,
      );
    } else if (!found.length) {
      log(`! ${"agents".padEnd(width)}none found; see docs/MCP.md to add mockingbird to yours`);
    }
  }
  return all.every((c) => c.ok || !c.needed) ? 0 : 1;
}

/** `mockingbird setup [--yes]`: installs what's missing, after asking, and adds mockingbird to each agent. */
export async function setup(args: string[], deps: SetupDeps = {}): Promise<number> {
  const log = deps.log ?? ((line: string) => console.log(line));
  if (helped(args, "--yes", SETUP_USAGE, log)) return 0;
  const yes = args.includes("--yes");
  const ask = (question: string, fallback = true) =>
    yes || (deps.ask ?? (() => fallback))(question, fallback);
  const which = deps.which ?? ((name: string) => Bun.which(name));
  const run = deps.run ?? runIt;

  const broken = checks(deps).filter((c) => !c.ok && c.needed);
  const ffmpeg = broken.find((c) => c.name === "ffmpeg");
  // Homebrew's copy is there but hidden: installing it again changes nothing.
  if (ffmpeg?.fix?.startsWith("put ")) {
    log(
      `ffmpeg: ${ffmpeg.detail}. To fix it, ${ffmpeg.fix}, then run \`mockingbird setup\` again.`,
    );
    return 1;
  }
  const mb = deps.mbHome ?? mockingbirdHome();
  // Linux and Windows download whisper.cpp's own build with the models, no Homebrew needed.
  const pinned = pinnedWhisper(
    mb,
    `${deps.platform ?? process.platform}-${deps.arch ?? process.arch}`,
  );
  const server = broken.find((c) => c.name === "whisper-server");
  // Only a missing one is installed here; an override or a build that won't start needs the person.
  const noServer = !!server?.fix && /models pull|whisper-cpp`?$/.test(server.fix);
  if (server && !noServer) log(`whisper-server: ${server.detail}. To fix it, ${server.fix}.`);
  const formulas = [...(ffmpeg ? ["ffmpeg"] : []), ...(noServer && !pinned ? ["whisper-cpp"] : [])];
  if (formulas.length) {
    if (!which("brew")) {
      log(
        `mockingbird needs ${formulas.join(" and ")}. Install them, then run \`mockingbird setup\` again.`,
      );
      return 1;
    }
    if (!ask(`Install ${formulas.join(" and ")} with Homebrew? [Y/n]`)) return 1;
    const r = run(["brew", "install", ...formulas]);
    if (r.code !== 0) {
      log(`brew install ${formulas.join(" ")} failed:\n${r.out.trim()}`);
      return 1;
    }
  }
  const absent = MODEL_FILES.filter((m) => !modelThere(mb, m.file));
  const needModels = broken.some((c) => c.name.endsWith("model")) && absent.length > 0;
  if (needModels || (noServer && pinned)) {
    // `models pull` checks every pinned file and fetches any that's missing or
    // fails its sha256, so the most it can download is all of them, then
    // whisper-server where it's pinned.
    const size = MODEL_FILES.reduce((sum, m) => sum + (m.bytes ?? 0), 0);
    const hosts = [...MODEL_FILES.map((m) => m.url), ...(pinned ? [pinned.archive.url] : [])];
    const from = [...new Set(hosts.map((u) => new URL(u).host))].join(" and ");
    const what = pinned ? "the speech models and whisper-server" : "the speech models";
    if (ask(`Download ${what} (up to ${gb(size)}) from ${from}? [Y/n]`)) {
      const code = await (deps.pull ?? (() => Promise.resolve(1)))();
      if (code !== 0) return code;
    } else {
      // Agents can still be added: the tools that don't transcribe work without the models.
      log(`Skipped ${what}: transcribe and captions need them (\`mockingbird models pull\`).`);
    }
  }

  // Not needed to transcribe or cut, so a no or a failed download carries on.
  const override = (deps.env ?? process.env).MOCKINGBIRD_CHROME;
  if (override && !findChrome(deps.env ?? process.env, mb)) {
    log(
      `MOCKINGBIRD_CHROME is ${override}, which isn't a program that can run: point it at a Chrome that runs, or unset it.`,
    );
  } else if (!findChrome(deps.env ?? process.env, mb) && pinnedChrome(mb)) {
    if (
      ask(
        "Download the headless Chrome that captions and motion graphics draw in, and its fonts (about 150 MB), from storage.googleapis.com and raw.githubusercontent.com? [Y/n]",
      )
    ) {
      // A pull that throws (an unpack that fails) counts as a failed download, not the end of setup.
      const code = await (deps.pullChrome ?? (() => Promise.resolve(1)))().catch((error) => {
        log(`Chrome: ${error instanceof Error ? error.message : error}`);
        return 1;
      });
      if (code !== 0) {
        log("Chrome didn't download: run `mockingbird models pull chrome` to try again.");
      }
    } else {
      log(
        "Skipped Chrome: captions become plain subtitles, and motion and music can't run (`mockingbird models pull chrome`).",
      );
    }
  }

  const command = commandPath(deps);
  if (!command) {
    log(
      "The `mockingbird` command isn't on the PATH, so no agent could run it. Reinstall, then run setup again.",
    );
    return 1;
  }
  const missing: Agent[] = agents(command, deps).filter((a) => !a.registered);
  let failed = false;
  if (missing.length && ask(`Add mockingbird to ${missing.map((a) => a.name).join(", ")}? [Y/n]`)) {
    for (const a of missing) {
      try {
        a.register();
        log(`added mockingbird to ${a.name} (${a.where}); restart it to load the tools`);
      } catch (error) {
        failed = true;
        log(`${a.name}: ${error instanceof Error ? error.message : error}`);
      }
    }
  }
  log("");
  const checked = doctor([], deps);
  return failed ? 1 : checked;
}
