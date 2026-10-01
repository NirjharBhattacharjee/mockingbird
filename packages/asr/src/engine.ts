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
  /**
   * What was said just before this audio, when a long dictation is
   * transcribed in pieces. Whisper carries punctuation and capitals across
   * the cut from it, as it does between its own 30s windows.
   */
  context?: string;
};

export interface AsrEngine {
  readonly model: string;
  transcribe(audio: PcmAudio, options?: TranscribeOptions): Promise<AsrResult>;
  health(): Promise<boolean>;
}
