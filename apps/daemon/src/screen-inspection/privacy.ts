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
    const cache = new Map<number, ReturnType<typeof privacyRows>>();
    const findings: object[] = [];
    let total = 0;
    for (const sample of samples) {
      let rows = cache.get(sample.index);
      if (!rows) {
        const tsv = await runBoundedProcess(
          [tesseract, requireFrameData(paths.get(sample.index)), "stdout", "tsv"],
          deadline,
          4 * 1024 * 1024,
        );
        rows = privacyRows(tsv.toString(), names as string[], source.width, source.height);
        cache.set(sample.index, rows);
      }
      total += rows.length;
      if (findings.length < 1000)
        for (const row of rows.slice(0, 1000 - findings.length))
          findings.push({
            requested: sample.requested,
            selected: sample.selected,
            pts: sample.pts,
            ptsTicks: sample.ptsTicks,
            ...row,
          });
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
