import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderHtml, screenOptions, screenPage } from "@mockingbird/motion";
import { mcpTools } from "../src/mcp.ts";
import { screenNormalizeTool } from "../src/screen-render.ts";

describe.skipIf(!process.env.MOCKINGBIRD_INTEGRATION)("source-pixel screen rendering", () => {
  const dir = mkdtempSync(join(tmpdir(), "screen-render-test-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  test("rotated sources must be normalized before source-pixel marks", async () => {
    const plain = join(dir, "geometry-plain.mp4"),
      rotated = join(dir, "geometry-rotated.mp4"),
      normalized = join(dir, "geometry-normal.mp4");
    expect(
      Bun.spawnSync([
        "ffmpeg",
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=white:s=64x32:r=4:d=1",
        "-c:v",
        "libx264",
        plain,
      ]).exitCode,
    ).toBe(0);
    expect(
      Bun.spawnSync([
        "ffmpeg",
        "-v",
        "error",
        "-display_rotation:v:0",
        "90",
        "-i",
        plain,
        "-c",
        "copy",
        rotated,
      ]).exitCode,
    ).toBe(0);
    const tools = mcpTools(
        async () => ({}),
        () => {},
      ),
      render = tools.find((t) => t.name === "screen_render"),
      normalize = tools.find((t) => t.name === "screen_normalize");
    if (!render || !normalize) throw new Error("Missing screen tools");
    await expect(
      render.run({ path: rotated, out: join(dir, "geometry-rejected.mp4") }),
    ).rejects.toThrow("unrotated square-pixel");
    await normalize.run({ path: rotated, out: normalized, fps: 4 });
    expect(
      await render.run({ path: normalized, out: join(dir, "geometry-render.mp4"), fps: 4 }),
    ).toContain("32x64");
  }, 60_000);
  test("normalization refuses a local playlist that references a network input", async () => {
    let requests = 0;
    const server = Bun.serve({
      port: 0,
      fetch: () => {
        requests++;
        return new Response("unexpected");
      },
    });
    const source = join(dir, "network.m3u8");
    writeFileSync(
      source,
      `#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXTINF:1,\nhttp://127.0.0.1:${server.port}/chunk.ts\n#EXT-X-ENDLIST\n`,
    );
    try {
      const tool = mcpTools(
        async () => ({}),
        () => {},
      ).find((t) => t.name === "screen_normalize");
      if (!tool) throw new Error("screen_normalize is missing from MCP");
      await expect(tool.run({ path: source, out: join(dir, "network.mp4") })).rejects.toThrow();
      expect(requests).toBe(0);
    } finally {
      server.stop(true);
    }
  });
  test("normalization trims inside a sparse hold before fast forwarding", async () => {
    const source = join(dir, "sparse.mp4"),
      out = join(dir, "normalized.mp4");
    const made = Bun.spawnSync([
      "ffmpeg",
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=red:s=64x64:r=10:d=21",
      "-vf",
      "drawbox=x=0:y=0:w=iw:h=ih:color=blue:t=fill:enable='gte(t,10)',select='eq(n,0)+eq(n,100)+eq(n,200)'",
      "-fps_mode",
      "vfr",
      "-c:v",
      "libx264",
      source,
    ]);
    expect(made.exitCode).toBe(0);
    await screenNormalizeTool(async () => ({ video: true, audio: false, seconds: 20.1 })).run({
      path: source,
      out,
      from: 5,
      to: 15,
      speed: 2,
      fps: 4,
    });
    const raw = Bun.spawnSync([
      "ffmpeg",
      "-v",
      "error",
      "-i",
      out,
      "-vf",
      "scale=1:1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "-",
    ]).stdout;
    expect(raw.length).toBe(20 * 3);
    expect(raw[0]).toBeGreaterThan(200);
    expect(raw[2]).toBeLessThan(40);
    expect(raw[15 * 3]).toBeLessThan(40);
    expect(raw[15 * 3 + 2]).toBeGreaterThan(200);
    await expect(
      screenNormalizeTool(async () => ({ video: true, audio: false, seconds: 20.1 })).run({
        path: source,
        out,
        from: 5,
        to: 15,
      }),
    ).rejects.toThrow();
  }, 60_000);
  test("normalization keeps audio on the same trimmed and slowed timeline", async () => {
    const source = join(dir, "sound.mp4"),
      out = join(dir, "sound-slow.mp4");
    expect(
      Bun.spawnSync([
        "ffmpeg",
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=white:s=64x64:r=4:d=2",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=2",
        "-c:v",
        "libx264",
        "-c:a",
        "aac",
        source,
      ]).exitCode,
    ).toBe(0);
    await screenNormalizeTool(async () => ({ video: true, audio: true, seconds: 2 })).run({
      path: source,
      out,
      from: 0.5,
      to: 1.5,
      speed: 0.5,
      fps: 4,
    });
    const result = Bun.spawnSync([
      "ffprobe",
      "-v",
      "error",
      "-show_entries",
      "stream=codec_type,duration",
      "-of",
      "json",
      out,
    ]);
    expect(result.exitCode).toBe(0);
    const streams = JSON.parse(result.stdout.toString()).streams as {
      codec_type: string;
      duration: string;
    }[];
    expect(streams.map((s) => s.codec_type).sort()).toEqual(["audio", "video"]);
    for (const stream of streams) expect(Math.abs(Number(stream.duration) - 2)).toBeLessThan(0.1);
  }, 60_000);
  test("normalization makes odd source dimensions H.264-compatible", async () => {
    const source = join(dir, "odd-source.mkv"),
      out = join(dir, "odd-normal.mp4");
    expect(
      Bun.spawnSync([
        "ffmpeg",
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "testsrc=size=721x481:rate=4:duration=1",
        "-c:v",
        "ffv1",
        source,
      ]).exitCode,
    ).toBe(0);
    await screenNormalizeTool(async () => ({ video: true, audio: false, seconds: 1 })).run({
      path: source,
      out,
      fps: 4,
    });
    const result = Bun.spawnSync([
      "ffprobe",
      "-v",
      "error",
      "-show_entries",
      "stream=width,height,pix_fmt,sample_aspect_ratio",
      "-of",
      "json",
      out,
    ]);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout.toString()).streams[0]).toMatchObject({
      width: 720,
      height: 480,
      pix_fmt: "yuv420p",
      sample_aspect_ratio: "1:1",
    });
  }, 60_000);
  test("camera and markers stay aligned; masks cover the source target while moving", async () => {
    const source = join(dir, "source.mp4");
    const make = Bun.spawnSync([
      "ffmpeg",
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=white:s=640x360:r=4:d=2",
      "-vf",
      "drawbox=x=460:y=170:w=40:h=20:color=blue:t=fill",
      "-pix_fmt",
      "yuv420p",
      source,
    ]);
    expect(make.exitCode).toBe(0);
    const camera = [
      { at: 0, x: 320, y: 180, zoom: 1 },
      { at: 1, x: 480, y: 180, zoom: 2 },
    ];
    for (const kind of ["box", "mask"]) {
      const script = join(dir, `${kind}.html`),
        out = join(dir, `${kind}.mp4`);
      writeFileSync(
        script,
        screenPage(
          screenOptions({
            camera,
            overlays: [
              {
                kind,
                from: 0,
                to: 2,
                x: 460,
                y: 170,
                w: 40,
                h: 20,
                color: kind === "box" ? "#ff0000" : "#000000",
              },
            ],
          }),
        ),
      );
      await renderHtml(script, {
        chrome: process.env.MOCKINGBIRD_CHROME as string,
        video: source,
        out,
        width: 640,
        height: 360,
        duration: 2,
        fps: 4,
      });
      const decode = Bun.spawnSync(
        ["ffmpeg", "-v", "error", "-i", out, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        { maxBuffer: 10_000_000 },
      );
      expect(decode.exitCode).toBe(0);
      const bytes = decode.stdout;
      for (const frame of [0, 2, 6]) {
        const pixels = bytes.subarray(frame * 640 * 360 * 3, (frame + 1) * 640 * 360 * 3);
        let blue = 0,
          red = 0;
        for (let i = 0; i < pixels.length; i += 3) {
          if ((pixels[i + 2] ?? 0) > 150 && (pixels[i] ?? 0) < 70 && (pixels[i + 1] ?? 0) < 70)
            blue++;
          if ((pixels[i] ?? 0) > 150 && (pixels[i + 1] ?? 0) < 70 && (pixels[i + 2] ?? 0) < 70)
            red++;
        }
        if (kind === "box") {
          expect(blue).toBeGreaterThan(200);
          expect(red).toBeGreaterThan(100);
          const bounds = (channel: number) => {
            let left = 640,
              top = 360,
              right = -1,
              bottom = -1;
            for (let i = 0; i < pixels.length; i += 3) {
              if (
                (pixels[i + channel] ?? 0) < 150 ||
                (pixels[i + ((channel + 1) % 3)] ?? 0) > 70 ||
                (pixels[i + ((channel + 2) % 3)] ?? 0) > 70
              )
                continue;
              const x = (i / 3) % 640,
                y = Math.floor(i / 3 / 640);
              left = Math.min(left, x);
              top = Math.min(top, y);
              right = Math.max(right, x);
              bottom = Math.max(bottom, y);
            }
            return [left, top, right, bottom];
          };
          const target = bounds(2),
            outline = bounds(0);
          for (let edge = 0; edge < 4; edge++)
            expect(
              Math.abs((target[edge] as number) - (outline[edge] as number)),
            ).toBeLessThanOrEqual(5);
        } else expect(blue).toBe(0);
      }
    }
  }, 60_000);
});
