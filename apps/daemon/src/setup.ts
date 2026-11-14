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
import { ASR_MODEL_SETTING, findAsrModel, mockingbirdHome, savedSetting } from "./runtime.ts";
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

const runIt = (argv: string[]) => {
  const r = Bun.spawnSync(argv, { stderr: "pipe" });
  return { code: r.exitCode, out: `${r.stdout}${r.stderr}` };
};

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

/** Every check, in the order `doctor` prints them. `needed` ones decide its exit code. */
export function checks(deps: SetupDeps = {}): Check[] {
  const which = deps.which ?? ((name: string) => Bun.which(name));
  const run = deps.run ?? runIt;
  const mb = deps.mbHome ?? mockingbirdHome();
  const brew = which("brew") ? "`brew install" : "install";
  const list: Check[] = [];

  const ffmpeg = which("ffmpeg");
  const encoders = ffmpeg ? run(["ffmpeg", "-hide_banner", "-encoders"]).out : "";
  // Homebrew's ffmpeg has libx264; another one earlier on the PATH can hide it.
  const brewed = "/opt/homebrew/bin/ffmpeg";
  const hidden = !!ffmpeg && ffmpeg !== brewed && existsSync(brewed);
  list.push({
    name: "ffmpeg",
    needed: true,
    ok: !!ffmpeg && encoders.includes("libx264"),
    detail: !ffmpeg
      ? "missing"
      : encoders.includes("libx264")
        ? ffmpeg
        : `${ffmpeg} has no libx264, which render encodes with`,
    fix: hidden
      ? `put /opt/homebrew/bin before ${ffmpeg?.replace(/\/ffmpeg$/, "")} on your PATH, so Homebrew's ffmpeg is used`
      : `${brew} ffmpeg${brew.startsWith("`") ? "`" : ""}`,
  });
  const whisper = which("whisper-server");
  list.push({
    name: "whisper-server",
    needed: true,
    ok: !!whisper,
    detail: whisper ?? "missing",
    fix: `${brew} whisper-cpp${brew.startsWith("`") ? "`" : ""}`,
  });
  // The model transcribe would load: MOCKINGBIRD_ASR_MODEL, the saved
  // choice, or the default, as findAsrModel picks it.
  let speech: string;
  let speechOk = true;
  try {
    const env = deps.env ?? process.env;
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
  list.push({
    name: "chrome",
    needed: false,
    ok: !!chrome,
    detail: chrome ?? "missing: captions become plain subtitles, and motion and music can't run",
    fix: "`mockingbird models pull chrome`",
  });
  const books = playbooks().length;
  list.push({
    name: "playbooks",
    needed: false,
    ok: books > 0,
    detail: books ? `${books}, for \`guide\`` : "the plugin/ folder is missing",
    fix: "reinstall mockingbird",
  });
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
  const formulas = [
    ...(ffmpeg ? ["ffmpeg"] : []),
    ...(broken.some((c) => c.name === "whisper-server") ? ["whisper-cpp"] : []),
  ];
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
  const mb = deps.mbHome ?? mockingbirdHome();
  const absent = MODEL_FILES.filter((m) => !modelThere(mb, m.file));
  if (broken.some((c) => c.name.endsWith("model")) && absent.length) {
    // `models pull` checks every pinned file and fetches any that's missing or
    // fails its sha256, so the most it can download is all of them.
    const size = MODEL_FILES.reduce((sum, m) => sum + (m.bytes ?? 0), 0);
    const from = [...new Set(MODEL_FILES.map((m) => new URL(m.url).host))].join(" and ");
    if (ask(`Download the speech models (up to ${gb(size)}) from ${from}? [Y/n]`)) {
      const code = await (deps.pull ?? (() => Promise.resolve(1)))();
      if (code !== 0) return code;
    } else {
      // Agents can still be added: the tools that don't transcribe work without the models.
      log("Skipped the models: transcribe and captions need them (`mockingbird models pull`).");
    }
  }

  // Not needed to transcribe or cut, so a no or a failed download carries on.
  if (!findChrome(deps.env ?? process.env, mb) && pinnedChrome(mb)) {
    if (
      ask(
        "Download the headless Chrome that captions and motion graphics draw in, and its fonts (about 150 MB), from storage.googleapis.com and raw.githubusercontent.com? [Y/n]",
      )
    ) {
      if ((await (deps.pullChrome ?? (() => Promise.resolve(1)))()) !== 0) {
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
