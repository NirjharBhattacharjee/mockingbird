import type { AsrEngine } from "@mockingbird/asr";
import { durationMs, normalizeLoudness, type PcmAudio } from "@mockingbird/audio";
import {
  type AppStyle,
  acceptCleanup,
  applyCorrections,
  buildCleanupPrompt,
  buildVocabularyPrompt,
  type DictionaryEntry,
  formatText,
  type GateOptions,
  type LlmProvider,
  shouldSkipLlm,
} from "@mockingbird/llm";
import { type SpeechSegment, trimToSpeech } from "@mockingbird/vad";

export type PipelineDeps = {
  detectSpeech: (audio: PcmAudio) => Promise<SpeechSegment[]>;
  asr: AsrEngine;
  llm: LlmProvider;
  dictionary?: DictionaryEntry[];
  /** Give Whisper the dictionary before it listens. Off by default: it can distort other names. */
  vocabularyHint?: boolean;
  gate?: GateOptions;
};

export type LlmOutcome = "skipped" | "cleaned" | "rejected" | "failed";

/** Field names mirror the `utterance` table in docs/DATABASE.md §3. */
export type PipelineResult = {
  rawText: string;
  finalText: string;
  durationMs: number;
  vadMs: number;
  asrMs: number | null;
  llmMs: number | null;
  llmOutcome: LlmOutcome;
  llmError?: string;
  asrModel: string;
  llmModel: string | null;
};

const elapsed = (start: number) => Math.round(performance.now() - start);

/** One-line timing summary, e.g. "speech 4.5s · vad 17ms · asr 201ms · cleanup 1645ms". */
export function describeTimings(result: PipelineResult): string {
  const parts = [
    `speech ${(result.durationMs / 1000).toFixed(1)}s`,
    `vad ${result.vadMs}ms`,
    `asr ${result.asrMs ?? "-"}ms`,
  ];
  if (result.llmOutcome === "cleaned") parts.push(`cleanup ${result.llmMs}ms`);
  else if (result.asrMs !== null) parts.push(`cleanup ${result.llmOutcome}`);
  return parts.join(" · ");
}

export async function runPipeline(
  { audio, style = "default" }: { audio: PcmAudio; style?: AppStyle },
  deps: PipelineDeps,
): Promise<PipelineResult> {
  const base = { durationMs: durationMs(audio), asrModel: deps.asr.model };

  // A quiet voice is missed by both the VAD and Whisper, so the level is
  // brought up before either sees it.
  const heard = normalizeLoudness(audio);

  let t = performance.now();
  const segments = await deps.detectSpeech(heard);
  const vadMs = elapsed(t);

  // Whisper hallucinates text ("Thank you.") on silence, so never send it any.
  if (segments.length === 0) {
    return {
      ...base,
      rawText: "",
      finalText: "",
      vadMs,
      asrMs: null,
      llmMs: null,
      llmOutcome: "skipped",
      llmModel: null,
    };
  }

  t = performance.now();
  const asr = await deps.asr.transcribe(trimToSpeech(heard, segments), {
    vocabulary: deps.vocabularyHint ? buildVocabularyPrompt(deps.dictionary ?? []) : undefined,
  });
  const asrMs = elapsed(t);
  const dictionary = deps.dictionary ?? [];
  const common = { ...base, rawText: asr.text, vadMs, asrMs };

  if (shouldSkipLlm(asr, deps.gate)) {
    return {
      ...common,
      finalText: applyCorrections(formatText(asr.text, style), dictionary),
      llmMs: null,
      llmOutcome: "skipped",
      llmModel: null,
    };
  }

  t = performance.now();
  let cleaned: string;
  try {
    cleaned = await deps.llm.complete(
      buildCleanupPrompt({ text: asr.text, dictionary: deps.dictionary, style }),
    );
  } catch (error) {
    // Degrade, don't break: a dead LLM still leaves usable raw dictation.
    return {
      ...common,
      finalText: applyCorrections(formatText(asr.text, style), dictionary),
      llmMs: elapsed(t),
      llmOutcome: "failed",
      llmError: String(error),
      llmModel: deps.llm.model,
    };
  }
  const llmMs = elapsed(t);
  const accepted = acceptCleanup(asr.text, cleaned);

  return {
    ...common,
    finalText: applyCorrections(formatText(accepted ? cleaned : asr.text, style), dictionary),
    llmMs,
    llmOutcome: accepted ? "cleaned" : "rejected",
    llmModel: deps.llm.model,
  };
}
