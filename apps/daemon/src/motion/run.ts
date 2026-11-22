import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { parseSrt } from "@mockingbird/captions";
import { noNetwork } from "@mockingbird/motion/sandbox";
import { clock } from "../clock.ts";
import { toSdrFor } from "../inspect/hdr.ts";
import { probe } from "../inspect/probe.ts";
import { findChrome, fontFaces } from "../models.ts";
import { requireFile } from "../runtime.ts";
import { withKit } from "./kit.ts";

const MOTION_RUNNER = join(import.meta.dir, "runner.ts");
/** A number from `min` to `max`, or `fallback` when absent; the message is mcp/args.ts's `within`, which a domain can't import. */
function within(value: unknown, min: number, max: number, what: string, fallback: number) {
  if (value === undefined || value === null) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new Error(`${what} must be from ${min} to ${max}; got ${JSON.stringify(value)}`);
  }
  return n;
}

/** Two hours: past any real video, short of a frame count that never ends. */
export const MOTION_MAX_SECONDS = 7200;

/**
 * Runs MOTION_RUNNER with `options` in a fresh process, sandboxed with no
 * network where the OS can (Chrome blocks it everywhere): the script is the client's code, and mockingbird's only download
 * is `models pull`. Returns what it printed.
 */
export async function sandboxed(options: object, what: string): Promise<string> {
  const proc = Bun.spawn(
    [...noNetwork(), process.execPath, MOTION_RUNNER, JSON.stringify(options)],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [said, why, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(why.trim() || `${what} stopped (exit ${code})`);
  return said;
}

/** Chrome's path, or the error that says how to get it. */
export function needChrome(): string {
  const chrome = findChrome();
  if (chrome) return chrome;
  throw new Error(
    process.env.MOCKINGBIRD_CHROME
      ? `MOCKINGBIRD_CHROME is ${process.env.MOCKINGBIRD_CHROME}, which isn't a program that can run. Ask the user to fix it, or to unset it and run \`mockingbird models pull chrome\`.`
      : "An HTML page renders in a headless Chrome that isn't downloaded yet. Ask the user to run `mockingbird models pull chrome` (about 100 MB), or to set MOCKINGBIRD_CHROME to one.",
  );
}

/** What a render needs from outside the domain: render owns output names, loudness and ffmpeg (#300). */
export type Host = {
  /** `out`, or the first free `<name>-<kind>-N.mp4` beside `path`, claimed. */
  outputFor: (path: string, out: string | undefined, sidecar: boolean, kind: string) => string;
  /** Creates `file` empty, or returns false if it exists. */
  claim: (file: string) => boolean;
  /** Mixes `sounds` into the video `target` in place, under its own sound if `audio`, brought to LUFS. */
  mix: (target: string, o: { audio: boolean; sounds: Sound[]; seconds: number }) => Promise<void>;
  ffmpeg: (args: string[], what: string) => Promise<void>;
};
export type Sound = { path: string; at: number; volume: number; loop: boolean; duck: boolean };

export type Motion = (script: string, options: MotionOptions) => Promise<string>;
export type MotionOptions = {
  path?: string;
  size?: string;
  duration?: number;
  fps?: number;
  captions?: string;
  out?: string;
  /** Draw on the GPU; by default, when the page imports "THREE". */
  gpu?: boolean;
};

/**
 * Renders `script`, an HTML page, in Chrome, over the video at `path` or on
 * its own at `size` for `duration` seconds, and saves the result. It runs in its own
 * sandboxed process with no network, Chrome included.
 */
export function makeMotion(host: Host): Motion {
  return async function motion(
    script: string,
    { path, size = "1080x1920", duration, fps = 30, captions, out, gpu }: MotionOptions,
  ): Promise<string> {
    requireFile(script, "Script");
    if (path) requireFile(path, "File");
    if (!/\.html?$/i.test(script)) {
      throw new Error(
        `motion renders an HTML page; ${script} isn't one. Canvas scripts went with the Canvas engine (#169): draw on a <canvas> in a page, with the kit's page() (guide("motion-graphics")).`,
      );
    }
    const chrome = needChrome();
    let seconds = duration;
    let audio = false;
    let picture = size;
    let videoFilters: string | undefined;
    if (path) {
      const source = await probe(path);
      if (!source.video) throw new Error(`${path} has no video, only audio.`);
      picture = source.size;
      audio = source.audio;
      seconds = Math.min(duration ?? source.seconds, source.seconds);
      // An HDR video is brought to SDR before the page sees it or it's drawn under (#252).
      videoFilters = toSdrFor(source.transfer);
    }
    const [width = 0, height = 0] = picture.split("x").map(Number);
    if (
      !/^\d+x\d+$/.test(picture) ||
      width % 2 ||
      height % 2 ||
      width < 16 ||
      height < 16 ||
      width > 4096 ||
      height > 4096
    ) {
      throw new Error(`size must be WIDTHxHEIGHT, even, 16 to 4096; got ${picture}`);
    }
    if (!seconds) throw new Error("Give a `duration` in seconds, or a video `path` to draw over.");
    if (!(seconds <= MOTION_MAX_SECONDS)) {
      throw new Error(`duration must be at most ${MOTION_MAX_SECONDS} s; got ${seconds}`);
    }
    const target = host.outputFor(path ?? script, out, false, "motion");
    const started = performance.now();
    const page = withKit(script);
    const options = {
      script: page,
      chrome,
      out: target,
      width,
      height,
      fps,
      duration: seconds,
      video: path,
      audio,
      cues: captions?.trim() ? parseSrt(captions) : [],
      fonts: fontFaces(),
      videoFilters,
      // A three.js page draws on the GPU; 2D pages keep software rendering's exact pixels (#270).
      gpu: gpu ?? /from "THREE(_ADDONS)?"/.test(readFileSync(script, "utf8")),
    };
    let said: string;
    try {
      said = await sandboxed(options, "the motion script");
    } catch (error) {
      rmSync(target, { force: true });
      throw error;
    } finally {
      if (page !== script) rmSync(page, { force: true });
    }
    let frames = 0;
    let warnings: string[] = [];
    let fonts: unknown = [];
    try {
      // The runner's last line; a script's own console.log comes before it. A
      // script that exits early leaves none, and the claimed target goes with the error.
      let result: { frames?: unknown; sounds?: unknown; warnings?: unknown; fonts?: unknown } = {};
      try {
        result = JSON.parse(said.trim().split("\n").at(-1) || "{}") ?? {};
      } catch {}
      frames = Number(result.frames);
      warnings = Array.isArray(result.warnings) ? result.warnings.map(String) : [];
      fonts = result.fonts;
      if (!Number.isInteger(frames) || frames < 1) {
        throw new Error("the motion script stopped without drawing; did it call process.exit?");
      }
      // The script's `audio` export, its paths already from the script's folder.
      const sounds = (Array.isArray(result.sounds) ? result.sounds : []).map((s, i): Sound => {
        const t = (s ?? {}) as Record<string, unknown>;
        return {
          path: requireFile(String(t.path), `audio[${i}]`),
          at: within(t.at, 0, Number.MAX_VALUE, `audio[${i}].at`, 0),
          volume: within(t.volume, 0, 4, `audio[${i}].volume`, 1),
          loop: !!t.loop,
          duck: !!t.duck,
        };
      });
      if (sounds.length) await host.mix(target, { audio, sounds, seconds: frames / fps });
    } catch (error) {
      rmSync(target, { force: true });
      throw error;
    }
    const took = ((performance.now() - started) / 1000).toFixed(1);
    // Which fonts drew its text, so a substitution can't hide, and any it lacked (#276).
    const families = Array.isArray(fonts) && fonts.length ? `; fonts: ${fonts.join(", ")}` : "";
    const warned = warnings.length ? `. Warning: ${warnings.join(" ")}` : "";
    return `${target} (${clock((frames / fps) * 1000)}, ${width}x${height}, ${fps} fps), drawn in ${took} s${families}${warned}`;
  };
}
