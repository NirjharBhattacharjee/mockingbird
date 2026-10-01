import { createReadStream, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { isLocalUrl, ollamaRunning, startOllamaServer } from "@mockingbird/llm";
import { DEFAULT_ASR_MODEL, DEFAULT_LLM_MODEL } from "./runtime.ts";

export type ModelFile = { file: string; url: string; sha256: string };

/**
 * What `mockingbird models pull` downloads. Each one is pinned to a fixed
 * version and checked against its sha256, so a changed, truncated or corrupt
 * file is downloaded again rather than loaded.
 */
export const MODEL_FILES: ModelFile[] = [
  {
    file: DEFAULT_ASR_MODEL,
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-large-v3-q5_0.bin",
    sha256: "d75795ecff3f83b5faa89d1900604ad8c780abd5739fae406de19f23ecd98ad1",
  },
  {
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
};

/**
 * Downloads one model into `dir`, unless a file with the right checksum is
 * already there. Returns whether it downloaded anything.
 */
export async function pullFile(
  model: ModelFile,
  dir: string,
  { fetch: get = fetch, log = () => {} }: PullFileDeps = {},
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
  try {
    for await (const chunk of response.body) writer.write(chunk);
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
  /** Pulls the cleanup model into a running Ollama. Returns the exit code. */
  ollamaPull?: (model: string, url: string) => Promise<number>;
  /** Injected in tests; the pinned list otherwise. */
  files?: ModelFile[];
  modelsDir?: string;
};

const runOllamaPull = async (model: string, url: string): Promise<number> => {
  // The ollama CLI finds its server through OLLAMA_HOST.
  const proc = Bun.spawn(["ollama", "pull", model], {
    env: { ...process.env, OLLAMA_HOST: url },
    stdout: "inherit",
    stderr: "inherit",
  });
  return proc.exited;
};

/**
 * The only network call mockingbird makes (ARCHITECTURE.md §9): the Whisper
 * and VAD models, then the cleanup model through Ollama. It runs when the
 * user asks for it and says where each download comes from.
 */
export async function pullModels(deps: PullDeps = {}): Promise<number> {
  const env = process.env;
  const log = deps.log ?? ((m: string) => console.error(m));
  const home = deps.home ?? env.MOCKINGBIRD_HOME ?? join(homedir(), ".mockingbird");
  const llmUrl = deps.llmUrl ?? env.MOCKINGBIRD_LLM_URL ?? "http://127.0.0.1:11434";
  const llmModel = deps.llmModel ?? env.MOCKINGBIRD_LLM_MODEL ?? DEFAULT_LLM_MODEL;

  const modelsDir = deps.modelsDir ?? join(home, "models");
  for (const model of deps.files ?? MODEL_FILES) {
    await pullFile(model, modelsDir, { fetch: deps.fetch, log });
  }

  log(`pulling the cleanup model ${llmModel} through Ollama at ${llmUrl}`);
  let stop: (() => Promise<void>) | undefined;
  if (!(await ollamaRunning(llmUrl))) {
    // Only start a server on this Mac: anything else would put Ollama on the network.
    if (!isLocalUrl(llmUrl)) {
      log(`No Ollama answers at ${llmUrl}. Start it there, then run this again.`);
      return 1;
    }
    if (Bun.which("ollama") === null) {
      log("Ollama isn't installed. Install it with `brew install ollama`, then run this again.");
      return 1;
    }
    stop = (await startOllamaServer({ baseUrl: llmUrl })).stop;
  }
  try {
    const code = await (deps.ollamaPull ?? runOllamaPull)(llmModel, llmUrl);
    if (code !== 0) {
      log(`\`ollama pull ${llmModel}\` failed (exit ${code}).`);
      return 1;
    }
  } finally {
    await stop?.();
  }
  log("All models are downloaded.");
  return 0;
}
