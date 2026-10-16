export type Encoder = {
  /** Mono PCM16 at the encoder's sample rate. Ignored once ffmpeg has gone. */
  write(samples: Int16Array): void;
  /**
   * Ends the input and waits for ffmpeg to write the rest; past `timeoutMs`
   * it kills ffmpeg instead. The file plays up to its last fragment either way.
   */
  finish(timeoutMs?: number): Promise<number>;
  /** Resolves with ffmpeg's exit code, however it ended. */
  exited: Promise<number>;
};

/**
 * Encodes PCM16 to AAC in a fragmented `.m4a` as it arrives. Fragmented, and
 * flushed every packet, so a file cut off by a crash or a kill still plays up
 * to its last fragment (2 s) instead of having no index at all. About 22 MB
 * an hour at 16 kHz mono.
 *
 * With `systemDevice`, ffmpeg also records that device (the system-audio tap)
 * and mixes it in, so a call's other side lands in the same file.
 */
export function startEncoder({
  path,
  sampleRate = 16000,
  ffmpeg = "ffmpeg",
  systemDevice,
}: {
  path: string;
  sampleRate?: number;
  ffmpeg?: string;
  systemDevice?: string;
}): Encoder {
  const proc = Bun.spawn(encoderArgs({ path, sampleRate, ffmpeg, systemDevice }), {
    stdin: "pipe",
    stdout: "ignore",
    stderr: "ignore",
  });
  let open = true;
  const exited = proc.exited.then((code) => {
    open = false;
    return code;
  });
  return {
    write(samples) {
      if (!open) return;
      try {
        proc.stdin.write(new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength));
      } catch {
        open = false; // ffmpeg went away; `exited` says how.
      }
    },
    async finish(timeoutMs = 5000) {
      if (open) {
        open = false;
        // Not awaited: ending can wait on a full pipe, and the timeout below
        // has to cover that too. A rejection means ffmpeg already closed it.
        Promise.resolve()
          .then(() => proc.stdin.end())
          .catch(() => {});
      }
      const late = Symbol();
      const first = await Promise.race([exited, Bun.sleep(timeoutMs).then(() => late)]);
      if (first !== late) return first as number;
      proc.kill("SIGKILL"); // a stalled ffmpeg mustn't hold up mockingbird stopping
      return exited;
    },
    exited,
  };
}

/** ffmpeg's arguments. Separate so the mix can be tested without a device. */
export function encoderArgs({
  path,
  sampleRate,
  ffmpeg,
  systemDevice,
}: {
  path: string;
  sampleRate: number;
  ffmpeg: string;
  systemDevice?: string;
}): string[] {
  const rate = String(sampleRate);
  // The tap is stereo at the output's rate: brought down to the microphone's,
  // then added at full level (amix's default, normalize=1, would halve both).
  // ponytail: no drift correction between the two clocks; measure over an hour if it matters.
  const mix = systemDevice
    ? [
        ...["-f", "avfoundation", "-i", `:${systemDevice}`],
        ...[
          "-filter_complex",
          `[1:a]aresample=${rate},pan=mono|c0=0.5*c0+0.5*c1[s];[0:a][s]amix=inputs=2:duration=first:normalize=0[a]`,
        ],
        ...["-map", "[a]"],
      ]
    : [];
  return [
    ffmpeg,
    ...["-nostdin", "-hide_banner", "-loglevel", "error", "-y"],
    ...["-f", "s16le", "-ar", rate, "-ac", "1", "-i", "pipe:0"],
    ...mix,
    ...["-c:a", "aac", "-b:a", "48k", "-flush_packets", "1", "-frag_duration", "2000000"],
    ...["-movflags", "+frag_keyframe+empty_moov+default_base_moof", "-f", "mp4", path],
  ];
}
