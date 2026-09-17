/**
 * Fixed-size circular buffer of samples. Positions are absolute: sample n is the
 * n-th sample ever written, so callers can mark a point and read from it later.
 */
export class RingBuffer {
  private readonly data: Int16Array;
  private total = 0;

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new RangeError(`capacity must be a positive integer, got ${capacity}`);
    }
    this.data = new Int16Array(capacity);
  }

  get capacity(): number {
    return this.data.length;
  }

  /** Absolute position one past the newest sample (= samples ever written). */
  get end(): number {
    return this.total;
  }

  /** Absolute position of the oldest sample still held. */
  get start(): number {
    return Math.max(0, this.total - this.data.length);
  }

  write(samples: Int16Array): void {
    const cap = this.data.length;
    // Only the newest `cap` samples of an oversized write can survive.
    const kept = samples.length > cap ? samples.subarray(samples.length - cap) : samples;
    const offset = (this.total + samples.length - kept.length) % cap;
    const first = Math.min(kept.length, cap - offset);
    this.data.set(kept.subarray(0, first), offset);
    this.data.set(kept.subarray(first), 0);
    this.total += samples.length;
  }

  /** Copies [from, to), clamped to what's still held. */
  read(from: number, to: number = this.total): Int16Array {
    const a = Math.max(from, this.start);
    const b = Math.min(to, this.total);
    if (b <= a) return new Int16Array(0);

    const cap = this.data.length;
    const out = new Int16Array(b - a);
    const offset = a % cap;
    const first = Math.min(out.length, cap - offset);
    out.set(this.data.subarray(offset, offset + first), 0);
    out.set(this.data.subarray(0, out.length - first), first);
    return out;
  }
}
