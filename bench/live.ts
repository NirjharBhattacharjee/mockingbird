/**
 * How long a dictation takes to come back once the user lets go, with and
 * without transcribing while they speak. Each clip is replayed in real time,
 * as the microphone would deliver it, through the real VAD and Whisper.
 *
 *   bun run bench:live                              # bench/voice/*.wav and the fixtures
 *   bun run bench:live a.wav b.wav
 *   MOCKINGBIRD_ASR_MODEL=ggml-large-v3-turbo-q8_0.bin bun run bench:live
 */
import { readdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { LiveTranscriber } from "../apps/daemon/src/live-transcriber.ts";
import { type PipelineDeps, runPipeline } from "../apps/daemon/src/pipeline.ts";
import { DEFAULT_ASR_MODEL } from "../apps/daemon/src/runtime.ts";
// bench/ isn't a workspace, so the packages are imported by path.
import { startWhisperServer } from "../packages/asr/src/index.ts";
import {
  concatSamples,
  durationMs,
  type PcmAudio,
  readWavFile,
} from "../packages/audio/src/index.ts";
import type { LlmProvider } from "../packages/llm/src/index.ts";
import { detectSpeech, SileroVad } from "../packages/vad/src/index.ts";

const PORT = Number(process.env.MOCKINGBIRD_BENCH_PORT ?? 8795);
const CHUNK_MS = 100;
const home = process.env.MOCKINGBIRD_HOME ?? join(homedir(), ".mockingbird");
const voice = join(import.meta.dir, "voice");
const asked = process.argv.slice(2);
const wavs = asked.length
  ? asked
  : [
      ...readdirSync(voice)
        .filter((f) => f.endsWith(".wav"))
        .map((f) => join(voice, f)),
      join(import.meta.dir, "fixtures", "hello.wav"),
    ];

// Cleanup is left out on purpose: this measures transcription, and compares
// what Whisper wrote (rawText) either way.
const passThrough: LlmProvider = {
  model: "none",
  // Empty is rejected, so the pipeline keeps the transcript.
  complete: async () => "",
  health: async () => true,
};

const vad = await SileroVad.load(join(home, "models", "silero_vad.onnx"));
const whisper = await startWhisperServer({
  modelPath: join(home, "models", process.env.MOCKINGBIRD_ASR_MODEL ?? DEFAULT_ASR_MODEL),
  port: PORT,
  readyTimeoutMs: 120_000,
});
const deps: PipelineDeps = {
  detectSpeech: (audio) => detectSpeech(vad, audio),
  asr: whisper.engine,
  llm: passThrough,
  gate: { maxWords: Number.POSITIVE_INFINITY, minConfidence: 0 },
};

/** Feeds the clip in real time, as the microphone would; resolves at "let go". */
async function replay(audio: PcmAudio, live?: LiveTranscriber): Promise<void> {
  const step = Math.round((CHUNK_MS / 1000) * audio.sampleRate);
  const chunks: Int16Array[] = [];
  let recorded = 0;
  const started = performance.now();
  for (let pos = 0; pos < audio.samples.length; pos += step) {
    const chunk = audio.samples.subarray(pos, pos + step);
    chunks.push(chunk);
    recorded += chunk.length;
    live?.update(recorded, () => ({
      sampleRate: audio.sampleRate,
      samples: concatSamples(chunks),
    }));
    const due = started + ((pos + step) / audio.sampleRate) * 1000;
    await Bun.sleep(Math.max(0, due - performance.now()));
  }
}

const words = (t: string) =>
  t
    .toLowerCase()
    .replace(/[^a-z0-9' ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
/** Word-level edit distance over the reference length. */
function difference(a: string, b: string): number {
  const r = words(a);
  const h = words(b);
  let row = Array.from({ length: h.length + 1 }, (_, j) => j);
  for (let i = 1; i <= r.length; i++) {
    const next = [i];
    for (let j = 1; j <= h.length; j++) {
      next[j] = Math.min(
        (row[j] ?? 0) + 1,
        (next[j - 1] ?? 0) + 1,
        (row[j - 1] ?? 0) + (r[i - 1] === h[j - 1] ? 0 : 1),
      );
    }
    row = next;
  }
  return (row[h.length] ?? 0) / Math.max(1, r.length);
}

try {
  console.log(`model: ${whisper.engine.model}\n`);
  for (const wav of wavs) {
    const audio = await readWavFile(wav);
    const name = `${basename(wav)} (${(durationMs(audio) / 1000).toFixed(1)}s)`;

    await replay(audio);
    let t = performance.now();
    const whole = await runPipeline({ audio }, deps);
    const wholeMs = Math.round(performance.now() - t);

    const minPieceMs = process.env.MOCKINGBIRD_LIVE_MIN_PIECE_MS;
    const live = new LiveTranscriber(
      { detectSpeech: deps.detectSpeech, asr: deps.asr },
      minPieceMs ? { minPieceMs: Number(minPieceMs) } : {},
    );
    await replay(audio, live);
    t = performance.now();
    const pieced = await runPipeline({ audio, live: live.finish() }, deps);
    const liveMs = Math.round(performance.now() - t);

    console.log(name);
    console.log(`  whole recording at the end:  ${String(wholeMs).padStart(5)}ms after letting go`);
    console.log(
      `  transcribed while speaking:  ${String(liveMs).padStart(5)}ms after letting go` +
        `  (${pieced.livePieces} pieces during speech)`,
    );
    console.log(
      `  words that differ: ${(difference(whole.rawText, pieced.rawText) * 100).toFixed(1)}%`,
    );
    if (whole.rawText !== pieced.rawText) {
      console.log(`    whole: ${whole.rawText}`);
      console.log(`    live : ${pieced.rawText}`);
    }
    console.log();
  }
} finally {
  await whisper.stop();
  await vad.close();
}
