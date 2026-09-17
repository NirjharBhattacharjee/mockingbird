/** Turns a stream of little-endian PCM16 bytes into samples, even when chunks split a sample. */
export class Pcm16Decoder {
  private carry: number | undefined;

  push(bytes: Uint8Array): Int16Array {
    const total = bytes.length + (this.carry === undefined ? 0 : 1);
    const out = new Int16Array(Math.floor(total / 2));
    let i = 0;
    let o = 0;
    if (this.carry !== undefined && bytes.length > 0) {
      out[o++] = ((bytes[i++] ?? 0) << 8) | this.carry;
      this.carry = undefined;
    }
    for (; i + 1 < bytes.length; i += 2) {
      out[o++] = ((bytes[i + 1] ?? 0) << 8) | (bytes[i] ?? 0);
    }
    if (i < bytes.length) this.carry = bytes[i];
    return out;
  }
}

/** Root-mean-square level, 0..1. */
export function rms(samples: Int16Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (const s of samples) sum += s * s;
  return Math.sqrt(sum / samples.length) / 32768;
}

export function peak(samples: Int16Array): number {
  let max = 0;
  for (const s of samples) max = Math.max(max, Math.abs(s));
  return max / 32768;
}

export function concatSamples(chunks: Int16Array[]): Int16Array {
  const out = new Int16Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}
