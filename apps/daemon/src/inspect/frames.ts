import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clock } from "../clock.ts";
import { toSdrFor } from "../hdr.ts";
import { requireFile } from "../runtime.ts";
import { probe } from "./probe.ts";

/**
 * Stills from a video, one every `every` seconds, as JPEGs in a new temp
 * folder; from `from` to `to` seconds if given.
 */
export async function frames(
  path: string,
  every: number,
  { from = 0, to }: { from?: number; to?: number } = {},
): Promise<string> {
  requireFile(path, "File");
  const source = await probe(path);
  if (!source.video) return `${path} has no video, only audio. \`transcribe\` reads it.`;
  // Stills from an HDR source as SDR, as render shows it, not flat and grey.
  const sdr = toSdrFor(source.transfer);
  const end = Math.min(to ?? source.seconds, source.seconds);
  const times: number[] = [];
  for (let t = from; t < end; t += every) times.push(t);
  if (!times.length) throw new Error(`No stills from ${from}s: ${path} is ${source.seconds}s.`);
  const dir = mkdtempSync(join(tmpdir(), "mockingbird-frames-"));
  const stills: string[] = [];
  try {
    for (const t of times) {
      // Each still seeks straight to its time, so a long 4K video isn't decoded end to end.
      const file = join(dir, `${String(stills.length + 1).padStart(4, "0")}.jpg`);
      const proc = Bun.spawn(
        [
          ...[
            "ffmpeg",
            "-nostdin",
            "-loglevel",
            "error",
            "-hwaccel",
            "auto",
            "-ss",
            String(t),
            "-i",
            path,
          ],
          ...["-frames:v", "1", "-vf", `${sdr ? `${sdr},` : ""}scale='min(1280,iw)':-2`, file],
        ],
        { stderr: "pipe" },
      );
      if ((await proc.exited) !== 0) {
        const why = (await new Response(proc.stderr).text()).trim();
        throw new Error(`ffmpeg couldn't read frames from ${path}: ${why}`);
      }
      // A time in the last moments, after the final frame, gives no still.
      if (readdirSync(dir).length > stills.length) stills.push(`[${clock(t * 1000)}] ${file}`);
    }
  } catch (error) {
    rmSync(dir, { recursive: true, force: true });
    throw error;
  }
  return stills.join("\n");
}
