import { constants, copyFileSync, mkdirSync, mkdtempSync, rmdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  decodePngFrames,
  decodeScaledFrames,
  probeVideoMetadata,
  probeVideoSource,
  requireFrameData,
  sampleFramesAt,
} from "@mockingbird/video";
import {
  DEADLINE_MS,
  fields,
  inspectionCoordinates,
  interval,
  MAX_SAMPLES,
  MAX_SECONDS,
  numberArg,
  pathArg,
  timing,
} from "./common.ts";

export async function screenFrames(a: Record<string, unknown>): Promise<string> {
  fields(a, ["path", "times", "outDir"]);
  const path = pathArg(a.path, "path");
  const outDir = pathArg(a.outDir, "outDir");
  if (!Array.isArray(a.times) || !a.times.length || a.times.length > MAX_SAMPLES)
    throw new Error(`times must have 1 to ${MAX_SAMPLES} entries.`);
  const times = a.times.map((t, i) => numberArg(t, `times[${i}]`, 0, MAX_SECONDS));
  const deadline = Date.now() + DEADLINE_MS;
  const metadata = await probeVideoMetadata(path, deadline);
  const coordinateSpace = inspectionCoordinates(metadata);
  const source = await probeVideoSource(metadata, deadline);
  const samples = sampleFramesAt(source, times);
  const temp = mkdtempSync(join(tmpdir(), "mockingbird-screen-"));
  let created = false;
  const files: string[] = [];
  try {
    const paths = await decodePngFrames(source, samples, temp, deadline);
    mkdirSync(outDir);
    created = true;
    for (const [i, sample] of samples.entries()) {
      const dest = join(outDir, `frame-${String(i + 1).padStart(4, "0")}.png`);
      copyFileSync(requireFrameData(paths.get(sample.index)), dest, constants.COPYFILE_EXCL);
      files.push(dest);
    }
    return JSON.stringify({
      path,
      coordinateSpace,
      ...timing(source),
      width: source.width,
      height: source.height,
      frames: samples.map(({ index: _index, ...s }, i) => ({ ...s, file: files[i] })),
    });
  } catch (error) {
    for (const file of files) rmSync(file, { force: true });
    if (created) {
      try {
        rmdirSync(outDir);
      } catch {}
    }
    throw error;
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

export async function screenChanges(a: Record<string, unknown>): Promise<string> {
  fields(a, ["path", "from", "to", "every", "threshold"]);
  const path = pathArg(a.path, "path");
  const threshold = numberArg(a.threshold, "threshold", 0, 100, 5);
  const deadline = Date.now() + DEADLINE_MS;
  const metadata = await probeVideoMetadata(path, deadline);
  const coordinateSpace = inspectionCoordinates(metadata);
  const source = await probeVideoSource(metadata, deadline);
  const coverage = interval(a, source, 120);
  const samples = sampleFramesAt(source, coverage.times);
  const pixels = await decodeScaledFrames(source, samples, 160, 90, deadline);
  const events = [];
  for (let i = 1; i < samples.length; i++) {
    const previous = requireFrameData(samples[i - 1]);
    const sample = requireFrameData(samples[i]);
    const before = requireFrameData(pixels.get(previous.index));
    const after = requireFrameData(pixels.get(sample.index));
    let diff = 0;
    for (let p = 0; p < before.length; p++)
      diff += Math.abs(before.readUInt8(p) - after.readUInt8(p));
    const score = (diff / before.length / 255) * 100;
    if (score > 0 && score >= threshold)
      events.push({
        from: previous.requested,
        at: sample.requested,
        selected: sample.selected,
        pts: sample.pts,
        ptsTicks: sample.ptsTicks,
        score,
      });
  }
  return JSON.stringify({
    path,
    coordinateSpace,
    ...timing(source),
    coverage,
    threshold,
    method: "mean absolute RGB pixel difference at sampled instants; events are not clicks",
    events,
  });
}
