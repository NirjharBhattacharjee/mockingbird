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
import { homedir } from "node:os";
import { basename, join } from "node:path";
import {
  isLocalUrl,
  listOllamaModels,
  ollamaRunning,
  pullOllamaModel,
  startOllamaServer,
} from "@mockingbird/llm";
import { openStore } from "@mockingbird/store";
import { ASR_MODEL_SETTING, LLM_MODEL_SETTING, tellDaemon } from "./dictionary.ts";
import {
  cleanupModel,
  DEFAULT_ASR_MODEL,
  DEFAULT_LLM_MODEL,
  findAsrModel,
  isWhisperFile,
  mockingbirdHome,
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
  llmUrl?: string;
  llmModel?: string;
  /** Pulls the cleanup model into a running Ollama, reporting bytes as they arrive. */
  ollamaPull?: (
    url: string,
    model: string,
    onProgress: (done: number, total: number) => void,
  ) => Promise<void>;
  /** Finds a command on the PATH; `Bun.which` unless a test supplies one. */
  which?: (command: string) => string | null;
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
 * terminal: `Whisper ███░░░░░ 0.4/1.1 GB   cleanup model █░░░░░░░ 0.3/2.5 GB`.
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
 * and VAD models, and the cleanup model through Ollama. It runs when the
 * user asks for it and says where each download comes from.
 */
export async function pullModels(deps: PullDeps = {}): Promise<number> {
  const env = process.env;
  const log = deps.log ?? ((m: string) => console.error(m));
  const home = deps.home ?? env.MOCKINGBIRD_HOME ?? join(homedir(), ".mockingbird");
  const llmUrl = deps.llmUrl ?? env.MOCKINGBIRD_LLM_URL ?? "http://127.0.0.1:11434";
  const llmModel = deps.llmModel ?? cleanupModel(savedModel(home), env);
  const modelsDir = deps.modelsDir ?? join(home, "models");
  const downloads = new Map<string, Download>();
  let shown = 0;
  const show = () => {
    shown = Date.now();
    deps.progress?.(progressLine([...downloads.values()]));
  };
  const progress = (name: string) => (done: number, total: number) => {
    downloads.set(name, { name, done, total });
    if (Date.now() - shown >= 250) show();
  };
  // A pull that has ended leaves the line straight away, unthrottled, so the
  // last thing shown is never a stale byte count.
  const tracked = async <T>(name: string, pull: Promise<T>): Promise<T> => {
    try {
      return await pull;
    } finally {
      downloads.delete(name);
      show();
    }
  };

  // The files and the cleanup model come from different servers, so they
  // download side by side: the wait is the longest one, not the sum. Both
  // finish before anything is reported, so a failure never leaves the other
  // half-written or an Ollama we started still running.
  const files = (async () => {
    for (const model of deps.files ?? MODEL_FILES) {
      await tracked(
        model.name,
        pullFile(model, modelsDir, { fetch: deps.fetch, log, onProgress: progress(model.name) }),
      );
    }
  })();
  const [pulled, code] = await Promise.allSettled([
    files,
    tracked(
      "cleanup model",
      pullCleanupModel(llmUrl, llmModel, deps, log, progress("cleanup model")),
    ),
  ]);
  if (pulled.status === "rejected") {
    // Both failed: say why Ollama did too, since only one can be thrown.
    if (code.status === "rejected") log(`and the cleanup model failed: ${code.reason}`);
    throw pulled.reason;
  }
  if (code.status === "rejected") throw code.reason;
  if (code.value !== 0) return code.value;
  log("All models are downloaded.");
  return 0;
}

async function pullCleanupModel(
  llmUrl: string,
  llmModel: string,
  deps: PullDeps,
  log: (message: string) => void,
  onProgress: (done: number, total: number) => void,
): Promise<number> {
  log(`pulling the cleanup model ${llmModel} through Ollama at ${llmUrl}`);
  const running = await ollamaRunning(llmUrl);
  // Only start a server on this Mac: anything else would put Ollama on the network.
  if (!running && !isLocalUrl(llmUrl)) {
    log(`No Ollama answers at ${llmUrl}. Start it there, then run this again.`);
    return 1;
  }
  // Checked even for a running server: without the ollama command this Mac
  // can't start one, so cleanup wouldn't work after the next restart.
  if ((deps.which ?? Bun.which)("ollama") === null) {
    log("Ollama isn't installed. Install it with `brew install ollama`, then run this again.");
    return 1;
  }
  let stop: (() => Promise<void>) | undefined;
  if (!running) {
    stop = (await startOllamaServer({ baseUrl: llmUrl })).stop;
  }
  try {
    await (deps.ollamaPull ?? pullOllamaModel)(llmUrl, llmModel, onProgress);
  } catch (error) {
    log(`Pulling ${llmModel} failed: ${error instanceof Error ? error.message : error}`);
    return 1;
  } finally {
    await stop?.();
  }
  return 0;
}

/**
 * The cleanup eval's pass counts for the models it has measured (MODELS.md
 * §7a: 37 dev cases, 16 held out), so a smaller model's cost shows before
 * switching to it. Any other model shows as not measured.
 */
export const MEASURED: Record<string, { dev: number; holdout: number }> = {
  [DEFAULT_LLM_MODEL]: { dev: 35, holdout: 16 },
  "llama3.2:3b": { dev: 30, holdout: 13 },
  "qwen2.5:1.5b": { dev: 28, holdout: 12 },
  "gemma3:1b": { dev: 26, holdout: 10 },
};

/** A model `mockingbird models use` saved, read without writing to data.db. */
export function savedModel(home = mockingbirdHome(), key = LLM_MODEL_SETTING): string | undefined {
  const path = join(home, "data.db");
  if (!existsSync(path)) return undefined;
  try {
    const store = openStore(path, { readonly: true });
    try {
      return store.setting(key);
    } finally {
      store.close();
    }
  } catch {
    return undefined;
  }
}

export type ModelsDeps = {
  /** Restarts the agent, so the next dictation uses the new model. */
  restart: () => Promise<number>;
  list?: (url: string) => Promise<{ name: string; size: number; writes: boolean }[]>;
  tell?: (path: string, body: string) => Promise<Response>;
  saved?: () => string | undefined;
  savedSpeech?: () => string | undefined;
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

export type ModelListing = {
  cleanup: { name: string; size: number; inUse: boolean; isDefault: boolean }[];
  transcription: { name: string; file: string; size: number; inUse: boolean; isDefault: boolean }[];
  /** Why the cleanup list is empty, when Ollama couldn't be asked. */
  cleanupError?: string;
};

/**
 * Both kinds of model on this Mac, for the picker and the plain list. Cleanup
 * models are the ones Ollama has that write text, best measured first; speech
 * models are the Whisper files in models/. The one in use is what the agent
 * picks at start: the environment, then the saved choice, then the default.
 */
export async function listModels(deps: ModelsDeps): Promise<ModelListing> {
  const env = deps.env ?? process.env;
  const url = env.MOCKINGBIRD_LLM_URL ?? "http://127.0.0.1:11434";
  const cleanupInUse = cleanupModel((deps.saved ?? savedModel)(), env);
  let cleanup: ModelListing["cleanup"] = [];
  let cleanupError: string | undefined;
  try {
    const rank = (n: string) => MEASURED[n]?.dev ?? -1;
    cleanup = (await (deps.list ?? listOllamaModels)(url))
      .filter((m) => m.writes)
      .sort((a, b) => rank(b.name) - rank(a.name) || a.name.localeCompare(b.name))
      .map(({ name, size }) => ({
        name,
        size,
        inUse: name === cleanupInUse,
        isDefault: name === DEFAULT_LLM_MODEL,
      }));
  } catch {
    cleanupError = `Ollama isn't answering at ${url}. \`mockingbird start\` starts it.`;
  }

  const dir = deps.modelsDir ?? join(mockingbirdHome(env), "models");
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter(isWhisperFile);
  } catch {
    // No models folder yet: `mockingbird models pull` makes it.
  }
  let speechInUse: string | undefined;
  try {
    const saved = (deps.savedSpeech ?? (() => savedModel(undefined, ASR_MODEL_SETTING)))();
    speechInUse = basename(findAsrModel(dir, env.MOCKINGBIRD_ASR_MODEL, () => {}, saved));
  } catch {
    // None installed: nothing is in use.
  }
  // Largest first, so the most accurate leads.
  // An entry that can't be read (a broken link, a file deleted meanwhile) is
  // left out rather than failing the whole list.
  const transcription = files
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
      inUse: file === speechInUse,
      isDefault: file === DEFAULT_ASR_MODEL,
    }))
    .sort((a, b) => b.size - a.size);
  return { cleanup, transcription, ...(cleanupError ? { cleanupError } : {}) };
}

/**
 * `mockingbird models` lists both kinds of model (`--json` for the Go
 * command's picker); `models use <name>` switches the cleanup model, `models
 * use speech <file>` the transcription model, and `--default` goes back.
 */
export async function modelsCommand(args: string[], deps: ModelsDeps): Promise<number> {
  const env = deps.env ?? process.env;
  const out = deps.out ?? ((l: string) => console.log(l));
  const log = deps.log ?? ((m: string) => console.error(m));

  if (args.length === 0 || (args.length === 1 && args[0] === "--json")) {
    const listing = await listModels(deps);
    if (args[0] === "--json") {
      out(JSON.stringify(listing));
      return 0;
    }
    const mark = (m: { inUse: boolean; isDefault: boolean }) =>
      [m.inUse && "in use", m.isDefault && "default"].filter(Boolean).join(", ");
    const table = (
      title: string,
      rows: { name: string; size: number; inUse: boolean; isDefault: boolean }[],
    ) => {
      const width = Math.max(title.length, ...rows.map((r) => r.name.length)) + 2;
      out(`${title.padEnd(width)}size`);
      for (const r of rows)
        out(`${r.name.padEnd(width)}${gb(r.size).padEnd(9)}${mark(r)}`.trimEnd());
    };
    if (listing.cleanupError) log(listing.cleanupError);
    else table("cleanup model", listing.cleanup);
    const inUse = cleanupModel((deps.saved ?? savedModel)(), env);
    if (!listing.cleanupError && !listing.cleanup.some((m) => m.inUse)) {
      out(`In use: ${inUse}, which isn't in Ollama yet. \`mockingbird models pull\` gets it.`);
    }
    out("");
    if (listing.transcription.length === 0) {
      out("No transcription model yet. `mockingbird models pull` downloads one.");
    } else {
      table(
        "transcription model",
        listing.transcription.map((t) => ({ ...t, name: t.file })),
      );
    }
    out(
      "\nSwitch with `mockingbird models use <name>` or `mockingbird models use speech <file>`;" +
        " `--default` goes back. In a terminal, `mockingbird models` lets you pick instead.",
    );
    return 0;
  }

  const [verb, name, ...extra] = args;
  const speech = verb === "use" && name === "speech";
  const choice = speech ? extra[0] : name;
  if (verb !== "use" || !choice || extra.length > (speech ? 1 : 0)) {
    log(
      "usage: mockingbird models | models use <name> | models use speech <file> | models use [speech] --default | models pull",
    );
    return 2;
  }
  let model: string | undefined;
  if (speech && choice !== "--default") {
    const dir = deps.modelsDir ?? join(mockingbirdHome(env), "models");
    if (!isWhisperFile(choice) || !existsSync(join(dir, choice))) {
      log(`${choice} isn't in ${dir}. \`mockingbird models\` lists the ones that are.`);
      return 1;
    }
    model = choice;
  } else if (!speech && choice !== "--default") {
    let models: Awaited<ReturnType<NonNullable<ModelsDeps["list"]>>>;
    const url = env.MOCKINGBIRD_LLM_URL ?? "http://127.0.0.1:11434";
    try {
      models = await (deps.list ?? listOllamaModels)(url);
    } catch {
      log(`Ollama isn't answering at ${url}. \`mockingbird start\` starts it.`);
      return 1;
    }
    // "gemma3" means what Ollama calls "gemma3:latest".
    const found = models.find((m) => m.name === choice || m.name === `${choice}:latest`);
    if (!found) {
      log(
        `Ollama doesn't have ${choice}. Pull it with \`ollama pull ${choice}\`, then run this again.`,
      );
      return 1;
    }
    if (!found.writes) {
      log(
        `${found.name} can't write text (it's an embedding model), so it can't clean up dictation.`,
      );
      return 1;
    }
    model = found.name;
  }
  let reply: Response;
  try {
    reply = await (deps.tell ?? ((p, b) => tellDaemon(p, b)))(
      `/settings/${speech ? ASR_MODEL_SETTING : LLM_MODEL_SETTING}`,
      model ?? "",
    );
  } catch {
    log(
      "mockingbird isn't running, so the choice can't be saved. `mockingbird start`, then try again.",
    );
    return 1;
  }
  if (!reply.ok) {
    log(`error: ${await reply.text()}`);
    return 1;
  }
  log(await reply.text());
  const override = speech ? "MOCKINGBIRD_ASR_MODEL" : "MOCKINGBIRD_LLM_MODEL";
  if (env[override]) {
    log(
      `note: ${override}=${env[override]} is set in this shell and wins ` +
        "over this choice. Unset it, then `mockingbird restart`.",
    );
  }
  return deps.restart();
}
