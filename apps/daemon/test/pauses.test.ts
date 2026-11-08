import { beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clipsFrom, findPauses, measure, parseSilence } from "../src/pauses.ts";

// What ffmpeg's silencedetect printed for the gaps fixture below, scanned from 0.5 s.
const LOG = `[silencedetect @ 0x1] silence_start: 0.941667
[silencedetect @ 0x1] silence_end: 2.38 | silence_duration: 1.43833
[silencedetect @ 0x1] silence_start: 3.80417
[silencedetect @ 0x1] silence_end: 5 | silence_duration: 1.19583`;

test("reads silencedetect's log, offset to where the scan started", () => {
  expect(parseSilence(LOG, 0.5)).toEqual([
    { start: 1.44, end: 2.88, length: 1.44 },
    { start: 4.3, end: 5.5, length: 1.2 },
  ]);
});

describe("clipsFrom", () => {
  test("keeps what's between pauses, a margin into each, as clips.sh did", () => {
    // clips.sh's output for these pauses from 0.5 s to 5.5 s, at its defaults.
    expect(clipsFrom(parseSilence(LOG, 0.5), 0.5, 5.5)).toEqual([
      { from: 0.5, to: 1.59 },
      { from: 2.73, to: 4.45 },
      { from: 5.35, to: 5.5 },
    ]);
  });

  test("joins a stretch too short to stand alone to the next, and pauses that touch", () => {
    const pauses = [
      { start: 1, end: 2, length: 1 },
      { start: 2.08, end: 3, length: 0.92 },
      // Reported as two, touching: one pause.
      { start: 5, end: 5.5, length: 0.5 },
      { start: 5.52, end: 6, length: 0.48 },
    ];
    // clips.sh's output for the same pauses.
    expect(clipsFrom(pauses, 0, 8, { min: 0.4, margin: 0.1 })).toEqual([
      { from: 0, to: 1.1 },
      // 1.9 to 2.18 is too short alone, so it carries on into the next.
      { from: 1.9, to: 5.1 },
      { from: 5.9, to: 8 },
    ]);
  });

  test("a pause shorter than min isn't cut", () => {
    expect(clipsFrom([{ start: 1, end: 1.3, length: 0.3 }], 0, 2)).toEqual([{ from: 0, to: 2 }]);
  });
});

describe.skipIf(!Bun.which("ffmpeg"))("on a file (needs ffmpeg)", () => {
  const dir = mkdtempSync(join(tmpdir(), "mb-pauses-"));
  const gaps = join(dir, "gaps.wav");
  const video = join(dir, "v.mp4");
  // Made here, not in the describe body, which runs even when it skips.
  beforeAll(() => {
    Bun.spawnSync([
      ...["ffmpeg", "-loglevel", "error", "-f", "lavfi"],
      ...["-i", "sine=frequency=300:duration=6,volume='gt(sin(2*PI*t*0.35),0)':eval=frame", gaps],
    ]);
    Bun.spawnSync([
      ...[
        "ffmpeg",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=size=640x360:rate=30:duration=6",
      ],
      ...[
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=330:duration=6",
        "-pix_fmt",
        "yuv420p",
        "-shortest",
        video,
      ],
    ]);
  });

  test("finds the pauses pauses.sh found", async () => {
    expect(await findPauses(gaps, { from: 0.5, to: 5.5 })).toEqual([
      { start: 1.44, end: 2.88, length: 1.44 },
      { start: 4.3, end: 5.5, length: 1.2 },
    ]);
  });

  test("measures what measure.sh measured", async () => {
    expect(await measure(video)).toBe(
      "size 640x360\nlength 6.0s\nloudness -21.8 LUFS, true peak -13.5 dBTP\ncuts: call `scenes` on the same file",
    );
  });
});
