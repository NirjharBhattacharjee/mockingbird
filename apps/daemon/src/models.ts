import {
  accessSync,
  closeSync,
  constants,
  createReadStream,
  existsSync,
  linkSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { withStore } from "./dictionary.ts";
import {
  ASR_MODEL_SETTING,
  DEFAULT_ASR_MODEL,
  englishOnly,
  findAsrModel,
  isWhisperFile,
  languageModels,
  mockingbirdHome,
  pinnedWhisper,
  savedModelFor,
  spokenLanguage,
  WHISPER_BUILD,
  WHISPER_LANGUAGES,
} from "./runtime.ts";

/** `name` is what the progress line calls it; `bytes` is its size, shown before a download. */
export type ModelFile = { name: string; file: string; url: string; sha256: string; bytes?: number };

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
    bytes: 1_081_140_203,
  },
  {
    name: "VAD",
    file: "silero_vad.onnx",
    url: "https://github.com/snakers4/silero-vad/raw/v6.2.2/src/silero_vad/data/silero_vad.onnx",
    sha256: "1a153a22f4509e292a94e67d6f9b85e8deb25b4988682b7e174c65279d8788e3",
    bytes: 2_327_524,
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
  // Named for the checksum it's heading for, so a partial of another
  // version of the file is never continued into this one.
  const part = `${path}.${model.sha256.slice(0, 12)}.part`;
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
 * The only network calls mockingbird makes (ARCHITECTURE.md §9) are this,
 * the Whisper and VAD models, and pullChrome. Each runs when the user asks
 * for it and says where each download comes from.
 */
export async function pullModels(deps: PullDeps = {}): Promise<number> {
  const log = deps.log ?? ((m: string) => console.error(m));
  const home = deps.home ?? mockingbirdHome();
  await pullFiles(deps.files ?? MODEL_FILES, deps.modelsDir ?? join(home, "models"), deps);
  log("All models are downloaded.");
  return 0;
}

async function pullFiles(files: ModelFile[], dir: string, deps: PullDeps) {
  const log = deps.log ?? ((m: string) => console.error(m));
  let shown = 0;
  for (const model of files) {
    const progress = (done: number, total: number) => {
      if (Date.now() - shown < 250) return;
      shown = Date.now();
      deps.progress?.(progressLine([{ name: model.name, done, total }]));
    };
    try {
      await pullFile(model, dir, { fetch: deps.fetch, log, onProgress: progress });
    } finally {
      // A pull that has ended leaves the line straight away, so the last
      // thing shown is never a stale byte count.
      deps.progress?.("");
    }
  }
}

/**
 * The headless Chrome that `motion` renders HTML pages in. One version,
 * checked against its sha256, so a page renders the same on every machine.
 * Chrome for Testing publishes no checksums; these are of the zips as
 * downloaded on 2026-11-04.
 */
export const CHROME_VERSION = "156.0.8078.80";
const CHROME_BUILDS: Record<string, { platform: string; sha256: string }> = {
  "darwin-arm64": {
    platform: "mac-arm64",
    sha256: "ea615baa2e9caf0d02d1898a6562b5f8fa9c35239707dae0f592178df5b986ac",
  },
  "darwin-x64": {
    platform: "mac-x64",
    sha256: "535d417d9034cbd11e7dacd1a71aa3d6e1b525e6d5dcd2671eb2532f01481228",
  },
  // Downloaded on 2026-11-05 (#157). Chrome for Testing has no Linux arm64 build.
  "linux-x64": {
    platform: "linux64",
    sha256: "547dcd374e02961bf998f6046a267644f8502225c36bb78ca307dab32a0b3eb4",
  },
  "win32-x64": {
    platform: "win64",
    sha256: "10a77466005e7f64e00f1a75fd1ea81f4a38a60093c65fea6895843b26e60a9a",
  },
};

/**
 * The pinned Chrome for this computer: its zip, the folder it unpacks to in
 * `~/.mockingbird/bin`, and the program in it. None for a platform that has
 * no pin yet.
 */
export function pinnedChrome(
  home = mockingbirdHome(),
  system = `${process.platform}-${process.arch}`,
) {
  const build = CHROME_BUILDS[system];
  if (!build) return undefined;
  const name = `chrome-headless-shell-${build.platform}`;
  const dir = join(home, "bin", `chrome-headless-shell-${CHROME_VERSION}`);
  const zip: ModelFile = {
    name: "Chrome",
    file: `${name}-${CHROME_VERSION}.zip`,
    url: `https://storage.googleapis.com/chrome-for-testing-public/${CHROME_VERSION}/${build.platform}/${name}.zip`,
    sha256: build.sha256,
  };
  const exe = system.startsWith("win32") ? ".exe" : "";
  return { zip, dir, program: join(dir, name, `chrome-headless-shell${exe}`) };
}

/** Whether `path` is a file this process may run. */
function runnable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** The Chrome to render in: MOCKINGBIRD_CHROME, or the pinned one once it's pulled. */
export function findChrome(env = process.env, home = mockingbirdHome(env)): string | undefined {
  if (env.MOCKINGBIRD_CHROME)
    return runnable(env.MOCKINGBIRD_CHROME) ? env.MOCKINGBIRD_CHROME : undefined;
  const program = pinnedChrome(home)?.program;
  return program && existsSync(program) ? program : undefined;
}

/**
 * `mockingbird models pull chrome`: downloads the pinned Chrome, unpacks it
 * into `~/.mockingbird/bin`, and removes any other version found there.
 */
export async function pullChrome(deps: PullDeps = {}): Promise<number> {
  const log = deps.log ?? ((m: string) => console.error(m));
  const home = deps.home ?? mockingbirdHome();
  const pin = pinnedChrome(home);
  if (!pin) {
    log(`There's no pinned Chrome for ${process.platform}-${process.arch} yet.`);
    return 1;
  }
  const bin = dirname(pin.dir);
  mkdirSync(bin, { recursive: true });
  // One pull at a time: two would share the download and the unpacking folder.
  const lock = join(bin, ".chrome-pull.lock");
  const holder = takeLock(lock);
  if (holder) {
    log(`Another \`mockingbird models pull chrome\` (pid ${holder}) is running; wait for it.`);
    return 1;
  }
  try {
    await installChrome(pin, bin, deps);
  } finally {
    rmSync(lock, { force: true });
  }
  log(`Chrome ${CHROME_VERSION} is downloaded.`);
  return 0;
}

/**
 * Takes the lock file at `lock` for this process, or returns the pid of the
 * running one that holds it. The pid is written before the lock appears (a
 * hard link fails if the name is taken), so it's never seen empty. A lock
 * whose process has gone is taken over.
 * ponytail: two pulls taking over the same stale lock at once can both win.
 */
function takeLock(lock: string): number | undefined {
  const mine = `${lock}.${process.pid}`;
  writeFileSync(mine, String(process.pid));
  try {
    for (;;) {
      try {
        linkSync(mine, lock);
        return undefined;
      } catch (error) {
        // Taken: see who by. Anything else (a read-only folder, say) won't change by trying again.
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
      let holder = 0;
      try {
        holder = Number(readFileSync(lock, "utf8"));
      } catch {
        continue; // released meanwhile: try again
      }
      if (alive(holder)) return holder;
      rmSync(lock, { force: true });
    }
  } finally {
    rmSync(mine, { force: true });
  }
}

/** Whether a process with this pid is running. */
function alive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: it's there, run by someone else.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function installChrome(
  pin: NonNullable<ReturnType<typeof pinnedChrome>>,
  bin: string,
  deps: PullDeps,
) {
  if (!existsSync(pin.program)) {
    await pullFiles([pin.zip], bin, deps);
    const zip = join(bin, pin.zip.file);
    // Unpacked beside the target and renamed into place, so a half-unpacked Chrome is never found.
    const unpacking = `${pin.dir}.part`;
    rmSync(unpacking, { recursive: true, force: true });
    // Windows has no unzip; its own tar.exe reads zips (not Git Bash's GNU tar, which can't).
    mkdirSync(unpacking, { recursive: true });
    const unzip = Bun.spawnSync(
      process.platform === "win32"
        ? [
            join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe"),
            "-xf",
            zip,
            "-C",
            unpacking,
          ]
        : ["unzip", "-q", zip, "-d", unpacking],
      { stderr: "pipe" },
    );
    if (unzip.exitCode !== 0) {
      rmSync(unpacking, { recursive: true, force: true });
      throw new Error(`couldn't unpack ${zip}: ${unzip.stderr.toString().trim()}`);
    }
    rmSync(pin.dir, { recursive: true, force: true });
    renameSync(unpacking, pin.dir);
    rmSync(zip, { force: true });
  }
  for (const old of readdirSync(bin)) {
    if (old.startsWith("chrome-headless-shell-") && join(bin, old) !== pin.dir) {
      rmSync(join(bin, old), { recursive: true, force: true });
    }
  }
}

/**
 * `mockingbird models pull` on Linux and Windows also downloads whisper-server
 * and unpacks it into `~/.mockingbird/bin`. Returns 0 where there's no pin
 * (macOS: Homebrew's).
 */
export async function pullWhisper(deps: PullDeps & { force?: boolean } = {}): Promise<number> {
  const log = deps.log ?? ((m: string) => console.error(m));
  const home = deps.home ?? mockingbirdHome();
  const pin = pinnedWhisper(home);
  if (!pin) return 0;
  // A plain `models pull` keeps one that's there; `models pull whisper-server`
  // unpacks it again, to repair a damaged one.
  if (existsSync(pin.program) && !deps.force) {
    log(`whisper-server ${WHISPER_BUILD} is downloaded`);
    return 0;
  }
  const bin = join(home, "bin");
  mkdirSync(bin, { recursive: true });
  // One pull at a time: two would share the download and the unpacking folder.
  const lock = join(bin, ".whisper-pull.lock");
  const holder = takeLock(lock);
  if (holder) {
    log(`Another \`mockingbird models pull\` (pid ${holder}) is running; wait for it.`);
    return 1;
  }
  try {
    await pullFiles([pin.archive], bin, deps);
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
    // The one there stays until the new one is in place.
    const old = `${pin.dir}.old`;
    rmSync(old, { recursive: true, force: true });
    if (existsSync(pin.dir)) renameSync(pin.dir, old);
    try {
      renameSync(unpacking, pin.dir);
    } catch (error) {
      if (existsSync(old)) renameSync(old, pin.dir);
      throw error;
    }
    rmSync(old, { recursive: true, force: true });
    rmSync(archive, { force: true });
  } finally {
    rmSync(lock, { force: true });
  }
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
    const saved = savedModelFor(spokenLanguage(env), home);
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

const USAGE =
  "usage: mockingbird models | models use <file> [--language <code>] | models use --default [--language <code>]\n" +
  "       models pull [<name or URL> [--sha256 <hex>] [--as <ggml-name.bin>]]";

/** Where `models pull <name>` finds an official model: whisper.cpp's own Hugging Face repo. */
const OFFICIAL = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/";

/**
 * A model to download, from a name (`large-v3-turbo`, `ggml-small.bin`) or
 * an https URL, with the sha256 it must match (#143). Hugging Face gives a
 * file's sha256 and the commit it's at in its headers, so a name or a
 * Hugging Face URL needs nothing else, and the download is pinned to that
 * commit. Any other URL needs `sha256`.
 */
export async function resolveModel(
  spec: string,
  { sha256, as, fetch: get = fetch }: { sha256?: string; as?: string; fetch?: typeof fetch } = {},
): Promise<ModelFile & { bytes?: number }> {
  const url = /^https?:\/\//.test(spec)
    ? // A Hugging Face page link (/blob/) is the viewer; /resolve/ is the file.
      spec.replace(/^(https:\/\/(?:huggingface\.co|hf\.co)\/[^/]+\/[^/]+)\/blob\//, "$1/resolve/")
    : `${OFFICIAL}ggml-${spec.replace(/^ggml-/, "").replace(/\.bin$/, "")}.bin`;
  if (!url.startsWith("https://"))
    throw new Error(`${spec}: only https downloads, so the file can't be swapped on the way`);
  const file = as ?? decodeURIComponent(basename(new URL(url).pathname));
  if (!isWhisperFile(file)) {
    throw new Error(
      `${file} isn't named like a Whisper model; give it a name with --as ggml-<name>.bin`,
    );
  }
  if (sha256 !== undefined && !/^[0-9a-f]{64}$/i.test(sha256)) {
    throw new Error(`--sha256 takes the 64 hex digits of the file's SHA-256`);
  }
  // Not followed: Hugging Face's own reply carries the checksum, the CDN's doesn't.
  const head = await get(url, { method: "HEAD", redirect: "manual" });
  if (head.status === 404 || head.status === 401)
    throw new Error(`no model at ${url} (HTTP ${head.status})`);
  // Only Hugging Face's own reply is trusted for a checksum: any server can
  // send these headers, and one that names its own sha256 proves nothing.
  const fromHf = ["huggingface.co", "hf.co"].includes(new URL(url).host);
  const linked = fromHf ? head.headers.get("x-linked-etag")?.replace(/"/g, "") : undefined;
  const known = linked && /^[0-9a-f]{64}$/i.test(linked) ? linked.toLowerCase() : undefined;
  if (sha256 && known && sha256.toLowerCase() !== known) {
    throw new Error(`${url}'s SHA-256 is ${known}, not the ${sha256} given`);
  }
  const expected = sha256?.toLowerCase() ?? known;
  if (!expected) {
    throw new Error(
      `${url} doesn't say its SHA-256; give the one its publisher lists with --sha256`,
    );
  }
  const commit = fromHf ? head.headers.get("x-repo-commit") : null;
  return {
    name: speechName(file),
    file,
    // Pinned to the commit checked, whatever branch or tag the link named.
    url:
      commit && /^[0-9a-f]{7,40}$/.test(commit)
        ? url.replace(/\/resolve\/[^/]+\//, `/resolve/${commit}/`)
        : url,
    sha256: expected,
    bytes: Number(head.headers.get("x-linked-size")) || undefined,
  };
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
    const mapped = languageModels(home);
    if (mapped.length) {
      out("\nBy language:");
      for (const [language, file] of mapped) out(`  ${language.padEnd(4)}${file}`);
    }
    out(
      "\nSwitch with `mockingbird models use <file>` (`--language <code>` for one language);" +
        " `--default` goes back.",
    );
    return 0;
  }

  // Read as MOCKINGBIRD_LANGUAGE is: lower case, region dropped (de-DE is de).
  const language = args.includes("--language")
    ? args[args.indexOf("--language") + 1]?.toLowerCase().split(/[-_]/)[0]
    : undefined;
  const rest = language
    ? args.filter(
        (_, i) => i !== args.indexOf("--language") && i !== args.indexOf("--language") + 1,
      )
    : args;
  const [verb, choice, ...extra] = rest;
  if (verb !== "use" || !choice || extra.length > 0 || (args.includes("--language") && !language)) {
    log(USAGE);
    return 2;
  }
  if (language && !WHISPER_LANGUAGES.has(language)) {
    log(`${language} isn't a language Whisper knows; use a code like bn, de or hi.`);
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
  const key = language ? `${ASR_MODEL_SETTING}.${language}` : ASR_MODEL_SETTING;
  withStore((store) => store.setSetting(key, model), home, log);
  log(
    language
      ? `transcription model for ${language}: ${model ?? "the one for every language"}`
      : `transcription model: ${model ?? "the default"}`,
  );
  if (env.MOCKINGBIRD_ASR_MODEL) {
    log(
      `note: MOCKINGBIRD_ASR_MODEL=${env.MOCKINGBIRD_ASR_MODEL} is set in this shell and wins over this choice.`,
    );
  }
  return 0;
}
