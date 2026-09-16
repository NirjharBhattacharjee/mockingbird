export type PcmAudio = {
  sampleRate: number;
  samples: Int16Array;
};

export class WavFormatError extends Error {
  override name = "WavFormatError";
}

function fourCC(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

export function decodeWav(bytes: Uint8Array): PcmAudio {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 12 || fourCC(view, 0) !== "RIFF" || fourCC(view, 8) !== "WAVE") {
    throw new WavFormatError("not a RIFF/WAVE file");
  }

  let sampleRate: number | undefined;
  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const id = fourCC(view, offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;

    if (id === "fmt ") {
      const format = view.getUint16(body, true);
      const channels = view.getUint16(body + 2, true);
      const bitsPerSample = view.getUint16(body + 14, true);
      if (format !== 1 || channels !== 1 || bitsPerSample !== 16) {
        throw new WavFormatError(
          `expected mono 16-bit PCM, got format=${format} channels=${channels} bits=${bitsPerSample}`,
        );
      }
      sampleRate = view.getUint32(body + 4, true);
    } else if (id === "data") {
      if (sampleRate === undefined) throw new WavFormatError("data chunk before fmt chunk");
      const end = Math.min(body + size, bytes.byteLength);
      const samples = new Int16Array(Math.floor((end - body) / 2));
      for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(body + i * 2, true);
      return { sampleRate, samples };
    }

    // RIFF chunks are word-aligned: odd sizes carry one pad byte.
    offset = body + size + (size % 2);
  }
  throw new WavFormatError("no data chunk");
}

export function encodeWav({ sampleRate, samples }: PcmAudio): Uint8Array {
  const dataSize = samples.length * 2;
  const bytes = new Uint8Array(44 + dataSize);
  const view = new DataView(bytes.buffer);
  const writeFourCC = (offset: number, s: string) => {
    for (let i = 0; i < 4; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeFourCC(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeFourCC(8, "WAVE");
  writeFourCC(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeFourCC(36, "data");
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < samples.length; i++) view.setInt16(44 + i * 2, samples[i] ?? 0, true);
  return bytes;
}

export async function readWavFile(path: string): Promise<PcmAudio> {
  return decodeWav(new Uint8Array(await Bun.file(path).arrayBuffer()));
}

export function toFloat32(samples: Int16Array): Float32Array {
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = (samples[i] ?? 0) / 32768;
  return out;
}

export function durationMs({ sampleRate, samples }: PcmAudio): number {
  return Math.round((samples.length / sampleRate) * 1000);
}
