import { type AsrEngine, type AsrResult, joinResults } from "@mockingbird/asr";
import { durationMs, normalizeLoudness, type PcmAudio } from "@mockingbird/audio";
import {
  type AppStyle,
  acceptCleanup,
  applyCorrections,
  buildCleanupPrompt,
  buildVocabularyPrompt,
  bulletize,
  correctNames,
  type DictionaryEntry,
  formatText,
  type GateOptions,
  type LlmProvider,
  shouldSkipLlm,
} from "@mockingbird/llm";
import { SPEECH_PAD_MS, type SpeechSegment, trimToSpeech } from "@mockingbird/vad";
import { contextFrom, type LiveTranscript } from "./live-transcriber.ts";

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
  /** Pieces transcribed while the user was still speaking. */
  livePieces: number;
};

const elapsed = (start: number) => Math.round(performance.now() - start);

/** One-line timing summary, e.g. "speech 4.5s · vad 17ms · asr 201ms · cleanup 1645ms". */
export function describeTimings(result: PipelineResult): string {
  const parts = [
    `speech ${(result.durationMs / 1000).toFixed(1)}s`,
    `vad ${result.vadMs}ms`,
    `asr ${result.asrMs ?? "-"}ms`,
  ];
  if (result.livePieces > 0) parts.push(`${result.livePieces} transcribed while speaking`);
  if (result.llmOutcome === "cleaned") parts.push(`cleanup ${result.llmMs}ms`);
  else if (result.asrMs !== null) parts.push(`cleanup ${result.llmOutcome}`);
  return parts.join(" · ");
}

export async function runPipeline(
  {
    audio,
    style = "default",
    live,
  }: {
    audio: PcmAudio;
    style?: AppStyle;
    /** What a LiveTranscriber already did with the start of this recording. */
    live?: Promise<LiveTranscript>;
  },
  deps: PipelineDeps,
): Promise<PipelineResult> {
  // Waiting for pieces still in flight is time spent on ASR after the user
  // stopped speaking, so it counts towards asrMs.
  let t = performance.now();
  const early = live ? await live : { results: [], fromSample: 0 };
  const waitedMs = elapsed(t);
  const rest = early.fromSample
    ? { ...audio, samples: audio.samples.subarray(early.fromSample) }
    : audio;
  const base = {
    durationMs: durationMs(audio),
    asrModel: deps.asr.model,
    livePieces: early.results.length,
  };

  // A quiet voice is missed by both the VAD and Whisper, so the level is
  // brought up before either sees it.
  const heard = normalizeLoudness(rest);

  t = performance.now();
  const segments = await deps.detectSpeech(heard);
  const vadMs = elapsed(t);
  const saidEarlier = [...early.results, early.pending?.result].some((r) => r?.text);

  // Whisper hallucinates text ("Thank you.") on silence, so never send it any.
  if (segments.length === 0 && !saidEarlier) {
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
  // Transcribed at the user's last pause, and nothing said after it: done.
  const pending = early.pending;
  const pad = (SPEECH_PAD_MS / 1000) * audio.sampleRate;
  const spokeAfter =
    pending && segments.some((s) => s.endSample - pad > pending.toSample - early.fromSample);
  const last: AsrResult[] =
    pending && !spokeAfter
      ? [pending.result]
      : segments.length
        ? [
            await deps.asr.transcribe(trimToSpeech(heard, segments), {
              vocabulary: deps.vocabularyHint
                ? buildVocabularyPrompt(deps.dictionary ?? [])
                : undefined,
              context: contextFrom(early.results),
            }),
          ]
        : [];
  const asrMs = waitedMs + elapsed(t);
  const asr = joinResults([...early.results, ...last]);
  const dictionary = deps.dictionary ?? [];
  /** Formatting, then the dictionary: replacements first, then names by sound. */
  const finish = (text: string) =>
    correctNames(
      applyCorrections(
        formatText(style === "terminal" ? text : bulletize(text), style),
        dictionary,
      ),
      dictionary,
    );
  const common = { ...base, rawText: asr.text, vadMs, asrMs };

  if (shouldSkipLlm(asr, deps.gate)) {
    return {
      ...common,
      finalText: finish(asr.text),
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
      finalText: finish(asr.text),
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
    finalText: finish(accepted ? cleaned : asr.text),
    llmMs,
    llmOutcome: accepted ? "cleaned" : "rejected",
    llmModel: deps.llm.model,
  };
}
