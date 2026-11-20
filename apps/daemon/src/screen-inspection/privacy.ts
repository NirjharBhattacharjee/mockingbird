import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  decodePngFrames,
  probeVideoMetadata,
  probeVideoSource,
  requireFrameData,
  runBoundedProcess,
  sampleFramesAt,
} from "@mockingbird/video";
import {
  DEADLINE_MS,
  fields,
  inspectionCoordinates,
  interval,
  MAX_SAMPLES,
  pathArg,
  timing,
} from "./common.ts";
import { privacyRows } from "./ocr-rows.ts";

export async function screenPrivacy(a: Record<string, unknown>): Promise<string> {
  fields(a, ["path", "from", "to", "every", "names"]);
  const path = pathArg(a.path, "path");
  const names = a.names === undefined ? [] : a.names;
  if (
    !Array.isArray(names) ||
    names.length > 20 ||
    names.some((n) => typeof n !== "string" || !n.trim() || n.length > 100)
  )
    throw new Error(
      "names must be an array of up to 20 nonempty strings of at most 100 characters.",
    );
  const tesseract = Bun.which("tesseract");
  if (!tesseract)
    throw new Error(
      "Privacy scanning needs a locally installed tesseract on PATH. Other screen tools still work.",
    );
  const deadline = Date.now() + DEADLINE_MS;
  const metadata = await probeVideoMetadata(path, deadline);
  const coordinateSpace = inspectionCoordinates(metadata);
  const source = await probeVideoSource(metadata, deadline);
  const coverage = interval(a, source, MAX_SAMPLES);
  const samples = sampleFramesAt(source, coverage.times);
  const dir = mkdtempSync(join(tmpdir(), "mockingbird-ocr-"));
  try {
    const paths = await decodePngFrames(source, samples, dir, deadline);
    // One frame held across samples is read once, and its findings are listed
    // once with every time it was sampled, so it can't fill all 1,000 slots.
    const seen = new Map<number, { alsoAt: number[] }[]>();
    const findings: object[] = [];
    let total = 0;
    for (const sample of samples) {
      const earlier = seen.get(sample.index);
      if (earlier) {
        for (const f of earlier) f.alsoAt.push(sample.requested);
        continue;
      }
      const tsv = await runBoundedProcess(
        [tesseract, requireFrameData(paths.get(sample.index)), "stdout", "tsv"],
        deadline,
        4 * 1024 * 1024,
      );
      const rows = privacyRows(tsv.toString(), names as string[], source.width, source.height);
      const listed: { alsoAt: number[] }[] = [];
      seen.set(sample.index, listed);
      total += rows.length;
      for (const row of rows.slice(0, Math.max(0, 1000 - findings.length))) {
        const f = {
          requested: sample.requested,
          selected: sample.selected,
          pts: sample.pts,
          ptsTicks: sample.ptsTicks,
          alsoAt: [] as number[],
          ...row,
        };
        listed.push(f);
        findings.push(f);
      }
    }
    return JSON.stringify({
      path,
      coordinateSpace,
      ...timing(source),
      width: source.width,
      height: source.height,
      coverage,
      findings,
      omittedFindings: total - findings.length,
      limitation:
        "Only sampled instants were inspected. OCR can miss text; names are limited to supplied strings. This is not a privacy clearance.",
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
