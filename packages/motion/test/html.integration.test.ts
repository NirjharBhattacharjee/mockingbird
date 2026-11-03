import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { renderHtml } from "../src/index.ts";

/** MOCKINGBIRD_CHROME, or the one `mockingbird models pull chrome` put in ~/.mockingbird/bin. */
function chrome(): string {
  if (process.env.MOCKINGBIRD_CHROME) return process.env.MOCKINGBIRD_CHROME;
  const bin = join(process.env.MOCKINGBIRD_HOME ?? join(homedir(), ".mockingbird"), "bin");
  for (const version of existsSync(bin) ? readdirSync(bin) : []) {
    if (!version.startsWith("chrome-headless-shell-")) continue;
    for (const build of readdirSync(join(bin, version))) {
      const program = join(bin, version, build, "chrome-headless-shell");
      if (existsSync(program)) return program;
    }
  }
  throw new Error("No Chrome: run `mockingbird models pull chrome`, or set MOCKINGBIRD_CHROME.");
}

const dir = mkdtempSync(join(tmpdir(), "html-motion-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function page(name: string, html: string): string {
  const path = join(dir, name);
  writeFileSync(path, `<!doctype html><html><body style="margin:0">${html}</body></html>`);
  return path;
}

/** Each frame of `video` as RGB bytes, scaled to `width` x `height`. */
function pixels(video: string, width: number, height: number): Uint8Array[] {
  const raw = Bun.spawnSync([
    ...["ffmpeg", "-v", "error", "-i", video, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
  ]).stdout;
  const size = width * height * 3;
  return Array.from({ length: raw.length / size }, (_, i) =>
    raw.subarray(i * size, (i + 1) * size),
  );
}

describe.skipIf(!process.env.MOCKINGBIRD_INTEGRATION)("renderHtml (integration)", () => {
  test("every frame is at its own time, in order, whichever tab drew it", async () => {
    // Red from draw, green from a stylesheet animation, blue from one draw starts at frame 4.
    const path = page(
      "clock.html",
      `<div id="a" style="position:absolute;left:0;width:32px;height:32px"></div>
       <div id="b" style="position:absolute;left:32px;width:32px;height:32px;animation:g 1s linear both"></div>
       <div id="c" style="position:absolute;left:64px;width:32px;height:32px;background:#000"></div>
       <style>@keyframes g { from { background: rgb(0,0,0) } to { background: rgb(0,250,0) } }</style>
       <script>
         mockingbird.audio = [{ path: "beep.wav", at: 0.5 }];
         mockingbird.draw = (t, m) => {
           document.getElementById("a").style.background = "rgb(" + m.frame * 25 + ",0,0)";
           if (m.frame === 4) {
             document.getElementById("c").animate(
               [{ background: "rgb(0,0,0)" }, { background: "rgb(0,0,250)" }],
               { duration: 1000, fill: "both" },
             );
           }
         };
       </script>`,
    );
    const out = join(dir, "clock.mp4");
    let loaded: unknown;
    const frames = await renderHtml(path, {
      chrome: chrome(),
      out,
      width: 96,
      height: 32,
      fps: 10,
      duration: 1,
      tabs: 4,
      onLoad: ({ audio }) => {
        loaded = audio;
      },
    });
    expect(frames).toBe(10);
    expect(loaded).toEqual([{ path: "beep.wav", at: 0.5 }]);
    const seen = pixels(out, 96, 32).map((p) => {
      const at = (x: number) => (16 * 96 + x) * 3;
      return [p[at(16)], p[at(48) + 1], p[at(80) + 2]] as [number, number, number];
    });
    expect(seen).toHaveLength(10);
    seen.forEach(([red, green, blue], f) => {
      expect(Math.abs(red - f * 25)).toBeLessThan(16);
      expect(Math.abs(green - f * 25)).toBeLessThan(16);
      expect(Math.abs(blue - Math.max(0, f - 4) * 25)).toBeLessThan(16);
    });
  }, 60_000);

  test("lays the page over a video and keeps its sound", async () => {
    const video = join(dir, "under.mp4");
    Bun.spawnSync([
      ...["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=64x64:r=10:d=2"],
      ...["-f", "lavfi", "-i", "sine=d=2", "-pix_fmt", "yuv420p", "-shortest", video],
    ]);
    const path = page("over.html", `<div style="width:32px;height:64px;background:#f00"></div>`);
    const out = join(dir, "over.mp4");
    const frames = await renderHtml(path, {
      chrome: chrome(),
      out,
      width: 64,
      height: 64,
      fps: 10,
      duration: 1,
      video,
      audio: true,
    });
    expect(frames).toBe(10);
    const streams = Bun.spawnSync([
      ...["ffprobe", "-v", "error", "-show_entries", "stream=codec_type", "-of", "csv=p=0", out],
    ]).stdout.toString();
    expect(streams.split("\n").filter(Boolean).sort()).toEqual(["audio", "video"]);
    const first = pixels(out, 64, 64)[0] as Uint8Array;
    const at = (x: number) => (32 * 64 + x) * 3;
    expect(first[at(8)]).toBeGreaterThan(200); // the page's red
    expect(first[at(48) + 2]).toBeGreaterThan(200); // the video's blue
  }, 60_000);

  test("says which frame a page failed on, and what failed while loading", async () => {
    const options = { chrome: chrome(), width: 32, height: 32, fps: 10, duration: 1 };
    const failing = page(
      "boom.html",
      `<script>mockingbird.draw = (t, m) => { if (m.frame === 3) throw new Error("boom") }</script>`,
    );
    const out = join(dir, "boom.mp4");
    await expect(renderHtml(failing, { ...options, out })).rejects.toThrow(
      "the page failed by 0.30 s (frame 3): Error: boom",
    );
    expect(existsSync(out)).toBe(false);

    const broken = page("broken.html", `<script>nope()</script>`);
    await expect(renderHtml(broken, { ...options, out })).rejects.toThrow(
      "failed while loading: Uncaught ReferenceError: nope is not defined",
    );
    await expect(renderHtml(join(dir, "missing.html"), { ...options, out })).rejects.toThrow(
      "ERR_FILE_NOT_FOUND",
    );
  }, 60_000);
});
