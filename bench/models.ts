/**
 * Compares Whisper model files on this Mac: warm transcription time and what
 * each one heard. Warm is the number that matters — the daemon keeps
 * whisper-server running, so only the first dictation after a restart pays
 * the model load.
 *
 *   bun run bench:models                          # every model in ~/.mockingbird/models
 *   bun run bench:models ggml-base.en.bin ...     # only these
 *   MOCKINGBIRD_BENCH_CLIPS=a.wav,b.wav bun run bench:models
 */
import { readdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
// bench/ isn't a workspace, so the packages are imported by path.
import { startWhisperServer } from "../packages/asr/src/index.ts";
import { durationMs, normalizeLoudness, readWavFile } from "../packages/audio/src/index.ts";

const RUNS = 3;
const PORT = Number(process.env.MOCKINGBIRD_BENCH_PORT ?? 8794);
const models = join(process.env.MOCKINGBIRD_HOME ?? join(homedir(), ".mockingbird"), "models");

const clips = (process.env.MOCKINGBIRD_BENCH_CLIPS ?? "")
  .split(",")
  .map((c) => c.trim())
  .filter(Boolean);
const wavs = clips.length
  ? clips
  : ["hello", "short"].map((name) => join(import.meta.dir, "fixtures", `${name}.wav`));

const asked = process.argv.slice(2);
const files = (
  asked.length
    ? asked
    : readdirSync(models).filter((f) => f.startsWith("ggml-") && f.endsWith(".bin"))
).map((f) => (f.includes("/") ? f : join(models, f)));

const median = (ns: number[]) => [...ns].sort((a, b) => a - b)[Math.floor(ns.length / 2)] ?? 0;

for (const modelPath of files) {
  const loadStart = performance.now();
  let whisper: Awaited<ReturnType<typeof startWhisperServer>>;
  try {
    whisper = await startWhisperServer({ modelPath, port: PORT, readyTimeoutMs: 120_000 });
  } catch (error) {
    console.log(`${basename(modelPath)}: ${error instanceof Error ? error.message : error}`);
    continue;
  }
  const loadMs = Math.round(performance.now() - loadStart);
  console.log(`\n${basename(modelPath)}  (ready in ${(loadMs / 1000).toFixed(1)}s)`);

  for (const wav of wavs) {
    const audio = normalizeLoudness(await readWavFile(wav));
    const times: number[] = [];
    let text = "";
    for (let i = 0; i < RUNS; i++) {
      const started = performance.now();
      const result = await whisper.engine.transcribe(audio);
      times.push(Math.round(performance.now() - started));
      text = result.text;
    }
    const speech = (durationMs(audio) / 1000).toFixed(1);
    console.log(`  ${basename(wav)} (${speech}s): ${median(times)}ms  ${JSON.stringify(text)}`);
  }
  await whisper.stop();
}
