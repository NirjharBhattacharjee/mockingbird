import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { launchChrome } from "../src/chrome.ts";
import { renderHtml } from "../src/index.ts";

/** MOCKINGBIRD_CHROME, or the one `mockingbird models pull chrome` put in ~/.mockingbird/bin. */
function chrome(): string {
  if (process.env.MOCKINGBIRD_CHROME) return process.env.MOCKINGBIRD_CHROME;
  const bin = join(process.env.MOCKINGBIRD_HOME ?? join(homedir(), ".mockingbird"), "bin");
  for (const version of existsSync(bin) ? readdirSync(bin) : []) {
    if (!version.startsWith("chrome-headless-shell-")) continue;
    for (const build of readdirSync(join(bin, version))) {
      const exe = process.platform === "win32" ? ".exe" : "";
      const program = join(bin, version, build, `chrome-headless-shell${exe}`);
      if (existsSync(program)) return program;
    }
  }
  throw new Error("No Chrome: run `mockingbird models pull chrome`, or set MOCKINGBIRD_CHROME.");
}

const chromePath = () => chrome();
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
  test.each([
    { name: "landscape", width: 640, height: 360, x: 435, y: 130, w: 141, h: 36 },
    { name: "edge", width: 640, height: 360, x: 435, y: 2, w: 141, h: 36 },
    { name: "portrait", width: 360, height: 450, x: 245, y: 162, w: 79, h: 45 },
  ])(
    "product-demo boxes follow the rendered target: $name",
    async ({ name, width, height, x, y, w, h }) => {
      const folder = join(import.meta.dir, "../../../plugin/skills/motion-graphics");
      const html = readFileSync(join(folder, "templates/product-demo.html"), "utf8")
        .replace('"KIT"', JSON.stringify(pathToFileURL(join(folder, "kit.js")).href))
        .replace('stroke: "#167a60"', 'stroke: "#ff0000"')
        .replace("lineWidth: 3", "lineWidth: 6")
        .replace(
          "{ x: 0.68, y: 0.36, w: 0.22, h: 0.1 }",
          JSON.stringify({ x: x / width, y: y / height, w: w / width, h: h / height }),
        );
      const script = page(`product-demo-${name}.html`, html);
      const video = join(dir, `product-target-${name}.mp4`);
      const source = Bun.spawnSync([
        "ffmpeg",
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        `color=white:s=${width}x${height}:r=10:d=6`,
        "-vf",
        `drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=blue:t=fill`,
        "-pix_fmt",
        "yuv420p",
        video,
      ]);
      expect(source.exitCode).toBe(0);
      const out = join(dir, `product-demo-${name}.mp4`);
      expect(
        await renderHtml(script, {
          chrome: chrome(),
          out,
          width,
          height,
          fps: 10,
          duration: 6,
          video,
          tabs: 2,
        }),
      ).toBe(60);
      const frames = pixels(out, width, height);
      const bounds = (p: Uint8Array, channel: number) => {
        const b: { left: number; top: number; right: number; bottom: number } = {
          left: width,
          top: height,
          right: -1,
          bottom: -1,
        };
        for (let i = 0; i < p.length; i += 3) {
          if (
            (p[i + channel] ?? 0) < 150 ||
            (p[i + ((channel + 1) % 3)] ?? 0) > 100 ||
            (p[i + ((channel + 2) % 3)] ?? 0) > 100
          )
            continue;
          const x = (i / 3) % width;
          const y = Math.floor(i / 3 / width);
          b.left = Math.min(b.left, x);
          b.right = Math.max(b.right, x);
          b.top = Math.min(b.top, y);
          b.bottom = Math.max(b.bottom, y);
        }
        return b;
      };
      // Actual rendered pixels, not the projection formula repeated in a test.
      for (const frame of [12, 25, 48]) {
        const p = frames[frame] as Uint8Array;
        const target = bounds(p, 2);
        const box = bounds(p, 0);
        expect(target.right).toBeGreaterThan(target.left);
        for (const gap of [
          target.left - box.left,
          target.top - box.top,
          box.right - target.right,
          box.bottom - target.bottom,
        ]) {
          expect(gap).toBeGreaterThanOrEqual(0);
          expect(gap).toBeLessThanOrEqual(6);
        }
      }
      expect(bounds(frames[5] as Uint8Array, 0).right).toBe(-1);
      expect(bounds(frames[52] as Uint8Array, 0).right).toBe(-1);
      if (name === "landscape") {
        const overlap = page(
          "product-overlap.html",
          html.replace("x: 0.5, y: 0.84", "x: 0.79, y: 0.41"),
        );
        await expect(
          renderHtml(overlap, {
            chrome: chrome(),
            out: join(dir, "product-overlap.mp4"),
            width,
            height,
            fps: 10,
            duration: 2,
            video,
          }),
        ).rejects.toThrow("move labelAt clear of the target");
      }
    },
    60_000,
  );

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

  test("a short animation is still there when a page is slow to load", async () => {
    // 0.3 s with no fill, on a page that takes a second to load: in real time
    // it would be over before the page had. A script holds the load up rather
    // than a slow server, since the page can't reach one (#157); new Date()
    // is real time, where Date.now() is the page's clock.
    const path = page(
      "slow.html",
      `<div style="width:32px;height:32px;animation:r 0.3s linear"></div>
       <style>@keyframes r { from { background: rgb(250,0,0) } to { background: rgb(0,0,0) } }</style>
       <script>const until = new Date().getTime() + 1000; while (new Date().getTime() < until);</script>`,
    );
    const out = join(dir, "slow.mp4");
    await renderHtml(path, {
      chrome: chrome(),
      out,
      width: 32,
      height: 32,
      fps: 10,
      duration: 0.5,
    });
    const reds = pixels(out, 32, 32).map((p) => p[(16 * 32 + 16) * 3] as number);
    expect(reds[0]).toBeGreaterThan(220);
    expect(Math.abs((reds[1] as number) - 167)).toBeLessThan(20);
  }, 60_000);

  test("a page can't reach the network, loopback included (#157)", async () => {
    let hits = 0;
    const server = Bun.serve({
      port: 0,
      fetch: () => {
        hits++;
        return new Response("reached");
      },
    });
    const urls = [`http://127.0.0.1:${server.port}/`, `http://localhost:${server.port}/`];
    const path = page(
      "fetch.html",
      `<script>
         mockingbird.draw = async () => {
           const tried = await Promise.allSettled(${JSON.stringify(urls)}.map((u) => fetch(u)));
           const reached = tried.findIndex((r) => r.status === "fulfilled");
           throw new Error(reached === -1 ? "every fetch failed" : "reached " + ${JSON.stringify(urls)}[reached]);
         };
       </script>`,
    );
    try {
      await expect(
        renderHtml(path, {
          chrome: chrome(),
          out: join(dir, "fetch.mp4"),
          width: 32,
          height: 32,
          fps: 10,
          duration: 0.1,
        }),
      ).rejects.toThrow(/every fetch failed/);
    } finally {
      server.stop(true);
    }
    expect(hits).toBe(0);
  }, 60_000);

  test("a page's WebRTC sends no UDP, even to a STUN server by IP (#157)", async () => {
    let packets = 0;
    const udp = await Bun.udpSocket({
      hostname: "127.0.0.1",
      socket: {
        data: () => {
          packets++;
        },
      },
    });
    const path = page(
      "webrtc.html",
      `<script>
         mockingbird.draw = async () => {
           const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:127.0.0.1:${udp.port}" }] });
           pc.createDataChannel("x");
           await pc.setLocalDescription(await pc.createOffer());
           // Real time: gathering talks to the STUN server, if it may.
           await new Promise((r) => setTimeout(r, 2000));
           throw new Error("gathered");
         };
       </script>`,
    );
    try {
      await expect(
        renderHtml(path, {
          chrome: chrome(),
          out: join(dir, "webrtc.mp4"),
          width: 32,
          height: 32,
          fps: 10,
          duration: 0.1,
        }),
      ).rejects.toThrow(/gathered/);
    } finally {
      udp.close();
    }
    expect(packets).toBe(0);
  }, 60_000);

  test("a file URL with a host fails, as Windows would read it over SMB; a local file loads (#157)", async () => {
    const png = join(dir, "dot.png");
    Bun.spawnSync([
      ..."ffmpeg -v error -y -f lavfi -i color=red:s=8x8 -frames:v 1".split(" "),
      png,
    ]);
    // On Windows the same file through the machine's own admin share, so only
    // the block can make it fail; elsewhere any file with a host.
    const remote =
      process.platform === "win32"
        ? `file://127.0.0.1/${png[0]}$/${png.slice(3).replaceAll("\\", "/")}`
        : "file://127.0.0.1/etc/hosts";
    const path = page("unc.html", `<img src="dot.png"><img src="${remote}">`);
    await expect(
      renderHtml(path, {
        chrome: chrome(),
        out: join(dir, "unc.mp4"),
        width: 8,
        height: 8,
        fps: 1,
        duration: 1,
      }),
    ).rejects.toThrow(`couldn't load ${remote}`);
  }, 60_000);

  test("any tab launchChrome opens is covered, with no setup of its own (#157)", async () => {
    // As music.ts and drawCaptions open theirs: a tab, and code run in it.
    let hits = 0;
    const server = Bun.serve({
      port: 0,
      fetch: () => {
        hits++;
        return new Response("reached");
      },
    });
    // The same picture by a local path and through a host: only the host may
    // differ, so only the gate fails it. (A picture, not a module: Windows
    // may give .js a MIME type a module won't take.)
    const png = join(dir, "raw.png");
    Bun.spawnSync([
      ..."ffmpeg -v error -y -f lavfi -i color=red:s=8x8 -frames:v 1".split(" "),
      png,
    ]);
    const local = pathToFileURL(png).href;
    const remote =
      process.platform === "win32"
        ? `file://127.0.0.1/${png[0]}$/${png.slice(3).replaceAll("\\", "/")}`
        : "file://127.0.0.1/etc/hosts";
    const rawPage = pathToFileURL(page("raw.html", "")).href;
    const chrome = await launchChrome(chromePath());
    try {
      const { targetId } = await chrome.send<{ targetId: string }>("Target.createTarget", {
        url: rawPage,
      });
      const { sessionId } = await chrome.send<{ sessionId: string }>("Target.attachToTarget", {
        targetId,
        flatten: true,
      });
      const run = async (call: string) =>
        (
          await chrome.send<{ result: { value: string } }>(
            "Runtime.evaluate",
            {
              expression: `(async () => { try { await ${call}; return "reached"; } catch { return "failed"; } })()`,
              awaitPromise: true,
              returnByValue: true,
            },
            sessionId,
          )
        ).result.value;
      const picture = (url: string) =>
        `new Promise((ok, no) => { const i = new Image(); i.onload = ok; i.onerror = no; i.src = ${JSON.stringify(url)}; })`;
      // createTarget returns before the page has loaded, and a navigation
      // under way throws away what's evaluated in it. A slow Windows runner
      // has taken more than 4 s (#216).
      for (const end = Date.now() + 15_000; ; ) {
        const at = await chrome
          .send<{ result: { value: string } }>(
            "Runtime.evaluate",
            { expression: "location.href + ' ' + document.readyState", returnByValue: true },
            sessionId,
          )
          .then((r) => r.result.value)
          .catch(() => "");
        if (at === `${rawPage} complete`) break;
        if (Date.now() > end) throw new Error(`the page didn't load: ${at}`);
        await Bun.sleep(20);
      }
      expect(await run(`fetch("http://127.0.0.1:${server.port}/")`)).toBe("failed");
      expect(await run(picture(local))).toBe("reached");
      expect(await run(picture(remote))).toBe("failed");
    } finally {
      await chrome.close();
      server.stop(true);
    }
    expect(hits).toBe(0);
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

  test("a page that draws the video gets each of its frames, in order, in every tab", async () => {
    // Frame n of the video is red 25n; the page draws it, then a green square.
    const video = join(dir, "numbered.mp4");
    Bun.spawnSync([
      ...["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=c=black:s=64x64:r=10:d=1"],
      ...["-f", "lavfi", "-i", "sine=d=1", "-vf", "geq=r='N*25':g=0:b=0", "-pix_fmt", "yuv420p"],
      ...["-shortest", video],
    ]);
    const path = page(
      "draws-video.html",
      `<canvas id="c" width="64" height="64"></canvas>
       <div style="position:absolute;left:48px;top:0;width:16px;height:16px;background:#0f0"></div>
       <script>
         mockingbird.drawVideo = true;
         const ctx = document.getElementById("c").getContext("2d");
         // A frame another tab captures gets a blank picture, never a later one.
         mockingbird.draw = (t, m) => {
           ctx.clearRect(0, 0, 64, 64);
           ctx.drawImage(m.video, 0, 0);
           const red = ctx.getImageData(16, 32, 1, 1).data[0];
           if (red > m.frame * 25 + 16) throw new Error("frame " + m.frame + " saw a later picture");
         };
       </script>`,
    );
    const out = join(dir, "draws-video.mp4");
    const frames = await renderHtml(path, {
      chrome: chrome(),
      out,
      width: 64,
      height: 64,
      fps: 10,
      duration: 1,
      video,
      audio: true,
      tabs: 4,
    });
    expect(frames).toBe(10);
    pixels(out, 64, 64).forEach((p, f) => {
      expect(Math.abs((p[(32 * 64 + 16) * 3] as number) - f * 25)).toBeLessThan(16);
      expect(p[(8 * 64 + 56) * 3 + 1]).toBeGreaterThan(200); // the page's own square
    });
    const streams = Bun.spawnSync([
      ...["ffprobe", "-v", "error", "-show_entries", "stream=codec_type", "-of", "csv=p=0", out],
    ]).stdout.toString();
    expect(streams).toContain("audio");
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

    const later = page(
      "later.html",
      `<script>mockingbird.draw = (t, m) => { if (m.frame === 9) Promise.reject(new Error("lost")) }</script>`,
    );
    await expect(renderHtml(later, { ...options, out })).rejects.toThrow("lost");
    expect(existsSync(out)).toBe(false);

    const missing = page(
      "missing-import.html",
      `<script type="module">import { nope } from "./missing.js";</script>`,
    );
    await expect(renderHtml(missing, { ...options, out })).rejects.toThrow(
      "failed while loading: a <script> or something it imports didn't load",
    );

    const image = page("missing-image.html", `<img src="nowhere.png">`);
    await expect(renderHtml(image, { ...options, out })).rejects.toThrow(
      /failed while loading: couldn't load file:.*nowhere\.png/,
    );

    const broken = page("broken.html", `<script>nope()</script>`);
    await expect(renderHtml(broken, { ...options, out })).rejects.toThrow(
      "failed while loading: Uncaught ReferenceError: nope is not defined",
    );
    await expect(renderHtml(join(dir, "missing.html"), { ...options, out })).rejects.toThrow(
      "ERR_FILE_NOT_FOUND",
    );
  }, 60_000);
});
