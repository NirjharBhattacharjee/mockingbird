import type { VideoGeometry } from "./source.ts";

function identityMatrix(matrix: string | null): boolean {
  if (!matrix) return false;
  const lines = matrix.trim().split(/\r?\n/);
  if (lines.length !== 3) return false;
  const values = lines.flatMap((line) => {
    const row = line.match(/^[0-9a-f]{8}:\s*(-?\d+)\s+(-?\d+)\s+(-?\d+)\s*$/i);
    return row ? row.slice(1).map(Number) : [];
  });
  return (
    values.length === 9 &&
    values.every((value, index) => value === [65536, 0, 0, 0, 65536, 0, 0, 0, 1073741824][index])
  );
}

/** True only when encoded pixels need no display-space transformation. */
export function hasEncodedPixelCoordinates(geometry: VideoGeometry): boolean {
  const sar = geometry.sampleAspectRatio?.match(/^(\d{1,12}):(\d{1,12})$/);
  if (!sar || BigInt(sar[1] ?? "0") === 0n || BigInt(sar[1] ?? "0") !== BigInt(sar[2] ?? "0"))
    return false;
  if (geometry.rotationTags.some((tag) => !/^[-+]?\d+(?:\.\d+)?$/.test(tag) || Number(tag) !== 0))
    return false;
  return geometry.displayMatrices.every(
    ({ rotation, matrix }) => (rotation === null || rotation === 0) && identityMatrix(matrix),
  );
}
