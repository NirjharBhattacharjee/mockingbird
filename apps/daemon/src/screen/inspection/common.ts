import { isAbsolute } from "node:path";
import {
  addRationals,
  compareRationals,
  decimalRational,
  hasEncodedPixelCoordinates,
  MAX_VIDEO_SECONDS,
  rationalToNumber,
  type VideoMetadata,
  type VideoSource,
} from "@mockingbird/video";

export const MAX_SECONDS = MAX_VIDEO_SECONDS;
export const MAX_SAMPLES = 48;
export const DEADLINE_MS = 300_000;

export function fields(a: Record<string, unknown>, allowed: string[]) {
  for (const key of Object.keys(a))
    if (!allowed.includes(key)) throw new Error(`Unknown argument: ${key}`);
}

export function pathArg(value: unknown, name: string): string {
  if (
    typeof value !== "string" ||
    !isAbsolute(value) ||
    value.includes("\0") ||
    value.length > 4096
  )
    throw new Error(`${name} must be an absolute local path.`);
  return value;
}

export function numberArg(
  value: unknown,
  name: string,
  min: number,
  max: number,
  fallback?: number,
): number {
  const n = value === undefined ? fallback : value;
  if (typeof n !== "number" || !Number.isFinite(n) || n < min || n > max)
    throw new Error(`${name} must be a number from ${min} to ${max}.`);
  return n;
}

export function inspectionCoordinates(source: VideoMetadata) {
  if (!hasEncodedPixelCoordinates(source.geometry))
    throw new Error(
      "Video geometry is rotated, non-square, or unknown. Normalize the supplied file to zero rotation and square pixels, then inspect that normalized file.",
    );
  return {
    inputPath: source.path,
    reference: "encoded_frame",
    units: "pixels",
    origin: "top-left",
    encoded: source.geometry.encoded,
    display: { width: source.width, height: source.height },
    sampleAspectRatio: source.geometry.sampleAspectRatio,
    rotationDegrees: 0,
  };
}

export function timing(source: VideoSource) {
  return {
    timeOriginPts: source.origin,
    timeOriginFraction: `${source.originExact.n}/${source.originExact.d}`,
    timeBase: `${source.timeBase.n}/${source.timeBase.d}`,
  };
}

export function interval(
  a: Record<string, unknown>,
  source: VideoSource,
  max: number,
): { from: number; to: number; every: number; times: number[] } {
  const from = numberArg(a.from, "from", 0, MAX_SECONDS, 0);
  const to = numberArg(a.to, "to", 0, source.duration, source.duration);
  const every = numberArg(a.every, "every", 0.1, MAX_SECONDS, 5);
  if (from >= to) throw new Error("from must be less than to.");
  const first = decimalRational(from);
  const step = decimalRational(every);
  const end = decimalRational(to);
  const times: number[] = [];
  for (let i = 0; i <= max; i++) {
    const t = addRationals(first, { n: step.n * BigInt(i), d: step.d });
    if (compareRationals(t, end) >= 0n) break;
    if (i === max) throw new Error(`Too many samples; use a larger every value (maximum ${max}).`);
    times.push(rationalToNumber(t));
  }
  return { from, to, every, times };
}
