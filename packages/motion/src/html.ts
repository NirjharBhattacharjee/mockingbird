import { rmSync } from "node:fs";
import { availableParallelism } from "node:os";
import { pathToFileURL } from "node:url";
import type { Subprocess } from "bun";
import { type Chrome, launchChrome } from "./chrome.ts";
import type { Cue } from "./index.ts";

/** What a page sees as the global `mockingbird`, and `draw`'s second argument. */
export type PageScene = {
  width: number;
  height: number;
  fps: number;
  duration: number;
  frame: number;
  cues: Cue[];
};

/**
 * Put in every page before its own scripts: the clock, and `mockingbird`.
 * For frame `t` (in ms here, as the page's clocks count), `step` freezes
 * `performance.now()` and `Date.now()` at `t`, runs the animation-frame
 * callbacks, calls `mockingbird.draw`, and seeks every animation to `t`:
 * the stylesheet's from 0, one started later from when it started. Every
 * tab steps through every frame, capturing only its own, so they all see
 * the same history; `Math.random` is seeded the same in each for the same
 * reason.
 */
/** A font file a page can use by its family name: a file URL, its weights and style. */
export type PageFont = { family: string; url: string; weight: string; style: string };

/**
 * Registers `fonts` with the page, unloaded, as @font-face rules would: each
 * loads the first time text needs it, and the frame waits for it.
 */
export const pageFonts = (fonts: PageFont[]) =>
  `for (const f of ${JSON.stringify(fonts)}) document.fonts.add(new FontFace(f.family, "url(" + JSON.stringify(f.url) + ")", { weight: f.weight, style: f.style }));`;

export function pageClock(scene: PageScene, epoch: number, fonts: PageFont[] = []): string {
  return `(() => {
  ${pageFonts(fonts)}
  let now = 0;
  const born = new WeakMap();
  const callbacks = new Map();
  let ids = 0;
  /** What m.video is on a step this tab doesn't capture, when the page draws the video. */
  let blank = null;
  performance.now = () => now;
  Date.now = () => ${epoch} + now;
  window.requestAnimationFrame = (cb) => (callbacks.set(++ids, cb), ids);
  window.cancelAnimationFrame = (id) => callbacks.delete(id);
  let seed = 1;
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  const errors = [];
  // Captured, so a script, image or stylesheet that fails to load counts too.
  addEventListener("error", (e) => {
    const el = e.target;
    if (!el || el === window || !el.tagName) return errors.push(e.message);
    const from = el.src || el.href;
    // An inline module's failed import names no file here; the element is the best clue.
    errors.push(from ? "couldn't load " + from : "a <" + el.tagName.toLowerCase() + "> or something it imports didn't load");
  }, true);
  addEventListener("unhandledrejection", (e) => errors.push(String(e.reason?.message ?? e.reason)));
  const seek = () => {
    for (const a of document.getAnimations()) {
      if (!born.has(a)) born.set(a, now);
      a.pause();
      a.currentTime = now - born.get(a);
    }
  };
  const m = ${JSON.stringify(scene)};
  window.mockingbird = m;
  Object.defineProperty(window, "__mockingbird", { value: {
    async ready() {
      if (document.readyState !== "complete") await new Promise((r) => addEventListener("load", r, { once: true }));
      await document.fonts.ready;
      for (const a of document.getAnimations()) born.set(a, 0);
      const audio = m.audio === undefined ? null : JSON.parse(JSON.stringify(m.audio));
      return { errors, audio, drawVideo: m.drawVideo === true };
    },
    // \`picture\`, a JPEG as base64, is the video's frame \`to\`. It's m.video for that
    // frame only: the frames before it, stepped through so the page sees each time, get
    // a blank picture, so no draw sees a frame ahead of its own.
    async step(from, to, picture) {
      let bitmap = null;
      if (picture) {
        if (m.video !== blank) m.video?.close();
        blank ??= await createImageBitmap(new ImageData(m.width, m.height));
        bitmap = await createImageBitmap(await (await fetch("data:image/jpeg;base64," + picture)).blob());
      }
      for (let f = from; f <= to; f++) {
        now = (f * 1000) / m.fps;
        m.frame = f;
        if (bitmap) m.video = f === to ? bitmap : blank;
        seek();
        const due = [...callbacks.values()];
        callbacks.clear();
        for (const cb of due) cb(now);
        if (typeof m.draw === "function") {
          await m.draw(now / 1000, m);
          // A canvas drawn with a font still loading kept the fallback: draw it again.
          if ([...document.fonts].some((f) => f.status === "loading")) {
            await document.fonts.ready;
            await m.draw(now / 1000, m);
          }
        }
        seek();
        // A font draw used for the first time loads now; the frame waits for it.
        await document.fonts.ready;
        this.check();
      }
    },
    // An error the page caught nowhere, from a frame or from work it left running.
    check() {
      if (errors.length) throw new Error(errors[0]);
      // A font that failed to load would be drawn as fallback glyphs or boxes.
      for (const f of document.fonts) {
        if (f.status === "error") throw new Error("couldn't load the font " + f.family);
      }
    },
    // After the last frame: anything still running gets a turn to fail.
    async done() {
      await new Promise((r) => setTimeout(r, 0));
      this.check();
    },
  } });
})();`;
}

/**
 * Tabs capturing at once, one per core up to 8. 150 frames of a title over a
 * 1080x1920 video on an 8-core M3: 1 tab 6.4 s, 2 tabs 3.2 s, 4 tabs 2.1 s,
 * 6 tabs 1.7 s, 8 tabs 1.6 s, 12 tabs 1.7 s.
 */
const TABS = Math.min(8, availableParallelism());

/**
 * Renders the HTML page at `page` frame by frame in the Chrome at `chrome`
 * and encodes it to `out` as H.264. With `video`, its sound is kept and the
 * page is laid over each of its frames, or, if the page sets
 * `mockingbird.drawVideo = true`, the page gets each frame as `m.video` (an
 * ImageBitmap) and draws the whole picture itself. Without, a transparent
 * page comes out black. `onLoad` gets the page's `mockingbird.audio` once it has
 * loaded, before any frame is drawn. Returns how many frames were drawn.
 */
export async function renderHtml(
  page: string,
  {
    chrome: chromePath,
    out,
    width,
    height,
    fps,
    duration,
    video,
    audio = false,
    cues = [],
    fonts = [],
    tabs: tabCount = TABS,
    onLoad = () => {},
  }: {
    chrome: string;
    out: string;
    width: number;
    height: number;
    fps: number;
    duration: number;
    video?: string;
    /** Whether `video` has sound to keep. */
    audio?: boolean;
    cues?: Cue[];
    /** Fonts the page can use by name, besides the system's. */
    fonts?: PageFont[];
    tabs?: number;
    onLoad?: (page: { audio: unknown }) => void;
  },
): Promise<number> {
  if (!(Number.isInteger(tabCount) && tabCount >= 1)) {
    throw new Error(`tabs must be a whole number, 1 or more; got ${tabCount}`);
  }
  const total = Math.round(duration * fps);
  if (!(Number.isFinite(total) && total >= 1)) {
    throw new Error(
      `duration × fps must come to at least one frame; got ${duration} s at ${fps} fps`,
    );
  }
  const scene: PageScene = { width, height, fps, duration: total / fps, frame: 0, cues };
  const clock = pageClock(scene, Date.now(), fonts);
  let chrome: Chrome | undefined;
  let encoder: Subprocess<"pipe", "ignore", "pipe"> | undefined;
  let decoder: Subprocess<"ignore", "pipe", "pipe"> | undefined;
  let pictures: AsyncGenerator<Uint8Array> | undefined;
  let drawn = 0;
  try {
    chrome = await launchChrome(chromePath);
    const browser = chrome;
    const tabs = await Promise.all(
      Array.from({ length: Math.min(tabCount, total) }, () => openTab(browser, page, scene, clock)),
    );
    onLoad({ audio: tabs[0]?.audio ?? undefined });
    const drawsVideo = !!video && !!tabs[0]?.drawVideo;
    if (drawsVideo && video) {
      decoder = Bun.spawn(
        [
          ...["ffmpeg", "-nostdin", "-loglevel", "error", "-i", video, "-an"],
          ...["-vf", `fps=${fps},scale=${width}:${height},setsar=1`],
          ...["-f", "image2pipe", "-c:v", "mjpeg", "-q:v", "2", "-"],
        ],
        { stdout: "pipe", stderr: "pipe" },
      );
      pictures = jpegs(decoder.stdout);
    }

    const png = ["-f", "image2pipe", "-framerate", String(fps), "-c:v", "png", "-i", "-"];
    const inputs = video ? ["-i", video, ...png] : png;
    // The page over the video, or over black, so a half-transparent pixel blends as it shows.
    const under =
      video && !drawsVideo
        ? `[0:v]fps=${fps},scale=${width}:${height},setsar=1[under]`
        : `color=c=black:s=${width}x${height}:r=${fps}[under]`;
    const graph = `${under};[under][${video ? 1 : 0}:v]overlay=format=auto:shortest=1[v]`;
    const sound = video && audio ? ["-map", "0:a", "-c:a", "aac", "-b:a", "160k", "-shortest"] : [];
    encoder = Bun.spawn(
      [
        ...["ffmpeg", "-nostdin", "-loglevel", "error", "-y", ...inputs],
        ...["-filter_complex", graph, "-map", "[v]", ...sound],
        ...["-c:v", "libx264", "-crf", "18", "-preset", "veryfast", "-pix_fmt", "yuv420p"],
        ...["-movflags", "+faststart", out],
      ],
      { stdin: "pipe", stderr: "pipe" },
    );

    // Frame i is captured by tab i % tabs, a few frames ahead, and handed to ffmpeg in order.
    const queues = tabs.map(() => Promise.resolve());
    const stepped = tabs.map(() => -1);
    const pending: Promise<Buffer>[] = [];
    let next = 0;
    let picture: Promise<string | undefined> = Promise.resolve(undefined);
    const schedule = () => {
      const i = next++;
      const k = i % tabs.length;
      const tab = tabs[k] as Tab;
      // In order, one per frame; when the video runs out, the last one stays.
      const frame = picture.then(async (last) => {
        const got = await pictures?.next();
        if (got && !got.done) return Buffer.from(got.value).toString("base64");
        // The pictures ended: the video ran out, or ffmpeg failed and the render must too.
        if (decoder && (await decoder.exited) !== 0) {
          const why = (await new Response(decoder.stderr).text()).trim();
          throw new Error(`ffmpeg couldn't decode ${video}: ${why}`);
        }
        return last;
      });
      picture = frame;
      const shot = (queues[k] as Promise<void>).then(async () => {
        const jpeg = pictures ? JSON.stringify((await frame) ?? "") : '""';
        // Every frame since its last, so its page has seen each of them.
        await onClock(browser, tab, `step(${(stepped[k] as number) + 1}, ${i}, ${jpeg})`, i, fps);
        stepped[k] = i;
        const { data } = await browser.send<{ data: string }>(
          "Page.captureScreenshot",
          { format: "png", optimizeForSpeed: true },
          tab.session,
        );
        return Buffer.from(data, "base64");
      });
      queues[k] = shot.then(
        () => {},
        () => {},
      );
      shot.catch(() => {}); // reported where it's awaited, in order
      pending.push(shot);
    };
    while (next < Math.min(total, tabs.length * 2)) schedule();
    while (drawn < total) {
      const frame = await (pending.shift() as Promise<Buffer>);
      if (next < total) schedule();
      encoder.stdin.write(frame);
      await encoder.stdin.flush();
      drawn++;
    }
    // A page that failed after its last frame was captured fails the render too.
    for (const tab of tabs) await onClock(browser, tab, "done()", total - 1, fps);
    await encoder.stdin.end();
    if ((await encoder.exited) !== 0) {
      throw new Error(
        `ffmpeg couldn't encode ${out}: ${(await new Response(encoder.stderr).text()).trim()}`,
      );
    }
    // And once more for anything that failed while ffmpeg finished.
    for (const tab of tabs) await onClock(browser, tab, "done()", total - 1, fps);
    return drawn;
  } catch (error) {
    // ffmpeg acts on SIGTERM only between writes, so a blocked one needs SIGKILL.
    encoder?.kill("SIGKILL");
    await encoder?.exited;
    rmSync(out, { force: true });
    throw error;
  } finally {
    // A decoder cut short is blocked writing frames nobody reads.
    decoder?.kill("SIGKILL");
    await pictures?.return(undefined);
    await chrome?.close();
  }
}

/**
 * The JPEGs in an MJPEG stream, one at a time. Each ends at the end-of-image
 * marker FF D9, which can't appear inside the coded data (a 0xFF there is
 * always followed by 0x00).
 */
export async function* jpegs(stream: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
  let held = new Uint8Array(0);
  for await (const chunk of stream) {
    const joined = new Uint8Array(held.length + chunk.length);
    joined.set(held);
    joined.set(chunk, held.length);
    let start = 0;
    for (let i = Math.max(1, held.length); i < joined.length; i++) {
      if (joined[i - 1] === 0xff && joined[i] === 0xd9) {
        yield joined.slice(start, i + 1);
        start = i + 1;
      }
    }
    held = joined.slice(start);
  }
}

type Tab = { session: string; audio: unknown; drawVideo: boolean };

/** A tab the size of the video, transparent, with the clock in and `page` loaded. */
async function openTab(chrome: Chrome, page: string, scene: PageScene, clock: string) {
  const { targetId } = await chrome.send<{ targetId: string }>("Target.createTarget", {
    url: "about:blank",
  });
  const { sessionId: session } = await chrome.send<{ sessionId: string }>("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  await chrome.send(
    "Emulation.setDeviceMetricsOverride",
    { width: scene.width, height: scene.height, deviceScaleFactor: 1, mobile: false },
    session,
  );
  await chrome.send(
    "Emulation.setDefaultBackgroundColorOverride",
    { color: { r: 0, g: 0, b: 0, a: 0 } },
    session,
  );
  // Without Page.enable, Chrome keeps the script but doesn't run it.
  await chrome.send("Page.enable", {}, session);
  // Animations stand still in real time, so one can't play out, end and vanish
  // while a slow page loads; each frame seeks them instead.
  await chrome.send("Animation.enable", {}, session);
  await chrome.send("Animation.setPlaybackRate", { playbackRate: 0 }, session);
  await chrome.send("Page.addScriptToEvaluateOnNewDocument", { source: clock }, session);
  const { errorText } = await chrome.send<{ errorText?: string }>(
    "Page.navigate",
    { url: pathToFileURL(page).href },
    session,
  );
  if (errorText) throw new Error(`Chrome couldn't open ${page}: ${errorText}`);
  const ready = await evaluate(chrome, session, "__mockingbird.ready()");
  const { errors, audio, drawVideo } = ready as Omit<Tab, "session"> & { errors: string[] };
  if (errors.length) throw new Error(`${page} failed while loading: ${errors[0]}`);
  return { session, audio, drawVideo };
}

/** Runs `call` on the page's clock in `tab`, naming `frame` if the page fails. */
async function onClock(chrome: Chrome, tab: Tab, call: string, frame: number, fps: number) {
  try {
    await evaluate(chrome, tab.session, `__mockingbird.${call}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `the page failed by ${(frame / fps).toFixed(2)} s (frame ${frame}): ${message}`,
    );
  }
}

async function evaluate(chrome: Chrome, session: string, expression: string): Promise<unknown> {
  const { result, exceptionDetails } = await chrome.send<{
    result?: { value?: unknown };
    exceptionDetails?: { text: string; exception?: { description?: string } };
  }>("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, session);
  if (exceptionDetails) {
    throw new Error(
      exceptionDetails.exception?.description?.split("\n")[0] ?? exceptionDetails.text,
    );
  }
  return result?.value;
}
