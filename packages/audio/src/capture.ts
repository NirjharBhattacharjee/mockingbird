import { Pcm16Decoder } from "./pcm.ts";

export type AudioDevice = { index: number; name: string };

/** Parses the audio section of `ffmpeg -f avfoundation -list_devices true -i ""`. */
export function parseAudioDevices(ffmpegOutput: string): AudioDevice[] {
  const devices: AudioDevice[] = [];
  let inAudio = false;
  for (const line of ffmpegOutput.split("\n")) {
    if (/AVFoundation audio devices:/.test(line)) inAudio = true;
    else if (/AVFoundation video devices:/.test(line)) inAudio = false;
    else if (inAudio) {
      const match = /\]\s*\[(\d+)\]\s+(.+?)\s*$/.exec(line);
      if (match?.[1] && match[2]) devices.push({ index: Number(match[1]), name: match[2] });
    }
  }
  return devices;
}

export async function listAudioDevices(ffmpeg = "ffmpeg"): Promise<AudioDevice[]> {
  // Listing always "fails" because there's no input; the device list is on stderr.
  const proc = Bun.spawn(
    [ffmpeg, "-hide_banner", "-f", "avfoundation", "-list_devices", "true", "-i", ""],
    { stdin: "ignore", stdout: "ignore", stderr: "pipe" },
  );
  const [stderr] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
  return parseAudioDevices(stderr);
}

/**
 * ffmpeg input arguments for a macOS microphone. `device` is an index from
 * listAudioDevices, a device name, or "default" for the system input device.
 */
export function micInputArgs(device = "default"): string[] {
  return ["-f", "avfoundation", "-i", `:${device}`];
}

export type CaptureProcess = {
  exited: Promise<number>;
  stop(): Promise<void>;
  /** The last ~2 KB of ffmpeg's error output. */
  stderrTail(): string;
};

export type CaptureOptions = {
  onSamples: (samples: Int16Array) => void;
  inputArgs?: string[];
  ffmpeg?: string;
  sampleRate?: number;
};

/** Starts ffmpeg and streams mono PCM16 samples to `onSamples` until it exits. */
export function startCapture({
  onSamples,
  inputArgs = micInputArgs(),
  ffmpeg = "ffmpeg",
  sampleRate = 16000,
}: CaptureOptions): CaptureProcess {
  let proc: ReturnType<typeof Bun.spawn<"ignore", "pipe", "pipe">>;
  try {
    proc = Bun.spawn(
      [
        ffmpeg,
        // -nostdin: the listen command owns the terminal's keyboard input.
        ...["-nostdin", "-hide_banner", "-loglevel", "error", ...inputArgs],
        ...["-f", "s16le", "-acodec", "pcm_s16le", "-ac", "1", "-ar", String(sampleRate), "-"],
      ],
      { stdin: "ignore", stdout: "pipe", stderr: "pipe" },
    );
  } catch (error) {
    const message = `could not run ${ffmpeg}: ${String(error)}`;
    return { exited: Promise.resolve(-1), stop: async () => {}, stderrTail: () => message };
  }

  let tail = "";
  const pumped = (async () => {
    const decoder = new Pcm16Decoder();
    for await (const chunk of proc.stdout) {
      const samples = decoder.push(chunk);
      if (samples.length) onSamples(samples);
    }
  })();
  const drained = (async () => {
    const text = new TextDecoder();
    for await (const chunk of proc.stderr) {
      tail = (tail + text.decode(chunk, { stream: true })).slice(-2000);
    }
  })();

  const exited = (async () => {
    const code = await proc.exited;
    await Promise.all([pumped, drained]);
    return code;
  })();

  return {
    exited,
    stop: async () => {
      proc.kill();
      await exited;
    },
    stderrTail: () => tail.trim(),
  };
}
