import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderHtml } from "@mockingbird/motion";
import { screenTools } from "../src/screen-inspect.ts";

const dir = mkdtempSync(join(tmpdir(), "screen-inspect-test-"));
const sparse = join(dir, "sparse.mkv");
const sound = join(dir, "sound.mkv");
const ocr = join(dir, "ocr.mp4");
const offset = join(dir, "offset.mkv");
const fractional = join(dir, "fractional.mkv");
const shortPicture = join(dir, "short-picture.mp4");
const interframe = join(dir, "interframe.mkv");
const rotated = join(dir, "rotated.mp4");
const rotatedTag = join(dir, "rotated-tag.mkv");
const nonsquare = join(dir, "nonsquare.mp4");
const multipleVideoStreams = join(dir, "multiple-video-streams.mkv");
const localSegment = join(dir, "referenced-segment-%03d.ts");
const localPlaylist = join(dir, "referenced-local.m3u8");
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function ffmpeg(...args: string[]) {
  const result = Bun.spawnSync(["ffmpeg", "-nostdin", "-v", "error", ...args], { stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
}

function tool(name: string) {
  const found = screenTools().find((t) => t.name === name);
  if (!found) throw new Error(`No ${name} tool`);
  return found;
}

function rgb(path: string): number[] {
  const result = Bun.spawnSync([
    "ffmpeg",
    "-v",
    "error",
    "-i",
    path,
    "-vf",
    "scale=1:1",
    "-pix_fmt",
    "rgb24",
    "-f",
    "rawvideo",
    "-",
  ]);
  if (result.exitCode !== 0) throw new Error("Could not read image pixels");
  return [...result.stdout];
}

type Frame = { requested: number; selected: number; pts: number; ptsTicks: string; file: string };
type Finding = {
  requested: number;
  types: string[];
  rect: { x: number; y: number; w: number; h: number };
};

describe.skipIf(!process.env.MOCKINGBIRD_INTEGRATION)("screen inspection (integration)", () => {
  beforeAll(() => {
    ffmpeg(
      "-f",
      "lavfi",
      "-i",
      "color=red:s=320x180:r=1:d=10",
      "-f",
      "lavfi",
      "-i",
      "color=green:s=320x180:r=1:d=10",
      "-f",
      "lavfi",
      "-i",
      "color=blue:s=320x180:r=1:d=10",
      "-filter_complex",
      "[0:v][1:v][2:v]concat=n=3:v=1:a=0,select='not(mod(n,10))'[v]",
      "-map",
      "[v]",
      "-fps_mode",
      "vfr",
      "-c:v",
      "ffv1",
      sparse,
    );
    ffmpeg(
      "-i",
      sparse,
      "-fps_mode",
      "vfr",
      "-c:v",
      "libx264",
      "-x264-params",
      "bframes=2:scenecut=0:keyint=250",
      interframe,
    );
    ffmpeg(
      "-f",
      "lavfi",
      "-i",
      "color=white:s=320x180:r=1:d=2",
      "-f",
      "lavfi",
      "-i",
      "aevalsrc=if(lt(t\\,1)\\,0.1*sin(2*PI*440*t)\\,0):s=48000:d=2",
      "-map",
      "0:v",
      "-map",
      "1:a",
      "-c:v",
      "ffv1",
      "-c:a",
      "pcm_s16le",
      sound,
    );
    ffmpeg(
      "-f",
      "lavfi",
      "-i",
      "color=red:s=64x64:r=1:d=3",
      "-output_ts_offset",
      "5",
      "-c:v",
      "ffv1",
      offset,
    );
    ffmpeg(
      "-f",
      "lavfi",
      "-i",
      "color=red:s=64x64:r=10:d=1",
      "-output_ts_offset",
      "1.4",
      "-c:v",
      "ffv1",
      fractional,
    );
    ffmpeg(
      "-f",
      "lavfi",
      "-i",
      "color=red:s=64x64:r=1:d=1",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=2",
      "-map",
      "0:v",
      "-map",
      "1:a",
      "-c:v",
      "libx264",
      "-c:a",
      "aac",
      shortPicture,
    );
    const help = Bun.spawnSync(["ffmpeg", "-hide_banner", "-h", "full"]).stdout.toString();
    if (help.includes("-display_rotation"))
      ffmpeg("-display_rotation:v:0", "90", "-i", shortPicture, "-c", "copy", rotated);
    else ffmpeg("-i", shortPicture, "-c", "copy", "-metadata:s:v:0", "rotate=90", rotated);
    ffmpeg(
      "-f",
      "lavfi",
      "-i",
      "color=red:s=160x90:r=1:d=1",
      "-vf",
      "setsar=4/3",
      "-c:v",
      "libx264",
      nonsquare,
    );
    ffmpeg(
      "-f",
      "lavfi",
      "-i",
      "color=red:s=160x90:r=1:d=1",
      "-c:v",
      "ffv1",
      "-metadata:s:v:0",
      "rotate=90",
      rotatedTag,
    );
    ffmpeg(
      "-f",
      "lavfi",
      "-i",
      "color=red:s=64x64:r=1:d=1",
      "-f",
      "lavfi",
      "-i",
      "color=blue:s=128x128:r=1:d=1",
      "-map",
      "0:v:0",
      "-map",
      "1:v:0",
      "-disposition:v:0",
      "0",
      "-disposition:v:1",
      "default",
      "-c:v",
      "ffv1",
      multipleVideoStreams,
    );
    ffmpeg(
      "-f",
      "lavfi",
      "-i",
      "color=blue:s=64x64:r=1:d=2",
      "-c:v",
      "libx264",
      "-g",
      "1",
      "-hls_time",
      "1",
      "-hls_list_size",
      "0",
      "-hls_segment_filename",
      localSegment,
      "-f",
      "hls",
      localPlaylist,
    );
  });

  test("selects the actual frame during sparse holds, including after the last PTS", async () => {
    const result = JSON.parse(
      await tool("screen_frames").run({
        path: sparse,
        outDir: join(dir, "frames"),
        times: [0, 9, 10, 19, 20, 20.5],
      }),
    ) as { frames: Frame[]; timeOriginPts: number; coordinateSpace: object };
    expect(result.coordinateSpace).toEqual({
      inputPath: sparse,
      reference: "encoded_frame",
      units: "pixels",
      origin: "top-left",
      encoded: { width: 320, height: 180 },
      display: { width: 320, height: 180 },
      sampleAspectRatio: "1:1",
      rotationDegrees: 0,
    });
    expect(result.frames.map((f) => f.requested)).toEqual([0, 9, 10, 19, 20, 20.5]);
    expect(result.frames.map((f) => f.selected)).toEqual([0, 0, 10, 10, 20, 20]);
    expect(result.frames.map((f) => f.pts)).toEqual([0, 0, 10, 10, 20, 20]);
    const colors = result.frames.map((f) => rgb(f.file));
    expect(colors[1]?.[0]).toBeGreaterThan(200);
    expect(colors[3]?.[1]).toBeGreaterThan(100);
    expect(colors[5]?.[2]).toBeGreaterThan(200);
    await expect(
      tool("screen_frames").run({ path: sparse, outDir: join(dir, "frames"), times: [0] }),
    ).rejects.toThrow();
    expect(rgb(result.frames[1]?.file ?? "")[0]).toBeGreaterThan(200);
  }, 60_000);

  test("uses the probed first video stream rather than a different default stream", async () => {
    const result = JSON.parse(
      await tool("screen_frames").run({
        path: multipleVideoStreams,
        outDir: join(dir, "multiple-video-frames"),
        times: [0],
      }),
    ) as { width: number; height: number; frames: Frame[] };
    expect([result.width, result.height]).toEqual([64, 64]);
    const pixel = rgb(result.frames[0]?.file ?? "");
    expect(pixel[0]).toBeGreaterThan(200);
    expect(pixel[2]).toBeLessThan(50);
  }, 60_000);

  test("keeps presentation order when a sparse recording contains B-frames", async () => {
    const probe = Bun.spawnSync([
      "ffprobe",
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_frames",
      "-show_entries",
      "frame=pict_type",
      "-of",
      "csv=p=0",
      interframe,
    ]);
    expect(probe.stdout.toString()).toContain("B");
    const result = JSON.parse(
      await tool("screen_frames").run({
        path: interframe,
        outDir: join(dir, "b-frames"),
        times: [19, 0, 20.5, 9],
      }),
    ) as { frames: Frame[] };
    expect(result.frames.map((f) => f.selected)).toEqual([10, 0, 20, 0]);
    expect(rgb(result.frames[0]?.file ?? "")[1]).toBeGreaterThan(100);
    expect(rgb(result.frames[1]?.file ?? "")[0]).toBeGreaterThan(200);
    expect(rgb(result.frames[2]?.file ?? "")[2]).toBeGreaterThan(200);
  }, 60_000);

  test("does not claim a video frame after a shorter video track ends", async () => {
    await expect(
      tool("screen_frames").run({
        path: shortPicture,
        outDir: join(dir, "past-picture"),
        times: [1.5],
      }),
    ).rejects.toThrow("outside");
    expect(existsSync(join(dir, "past-picture"))).toBe(false);
  }, 60_000);

  test("selects correctly on and immediately before a fractional frame boundary", async () => {
    const result = JSON.parse(
      await tool("screen_frames").run({
        path: fractional,
        outDir: join(dir, "fractional-frames"),
        times: [0.1999999, 0.2, 0.2000001, 0.3],
      }),
    ) as { timeOriginPts: number; timeBase: string; frames: Frame[] };
    expect(result.timeOriginPts).toBe(1.4);
    expect(result.frames.map((f) => f.selected)).toEqual([0.1, 0.2, 0.2, 0.3]);
    expect(result.frames.map((f) => f.pts)).toEqual([1.5, 1.6, 1.6, 1.7]);
    expect(result.timeBase).toBe("1/1000");
    expect(result.frames.map((f) => f.ptsTicks)).toEqual(["1500", "1600", "1600", "1700"]);
  }, 60_000);

  test("uses playback time relative to a nonzero Matroska start PTS", async () => {
    const result = JSON.parse(
      await tool("screen_frames").run({
        path: offset,
        outDir: join(dir, "offset-frames"),
        times: [0, 2.5],
      }),
    ) as { timeOriginPts: number; frames: Frame[] };
    expect(result.timeOriginPts).toBe(5);
    expect(result.frames.map((f) => f.selected)).toEqual([0, 2]);
    expect(result.frames.map((f) => f.pts)).toEqual([5, 7]);
    await expect(
      tool("screen_frames").run({ path: offset, outDir: join(dir, "outside"), times: [3] }),
    ).rejects.toThrow("outside");
    expect(existsSync(join(dir, "outside"))).toBe(false);
  }, 60_000);

  test("rejects real rotated and non-square-pixel sources before publishing", async () => {
    for (const [index, input] of [rotated, nonsquare, rotatedTag].entries()) {
      const probe = Bun.spawnSync([
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_streams",
        "-of",
        "json",
        input,
      ]);
      expect(probe.exitCode).toBe(0);
      const stream = JSON.parse(probe.stdout.toString()).streams[0];
      if (input === rotated)
        expect(
          stream.side_data_list.some(
            (item: { rotation?: number }) => Math.abs(item.rotation ?? 0) === 90,
          ),
        ).toBe(true);
      else if (input === nonsquare) expect(stream.sample_aspect_ratio).toBe("4:3");
      else
        expect(
          Object.entries(stream.tags).some(
            ([key, value]) => key.toLowerCase() === "rotate" && value === "90",
          ),
        ).toBe(true);

      const outDir = join(dir, `geometry-frames-${index}`);
      const out = join(dir, `geometry-sheet-${index}.png`);
      const calls: [string, Record<string, unknown>][] = [
        ["screen_frames", { path: input, outDir, times: [0] }],
        ["screen_changes", { path: input, every: 1 }],
        ["screen_watch", { path: input, out, every: 1 }],
      ];
      if (Bun.which("tesseract")) calls.push(["screen_privacy", { path: input, every: 1 }]);
      for (const [name, args] of calls)
        await expect(tool(name).run(args)).rejects.toThrow("Normalize the supplied file");
      expect(existsSync(outDir)).toBe(false);
      expect(existsSync(out)).toBe(false);
    }
  }, 60_000);

  test("reports sampled screen changes without inventing clicks", async () => {
    const result = JSON.parse(
      await tool("screen_changes").run({ path: sparse, from: 0, to: 21, every: 5, threshold: 5 }),
    ) as {
      events: { at: number; selected: number; score: number }[];
      method: string;
      coordinateSpace: { inputPath: string };
    };
    expect(result.coordinateSpace.inputPath).toBe(sparse);
    expect(result.events.map((e) => e.at)).toEqual([10, 20]);
    expect(result.events.every((e) => e.score >= 5)).toBe(true);
    expect(result.method).toContain("not clicks");
  }, 60_000);

  test("writes a timestamped contact sheet and distinguishes sound, silence and no audio", async () => {
    const sheet = join(dir, "sheet.png");
    const result = JSON.parse(
      await tool("screen_watch").run({ path: sound, out: sheet, every: 1, columns: 2 }),
    ) as {
      frames: Frame[];
      sections: { status: string; integratedLufs?: number }[];
      coordinateSpace: { inputPath: string };
    };
    expect(result.coordinateSpace.inputPath).toBe(sound);
    expect(result.frames.map((f) => f.requested)).toEqual([0, 1]);
    expect(result.sections[0]?.status).toBe("measured");
    expect(result.sections[0]?.integratedLufs).toBeLessThan(-10);
    expect(result.sections[1]?.status).toBe("silent");
    expect(existsSync(sheet)).toBe(true);
    const pixels = Bun.spawnSync([
      "ffmpeg",
      "-v",
      "error",
      "-i",
      sheet,
      "-pix_fmt",
      "rgb24",
      "-f",
      "rawvideo",
      "-",
    ]).stdout;
    const whiteLabelPixel = (184 * 640 + 8) * 3;
    expect([...pixels.subarray(whiteLabelPixel, whiteLabelPixel + 3)]).toEqual([255, 255, 255]);
    const before = readFileSync(sheet);
    await expect(tool("screen_watch").run({ path: sound, out: sheet, every: 1 })).rejects.toThrow();
    expect(readFileSync(sheet)).toEqual(before);
    const noAudio = JSON.parse(
      await tool("screen_watch").run({ path: sparse, out: join(dir, "no-audio.png"), every: 10 }),
    ) as { sections: { status: string }[] };
    expect(noAudio.sections.every((s) => s.status === "no_audio")).toBe(true);
  }, 60_000);

  test("concurrent calls cannot overwrite the same contact sheet", async () => {
    const out = join(dir, "concurrent.png");
    const calls = await Promise.allSettled([
      tool("screen_watch").run({ path: sparse, out, every: 10 }),
      tool("screen_watch").run({ path: sparse, out, every: 10 }),
    ]);
    expect(calls.map((call) => call.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(existsSync(out)).toBe(true);
  }, 60_000);

  test.skipIf(!process.env.MOCKINGBIRD_CHROME || !Bun.which("tesseract"))(
    "finds email, path and supplied name in source-pixel OCR rows",
    async () => {
      const html = join(dir, "ocr.html");
      writeFileSync(
        html,
        `<!doctype html><style>body{margin:0;background:white;color:black;font:38px monospace}.row{position:absolute;left:40px}</style><div class="row" style="top:50px">Contact: alice@example.com</div><div class="row" style="top:150px">File: /Users/alice/report.pdf</div><div class="row" style="top:250px">Client: Morgan Smith</div>`,
      );
      await renderHtml(html, {
        chrome: process.env.MOCKINGBIRD_CHROME ?? "",
        out: ocr,
        width: 900,
        height: 400,
        fps: 1,
        duration: 1,
        tabs: 1,
      });
      const result = JSON.parse(
        await tool("screen_privacy").run({ path: ocr, every: 1, names: ["Morgan Smith"] }),
      ) as {
        width: number;
        height: number;
        findings: Finding[];
        limitation: string;
        coordinateSpace: { inputPath: string };
      };
      expect(result.coordinateSpace.inputPath).toBe(ocr);
      const email = result.findings.find((f) => f.types.includes("email"));
      const file = result.findings.find((f) => f.types.includes("file_path"));
      const name = result.findings.find((f) => f.types.includes("supplied_name"));
      expect([result.width, result.height]).toEqual([900, 400]);
      expect(email?.rect.y).toBeGreaterThanOrEqual(45);
      expect(email?.rect.y).toBeLessThan(100);
      expect(file?.rect.y).toBeGreaterThanOrEqual(145);
      expect(file?.rect.y).toBeLessThan(200);
      expect(name?.rect.y).toBeGreaterThanOrEqual(245);
      expect(name?.rect.y).toBeLessThan(300);
      expect(
        result.findings.every(
          (f) => f.rect.x >= 0 && f.rect.x + f.rect.w <= 900 && f.rect.y + f.rect.h <= 400,
        ),
      ).toBe(true);
      expect(result.limitation).toContain("not a privacy clearance");
      expect(JSON.stringify(result)).not.toContain("alice@example.com");
    },
    60_000,
  );

  test("rejects unbounded and invalid input before writing", async () => {
    const out = join(dir, "invalid.png");
    await expect(tool("screen_watch").run({ path: sparse, out, every: 0 })).rejects.toThrow(
      "every",
    );
    await expect(tool("screen_watch").run({ path: sparse, out, every: 0.1 })).rejects.toThrow(
      "maximum",
    );
    await expect(
      tool("screen_frames").run({ path: sparse, outDir: join(dir, "invalid"), times: [NaN] }),
    ).rejects.toThrow("times[0]");
    expect(existsSync(out)).toBe(false);
  }, 60_000);

  test("does not follow network references in a local playlist", async () => {
    let requests = 0;
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch() {
        requests++;
        return new Response("unexpected");
      },
    });
    try {
      const playlist = join(dir, "remote.m3u8");
      const outDir = join(dir, "remote-frames");
      writeFileSync(
        playlist,
        `#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXTINF:10,\nhttp://127.0.0.1:${server.port}/segment.ts\n#EXT-X-ENDLIST\n`,
      );
      await expect(
        tool("screen_frames").run({ path: playlist, outDir, times: [0] }),
      ).rejects.toThrow();
      expect(requests).toBe(0);
      expect(existsSync(outDir)).toBe(false);
    } finally {
      server.stop(true);
    }
  }, 60_000);

  test("does not publish frames from a separate local playlist segment", async () => {
    const outDir = join(dir, "local-playlist-frames");
    await expect(
      tool("screen_frames").run({ path: localPlaylist, outDir, times: [0] }),
    ).rejects.toThrow("Playlist and manifest");
    expect(existsSync(outDir)).toBe(false);
  }, 60_000);

  test("reports missing OCR without disabling the other tools", async () => {
    const moduleUrl = new URL("../src/screen-inspect.ts", import.meta.url).href;
    const script = `import {screenTools} from ${JSON.stringify(moduleUrl)};
      const tools = screenTools();
      try { await tools.find(t => t.name === "screen_privacy").run({path: process.argv[1]}); }
      catch (e) { console.log(e.message); }
      console.log(tools.map(t => t.name).join(","));`;
    const result = Bun.spawnSync([process.execPath, "-e", script, sparse], {
      env: { ...process.env, PATH: join(dir, "no-programs") },
      stderr: "pipe",
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain("locally installed tesseract");
    expect(result.stdout.toString()).toContain("screen_frames");
  });
});
