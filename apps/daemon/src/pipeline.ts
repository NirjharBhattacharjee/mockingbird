import type { AsrEngine, AsrResult } from "@mockingbird/asr";
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
  dropLastWords,
  formatPartial,
  formatText,
  type GateOptions,
  holdBack,
  type LlmProvider,
  rawRemainder,
  shouldSkipLlm,
  verifiedPrefix,
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

/**
 * Receives the final text in order, in one piece or several, as soon as each
 * is ready; the pieces joined are `finalText`. The next piece waits for the
 * returned promise, so typing them can't interleave.
 */
export type OnText = (piece: string) => Promise<void>;

export async function runPipeline(
  { audio, style = "default" }: { audio: PcmAudio; style?: AppStyle },
  deps: PipelineDeps,
  onText?: OnText,
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
  return { ...base, rawText: asr.text, vadMs, asrMs, ...(await cleanUp(asr, deps, style, onText)) };
}

export type CleanupDeps = Pick<PipelineDeps, "llm" | "dictionary" | "gate">;

export type CleanupResult = Pick<
  PipelineResult,
  "finalText" | "llmMs" | "llmOutcome" | "llmError" | "llmModel"
>;

/**
 * Everything after Whisper: the gate, the cleanup model, the checks on what
 * it returned, formatting and the dictionary. Exported so the eval suite
 * (evals/cleanup) scores exactly what the app types.
 *
 * With `onText`, prose is handed over while the model is still writing it:
 * the words `verifiedPrefix` lets through, formatted, the moment they are
 * written. The rest follows once the cleanup is done and checked. If the
 * check rejects it after some has gone out, the transcript carries on from
 * where the typed words left off, so nothing typed has to be taken back and
 * the rest of what the user said still arrives. Words the model left out of
 * the typed part stay out; `verifiedPrefix` allows at most five in a row.
 * Typing also pauses where a dictionary term would change a word, so what's
 * typed is always the model's text, lined up with the transcript. A list's heading is the model's word,
 * not the user's, so a list is typed whole; in the rare case the model writes
 * one item per line with no markers and `bulletize` makes the list, the first
 * line will have gone out already and the rest follows as a sentence.
 */
export async function cleanUp(
  asr: Pick<AsrResult, "text" | "confidence">,
  deps: CleanupDeps,
  style: AppStyle = "default",
  onText?: OnText,
): Promise<CleanupResult> {
  const dictionary = deps.dictionary ?? [];
  /** The dictionary: replacements first, then names by sound. */
  const correct = (text: string) => correctNames(applyCorrections(text, dictionary), dictionary);
  const finish = (text: string) =>
    correct(formatText(style === "terminal" ? text : bulletize(text), style));

  let typed = "";
  /** Hands over whatever `text` adds to what's gone out already. */
  const send = async (text: string) => {
    if (!onText || text.length <= typed.length || !text.startsWith(typed)) return;
    await onText(text.slice(typed.length));
    typed = text;
  };

  if (shouldSkipLlm(asr, deps.gate)) {
    const finalText = finish(asr.text);
    await send(finalText);
    return { finalText, llmMs: null, llmOutcome: "skipped", llmModel: null };
  }

  const prompt = buildCleanupPrompt({ text: asr.text, dictionary, style });
  const t = performance.now();
  let cleaned = "";
  let failure: string | undefined;
  try {
    // A terminal is left to the whole, checked cleanup: there a stray word is a command.
    if (onText && deps.llm.stream && style === "default") {
      const held = holdBack(dictionary);
      for await (const piece of deps.llm.stream(prompt)) {
        cleaned += piece;
        // Typed as the model wrote it, and only as far as the dictionary
        // leaves it alone, so `rawRemainder` can line it up with the transcript.
        const verified = formatPartial(verifiedPrefix(asr.text, cleaned));
        const ready = dropLastWords(verified, held);
        if (correct(verified).startsWith(ready)) await send(ready);
      }
      cleaned = cleaned.trim();
    } else {
      cleaned = await deps.llm.complete(prompt);
    }
  } catch (error) {
    // Degrade, don't break: a dead LLM still leaves usable raw dictation.
    failure = String(error);
  }
  const llmMs = elapsed(t);
  const accepted = failure === undefined && acceptCleanup(asr.text, cleaned);
  let finalText = finish(accepted ? cleaned : asr.text);
  if (!finalText.startsWith(typed)) {
    // Rejected, or the model died, after part of its cleanup was typed.
    const rest = rawRemainder(asr.text, typed);
    const joined = finish(`${typed} ${rest}`);
    finalText = joined.startsWith(typed) ? joined : `${typed} ${rest}`.trim();
  }
  await send(finalText);
  return {
    finalText,
    llmMs,
    llmOutcome: failure !== undefined ? "failed" : accepted ? "cleaned" : "rejected",
    ...(failure !== undefined && { llmError: failure }),
    llmModel: deps.llm.model,
  };
}
