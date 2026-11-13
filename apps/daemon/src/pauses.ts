/**
 * The playbooks' measurements as engine code (#158), so they run on every OS
 * and reach every agent over MCP: the pauses in a video's sound, the clips
 * that keep the speech between them, and a finished video's size, length and
 * loudness. These replace plugin/skills/retention-editing/scripts/pauses.sh
 * and clips.sh and style-match/scripts/measure.sh, number for number. A
 * video's cuts come from the `scenes` tool.
 */

/** A pause, in seconds of the source, rounded to hundredths as the scripts printed. */
export type Pause = { start: number; end: number; length: number };

const hundredths = (n: number) => Math.round(n * 100) / 100;

/** The pauses in ffmpeg's `silencedetect` log, `offset` seconds added (where the scan started). */
export function parseSilence(log: string, offset = 0): Pause[] {
  const pauses: Pause[] = [];
  let start: number | undefined;
  for (const line of log.split("\n")) {
    const opened = line.match(/silence_start: (-?[\d.]+)/);
    if (opened) start = Number(opened[1]) + offset;
    const closed = line.match(/silence_end: (-?[\d.]+) \| silence_duration: ([\d.]+)/);
    if (closed && start !== undefined) {
      pauses.push({
        start: hundredths(start),
        end: hundredths(Number(closed[1]) + offset),
        length: hundredths(Number(closed[2])),
      });
      start = undefined;
    }
  }
  return pauses;
}

/**
 * The stretches from `from` to `to` that `pauses` at least `min` seconds long
 * leave, each kept `margin` seconds into the pause either side: render's
 * clips. A stretch of 0.3 s or less (a word before a pause) is joined to the
 * next rather than dropped, so no speech is lost; the last is kept whatever
 * its length. Pauses ffmpeg reports as two that touch are one.
 */
export function clipsFrom(
  pauses: Pause[],
  from: number,
  to: number,
  { min = 0.4, margin = 0.15 }: { min?: number; margin?: number } = {},
): { from: number; to: number }[] {
  const joined: { start: number; end: number }[] = [];
  for (const { start, end } of pauses) {
    const last = joined.at(-1);
    if (last && start - last.end < 0.05) last.end = end;
    else joined.push({ start, end });
  }
  const clips: { from: number; to: number }[] = [];
  let at = from;
  let pending: number | undefined;
  const keep = (a: number, b: number) => {
    const begin = pending ?? a;
    if (b - begin > 0.3) {
      clips.push({ from: hundredths(begin), to: hundredths(b) });
      pending = undefined;
    } else pending = begin;
  };
  for (const { start, end } of joined) {
    if (end - start < min) continue;
    keep(at, start + margin);
    at = end - margin;
  }
  if (pending !== undefined) at = pending;
  if (to - at > 0) clips.push({ from: hundredths(at), to: hundredths(to) });
  return clips;
}

/** Runs ffmpeg or ffprobe and returns what it wrote, or throws with the end of its error. */
async function run(argv: string[], what: string): Promise<{ out: string; err: string }> {
  const proc = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(`${what}: ${err.trim().split("\n").slice(-3).join(" ")}`);
  return { out, err };
}

/**
 * The pauses in `path`'s sound from `from` to `to` seconds (default all of
 * it): quieter than `noise` dB for at least `shortest` seconds.
 */
export async function findPauses(
  path: string,
  {
    from = 0,
    to,
    noise = -35,
    shortest = 0.25,
  }: { from?: number; to?: number; noise?: number; shortest?: number } = {},
): Promise<Pause[]> {
  const { err } = await run(
    [
      ...["ffmpeg", "-hide_banner", "-nostats", "-nostdin", "-ss", String(from)],
      ...(to === undefined ? [] : ["-to", String(to)]),
      ...[
        "-i",
        path,
        "-vn",
        "-af",
        `silencedetect=noise=${noise}dB:d=${shortest}`,
        "-f",
        "null",
        "-",
      ],
    ],
    `ffmpeg couldn't read the sound in ${path}`,
  );
  return parseSilence(err, from);
}

/** A file's length in seconds, and its picture's size as `WxH` (undefined with no picture). */
async function probeFile(path: string): Promise<{ seconds: number; size?: string }> {
  const { out } = await run(
    [
      ...[
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration:stream=codec_type,width,height",
      ],
      ...["-of", "json", path],
    ],
    `ffprobe couldn't read ${path}`,
  );
  const { format, streams = [] } = JSON.parse(out) as {
    format?: { duration?: string };
    streams?: { codec_type: string; width?: number; height?: number }[];
  };
  const picture = streams.find((s) => s.codec_type === "video");
  return {
    seconds: Number(format?.duration ?? 0),
    size: picture?.width ? `${picture.width}x${picture.height}` : undefined,
  };
}

/** A finished video's size, length and loudness (EBU R128 integrated, true peak), for `style-match`. */
export async function measure(path: string): Promise<string> {
  const { seconds, size } = await probeFile(path);
  // A video with no sound still has a size and a length.
  const heard = await run(
    [
      "ffmpeg",
      "-hide_banner",
      "-nostats",
      "-nostdin",
      "-i",
      path,
      "-vn",
      "-af",
      "ebur128=peak=true:framelog=quiet",
      "-f",
      "null",
      "-",
    ],
    `ffmpeg couldn't read the sound in ${path}`,
  ).catch(() => undefined);
  const err = heard?.err ?? "";
  const summary = err.slice(err.lastIndexOf("Summary:"));
  const integrated = summary.match(/I:\s+(-?[\d.]+|-inf) LUFS/)?.[1] ?? "?";
  const peak = summary.match(/Peak:\s+(-?[\d.]+|-inf) dBFS/)?.[1] ?? "?";
  return [
    `size ${size ?? "no picture"}`,
    `length ${seconds.toFixed(1)}s`,
    heard ? `loudness ${integrated} LUFS, true peak ${peak} dBTP` : "loudness: no sound",
    "cuts: call `scenes` on the same file",
  ].join("\n");
}
