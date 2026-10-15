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
 */
export function startEncoder({
  path,
  sampleRate = 16000,
  ffmpeg = "ffmpeg",
}: {
  path: string;
  sampleRate?: number;
  ffmpeg?: string;
}): Encoder {
  const proc = Bun.spawn(
    [
      ffmpeg,
      ...["-nostdin", "-hide_banner", "-loglevel", "error", "-y"],
      ...["-f", "s16le", "-ar", String(sampleRate), "-ac", "1", "-i", "pipe:0"],
      ...["-c:a", "aac", "-b:a", "48k", "-flush_packets", "1", "-frag_duration", "2000000"],
      ...["-movflags", "+frag_keyframe+empty_moov+default_base_moof", "-f", "mp4", path],
    ],
    { stdin: "pipe", stdout: "ignore", stderr: "ignore" },
  );
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
        try {
          await proc.stdin.end();
        } catch {
          // Already closed by ffmpeg exiting.
        }
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
