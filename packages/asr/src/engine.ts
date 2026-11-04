import type { PcmAudio } from "@mockingbird/audio";

/**
 * A token, or a word made of tokens. `atMs` is where Whisper's attention put
 * it in the audio (whisper.cpp's DTW timestamps, when the server computes
 * them): a point inside the word, more reliable than `startMs`/`endMs`,
 * which drift by up to half a second over a 30-second window. `atEndMs` is
 * the last token's, for a word of several.
 */
export type AsrWord = {
  word: string;
  startMs: number;
  endMs: number;
  probability: number;
  atMs?: number;
  atEndMs?: number;
};

export type AsrResult = {
  text: string;
  /** Mean probability of spoken (non-punctuation) words, 0..1. */
  confidence: number;
  words: AsrWord[];
};

export type TranscribeOptions = {
  /** Words to expect, so unusual names aren't spelled phonetically. */
  vocabulary?: string;
};

export interface AsrEngine {
  readonly model: string;
  transcribe(audio: PcmAudio, options?: TranscribeOptions): Promise<AsrResult>;
  health(): Promise<boolean>;
}
