// Pins what render makes today (#300), from a generated test picture and
// tone: the length, the streams, and the loudness. Once from a path and its
// clips, once from a project, which goes through the segment cache.
// Needs ffmpeg. Run with MOCKINGBIRD_INTEGRATION=1.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mcpTools } from "../../src/mcp.ts";

const tools = mcpTools(
  async () => ({}),
  () => {},
);
const tool = (name: string) =>
  tools.find((t) => t.name === name) as { run: (a: Record<string, unknown>) => Promise<string> };

/** Each stream's layout: what a move must keep exactly. */
const streams = (file: string) =>
  JSON.parse(
    Bun.spawnSync([
      ...["ffprobe", "-v", "error", "-of", "json", "-show_entries"],
      ...[
        "stream=codec_type,codec_name,width,height,pix_fmt,r_frame_rate,sample_rate,channels",
        file,
      ],
    ]).stdout.toString(),
  ).streams;

const seconds = (file: string) =>
  Number(
    Bun.spawnSync([
      ...["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file],
    ]).stdout.toString(),
  );

/** Integrated loudness in LUFS, from ebur128's summary. */
const lufs = (file: string) => {
  const said = Bun.spawnSync([
    ...["ffmpeg", "-nostdin", "-hide_banner", "-i", file, "-af", "ebur128", "-f", "null", "-"],
  ]).stderr.toString();
  return Number(said.match(/I:\s+(-?[\d.]+) LUFS\s*\n\s*Threshold/)?.[1]);
};

describe.skipIf(!process.env.MOCKINGBIRD_INTEGRATION)("render (characterization)", () => {
  // Made in beforeAll, so a skipped run leaves no folder behind.
  let dir = "";
  let talk = "";
  const saved = process.env.MOCKINGBIRD_HOME;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "mb-characterize-render-"));
    talk = join(dir, "talk.mp4");
    process.env.MOCKINGBIRD_HOME = join(dir, "home");
    mkdirSync(join(dir, "home"));
    // 6 s of a moving test picture with a tone at about -28 LUFS: under -14, within the 30 dB render may add.
    const made = Bun.spawnSync([
      ...["ffmpeg", "-nostdin", "-loglevel", "error", "-f", "lavfi"],
      ...["-i", "testsrc2=size=640x360:rate=30:duration=6"],
      ...["-f", "lavfi", "-i", "sine=frequency=440:duration=6,volume=0.5"],
      ...["-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", talk],
    ]);
    if (made.exitCode !== 0) throw new Error(`ffmpeg couldn't make the test clip: ${made.stderr}`);
  });
  afterAll(() => {
    if (saved === undefined) delete process.env.MOCKINGBIRD_HOME;
    else process.env.MOCKINGBIRD_HOME = saved;
    rmSync(dir, { recursive: true, force: true });
  });

  const clips = [
    { from: 0.5, to: 2.5 },
    { from: 3, to: 5, zoom: 1.5, focus: { x: 0.3, y: 0.6 } },
  ];

  test("a path and its clips", async () => {
    const said = await tool("render").run({ path: talk, clips });
    expect(said).toContain(join(dir, "talk-short-1.mp4"));
    const out = join(dir, "talk-short-1.mp4");
    expect(seconds(out)).toBeCloseTo(4, 1);
    expect(streams(out)).toMatchSnapshot();
    expect(Math.abs(lufs(out) - -14)).toBeLessThanOrEqual(0.5);
  }, 120_000);

  test("a project, rendered twice from the segment cache", async () => {
    const project = join(dir, "edit.json");
    await tool("edit").run({
      project,
      ops: clips.map((c) => ({ op: "add", type: "clip", path: talk, ...c })),
    });
    // An effect, so the cut is encoded through the segment cache instead of copied (#166).
    await tool("edit").run({
      project,
      ops: [{ op: "set", id: "c1", effects: [{ name: "color", saturation: 1.2 }] }],
    });
    await tool("render").run({ project });
    const out = join(dir, "edit-render-1.mp4");
    expect(seconds(out)).toBeCloseTo(4, 1);
    expect(streams(out)).toMatchSnapshot();
    expect(Math.abs(lufs(out) - -14)).toBeLessThanOrEqual(0.5);
    const cache = join(dir, "home", "cache", "segments");
    // Each segment by name, with when it was written.
    const written = () =>
      Object.fromEntries(
        readdirSync(cache)
          .sort()
          .map((f) => [f, statSync(join(cache, f)).mtimeMs]),
      );
    const kept = written();
    expect(Object.keys(kept).length).toBeGreaterThan(0);
    await tool("render").run({ project });
    // The second render reads the same segments: none made again, none added.
    expect(written()).toEqual(kept);
    expect(streams(join(dir, "edit-render-2.mp4"))).toEqual(streams(out));
  }, 120_000);
});
