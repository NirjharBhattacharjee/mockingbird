const PROCESS_MS = 90_000;

export async function runBoundedProcess(
  argv: string[],
  deadline: number,
  maxBytes = 64 * 1024 * 1024,
  stderrOutput = false,
): Promise<Buffer> {
  const left = Math.min(PROCESS_MS, deadline - Date.now());
  if (left <= 0) throw new Error("Screen inspection exceeded its five-minute limit.");
  const proc = (() => {
    try {
      return Bun.spawn(argv, { stdout: "pipe", stderr: "pipe", stdin: "ignore" });
    } catch {
      throw new Error(`${argv[0]} is unavailable. Install it locally and try again.`);
    }
  })();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
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
        proc.kill();
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
    proc.kill();
    await Promise.allSettled([outPromise, errPromise, proc.exited]);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
