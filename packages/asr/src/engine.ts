import type { PcmAudio } from "@mockingbird/audio";

export type AsrWord = { word: string; startMs: number; endMs: number; probability: number };

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
