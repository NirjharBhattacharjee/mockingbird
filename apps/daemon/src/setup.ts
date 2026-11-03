/**
 * `mockingbird doctor` checks every part and says how to fix what's broken;
 * `mockingbird setup` fixes it, asking first, then adds mockingbird to the
 * coding agents on this computer (#141). Both work from the same checks.
 */
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { type Agent, agents } from "./agents.ts";
import { readDictionary } from "./dictionary.ts";
import { playbooks } from "./guide.ts";
import { listModels, MODEL_FILES } from "./models.ts";
import { mockingbirdHome } from "./runtime.ts";

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
  platform?: string;
};

const runIt = (argv: string[]) => {
  const r = Bun.spawnSync(argv, { stderr: "pipe" });
  return { code: r.exitCode, out: `${r.stdout}${r.stderr}` };
};

/** The full path an agent's config should run: the `mockingbird` command the installer or Homebrew put in place. */
export function commandPath(deps: SetupDeps = {}): string {
  const which = deps.which ?? ((name: string) => Bun.which(name));
  const home = deps.home ?? homedir();
  const known = [join(home, ".local", "bin", "mockingbird"), "/opt/homebrew/bin/mockingbird"];
  return which("mockingbird") ?? known.find((p) => existsSync(p)) ?? "mockingbird";
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
  list.push({
    name: "ffmpeg",
    needed: true,
    ok: !!ffmpeg && encoders.includes("libx264"),
    detail: !ffmpeg
      ? "missing"
      : encoders.includes("libx264")
        ? ffmpeg
        : `${ffmpeg} has no libx264, which render encodes with`,
    fix: `${brew} ffmpeg${brew.startsWith("`") ? "`" : ""}`,
  });
  const whisper = which("whisper-server");
  list.push({
    name: "whisper-server",
    needed: true,
    ok: !!whisper,
    detail: whisper ?? "missing",
    fix: `${brew} whisper-cpp${brew.startsWith("`") ? "`" : ""}`,
  });
  const speech = listModels({ home: mb }).find((m) => m.inUse)?.file;
  list.push({
    name: "speech model",
    needed: true,
    ok: !!speech,
    detail: speech ?? "missing",
    fix: "`mockingbird models pull`",
  });
  const vad = existsSync(join(mb, "models", "silero_vad.onnx"));
  list.push({
    name: "speech detection model",
    needed: true,
    ok: vad,
    detail: vad ? "silero_vad.onnx" : "missing",
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
  const mac = (deps.platform ?? process.platform) === "darwin";
  list.push({
    name: "captions and motion",
    needed: false,
    ok: mac,
    detail: mac
      ? "drawn with Core Text and Core Graphics"
      : "need macOS; captions become a subtitle track",
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
  const all = checks(deps);
  const found = agents(commandPath(deps), deps);
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
    if (!found.length)
      log(`! ${"agents".padEnd(width)}none found; see docs/MCP.md to add mockingbird to yours`);
  }
  return all.every((c) => c.ok || !c.needed) ? 0 : 1;
}

/** `mockingbird setup [--yes]`: installs what's missing, after asking, and adds mockingbird to each agent. */
export async function setup(args: string[], deps: SetupDeps = {}): Promise<number> {
  const log = deps.log ?? ((line: string) => console.log(line));
  const yes = args.includes("--yes");
  const ask = (question: string, fallback = true) =>
    yes || (deps.ask ?? (() => fallback))(question, fallback);
  const which = deps.which ?? ((name: string) => Bun.which(name));
  const run = deps.run ?? runIt;

  const broken = checks(deps).filter((c) => !c.ok && c.needed);
  const formulas = [
    ...(broken.some((c) => c.name === "ffmpeg") ? ["ffmpeg"] : []),
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
  if (broken.some((c) => c.name.endsWith("model"))) {
    const size = MODEL_FILES.reduce((sum, m) => sum + (m.bytes ?? 0), 0);
    const from = [...new Set(MODEL_FILES.map((m) => new URL(m.url).host))].join(" and ");
    if (!ask(`Download the speech models (${gb(size)}) from ${from}? [Y/n]`)) return 1;
    const code = await (deps.pull ?? (() => Promise.resolve(1)))();
    if (code !== 0) return code;
  }

  const missing: Agent[] = agents(commandPath(deps), deps).filter((a) => !a.registered);
  if (missing.length && ask(`Add mockingbird to ${missing.map((a) => a.name).join(", ")}? [Y/n]`)) {
    for (const a of missing) {
      try {
        a.register();
        log(`added mockingbird to ${a.name} (${a.where}); restart it to load the tools`);
      } catch (error) {
        log(`${a.name}: ${error instanceof Error ? error.message : error}`);
      }
    }
  }
  log("");
  return doctor([], deps);
}
