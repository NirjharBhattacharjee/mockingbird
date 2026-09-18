import { rms } from "@mockingbird/audio";
import type { Recorder, Recording } from "./recorder.ts";

export type KeyAction = "quit" | undefined;

const METER_WIDTH = 10;

export function meter(level: number): string {
  // sqrt spreads normal speech levels (~0.02–0.2 RMS) across the bar.
  const filled = Math.min(METER_WIDTH, Math.round(Math.sqrt(level) * METER_WIDTH * 2));
  return "▮".repeat(filled) + "▯".repeat(METER_WIDTH - filled);
}

/**
 * Push-to-talk from the keyboard: Enter/Space starts and stops a recording,
 * Esc cancels it, q or Ctrl+C quits. One recording is processed at a time.
 */
export type ListenHints = { start: string; stop: string };

export class ListenController {
  private level = 0;
  private heardMic = false;
  private pending: Promise<void> | undefined;

  constructor(
    private readonly recorder: Recorder,
    private readonly handle: (recording: Recording) => Promise<void>,
    private readonly onError: (error: unknown) => void,
    private readonly hints: ListenHints = {
      start: "Enter: start speaking · q: quit",
      stop: "Enter: stop · Esc: cancel",
    },
  ) {}

  get busy(): boolean {
    return this.pending !== undefined;
  }

  onSamples(samples: Int16Array): void {
    this.recorder.push(samples);
    this.level = rms(samples);
    this.heardMic = true;
  }

  key(key: string): KeyAction {
    switch (key) {
      case "\x03":
      case "q":
      case "Q":
        return "quit";
      case "\r":
      case "\n":
      case " ":
        this.toggle();
        return undefined;
      case "\x1b":
        this.cancelRecording();
        return undefined;
      default:
        return undefined;
    }
  }

  /** Resolves when the recording being processed (if any) is done. */
  async settled(): Promise<void> {
    await this.pending;
  }

  status(): string {
    if (this.pending) return "… transcribing";
    if (this.recorder.recording) {
      const seconds = (this.recorder.recordedMs / 1000).toFixed(1);
      return `● recording ${seconds}s  ${meter(this.level)}  ${this.hints.stop}`;
    }
    if (!this.heardMic) return "○ waiting for the microphone (allow access if macOS asks)...";
    return `○ ready  ${meter(this.level)}  ${this.hints.start}`;
  }

  startRecording(): void {
    if (!this.pending) this.recorder.start();
  }

  /** Stops and transcribes; ignored if nothing is being recorded. */
  stopRecording(): void {
    if (this.pending || !this.recorder.recording) return;
    const recording = this.recorder.stop();
    if (!recording) return;
    this.process(recording);
  }

  cancelRecording(): void {
    this.recorder.cancel();
  }

  private toggle(): void {
    if (this.pending) return;
    if (!this.recorder.recording) {
      this.recorder.start();
      return;
    }
    const recording = this.recorder.stop();
    if (!recording) return;
    this.process(recording);
  }

  private process(recording: Recording): void {
    this.pending = this.handle(recording)
      .catch(this.onError)
      .finally(() => {
        this.pending = undefined;
      });
  }
}
