import { concatSamples, type PcmAudio, RingBuffer } from "@mockingbird/audio";

export type RecorderOptions = {
  sampleRate?: number;
  /** Rolling history kept while idle. */
  bufferMs?: number;
  /** Audio from before start() included in the recording, so the first word isn't clipped. */
  preRollMs?: number;
  /** Recordings stop growing past this length. */
  maxRecordingMs?: number;
};

export type Recording = { audio: PcmAudio; truncated: boolean };

type Session = { chunks: Int16Array[]; samples: number; truncated: boolean };

/** Holds a rolling buffer of microphone audio and cuts recordings out of it. */
export class Recorder {
  private readonly ring: RingBuffer;
  private readonly sampleRate: number;
  private readonly preRoll: number;
  private readonly maxSamples: number;
  private session: Session | undefined;

  constructor({
    sampleRate = 16000,
    bufferMs = 30_000,
    preRollMs = 300,
    maxRecordingMs = 120_000,
  }: RecorderOptions = {}) {
    this.sampleRate = sampleRate;
    this.ring = new RingBuffer(Math.round((bufferMs / 1000) * sampleRate));
    this.preRoll = Math.round((preRollMs / 1000) * sampleRate);
    this.maxSamples = Math.round((maxRecordingMs / 1000) * sampleRate);
  }

  get recording(): boolean {
    return this.session !== undefined;
  }

  get recordedMs(): number {
    return this.session ? Math.round((this.session.samples / this.sampleRate) * 1000) : 0;
  }

  push(samples: Int16Array): void {
    this.ring.write(samples);
    const session = this.session;
    if (!session || session.truncated) return;
    const room = this.maxSamples - session.samples;
    const kept = samples.length > room ? samples.subarray(0, room) : samples;
    session.chunks.push(kept);
    session.samples += kept.length;
    if (kept.length < samples.length) session.truncated = true;
  }

  start(): void {
    if (this.session) return;
    const preRoll = this.ring.read(this.ring.end - this.preRoll);
    this.session = { chunks: [preRoll], samples: preRoll.length, truncated: false };
  }

  stop(): Recording | undefined {
    const session = this.session;
    this.session = undefined;
    if (!session) return undefined;
    return {
      audio: { sampleRate: this.sampleRate, samples: concatSamples(session.chunks) },
      truncated: session.truncated,
    };
  }

  cancel(): void {
    this.session = undefined;
  }
}
