import { type PcmAudio, toFloat32 } from "@mockingbird/audio";
import * as ort from "onnxruntime-node";

export const SAMPLE_RATE = 16000;
export const WINDOW_SAMPLES = 512;
// Silero v5 expects the tail of the previous window prepended to each new one.
const CONTEXT_SAMPLES = 64;

export class SileroVad {
  private state = new Float32Array(2 * 1 * 128);
  private context = new Float32Array(CONTEXT_SAMPLES);
  private readonly sr = new ort.Tensor("int64", BigInt64Array.from([BigInt(SAMPLE_RATE)]), []);

  private constructor(private readonly session: ort.InferenceSession) {}

  static async load(modelPath: string): Promise<SileroVad> {
    return new SileroVad(await ort.InferenceSession.create(modelPath));
  }

  reset(): void {
    this.state = new Float32Array(2 * 1 * 128);
    this.context = new Float32Array(CONTEXT_SAMPLES);
  }

  async probability(window: Float32Array): Promise<number> {
    if (window.length !== WINDOW_SAMPLES) {
      throw new RangeError(`expected ${WINDOW_SAMPLES} samples, got ${window.length}`);
    }
    const input = new Float32Array(CONTEXT_SAMPLES + WINDOW_SAMPLES);
    input.set(this.context, 0);
    input.set(window, CONTEXT_SAMPLES);

    const out = await this.session.run({
      input: new ort.Tensor("float32", input, [1, input.length]),
      state: new ort.Tensor("float32", this.state, [2, 1, 128]),
      sr: this.sr,
    });

    const { output, stateN } = out;
    if (!output || !stateN) throw new Error("Silero VAD returned no output/stateN tensor");
    this.state = new Float32Array(stateN.data as Float32Array);
    this.context = window.slice(WINDOW_SAMPLES - CONTEXT_SAMPLES);
    return (output.data as Float32Array)[0] ?? 0;
  }

  async close(): Promise<void> {
    await this.session.release();
  }
}

export type SpeechSegment = { startSample: number; endSample: number };

export type SpeechOptions = {
  threshold?: number;
  minSilenceMs?: number;
  minSpeechMs?: number;
  speechPadMs?: number;
};

export async function detectSpeech(
  vad: SileroVad,
  audio: PcmAudio,
  // 300ms padding matches the capture pre-roll; less clips soft word onsets like "um".
  { threshold = 0.5, minSilenceMs = 300, minSpeechMs = 150, speechPadMs = 300 }: SpeechOptions = {},
): Promise<SpeechSegment[]> {
  if (audio.sampleRate !== SAMPLE_RATE) {
    throw new RangeError(`Silero VAD needs ${SAMPLE_RATE} Hz audio, got ${audio.sampleRate}`);
  }
  const perMs = SAMPLE_RATE / 1000;
  const samples = toFloat32(audio.samples);
  const negThreshold = threshold - 0.15;
  const segments: SpeechSegment[] = [];

  vad.reset();
  let start: number | undefined;
  let silenceStart: number | undefined;

  for (let pos = 0; pos + WINDOW_SAMPLES <= samples.length; pos += WINDOW_SAMPLES) {
    const p = await vad.probability(samples.subarray(pos, pos + WINDOW_SAMPLES));

    if (p >= threshold) {
      silenceStart = undefined;
      start ??= pos;
    } else if (start !== undefined && p < negThreshold) {
      silenceStart ??= pos;
      if (pos - silenceStart >= minSilenceMs * perMs) {
        segments.push({ startSample: start, endSample: silenceStart });
        start = undefined;
        silenceStart = undefined;
      }
    }
  }
  if (start !== undefined) segments.push({ startSample: start, endSample: samples.length });

  const pad = speechPadMs * perMs;
  return segments
    .filter((s) => s.endSample - s.startSample >= minSpeechMs * perMs)
    .map((s) => ({
      startSample: Math.max(0, s.startSample - pad),
      endSample: Math.min(samples.length, s.endSample + pad),
    }));
}

export function trimToSpeech(audio: PcmAudio, segments: SpeechSegment[]): PcmAudio {
  const first = segments[0];
  const last = segments.at(-1);
  if (!first || !last) return { ...audio, samples: new Int16Array(0) };
  return { ...audio, samples: audio.samples.slice(first.startSample, last.endSample) };
}
