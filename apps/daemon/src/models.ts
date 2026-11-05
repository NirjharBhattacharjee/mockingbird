import {
  closeSync,
  createReadStream,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeSync,
} from "node:fs";
import { basename, join } from "node:path";
import { withStore } from "./dictionary.ts";
import {
  ASR_MODEL_SETTING,
  DEFAULT_ASR_MODEL,
  englishOnly,
  findAsrModel,
  isWhisperFile,
  mockingbirdHome,
  pinnedWhisper,
  savedSetting,
  spokenLanguage,
  WHISPER_BUILD,
} from "./runtime.ts";

/** `name` is what the progress line calls it. */
export type ModelFile = { name: string; file: string; url: string; sha256: string };

/**
 * What `mockingbird models pull` downloads. Each one is pinned to a fixed
 * version and checked against its sha256, so a changed, truncated or corrupt
 * file is downloaded again rather than loaded.
 */
export const MODEL_FILES: ModelFile[] = [
  {
    name: "Whisper",
    file: DEFAULT_ASR_MODEL,
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-large-v3-q5_0.bin",
    sha256: "d75795ecff3f83b5faa89d1900604ad8c780abd5739fae406de19f23ecd98ad1",
  },
  {
    name: "VAD",
    file: "silero_vad.onnx",
    url: "https://github.com/snakers4/silero-vad/raw/v6.2.2/src/silero_vad/data/silero_vad.onnx",
    sha256: "1a153a22f4509e292a94e67d6f9b85e8deb25b4988682b7e174c65279d8788e3",
  },
];

export async function sha256Of(path: string): Promise<string> {
  const hasher = new Bun.CryptoHasher("sha256");
  for await (const chunk of createReadStream(path)) hasher.update(chunk as Buffer);
  return hasher.digest("hex");
}

export type PullFileDeps = {
  fetch?: typeof fetch;
  log?: (message: string) => void;
  /** Bytes written so far, and the size the server gave (0 if it gave none). */
  onProgress?: (done: number, total: number) => void;
};

/**
 * Downloads one model into `dir`, unless a file with the right checksum is
 * already there. Returns whether it downloaded anything.
 */
export async function pullFile(
  model: ModelFile,
  dir: string,
  { fetch: get = fetch, log = () => {}, onProgress = () => {} }: PullFileDeps = {},
): Promise<boolean> {
  const path = join(dir, model.file);
  if (existsSync(path) && (await sha256Of(path)) === model.sha256) {
    log(`${model.file} is downloaded`);
    return false;
  }
  mkdirSync(dir, { recursive: true });
  // A temporary name first, so an interrupted download isn't mistaken for a
  // model. What an interrupted one left behind is kept and continued: on a slow
  // connection, starting a 1 GB file over is what makes an install take an hour.
  const part = `${path}.part`;
  const have = existsSync(part) ? statSync(part).size : 0;
  if (have > 0 && (await sha256Of(part)) === model.sha256) {
    renameSync(part, path);
    return true;
  }
  log(
    `downloading ${model.file}${have ? `, continuing from ${size(have, 0)}` : ""}\n  from ${model.url}`,
  );
  let response = await get(model.url, have ? { headers: { range: `bytes=${have}-` } } : {});
  if (response.status === 416) {
    // The part is as long as the file or longer, and wrong, or the checksum
    // above would have matched. Kept, it would fail every pull from now on.
    rmSync(part, { force: true });
    response = await get(model.url, {});
  }
  if (!response.ok || !response.body) {
    throw new Error(`couldn't download ${model.file}: HTTP ${response.status}`);
  }
  // 206 is the rest of the file; a server that ignores the range sends all of it.
  const from = response.status === 206 ? have : 0;
  const total = from + (Number(response.headers.get("content-length")) || 0);
  const fd = openSync(part, from ? "a" : "w");
  let done = from;
  try {
    for await (const chunk of response.body) {
      writeSync(fd, chunk);
      done += chunk.byteLength;
      onProgress(done, total === from ? 0 : total);
    }
  } finally {
    closeSync(fd);
  }
  if ((await sha256Of(part)) !== model.sha256) {
    rmSync(part, { force: true });
    throw new Error(
      `${model.file} didn't match its expected checksum. Run this again; if it keeps happening, please open an issue.`,
    );
  }
  renameSync(part, path);
  return true;
}

export type PullDeps = PullFileDeps & {
  home?: string;
  /** Injected in tests; the pinned list otherwise. */
  files?: ModelFile[];
  modelsDir?: string;
  /** Gets the line from progressLine, at most every quarter second. */
  progress?: (line: string) => void;
};

type Download = { name: string; done: number; total: number };

const bar = (fraction: number) => {
  const full = Math.round(Math.min(1, fraction) * 8);
  return "█".repeat(full) + "░".repeat(8 - full);
};

const size = (done: number, total: number) => {
  if (!total) return `${Math.round(done / 1e6)} MB`;
  return total >= 1e8
    ? `${(done / 1e9).toFixed(1)}/${(total / 1e9).toFixed(1)} GB`
    : `${Math.round(done / 1e6)}/${Math.round(total / 1e6)} MB`;
};

/**
 * One line for the downloads still running, short enough for an 80-column
 * terminal: `Whisper ███░░░░░ 0.4/1.1 GB`.
 * Empty once they've all finished.
 */
export function progressLine(downloads: Download[]): string {
  return downloads
    .filter((d) => !d.total || d.done < d.total)
    .map((d) => `${d.name} ${d.total ? `${bar(d.done / d.total)} ` : ""}${size(d.done, d.total)}`)
    .join("   ");
}

/**
 * The only network call mockingbird makes (ARCHITECTURE.md §9): the Whisper
 * and VAD models. It runs when the user asks for it and says where each
 * download comes from.
 */
export async function pullModels(deps: PullDeps = {}): Promise<number> {
  const log = deps.log ?? ((m: string) => console.error(m));
  const home = deps.home ?? mockingbirdHome();
  const modelsDir = deps.modelsDir ?? join(home, "models");
  let shown = 0;
  for (const model of deps.files ?? MODEL_FILES) {
    const progress = (done: number, total: number) => {
      if (Date.now() - shown < 250) return;
      shown = Date.now();
      deps.progress?.(progressLine([{ name: model.name, done, total }]));
    };
    try {
      await pullFile(model, modelsDir, { fetch: deps.fetch, log, onProgress: progress });
    } finally {
      // A pull that has ended leaves the line straight away, so the last
      // thing shown is never a stale byte count.
      deps.progress?.("");
    }
  }
  log("All models are downloaded.");
  return 0;
}

/**
 * `mockingbird models pull` on Linux and Windows also downloads whisper-server
 * and unpacks it into `~/.mockingbird/bin`. Returns 0 where there's no pin
 * (macOS: Homebrew's).
 */
export async function pullWhisper(deps: PullDeps = {}): Promise<number> {
  const log = deps.log ?? ((m: string) => console.error(m));
  const home = deps.home ?? mockingbirdHome();
  const pin = pinnedWhisper(home);
  if (!pin) return 0;
  if (existsSync(pin.program)) {
    log(`whisper-server ${WHISPER_BUILD} is downloaded`);
    return 0;
  }
  const bin = join(home, "bin");
  await pullFile(pin.archive, bin, { fetch: deps.fetch, log });
  const archive = join(bin, pin.archive.file);
  // Unpacked beside the target and renamed into place, so a half-unpacked one
  // is never found. tar reads .zip too on Windows (bsdtar, since Windows 10).
  const unpacking = `${pin.dir}.part`;
  rmSync(unpacking, { recursive: true, force: true });
  mkdirSync(unpacking, { recursive: true });
  // Windows' own tar.exe: Git Bash's GNU tar, often first on the PATH, takes
  // "D:" for a remote host.
  const tarExe =
    process.platform === "win32"
      ? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe")
      : "tar";
  const tar = Bun.spawnSync([tarExe, "-xf", archive, "-C", unpacking], { stderr: "pipe" });
  if (tar.exitCode !== 0) {
    rmSync(unpacking, { recursive: true, force: true });
    throw new Error(`couldn't unpack ${archive}: ${tar.stderr.toString().trim()}`);
  }
  rmSync(pin.dir, { recursive: true, force: true });
  renameSync(unpacking, pin.dir);
  rmSync(archive, { force: true });
  log(`whisper-server ${WHISPER_BUILD} is downloaded.`);
  return 0;
}

export type ModelsDeps = {
  home?: string;
  /** Where the Whisper files are; `~/.mockingbird/models` by default. */
  modelsDir?: string;
  out?: (line: string) => void;
  log?: (message: string) => void;
  env?: Record<string, string | undefined>;
};

const gb = (bytes: number) => `${(bytes / 1e9).toFixed(1)} GB`;

/** `ggml-large-v3-turbo-q8_0.bin` → `large-v3-turbo Q8_0`. */
export function speechName(file: string): string {
  return file
    .replace(/^ggml-/, "")
    .replace(/\.bin$/, "")
    .replace(/-(q\d\w*|f16)$/i, (_, quant: string) => ` ${quant.toUpperCase()}`);
}

export type SpeechModel = {
  name: string;
  file: string;
  size: number;
  inUse: boolean;
  isDefault: boolean;
};

/**
 * The Whisper files in models/, largest first. The one in use is what
 * transcription picks: the environment, then the saved choice, then the
 * default.
 */
export function listModels(deps: ModelsDeps = {}): SpeechModel[] {
  const env = deps.env ?? process.env;
  const home = deps.home ?? mockingbirdHome(env);
  const dir = deps.modelsDir ?? join(home, "models");
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter(isWhisperFile);
  } catch {
    // No models folder yet: `mockingbird models pull` makes it.
  }
  let inUse: string | undefined;
  try {
    const saved = savedSetting(ASR_MODEL_SETTING, home);
    inUse = basename(findAsrModel(dir, env.MOCKINGBIRD_ASR_MODEL, () => {}, saved));
  } catch {
    // None installed: nothing is in use.
  }
  // A ".en" model only knows English, so it's no choice in another language,
  // unless it's the one in use: that is what the startup warning is about.
  if (spokenLanguage(env) !== "en")
    files = files.filter((file) => !englishOnly(file) || file === inUse);
  // An entry that can't be read (a broken link, a file deleted meanwhile) is
  // left out rather than failing the whole list.
  return files
    .flatMap((file) => {
      try {
        return [{ file, size: statSync(join(dir, file)).size }];
      } catch {
        return [];
      }
    })
    .map(({ file, size }) => ({
      name: speechName(file),
      file,
      size,
      inUse: file === inUse,
      isDefault: file === DEFAULT_ASR_MODEL,
    }))
    .sort((a, b) => b.size - a.size);
}

/**
 * `mockingbird models` lists the Whisper models; `models use <file>` picks
 * the one transcription uses, and `models use --default` goes back.
 */
export function modelsCommand(args: string[], deps: ModelsDeps = {}): number {
  const env = deps.env ?? process.env;
  const home = deps.home ?? mockingbirdHome(env);
  const out = deps.out ?? ((l: string) => console.log(l));
  const log = deps.log ?? ((m: string) => console.error(m));

  if (args.length === 0) {
    const models = listModels(deps);
    if (models.length === 0) {
      out("No transcription model yet. `mockingbird models pull` downloads one.");
      return 0;
    }
    const width = Math.max(...models.map((m) => m.file.length)) + 2;
    out(`${"model".padEnd(width)}size`);
    for (const m of models) {
      const mark = [m.inUse && "in use", m.isDefault && "default"].filter(Boolean).join(", ");
      out(`${m.file.padEnd(width)}${gb(m.size).padEnd(9)}${mark}`.trimEnd());
    }
    out("\nSwitch with `mockingbird models use <file>`; `--default` goes back.");
    return 0;
  }

  const [verb, choice, ...extra] = args;
  if (verb !== "use" || !choice || extra.length > 0) {
    log("usage: mockingbird models | models use <file> | models use --default | models pull");
    return 2;
  }
  let model: string | undefined;
  if (choice !== "--default") {
    const dir = deps.modelsDir ?? join(home, "models");
    if (!isWhisperFile(choice) || !existsSync(join(dir, choice))) {
      log(`${choice} isn't in ${dir}. \`mockingbird models\` lists the ones that are.`);
      return 1;
    }
    model = choice;
  }
  withStore((store) => store.setSetting(ASR_MODEL_SETTING, model), home, log);
  log(`transcription model: ${model ?? "the default"}`);
  if (env.MOCKINGBIRD_ASR_MODEL) {
    log(
      `note: MOCKINGBIRD_ASR_MODEL=${env.MOCKINGBIRD_ASR_MODEL} is set in this shell and wins over this choice.`,
    );
  }
  return 0;
}
