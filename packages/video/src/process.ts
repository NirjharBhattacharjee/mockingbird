const PROCESS_MS = 90_000;
const KILL_MS = 2_000;

export async function runBoundedProcess(
  argv: string[],
  deadline: number,
  maxBytes = 64 * 1024 * 1024,
  stderrOutput = false,
  processMs = PROCESS_MS,
): Promise<Buffer> {
  const left = Math.min(processMs, deadline - Date.now());
  if (left <= 0) throw new Error(`${argv[0]} ran out of time.`);
  const proc = (() => {
    try {
      return Bun.spawn(argv, { stdout: "pipe", stderr: "pipe", stdin: "ignore" });
    } catch {
      throw new Error(`${argv[0]} is unavailable. Install it locally and try again.`);
    }
  })();
  // SIGTERM, then SIGKILL if the child ignores it, so a stuck ffmpeg or
  // tesseract can't hold the call open.
  let killer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    proc.kill();
    killer ??= setTimeout(() => proc.kill("SIGKILL"), KILL_MS);
  };
  proc.exited.finally(() => clearTimeout(killer));
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    stop();
  }, left);
  const read = async (stream: ReadableStream<Uint8Array>, limit: number) => {
    const reader = stream.getReader();
    const parts: Buffer[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        stop();
        throw new Error(`${argv[0]} output exceeded the inspection limit.`);
      }
      parts.push(Buffer.from(value));
    }
    return Buffer.concat(parts);
  };
  const outPromise = read(proc.stdout, maxBytes);
  const errPromise = read(proc.stderr, 1024 * 1024);
  try {
    const [out, err, code] = await Promise.all([outPromise, errPromise, proc.exited]);
    if (timedOut) throw new Error(`${argv[0]} timed out during screen inspection.`);
    if (code !== 0)
      throw new Error(
        `${argv[0]} failed: ${err.toString().trim().split("\n").slice(-2).join(" ").slice(0, 500)}`,
      );
    return stderrOutput ? err : out;
  } catch (error) {
    stop();
    await Promise.allSettled([outPromise, errPromise, proc.exited]);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
