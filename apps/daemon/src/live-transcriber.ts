import type { AsrEngine, AsrResult, AsrWord } from "@mockingbird/asr";
import { normalizeLoudness, type PcmAudio } from "@mockingbird/audio";
import { SPEECH_PAD_MS, type SpeechSegment, speechBounds } from "@mockingbird/vad";

export type LiveTranscriberDeps = {
  detectSpeech: (audio: PcmAudio) => Promise<SpeechSegment[]>;
  asr: AsrEngine;
  vocabulary?: string;
};

export type LiveOptions = {
  sampleRate?: number;
  /** Untranscribed audio has to reach this before Whisper is asked. */
  minPieceMs?: number;
  /** How long the user has to have been quiet: transcribing mid-word is wasted. */
  pauseMs?: number;
  /** The padding the VAD adds either side of speech. */
  speechPadMs?: number;
  /** How far a sentence end Whisper reports may sit from a real pause. */
  snapMs?: number;
  /** How often a growing recording is looked at for a pause. */
  checkEveryMs?: number;
};

/** What was transcribed while the user spoke, and where the rest begins. */
export type LiveTranscript = {
  results: AsrResult[];
  fromSample: number;
  /**
   * Whisper's reading of everything from `fromSample` to `toSample`, taken at
   * the last pause. If nothing was said after `toSample`, that's the rest of
   * the dictation, and it needs no second pass.
   */
  pending?: { result: AsrResult; toSample: number };
};

/** Whisper reads at most 224 tokens of prompt; the end of the last sentence is what helps. */
const CONTEXT_CHARS = 200;

/** Whisper ends a sentence with a word like "up." or "going?", quotes aside. */
const SENTENCE_END = /[.?!]["')\]]*$/;

/** The end of what's been said so far, cut at a word, to prompt the next piece with. */
export function contextFrom(results: AsrResult[]): string | undefined {
  const text = results
    .map((r) => r.text)
    .filter(Boolean)
    .join(" ");
  if (!text) return undefined;
  if (text.length <= CONTEXT_CHARS) return text;
  const tail = text.slice(-CONTEXT_CHARS);
  return tail.slice(tail.indexOf(" ") + 1);
}

export type Gap = { start: number; end: number };

/**
 * The silences between speech segments. The VAD pads each segment, so two
 * segments either side of a short pause overlap; the silence itself is what
 * lies between them with the padding taken back off.
 */
export function gapsBetween(segments: SpeechSegment[], pad: number): Gap[] {
  const gaps: Gap[] = [];
  for (let i = 1; i < segments.length; i++) {
    const before = segments[i - 1];
    const after = segments[i];
    if (!before || !after) continue;
    const gap = { start: before.endSample - pad, end: after.startSample + pad };
    if (gap.end > gap.start) gaps.push(gap);
  }
  return gaps;
}

/**
 * Where to commit a transcribed piece: after its last complete sentence, at
 * a real pause. A pause on its own isn't enough. People pause mid-sentence
 * ("with the... with the chat"), and Whisper, handed half a sentence and a
 * prompt, invents words to fill it. So the cut has to be where Whisper ended
 * a sentence and the VAD heard silence, both. Returns how many words to keep
 * and the sample to cut at, or undefined to keep listening.
 */
export function sentenceCut(
  words: AsrWord[],
  gaps: Gap[],
  { offset, sampleRate, snap }: { offset: number; sampleRate: number; snap: number },
): { keep: number; at: number } | undefined {
  const at = (ms: number) => offset + Math.round((ms / 1000) * sampleRate);
  for (let k = words.length - 2; k >= 0; k--) {
    const word = words[k];
    const next = words[k + 1];
    if (!word || !next || !SENTENCE_END.test(word.word.trim())) continue;
    const boundary = at((word.endMs + next.startMs) / 2);
    const gap = gaps.find((g) => g.start - snap <= boundary && boundary <= g.end + snap);
    if (gap) return { keep: k + 1, at: gap.start + Math.floor((gap.end - gap.start) / 2) };
  }
  return undefined;
}

/** The words as one result, as Whisper wrote them. */
function resultOf(words: AsrWord[], confidence: number): AsrResult {
  return {
    text: words
      .map((w) => w.word)
      .join("")
      .trim(),
    confidence,
    words,
  };
}

/**
 * Transcribes a dictation while it is still being spoken, so letting go of
 * Fn leaves little or nothing to transcribe.
 *
 * Whisper is only asked at a pause, about everything not yet committed. Its
 * complete sentences are committed when they end in a real silence; the rest
 * is kept as `pending`, which is the final text if the user lets go without
 * saying more. Nothing is committed at a seam the whole recording wouldn't
 * have had, so a dictation without such a sentence end comes out exactly as
 * it would have before, only no faster.
 */
export class LiveTranscriber {
  private readonly sampleRate: number;
  private readonly minPiece: number;
  private readonly pause: number;
  private readonly pad: number;
  private readonly snap: number;
  private readonly checkEvery: number;
  /** Samples before this are committed. */
  private cut = 0;
  private checkedAt = 0;
  private checking: Promise<void> | undefined;
  private readonly results: AsrResult[] = [];
  private pending: LiveTranscript["pending"];
  private done = false;

  constructor(
    private readonly deps: LiveTranscriberDeps,
    {
      sampleRate = 16000,
      minPieceMs = 10_000,
      pauseMs = 400,
      speechPadMs = SPEECH_PAD_MS,
      snapMs = 300,
      checkEveryMs = 500,
    }: LiveOptions = {},
  ) {
    const samples = (ms: number) => Math.round((ms / 1000) * sampleRate);
    this.sampleRate = sampleRate;
    this.minPiece = samples(minPieceMs);
    this.pause = samples(pauseMs);
    this.pad = samples(speechPadMs);
    this.snap = samples(snapMs);
    this.checkEvery = samples(checkEveryMs);
  }

  /**
   * Called as the recording grows. `snapshot` copies the recording, so it's
   * only called when a check is actually due.
   */
  update(recorded: number, snapshot: () => PcmAudio | undefined): void {
    if (this.done || this.checking) return;
    if (recorded - this.cut < this.minPiece || recorded - this.checkedAt < this.checkEvery) return;
    // Already transcribed up to here at the last pause, and nothing new since.
    if (this.pending && recorded <= this.pending.toSample) return;
    this.checkedAt = recorded;
    const audio = snapshot();
    if (!audio || audio.sampleRate !== this.sampleRate) return;
    this.checking = this.check(audio)
      // A failed check costs speed, not text: the audio stays for the end.
      .catch(() => {})
      .finally(() => {
        this.checking = undefined;
      });
  }

  private async check(audio: PcmAudio): Promise<void> {
    const from = this.cut;
    // Normalized on its own, as the whole recording would be.
    const heard = normalizeLoudness({ ...audio, samples: audio.samples.subarray(from) });
    const segments = await this.deps.detectSpeech(heard);
    const last = segments.at(-1);
    if (!last || this.done) return;
    // Still talking: whatever Whisper made of it now would be thrown away.
    if (heard.samples.length - (last.endSample - this.pad) < this.pause) return;
    const bounds = speechBounds(heard, segments);
    if (!bounds) return;
    const piece = { ...heard, samples: heard.samples.subarray(bounds.start, bounds.end) };
    const { asr, vocabulary } = this.deps;
    const result = await asr.transcribe(piece, { vocabulary, context: contextFrom(this.results) });
    const toSample = from + heard.samples.length;
    const cut = sentenceCut(result.words, gapsBetween(segments, this.pad), {
      offset: bounds.start,
      sampleRate: this.sampleRate,
      snap: this.snap,
    });
    if (!cut) {
      this.pending = { result, toSample };
      return;
    }
    this.results.push(resultOf(result.words.slice(0, cut.keep), result.confidence));
    this.pending = { result: resultOf(result.words.slice(cut.keep), result.confidence), toSample };
    this.cut = from + cut.at;
  }

  /** Waits for a check still in flight, then hands over what's been done. */
  async finish(): Promise<LiveTranscript> {
    this.done = true;
    await this.checking;
    return { results: [...this.results], fromSample: this.cut, pending: this.pending };
  }
}
