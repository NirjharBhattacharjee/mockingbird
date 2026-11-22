import {
  decodeScaledFrames,
  probeVideoMetadata,
  probeVideoSource,
  runBoundedProcess,
  sampleFramesAt,
  type VideoSource,
} from "@mockingbird/video";
import {
  DEADLINE_MS,
  fields,
  inspectionCoordinates,
  interval,
  MAX_SAMPLES,
  numberArg,
  pathArg,
  timing,
} from "./common.ts";
import { createContactSheet, publishContactSheet } from "./sheet.ts";

async function measureSection(source: VideoSource, from: number, to: number, deadline: number) {
  if (!source.audio) return { from, to, status: "no_audio" };
  const log = (
    await runBoundedProcess(
      [
        "ffmpeg",
        "-nostdin",
        "-nostats",
        "-protocol_whitelist",
        "file,pipe",
        "-ss",
        String(from),
        "-t",
        String(to - from),
        "-i",
        source.path,
        "-map",
        "0:a:0",
        "-af",
        "ebur128=framelog=quiet,astats=metadata=0:reset=0",
        "-f",
        "null",
        "-",
      ],
      deadline,
      1024 * 1024,
      true,
    )
  ).toString();
  const count = Number(log.match(/Number of samples:\s*(\d+)/)?.[1] ?? 0);
  const peaks = [...log.matchAll(/Peak level dB:\s*(-?[\d.]+|-inf)/g)];
  const max = peaks.at(-1)?.[1];
  if (!count) return { from, to, status: "no_samples" };
  if (max === "-inf") return { from, to, status: "silent" };
  const values = [...log.matchAll(/^\s*I:\s*(-?[\d.]+)\s*LUFS/gm)];
  const lufs = Number(values.at(-1)?.[1]);
  if (!Number.isFinite(lufs) || lufs <= -70) return { from, to, status: "below_gate" };
  return { from, to, status: "measured", integratedLufs: lufs };
}

export async function screenWatch(a: Record<string, unknown>): Promise<string> {
  fields(a, ["path", "out", "from", "to", "every", "columns"]);
  const path = pathArg(a.path, "path");
  const out = pathArg(a.out, "out");
  if (!out.toLowerCase().endsWith(".png")) throw new Error("out must end in .png.");
  const columns = numberArg(a.columns, "columns", 1, 6, 4);
  if (!Number.isInteger(columns)) throw new Error("columns must be a whole number.");
  const deadline = Date.now() + DEADLINE_MS;
  const metadata = await probeVideoMetadata(path, deadline);
  const coordinateSpace = inspectionCoordinates(metadata);
  const source = await probeVideoSource(metadata, deadline);
  const coverage = interval(a, source, MAX_SAMPLES);
  const samples = sampleFramesAt(source, coverage.times);
  const pixels = await decodeScaledFrames(source, samples, 320, 180, deadline);
  const sheet = createContactSheet(samples, pixels, columns);
  const sections = [];
  for (const [i, sample] of samples.entries())
    sections.push(
      await measureSection(
        source,
        sample.requested,
        samples[i + 1]?.requested ?? coverage.to,
        deadline,
      ),
    );
  await publishContactSheet(out, sheet, deadline);
  return JSON.stringify({
    path,
    coordinateSpace,
    out,
    ...timing(source),
    coverage,
    frames: samples.map(({ index: _index, ...s }) => s),
    sections,
    limitation:
      "A contact sheet and measurements do not establish listening or creative acceptance.",
  });
}
