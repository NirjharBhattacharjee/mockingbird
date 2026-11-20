import { expect, test } from "bun:test";
import { tempo } from "../src/tempo.ts";

test("tempo chains preserve large and small requested rates", () => {
  for (const speed of [0.25, 0.5, 1, 1.5, 4, 20, 64]) {
    const steps = tempo(speed)
      .split(",")
      .map((s) => Number(s.split("=")[1]));
    for (const step of steps) {
      expect(step).toBeGreaterThanOrEqual(0.5);
      expect(step).toBeLessThanOrEqual(2);
    }
    expect(steps.reduce((a, b) => a * b, 1)).toBeCloseTo(speed, 5);
  }
  for (const speed of [0, -1, Infinity, NaN]) expect(() => tempo(speed)).toThrow("positive");
});
