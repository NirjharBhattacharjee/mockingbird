import { fineClock } from "../clock.ts";
import { requireFile } from "../runtime.ts";
import { probe } from "./probe.ts";

/**
 * The shot changes ffmpeg's `scdet` logged, `from` seconds added back, since
 * a seek starts its times at 0: `lavfi.scd.score: 29.3, lavfi.scd.time: 2`.
 */
export function parseScenes(log: string, from = 0): { at: number; score: number }[] {
  return (
    [...log.matchAll(/lavfi\.scd\.score: ([\d.]+), lavfi\.scd\.time: ([\d.]+)/g)]
      // To the millisecond, so a seek that started a frame early doesn't read 3.9999 as 3.99.
      .map(([, score, at]) => ({
        at: Math.round((from + Number(at)) * 1000) / 1000,
        score: Number(score),
      }))
      .filter((c) => c.score > 0)
  ); // At threshold 0, an unchanged frame is logged too.
}

/**
 * The shot changes in a video, from `from` to `to` seconds: ffmpeg's `scdet`
 * over each frame shrunk to 180 lines, which is plenty to see a cut and
 * quick to compare. `threshold` (0-100, default 10) is how different two
 * frames must be to count; a jump cut in one shot scores lower than a cut
 * to another shot. Decoded with the hardware when there's a decoder for it:
 * a minute of 4K HEVC from a phone took 21.6 s that way, 165.6 s without.
 */
export async function scenes(
  path: string,
  { from = 0, to, threshold = 10 }: { from?: number; to?: number; threshold?: number },
): Promise<string> {
  requireFile(path, "File");
  const source = await probe(path);
  if (!source.video) return `${path} has no video, only audio.`;
  // ffprobe can't always tell a length (some streams and broken files): 0 then
  // means unknown, so the asked-for range is scanned, or to the end.
  const known = source.seconds > 0;
  const end = known ? Math.min(to ?? source.seconds, source.seconds) : to;
  if (end !== undefined && !(end > from))
    throw new Error(`Nothing to look at from ${from}s: ${path} is ${source.seconds}s.`);
  // scdet compares each frame with the one before, so a cut on the first frame
  // needs a frame before it: start one early and drop cuts before `from`.
  const start = Math.max(0, from - 1 / source.fps);
  const run = async (hw: boolean) => {
    const proc = Bun.spawn(
      [
        ...["ffmpeg", "-nostdin", "-nostats", ...(hw ? ["-hwaccel", "auto"] : [])],
        ...["-ss", String(start), ...(end === undefined ? [] : ["-t", String(end - start)])],
        ...["-i", path, "-an"],
        ...["-vf", `scale=-2:180,scdet=threshold=${threshold}`, "-f", "null", "-"],
      ],
      { stderr: "pipe" },
    );
    const said = await new Response(proc.stderr).text();
    return { said, code: await proc.exited };
  };
  // A hardware decoder that can't hand its frames over fails; software then.
  let { said, code } = await run(true);
  if (code !== 0) ({ said, code } = await run(false));
  if (code !== 0) {
    throw new Error(
      `ffmpeg couldn't look for cuts in ${path}: ${said.trim().split("\n").slice(-3).join("\n")}`,
    );
  }
  const half = 1 / source.fps / 2;
  const cuts = parseScenes(said, start).filter((c) => c.at >= from - half);
  const length = end === undefined ? 0 : end - from;
  const pace = length
    ? `, ${((cuts.length / length) * 60).toFixed(1)} a minute, ${(length / (cuts.length + 1)).toFixed(1)} s a shot`
    : "";
  const until = end === undefined ? "the end (its length is unknown)" : fineClock(end * 1000);
  const head = `${path}: ${cuts.length} cut${cuts.length === 1 ? "" : "s"} from ${fineClock(from * 1000)} to ${until}${pace}`;
  return [head, ...cuts.map((c) => `[${fineClock(c.at * 1000)}] ${c.score.toFixed(1)}`)].join("\n");
}
