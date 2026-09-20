import { describe, expect, test } from "bun:test";
import { stamp } from "../src/agent.ts";

describe("stamp", () => {
  test("is sortable, to the second, with no timezone suffix", () => {
    expect(stamp()).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  test("follows the machine's clock rather than UTC", () => {
    // A log read by the person at the keyboard has to match their clock.
    const at = new Date("2026-09-20T09:44:28Z");
    const [, hour] = stamp(at).match(/ (\d{2}):/) ?? [];
    expect(Number(hour)).toBe(at.getHours());
  });
});
