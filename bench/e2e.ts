/**
 * Scores what the user actually gets: each clip of bench/corpus.ts through
 * VAD, a Whisper model and a cleanup model, by `runPipeline` itself, for
 * every pair asked for. Each model on its own is scored by bench:models and
 * bench:cleanup; this one catches the errors they make together.
 *
 *   bun run bench:e2e                                   # the defaults
 *   bun run bench:e2e --speech ggml-large-v3-turbo-q5_0.bin --cleanup qwen2.5:1.5b --cleanup gemma3:1b
 *
 * The transcript is scored against the words spoken, and the final text
 * against what the cleanup should make of them (`cleaned`, else the sentence
 * as written): word error before and after cleanup, exact matches
 * (punctuation, capitals and line breaks too), and names spelled right. No dictionary, so names measure the models alone. Time runs from
 * the end of the clip to the final text, warm.
 */
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { parseArgs } from "node:util";
import { type PipelineDeps, runPipeline } from "../apps/daemon/src/pipeline.ts";
import { DEFAULT_ASR_MODEL, DEFAULT_LLM_MODEL } from "../apps/daemon/src/runtime.ts";
// bench/ isn't a workspace, so the packages are imported by path.
import { startWhisperServer } from "../packages/asr/src/index.ts";
import { readWavFile } from "../packages/audio/src/index.ts";
import { OllamaProvider } from "../packages/llm/src/index.ts";
import { detectSpeech, SileroVad } from "../packages/vad/src/index.ts";
import { corpus, pct, wordErrors } from "./corpus.ts";

const { values } = parseArgs({
  options: {
    speech: { type: "string", multiple: true },
    cleanup: { type: "string", multiple: true },
  },
});
const PORT = Number(process.env.MOCKINGBIRD_BENCH_PORT ?? 8794);
const OLLAMA = process.env.MOCKINGBIRD_LLM_URL ?? "http://127.0.0.1:11434";
const models = join(process.env.MOCKINGBIRD_HOME ?? join(homedir(), ".mockingbird"), "models");
const speechModels = (values.speech ?? [DEFAULT_ASR_MODEL]).map((f) =>
  f.includes("/") ? f : join(models, f),
);
const cleanupModels = values.cleanup ?? [DEFAULT_LLM_MODEL];

const clips = corpus();
const audio = await Promise.all(clips.map((c) => readWavFile(c.wav)));
const vad = await SileroVad.load(join(models, "silero_vad.onnx"));

console.log(
  `${clips.length} clips: ${new Set(clips.map((c) => c.voice.name)).size} voices x ${new Set(clips.map((c) => c.sentence.text)).size} sentences\n`,
);
console.log(
  "| Speech | Cleanup | WER raw | WER final | Exact | Names | Median | p90 | Cleaned / skipped / rejected |",
);
console.log("|---|---|---|---|---|---|---|---|---|");

const percent = (e: { edits: number; words: number }) =>
  `${((e.edits / e.words) * 100).toFixed(1)}%`;

for (const modelPath of speechModels) {
  const speech = basename(modelPath, ".bin").replace(/^ggml-/, "");
  const whisper = await startWhisperServer({ modelPath, port: PORT, readyTimeoutMs: 120_000 });
  try {
    for (const cleanup of cleanupModels) {
      const deps: PipelineDeps = {
        detectSpeech: (pcm) => detectSpeech(vad, pcm),
        asr: whisper.engine,
        llm: new OllamaProvider(OLLAMA, cleanup, 60_000),
      };
      const first = audio[0];
      if (first) await runPipeline({ audio: first }, deps); // warm both models
      const raw = { edits: 0, words: 0 };
      const final = { edits: 0, words: 0 };
      const outcomes = { cleaned: 0, skipped: 0, rejected: 0, failed: 0 };
      const times: number[] = [];
      let exact = 0;
      let names = 0;
      let namesRight = 0;
      for (const [i, clip] of clips.entries()) {
        const pcm = audio[i];
        if (!pcm) continue;
        const t = performance.now();
        const result = await runPipeline({ audio: pcm }, deps);
        times.push(performance.now() - t);
        outcomes[result.llmOutcome]++;
        const expected = clip.sentence.cleaned ?? clip.sentence.text;
        for (const [total, reference, text] of [
          [raw, clip.sentence.text, result.rawText],
          [final, expected, result.finalText],
        ] as const) {
          const e = wordErrors(reference, text);
          total.edits += e.edits;
          total.words += e.words;
        }
        if (result.finalText === expected) exact++;
        for (const name of clip.sentence.names) {
          names++;
          // Whole words only: "Xiaomingo" isn't "Xiaoming".
          if (new RegExp(`\\b${name}\\b`).test(result.finalText)) namesRight++;
        }
      }
      const failed = outcomes.failed ? ` / ${outcomes.failed} failed` : "";
      console.log(
        `| ${speech} | ${cleanup} | ${percent(raw)} | ${percent(final)} | ${exact}/${clips.length} | ${namesRight}/${names} | ${Math.round(pct(times, 0.5))} ms | ${Math.round(pct(times, 0.9))} ms | ${outcomes.cleaned} / ${outcomes.skipped} / ${outcomes.rejected}${failed} |`,
      );
    }
  } finally {
    // Always, so one failing pair doesn't leave a server on the port for the next.
    await whisper.stop();
  }
}
await vad.close();
