import { type PcmAudio, readWavFile, WavFormatError } from "./wav.ts";

export class AudioDecodeError extends Error {
  override name = "AudioDecodeError";
}

export type DecodeOptions = { ffmpeg?: string; sampleRate?: number };

export async function decodeWithFfmpeg(
  path: string,
  { ffmpeg = "ffmpeg", sampleRate = 16000 }: DecodeOptions = {},
): Promise<PcmAudio> {
  let proc: ReturnType<typeof Bun.spawn<"ignore", "pipe", "pipe">>;
  try {
    proc = Bun.spawn(
      [
        ffmpeg,
        ...["-nostdin", "-hide_banner", "-loglevel", "error", "-i", path],
        ...["-f", "s16le", "-acodec", "pcm_s16le", "-ac", "1", "-ar", String(sampleRate), "-"],
      ],
      { stdin: "ignore", stdout: "pipe", stderr: "pipe" },
    );
  } catch (error) {
    throw new AudioDecodeError(`could not run ${ffmpeg}: ${String(error)}`);
  }

  const [pcm, stderr, code] = await Promise.all([
    new Response(proc.stdout).arrayBuffer(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new AudioDecodeError(`ffmpeg exited with ${code}: ${stderr.trim()}`);
  return { sampleRate, samples: new Int16Array(pcm, 0, Math.floor(pcm.byteLength / 2)) };
}

/** Reads 16 kHz mono PCM16 WAVs directly; converts anything else with ffmpeg. */
export async function loadAudio(path: string, options: DecodeOptions = {}): Promise<PcmAudio> {
  const sampleRate = options.sampleRate ?? 16000;
  try {
    const audio = await readWavFile(path);
    if (audio.sampleRate === sampleRate) return audio;
  } catch (error) {
    if (!(error instanceof WavFormatError)) throw error;
  }
  return decodeWithFfmpeg(path, { ...options, sampleRate });
}
