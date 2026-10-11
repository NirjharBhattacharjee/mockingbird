import { createReadStream, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { isLocalUrl, ollamaRunning, pullOllamaModel, startOllamaServer } from "@mockingbird/llm";
import { DEFAULT_ASR_MODEL, DEFAULT_LLM_MODEL } from "./runtime.ts";

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
  log(`downloading ${model.file}\n  from ${model.url}`);
  const response = await get(model.url);
  if (!response.ok || !response.body) {
    throw new Error(`couldn't download ${model.file}: HTTP ${response.status}`);
  }
  // A temporary name first, so an interrupted download isn't mistaken for a model.
  const part = `${path}.part`;
  const writer = Bun.file(part).writer();
  const total = Number(response.headers.get("content-length")) || 0;
  let done = 0;
  try {
    for await (const chunk of response.body) {
      writer.write(chunk);
      done += chunk.byteLength;
      onProgress(done, total);
    }
  } finally {
    await writer.end();
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
  const llmModel = deps.llmModel ?? env.MOCKINGBIRD_LLM_MODEL ?? DEFAULT_LLM_MODEL;
  const modelsDir = deps.modelsDir ?? join(home, "models");
  const downloads = new Map<string, Download>();
  let shown = 0;
  const progress = (name: string) => (done: number, total: number) => {
    downloads.set(name, { name, done, total });
    if (deps.progress && Date.now() - shown >= 250) {
      shown = Date.now();
      deps.progress(progressLine([...downloads.values()]));
    }
  };

  // The files and the cleanup model come from different servers, so they
  // download side by side: the wait is the longest one, not the sum. Both
  // finish before anything is reported, so a failure never leaves the other
  // half-written or an Ollama we started still running.
  const files = (async () => {
    for (const model of deps.files ?? MODEL_FILES) {
      await pullFile(model, modelsDir, {
        fetch: deps.fetch,
        log,
        onProgress: progress(model.name),
      });
    }
  })();
  const [pulled, code] = await Promise.allSettled([
    files,
    pullCleanupModel(llmUrl, llmModel, deps, log, progress("cleanup model")),
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
