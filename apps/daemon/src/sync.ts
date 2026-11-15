/**
 * `sync` (#200): lines up recordings of one take (two cameras, a camera and
 * a separate recorder) by their sound. The loudness envelopes are
 * cross-correlated for the rough offset, then the samples around it for the
 * exact one, well inside a frame.
 */

/** Envelope hop, in seconds: 10 ms. */
const HOP = 0.01;
/** The rate the samples are compared at. */
const RATE = 8000;

/** `seconds` of `path`'s sound from `from`, mono float32 at `rate`. */
async function samples(
  path: string,
  rate: number,
  from: number,
  seconds: number,
): Promise<Float32Array> {
  const proc = Bun.spawn(
    [
      ...[
        "ffmpeg",
        "-nostdin",
        "-v",
        "error",
        "-ss",
        String(from),
        "-t",
        String(seconds),
        "-i",
        path,
      ],
      ...["-map", "0:a:0", "-ac", "1", "-ar", String(rate), "-f", "f32le", "-"],
    ],
    { stderr: "pipe" },
  );
  const bytes = new Uint8Array(await new Response(proc.stdout).arrayBuffer());
  if ((await proc.exited) !== 0) {
    throw new Error(
      `ffmpeg couldn't read ${path}'s sound: ${(await new Response(proc.stderr).text()).trim()}`,
    );
  }
  return new Float32Array(bytes.buffer, 0, Math.floor(bytes.length / 4));
}

/**
 * Log energy per `hop` samples, with its running mean taken off and scaled
 * to unit variance: what two microphones in one room share, whatever their
 * gain and tone.
 */
export function envelope(x: Float32Array, hop: number): Float32Array {
  const n = Math.floor(x.length / hop);
  const e = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = i * hop; j < (i + 1) * hop; j++) s += (x[j] as number) ** 2;
    e[i] = Math.log10(s / hop + 1e-10);
  }
  // Take off the mean over the last second, so slow level changes don't line up by themselves.
  const w = Math.round(1 / HOP);
  const out = new Float32Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += e[i] as number;
    if (i >= w) sum -= e[i - w] as number;
    out[i] = (e[i] as number) - sum / Math.min(i + 1, w);
  }
  let sq = 0;
  for (const v of out) sq += v * v;
  const sd = Math.sqrt(sq / Math.max(n, 1)) || 1;
  for (let i = 0; i < n; i++) out[i] = (out[i] as number) / sd;
  return out;
}

/**
 * The lag, from `-max` to `max` samples, at which `b` best matches `a`
 * (a[i] lines up with b[i - lag]), and the normalised correlation there.
 * Lags with less than half of `b` overlapping aren't counted.
 */
export function bestLag(
  a: Float32Array,
  b: Float32Array,
  max: number,
  around = 0,
): { lag: number; score: number } {
  let best = { lag: around, score: -Infinity };
  for (let lag = around - max; lag <= around + max; lag++) {
    const lo = Math.max(0, lag);
    const hi = Math.min(a.length, b.length + lag);
    if (hi - lo < Math.min(a.length, b.length) / 2) continue;
    let ab = 0;
    let aa = 0;
    let bb = 0;
    for (let i = lo; i < hi; i++) {
      const x = a[i] as number;
      const y = b[i - lag] as number;
      ab += x * y;
      aa += x * x;
      bb += y * y;
    }
    const score = ab / Math.sqrt(aa * bb || 1);
    if (score > best.score) best = { lag, score };
  }
  return best;
}

export type Synced = { path: string; offset: number; score: number };

/**
 * Each of `paths` against the first: `offset` is where its start falls on
 * the first's clock (a moment at t in it is at t + offset in the first), and
 * `score` how well the sound matched (0-1; under about 0.3 is a guess).
 * Reads the first `window` seconds of each.
 */
export async function sync(paths: string[], window = 120): Promise<Synced[]> {
  const [first, ...rest] = paths;
  if (!first || !rest.length)
    throw new Error("sync needs at least two recordings of the same take.");
  const hop = Math.round(RATE * HOP);
  const ref = await samples(first, RATE, 0, window);
  const refEnv = envelope(ref, hop);
  const out: Synced[] = [{ path: first, offset: 0, score: 1 }];
  for (const path of rest) {
    const other = await samples(path, RATE, 0, window);
    const otherEnv = envelope(other, hop);
    const rough = bestLag(
      refEnv,
      otherEnv,
      Math.floor(Math.min(refEnv.length, otherEnv.length) / 2),
    );
    // Then sample by sample, on up to 20 s where both run, within two hops of the rough lag.
    const lag = rough.lag * hop;
    const start = Math.max(0, lag);
    const length = Math.min(20 * RATE, ref.length - start, other.length - (start - lag));
    let offset = rough.lag * HOP;
    if (length > RATE) {
      const a = ref.subarray(start, start + length);
      const b = other.subarray(start - lag, start - lag + length);
      const fine = bestLag(a, b, 2 * hop);
      offset = (lag + fine.lag) / RATE;
    }
    out.push({
      path,
      offset: Math.round(offset * 1000) / 1000,
      score: Math.round(rough.score * 100) / 100,
    });
  }
  return out;
}
