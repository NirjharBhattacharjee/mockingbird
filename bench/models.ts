/**
 * Compares Whisper model files on this Mac: size on disk, memory while
 * running, warm transcription time, and accuracy (word error rate, and
 * names spelled right) over bench/corpus.ts, 8 voices x 8 sentences.
 *
 *   bun run bench:models                          # every model in ~/.mockingbird/models
 *   bun run bench:models ggml-base.en.bin ...     # only these
 *
 * Warm time is the number that matters: the daemon keeps whisper-server
 * running, so only the first dictation after a restart pays the load.
 */
import { readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
// bench/ isn't a workspace, so the packages are imported by path.
import { startWhisperServer } from "../packages/asr/src/index.ts";
import { normalizeLoudness, readWavFile } from "../packages/audio/src/index.ts";
import { corpus, pct, wer } from "./corpus.ts";

const PORT = Number(process.env.MOCKINGBIRD_BENCH_PORT ?? 8794);
const models = join(process.env.MOCKINGBIRD_HOME ?? join(homedir(), ".mockingbird"), "models");

const asked = process.argv.slice(2);
const files = (
  asked.length
    ? asked
    : readdirSync(models).filter((f) => f.startsWith("ggml-") && f.endsWith(".bin"))
).map((f) => (f.includes("/") ? f : join(models, f)));

const clips = corpus();
const audio = await Promise.all(
  clips.map(async (c) => normalizeLoudness(await readWavFile(c.wav))),
);

const mean = (ns: number[]) => ns.reduce((a, b) => a + b, 0) / Math.max(1, ns.length);

/** Resident memory of the whisper-server on our port, in MB. */
function serverMb(): number {
  const pid = Bun.spawnSync(["pgrep", "-f", `whisper-server.*--port ${PORT}`])
    .stdout.toString()
    .trim()
    .split("\n")[0];
  const kb = Number(
    Bun.spawnSync(["ps", "-o", "rss=", "-p", pid ?? ""])
      .stdout.toString()
      .trim(),
  );
  return Math.round(kb / 1024);
}

console.log(
  `${clips.length} clips: ${new Set(clips.map((c) => c.voice.name)).size} voices x ${new Set(clips.map((c) => c.sentence.text)).size} sentences\n`,
);
console.log("| Model | Disk | Ready | Memory | Median | p90 | WER | WER en_IN | Names |");
console.log("|---|---|---|---|---|---|---|---|---|");

for (const modelPath of files) {
  const started = performance.now();
  let whisper: Awaited<ReturnType<typeof startWhisperServer>>;
  try {
    whisper = await startWhisperServer({ modelPath, port: PORT, readyTimeoutMs: 120_000 });
  } catch (error) {
    console.log(
      `| ${basename(modelPath)} | failed to start: ${error instanceof Error ? error.message : error} |`,
    );
    continue;
  }
  const readyS = (performance.now() - started) / 1000;
  const first = audio[0];
  if (first) await whisper.engine.transcribe(first); // warm

  const times: number[] = [];
  const errors: number[] = [];
  const errorsIn: number[] = [];
  let names = 0;
  let namesRight = 0;
  for (const [i, clip] of clips.entries()) {
    const pcm = audio[i];
    if (!pcm) continue;
    const t = performance.now();
    const { text } = await whisper.engine.transcribe(pcm);
    times.push(performance.now() - t);
    const e = wer(clip.sentence.text, text);
    errors.push(e);
    if (clip.voice.accent === "en_IN") errorsIn.push(e);
    for (const name of clip.sentence.names) {
      names++;
      if (text.includes(name)) namesRight++;
    }
  }
  const memory = serverMb();
  await whisper.stop();
  const ms = (n: number) => `${Math.round(n)} ms`;
  const percent = (n: number) => `${(n * 100).toFixed(1)}%`;
  console.log(
    `| ${basename(modelPath, ".bin").replace(/^ggml-/, "")} | ${Math.round(statSync(modelPath).size / 1e6)} MB | ${readyS.toFixed(1)} s | ${memory} MB | ${ms(pct(times, 0.5))} | ${ms(pct(times, 0.9))} | ${percent(mean(errors))} | ${percent(mean(errorsIn))} | ${namesRight}/${names} |`,
  );
}
