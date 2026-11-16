import { expect, test } from "bun:test";
import { bestLag, envelope } from "../src/sync.ts";

test("sync finds where one recording's sound sits in another's (#200)", () => {
  // Bursts at uneven times, heard by two microphones: the second starts 37 hops later, quieter, with its own noise.
  let seed = 7;
  const noise = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647 - 0.5;
  };
  const hop = 80;
  const take = new Float32Array(hop * 3000);
  for (const at of [100, 340, 410, 900, 1320, 1500, 2100, 2230, 2700]) {
    for (let i = at * hop; i < (at + 40) * hop; i++) take[i] = Math.sin(i / 3) * 0.5;
  }
  const a = take.map((v) => v + noise() * 0.01);
  const b = take.subarray(37 * hop).map((v) => v * 0.3 + noise() * 0.02);
  const { lag, score } = bestLag(envelope(a, hop), envelope(b, hop), 500);
  expect(lag).toBe(37);
  expect(score).toBeGreaterThan(0.8);
});
