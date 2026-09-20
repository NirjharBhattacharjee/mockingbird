import { describe, expect, test } from "bun:test";
import { cues, playCue } from "../src/index.ts";

const record = () => {
  const calls: string[][] = [];
  return { calls, spawn: (cmd: string[]) => calls.push(cmd) };
};

describe("playCue", () => {
  test("plays a sound macOS actually ships", async () => {
    const { calls, spawn } = record();
    playCue("start", { spawn });
    const path = calls[0]?.at(-1) ?? "";
    expect(await Bun.file(path).exists()).toBe(true);
  });

  test("uses a different sound for each kind", () => {
    const { calls, spawn } = record();
    for (const kind of ["start", "stop", "error"] as const) playCue(kind, { spawn });
    const paths = calls.map((c) => c.at(-1));
    expect(new Set(paths).size).toBe(3);
  });

  test("plays quietly, so it doesn't startle mid-sentence", () => {
    const { calls, spawn } = record();
    playCue("start", { spawn });
    expect(calls[0]?.slice(0, 3)).toEqual(["afplay", "-v", "0.3"]);
  });

  test("a cue that can't play never breaks dictation", () => {
    expect(() =>
      playCue("start", {
        spawn: () => {
          throw new Error("no afplay");
        },
      }),
    ).not.toThrow();
  });
});

describe("cues", () => {
  test("switched on, it plays", () => {
    const { calls, spawn } = record();
    cues(true, { spawn })("start");
    expect(calls).toHaveLength(1);
  });

  test("switched off, it spawns nothing at all", () => {
    const { calls, spawn } = record();
    cues(false, { spawn })("start");
    expect(calls).toEqual([]);
  });
});
