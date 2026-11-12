/** ffmpeg atempo steps, each within its supported 0.5–2 range. */
export function tempo(speed: number): string {
  if (!Number.isFinite(speed) || speed <= 0)
    throw new Error("Audio speed must be finite and positive");
  const steps: number[] = [];
  let left = speed;
  while (left > 2) {
    steps.push(2);
    left /= 2;
  }
  while (left < 0.5) {
    steps.push(0.5);
    left /= 0.5;
  }
  steps.push(Number(left.toFixed(6)));
  return steps.map((s) => `atempo=${s}`).join(",");
}
