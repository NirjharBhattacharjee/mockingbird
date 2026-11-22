import { createHash, type Hash, randomUUID } from "node:crypto";
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AsrWord } from "@mockingbird/asr";
import { tempo } from "@mockingbird/audio";
import {
  CAPTION_FONTS,
  CAPTION_PRESETS,
  type CaptionStyle,
  type Cue,
  captionStyle,
  drawCaptions,
  hanOrder,
  parseSrt,
} from "@mockingbird/captions";
import type { MusicParams, PageFont } from "@mockingbird/motion";
import { noNetwork } from "@mockingbird/motion/sandbox";
import {
  apply,
  compile,
  edit,
  lengthOf,
  load,
  lookGate,
  type Move,
  type Project,
  transcript,
  type Word,
  wanted,
} from "@mockingbird/timeline";
import { type Source, toFcpxml, toOtio } from "@mockingbird/timeline/export";
import { clock, fineClock } from "./clock.ts";
import { type Ctx, EFFECTS, type Effect } from "./effects/catalog.ts";
import { checkEffects, effectFilters, masked, pictureSteps } from "./effects/filters.ts";
import { checkPath, type Mask } from "./effects/masks.ts";
import { subjectMask } from "./effects/subject.ts";
import { guide, PLUGIN, playbooks } from "./guide.ts";
import { BT709, toSdrFor } from "./inspect/hdr.ts";
import { even, probe, quoted } from "./inspect/probe.ts";
import { along, type TrackPoint } from "./inspect/track.ts";
import { area, items, seconds, stretch, within } from "./mcp/args.ts";
import type { Tool } from "./mcp/types.ts";
import { findChrome, fontFaces } from "./models.ts";
import { withKit } from "./motion/kit.ts";
import { type Host, MOTION_MAX_SECONDS, makeMotion, needChrome, sandboxed } from "./motion/run.ts";
import {
  checkChoice,
  type ModelChoice,
  mockingbirdHome,
  requireFile,
  spokenLanguage,
} from "./runtime.ts";
import { clipWords } from "./transcript/clips.ts";
import { choiceOf } from "./transcript/transcribe.ts";
import { type Span, sourceWords } from "./transcript/words.ts";

/** The captions file's name in render's temp folder. */
const CAPTIONS = "captions.srt";

/**
 * A stretch of the source to keep, in seconds. `focus` is the point to keep
 * in frame (0–1 of the width and height, default the middle) and `zoom`
 * how far to punch in on it (1 to 4, default 1). `path` is its own source,
 * for a project's clips; without it, render's.
 */
export type Clip = {
  from: number;
  to: number;
  focus?: { x: number; y: number };
  zoom?: number;
  path?: string;
  /** A project's: played faster or slower, framed differently as it plays, and how it comes in. */
  speed?: number;
  moves?: Move[];
  transition?: { type: string; duration: number };
  /** Where its sound comes from in the source, when a J or L cut moves it off the picture's stretch. */
  sound?: { from: number; to: number };
  /** From the effects catalog (#197), on its picture and its sound. */
  effects?: Effect[];
};

/** The stretch of the source a clip's input opens: its picture's and its sound's together. */
const opened = (c: Clip) => ({
  from: Math.min(c.from, c.sound?.from ?? c.from),
  to: Math.max(c.to, c.sound?.to ?? c.to),
});

/**
 * Each clip's start in the finished video and the video's length: a clip
 * lasts its source stretch over its speed, and one with a transition starts
 * that much before the clip ahead of it ends.
 */
export function timeline(clips: Clip[]): { starts: number[]; length: number } {
  const starts: number[] = [];
  let length = 0;
  for (const c of clips) {
    const start = Math.max(0, length - (c.transition?.duration ?? 0));
    starts.push(start);
    length = start + lengthOf(c);
  }
  return { starts, length };
}

export { tempo };

/**
 * The perspective filter that frames a clip with moves: each frame, a window
 * of `shape`'s width to height around the focus, made smaller by the zoom,
 * mapped onto the whole frame with sub-pixel accuracy, then scaled to
 * `shape`. Measured on a slow push: crop sizes and positions rounded to whole
 * pixels jitter (frame-to-frame change 7.6 ± 3.9 for scale and overlay, 9.0 ±
 * 2.7 for zoompan, against 3.4 ± 0.3 for a 4x supersampled reference);
 * perspective moved 3.1 ± 0.06, at the same speed (#161). The clip's time is
 * its frame number over `fps`, as perspective has no other clock.
 */
export function moving(clip: Clip, shape: string, fps: number): string {
  const [sw = 1, sh = 1] = shape.split("x").map(Number);
  const [a, b] = [sw / gcd(sw, sh), sh / gcd(sw, sh)];
  const t = `(in/${fps})`;
  // Each value over time: a nested if() of eased segments, then the last value held.
  const over = (pick: (s: { focus: { x: number; y: number }; zoom: number }) => number) => {
    let at = 0;
    let now = { focus: clip.focus ?? { x: 0.5, y: 0.5 }, zoom: clip.zoom ?? 1 };
    const parts: [number, string][] = [];
    for (const m of clip.moves ?? []) {
      const next = { focus: m.focus ?? now.focus, zoom: m.zoom ?? now.zoom };
      const [from, to] = [pick(now), pick(next)];
      const u = `clip((${t}-${at})/${Math.max(m.at - at, 1e-3)},0,1)`;
      const eased = m.ease === "linear" ? u : `(${u}*${u}*(3-2*${u}))`;
      parts.push([m.at, from === to ? `${from}` : `(${from}+${to - from}*${eased})`]);
      at = m.at;
      now = next;
    }
    return parts.reduceRight(
      (rest, [until, value]) => `if(lt(${t},${until}),${value},${rest})`,
      `${pick(now)}`,
    );
  };
  const z = over((s) => s.zoom);
  const w = `(min(W,H*${a}/${b})/${z})`;
  const h = `(min(H,W*${b}/${a})/${z})`;
  const x = `clip(${over((s) => s.focus.x)}*W-${w}/2,0,W-${w})`;
  const y = `clip(${over((s) => s.focus.y)}*H-${h}/2,0,H-${h})`;
  const corners = [
    [x, y],
    [`${x}+${w}`, y],
    [x, `${y}+${h}`],
    [`${x}+${w}`, `${y}+${h}`],
  ];
  const points = corners.flatMap(([cx, cy], i) => [`x${i}='${cx}'`, `y${i}='${cy}'`]).join(":");
  return `perspective=${points}:interpolation=linear:eval=frame,scale=${shape.replace("x", ":")},setsar=1`;
}

/** An area of the source: its left, top, width and height, each 0–1 of the picture. */
export type Area = { x: number; y: number; w: number; h: number };

/** A sound laid under the speech, from `at` seconds into the finished video. */
export type Sound = { at: number; volume: number; loop: boolean; duck: boolean };

/** Where caption images sit unless told: a little below the middle, where Shorts and Reels leave room for text. */
export const CAPTIONS_Y = 0.7;

/** Each motion style's typography roles (#276), from plugin/skills/motion-graphics/styles/roles.json. */
type Roles = Record<
  string,
  {
    title: { family: string };
    body: { family: string };
    ink: string;
    accent: string;
    background: string;
  }
>;
let roles: Roles | undefined;

/**
 * A caption style with `look: "<style id>"` turned into fields: the look's
 * title font if a caption can use it (its body font, or Inter, if not), and
 * its accent (or ink) for the spoken word when it's light enough to read on
 * the outline, so the approved look sets the captions with its titles.
 * Anything else given stays as given.
 */
export function lookCaptions(v: unknown, what = "captionStyle"): unknown {
  if (!v || typeof v !== "object" || !("look" in v)) return v;
  const { look, ...rest } = v as Record<string, unknown>;
  roles ??= JSON.parse(
    readFileSync(join(PLUGIN, "skills", "motion-graphics", "styles", "roles.json"), "utf8"),
  ) as Roles;
  const r = roles[String(look)];
  if (!r) throw new Error(`${what}.look: no style "${look}"; see the motion-graphics styles`);
  const usable = (f: string) => (CAPTION_FONTS as readonly string[]).includes(f);
  const font = usable(r.title.family)
    ? r.title.family
    : usable(r.body.family)
      ? r.body.family
      : "Inter";
  // Captions are light text on a black outline: a dark accent would vanish, so
  // the look's accent if it's light enough, else its ink, else the preset's.
  const light = (c: string) => {
    if (!/^#[0-9a-f]{6}$/i.test(c)) return false;
    const n = Number.parseInt(c.slice(1), 16);
    return (
      (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255 >= 0.35
    );
  };
  const accent = [r.accent, r.ink].find(light);
  // The colour goes where the preset puts its lit word: behind it on a pill
  // (the word stays dark on it), on it otherwise, and nowhere for a preset
  // with no lit word, like subtitle.
  const presets: Record<string, CaptionStyle> = CAPTION_PRESETS;
  const p = presets[String(rest.preset ?? "classic")];
  const lit = !p ? {} : p.pill ? { pill: accent } : p.active !== p.fill ? { active: accent } : {};
  return { font, ...(accent && lit), ...rest };
}

/** render's `captionStyle`, and a project's `captions.style` (#276). */
const CAPTION_STYLE_SCHEMA = {
  description: `How the captions and texts look: a preset's name (${Object.keys(CAPTION_PRESETS).join(", ")}; default classic, white Inter 700 with a black outline and the *spoken* word yellow), or an object with \`preset\` and any of: font (${CAPTION_FONTS.join(", ")}), weight, upper (capitals, which get 0.06 em of tracking), tracking (em), fill, stroke and active (colours; active is the *spoken* word's), outline (0-0.5 of the text height), shadow, pill (a colour behind the spoken word), maxChars (about this many characters a line), pop (1-1.4: the spoken word that much bigger), keyword (the colour of a word written **like this**, drawn 15% bigger) and look (a motion style's id: its title font and accent, so the approved look sets the captions too). subtitle suits long-form; creator and pill suit Shorts.`,
  oneOf: [
    { type: "string", enum: Object.keys(CAPTION_PRESETS) },
    {
      type: "object",
      properties: {
        preset: { type: "string", enum: Object.keys(CAPTION_PRESETS) },
        font: { type: "string", enum: [...CAPTION_FONTS] },
        weight: { type: "number" },
        upper: { type: "boolean" },
        tracking: { type: "number" },
        fill: { type: "string" },
        stroke: { type: "string" },
        active: { type: "string" },
        pill: { type: "string" },
        outline: { type: "number" },
        shadow: { type: "boolean" },
        maxChars: { type: "number" },
        pop: { type: "number" },
        keyword: { type: "string" },
        look: { type: "string" },
      },
      additionalProperties: false,
    },
  ],
};

/** The loudness Shorts, Reels, TikTok and YouTube play at: EBU R128 integrated, in LUFS. */
const LUFS = -14;

/**
 * Holds peaks under -1.5 dBTP, oversampled 4x so the peaks between samples
 * are caught too, as a true-peak meter reads them. It limits at -2 dB, since
 * encoding to AAC afterwards adds about 0.3 dB to the peaks.
 */
const LIMIT =
  "aresample=192000,alimiter=limit=-2dB:level=false:attack=5:release=50,aresample=48000";

/** The most gain `level` adds: past it is mostly the noise floor of a near-silent file. */
const MAX_GAIN = 30;

/**
 * Square pixels at the width the picture is shown at. Every clip starts with
 * it: concat refuses clips whose pixel shapes differ, and crops then measure
 * the picture as it's seen.
 */
const SQUARE = "scale='trunc(iw*sar/2)*2':ih,setsar=1";

/** What SQUARE does to a width: down to an even number. */

/** `area` of the picture, scaled and cropped to fill `w`x`h`. Even sizes, which yuv420p needs. */
const fill = ({ x, y, w, h }: Area, size: string) =>
  `crop=w='floor(${w}*iw/2)*2':h='floor(${h}*ih/2)*2':x='${x}*iw':y='${y}*ih',` +
  `scale=${size.replace("x", ":")}:force_original_aspect_ratio=increase,crop=${size.replace("x", ":")}`;

function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : a;
}

/**
 * The filters that frame one clip: the widest window of `size`'s width to
 * height around its focus, made smaller by its zoom, scaled to `size`.
 */
function frame({ focus = { x: 0.5, y: 0.5 }, zoom = 1 }: Clip, size: string) {
  const [sw = 1, sh = 1] = size.split("x").map(Number);
  const [a, b] = [sw / gcd(sw, sh), sh / gcd(sw, sh)];
  const crop =
    `crop=w='floor(min(iw,ih*${a}/${b})/${zoom}/2)*2':h='floor(min(ih,iw*${b}/${a})/${zoom}/2)*2'` +
    `:x='clip(${focus.x}*iw-ow/2,0,iw-ow)':y='clip(${focus.y}*ih-oh/2,0,ih-oh)'`;
  return `,${crop},scale=${size.replace("x", ":")},setsar=1`;
}

/**
 * A clip as render hands it on: `silent` if its source has no sound, and
 * `sdr`, the filters that bring an HDR source's picture to SDR, or label an
 * SDR clip BT.709 to match in an edit with HDR in it (#252).
 */
type Shaped = Clip & { silent?: boolean; sdr?: string };

/**
 * The ffmpeg filter graph that joins `clips` in order, each its own input
 * (0, 1, …, from seekClips), cropped to `size`'s shape around its focus,
 * punched in by its zoom or moved by its moves, scaled to `size` and set to
 * `fps`, so clips from any sources join; or with `split`'s two areas stacked
 * into 1080x1920. Then,
 * over the picture: `inserts` (images or videos, the inputs after the
 * overlays), and `overlays` (text drawn as images, the inputs after the
 * clips), each for its stretch of the finished video in seconds, its middle
 * at `y` of the height. `burn` draws the captions in CAPTIONS over all of it,
 * at `captionsY`. `sounds` (the inputs after the inserts) are mixed under the
 * speech, the sound cut to the picture's length unless `whole`, and left
 * for `level` to bring to LUFS. `size` is the finished picture's, `WxH` (a
 * split's clips are brought to it before their areas are taken). A `silent`
 * clip's sound is silence; an `sdr` clip's picture goes through those filters first. Ends in [v], and [a] if there's sound.
 */
/**
 * Clip `i`'s sound as the render hears it, from input `i`: its own stretch
 * (a J or L cut's), its speed and its sound effects. speechGain measures
 * this, so a `gain` effect (a project's `level`) isn't lifted twice.
 */
export function soundOf(clip: Shaped, i: number, ctx: Ctx): string {
  const start = opened(clip).from;
  const heard = clip.sound ?? clip;
  const acut = clip.sound
    ? `atrim=start=${heard.from - start}:duration=${heard.to - heard.from},`
    : "";
  const speed = clip.speed && clip.speed !== 1 ? `,${tempo(clip.speed)}` : "";
  const fx = effectFilters(clip.effects, ctx).audio;
  return `[${i}:a]${acut}asetpts=PTS-STARTPTS${speed}${fx ? `,${fx}` : ""}`;
}

export function renderGraph(
  clips: Shaped[],
  {
    audio,
    size = "1920x1080",
    fps,
    split,
    burn = false,
    captionsY = CAPTIONS_Y,
    overlays = [],
    inserts = [],
    sounds = [],
    whole = false,
    gain = 0,
    adjust = [],
  }: {
    audio: boolean;
    size?: string;
    fps: number;
    split?: { top: Area; bottom: Area };
    burn?: boolean;
    captionsY?: number;
    overlays?: (Omit<Cue, "text"> & { y?: number })[];
    inserts?: (Omit<Cue, "text"> & Look & { sdr?: string })[];
    /** Adjustment layers: effects on everything under the text for a stretch (#198). */
    adjust?: (Omit<Cue, "text"> & { effects: Effect[] })[];
    sounds?: Sound[];
    whole?: boolean;
    /** The speech's gain in dB before sounds are mixed under it: see mixGraph. */
    gain?: number;
  },
): string {
  const out = split ? "1080x1920" : size;
  // Transitions overlap clips with xfade, which needs every input on one timebase.
  const chained = clips.some((c, i) => i > 0 && c.transition);
  // A J or L cut makes a clip's sound longer or shorter than its picture, so they're joined apart.
  const apart = clips.some((c) => c.sound);
  // A split takes its areas from the whole picture, so its clips aren't framed
  // one by one, only brought to one size if they're from different sources.
  const parts = clips.map((clip, i) => {
    const speed = clip.speed && clip.speed !== 1 ? `,setpts=PTS/${clip.speed}` : "";
    // Slow motion made of new frames, not repeats (#200): motion-compensated, after the
    // framing so it works on the finished size, before fps would repeat frames.
    const rate = clip.effects?.some((e) => e.name === "interpolate")
      ? `minterpolate=fps=${fps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,fps=${fps}`
      : `fps=${fps}`;
    const look =
      split || !clip.moves?.length
        ? `${frame(split ? { from: 0, to: 0 } : clip, size)},${rate}`
        : `,${rate},${moving(clip, size, fps)}`;
    const tb = chained ? `,settb=1/${fps}` : "";
    // The input opens the picture's and the sound's stretches together; each takes its own.
    const start = opened(clip).from;
    const cut = clip.sound
      ? `trim=start=${clip.from - start}:duration=${clip.to - clip.from},`
      : "";
    const [width, height] = size.split("x").map(Number) as [number, number];
    const ctx = { width, height, fps, length: lengthOf(clip), speed: clip.speed ?? 1 };
    const fx = effectFilters(clip.effects, ctx);
    // A subject mask's video goes through the clip's own speed and framing, so
    // it stays on the person through a crop, a punch-in or a move (#260).
    const effects = (clip.effects ?? []).map((e) => {
      const m = e.mask as Mask | undefined;
      if (m?.shape !== "subject" || !m.file) return e;
      // Back to the source's shape first (MODNet's sides are multiples of 32, a
      // slightly different one), 540 high: the framing scales it from there.
      const [sw = 16, sh = 9] = (m.size ?? "").split("x").map(Number);
      const back = m.size ? `,scale=${even((540 * sw) / sh)}:540` : "";
      const source = `movie=filename=${quoted(m.file)}${back},setpts=PTS-STARTPTS${speed},setsar=1${look},tpad=stop_mode=clone:stop_duration=1,trim=duration=${ctx.length}`;
      return { ...e, mask: { ...m, source } };
    });
    const head = `[${i}:v]${clip.sdr ? `${clip.sdr},` : ""}${cut}setpts=PTS-STARTPTS${speed},${SQUARE}${look}`;
    // A masked effect needs labels of its own (#198); the rest stay one chain.
    const v = masked(clip.effects)
      ? [
          `${head}[b${i}]`,
          ...pictureSteps(effects, `[b${i}]`, `[e${i}]`, ctx, `c${i}`),
          `[e${i}]${tb ? tb.slice(1) : "null"}[v${i}]`,
        ].join(";")
      : `${head}${fx.video ? `,${fx.video}` : ""}${tb}[v${i}]`;
    if (!audio) return v;
    const heard = clip.sound ?? clip;
    const a = clip.silent
      ? `aevalsrc=0:c=stereo:s=48000:d=${(heard.to - heard.from) / (clip.speed ?? 1)}[a${i}]`
      : `${soundOf(clip, i, ctx)}[a${i}]`;
    return `${v};${a}`;
  });
  const inputs = clips.map((_, i) => (audio ? `[v${i}][a${i}]` : `[v${i}]`)).join("");
  const joined = chained
    ? chain(clips, audio, fps)
    : apart
      ? [
          `${clips.map((_, i) => `[v${i}]`).join("")}concat=n=${clips.length}:v=1:a=0[joined]`,
          ...(audio
            ? [`${clips.map((_, i) => `[a${i}]`).join("")}concat=n=${clips.length}:v=0:a=1[speech]`]
            : []),
        ].join(";")
      : `${inputs}concat=n=${clips.length}:v=1:a=${audio ? 1 : 0}[joined]${audio ? "[speech]" : ""}`;
  const stacked = split && [
    "[joined]split[upper][lower]",
    `[upper]${fill(split.top, "1080x960")}[top]`,
    `[lower]${fill(split.bottom, "1080x960")}[bottom]`,
    "[top][bottom]vstack,setsar=1[stacked]",
  ];
  const base = stacked ? "[stacked]" : "[joined]";
  // Inserts go under the text, so captions stay readable over b-roll, and
  // adjustment layers between them, so they change the inserts too (#198).
  const [W, H] = out.split("x").map(Number) as [number, number];
  type Layer = {
    start: number;
    end: number;
    y?: number;
    input: number;
    kind: string;
    sdr?: string;
  } & Look;
  const layers: Layer[] = [
    ...inserts.map((cue, i) => ({
      ...cue,
      y: 0,
      input: clips.length + overlays.length + i,
      kind: "insert",
    })),
    ...adjust.map((a) => ({ ...a, input: -1, kind: "adjust" })),
    ...overlays.map((cue, i) => ({ ...cue, input: clips.length + i, kind: "text" })),
  ];
  const label = (i: number) => (i < layers.length ? `[c${i}]` : burn ? "[laid]" : "[v]");
  const laid = layers.flatMap((layer, i) => {
    const { start, end, y = CAPTIONS_Y, input, kind } = layer;
    const when = `enable='gte(t,${start})*lt(t,${end})'`;
    if (kind === "text") {
      return `${label(i)}[${input}:v]overlay=x=(main_w-overlay_w)/2:y=main_h*${y}-overlay_h/2:${when}${label(i + 1)}`;
    }
    const ctx = { width: W, height: H, fps, length: end - start };
    if (kind === "adjust") {
      // Its stretch of everything under it, through its effects, laid back over it.
      return [
        `${label(i)}split[ak${i}][ae${i}]`,
        `[ae${i}]trim=start=${start}:end=${end},setpts=PTS-STARTPTS[ar${i}]`,
        ...pictureSteps(layer.effects ?? [], `[ar${i}]`, `[ag${i}]`, ctx, `a${i}`),
        `[ag${i}]setpts=PTS+${start}/TB[ad${i}]`,
        `[ak${i}][ad${i}]overlay=eof_action=pass:${when}${label(i + 1)}`,
      ];
    }
    const { box, blend, effects = [], moves } = layer;
    // HDR b-roll is brought to SDR like the clips under it (#252).
    const sdr = layer.sdr ? `${layer.sdr},` : "";
    if (!box && !blend && !effects.length && !moves?.length) {
      // Its own first frame lands at `start`; once it runs out, the picture underneath shows again.
      const shaped = `[${input}:v]${sdr}trim=duration=${end - start},setpts=PTS-STARTPTS+${start}/TB,${fill({ x: 0, y: 0, w: 1, h: 1 }, out)},setsar=1[i${i}]`;
      return [shaped, `${label(i)}[i${i}]overlay=eof_action=pass:${when}${label(i + 1)}`];
    }
    // A box is a picture in the picture: the insert filled to the box, laid at its corner.
    const shape = box ? `${evenSize(box.w * W)}x${evenSize(box.h * H)}` : out;
    const [bw, bh] = shape.split("x").map(Number) as [number, number];
    const moved = moves?.length
      ? `,${moving({ from: 0, to: end - start, moves }, shape, fps)}`
      : "";
    const steps = [
      `[${input}:v]${sdr}trim=duration=${end - start},setpts=PTS-STARTPTS,fps=${fps},${fill({ x: 0, y: 0, w: 1, h: 1 }, shape)}${moved},setsar=1[ib${i}]`,
      ...pictureSteps(effects, `[ib${i}]`, `[ie${i}]`, { ...ctx, width: bw, height: bh }, `i${i}`),
      `[ie${i}]setpts=PTS+${start}/TB[i${i}]`,
    ];
    if (blend && blend !== "normal") {
      // Blended in RGB, since a mode like screen on YUV's colour planes shifts the hue.
      return [
        ...steps,
        `${label(i)}format=gbrp[ig${i}]`,
        `[i${i}]format=gbrp[ih${i}]`,
        `[ig${i}][ih${i}]blend=all_mode=${blend}:eof_action=pass:${when},format=yuv420p${label(i + 1)}`,
      ];
    }
    const at = box?.path?.length
      ? `x='${along(box.path, "x", `(t-${start})`, W)}':y='${along(box.path, "y", `(t-${start})`, H)}':`
      : box
        ? `x=${Math.round(box.x * W)}:y=${Math.round(box.y * H)}:`
        : "";
    return [...steps, `${label(i)}[i${i}]overlay=${at}eof_action=pass:${when}${label(i + 1)}`];
  });
  // libass's captions go on last, over the inserts like the images. An .srt is
  // laid out 288 lines high: its bottom margin puts the line's middle near captionsY.
  // ffmpeg runs in the folder that holds it, so no path needs escaping in the graph.
  const margin = Math.max(0, Math.round((1 - captionsY) * 288 - 10));
  const burnt = burn
    ? [`[laid]subtitles=filename=${CAPTIONS}:force_style='Alignment=2,MarginV=${margin}'[v]`]
    : [];

  const { length } = timeline(clips);
  return [
    ...parts,
    joined,
    ...(stacked || []),
    `${base}null${label(0)}`,
    ...laid,
    ...burnt,
    ...mixGraph(sounds, {
      speech: audio,
      length,
      first: clips.length + overlays.length + inserts.length,
      whole,
      gain,
    }),
  ].join(";");
}

/**
 * The clips [v0], [v1], … joined one after another into [joined], and their
 * sounds [a0], [a1], … into [speech]: by concat, or by xfade and acrossfade
 * where a clip comes in with a transition, starting that long before the
 * clip ahead of it ends. Picture and sound are joined apart, since a J or L
 * cut makes a clip's sound longer or shorter than its picture.
 */
function chain(clips: Clip[], audio: boolean, fps: number): string {
  const steps: string[] = [];
  let [v, a] = ["[v0]", "[a0]"];
  let length = lengthOf(clips[0] as Clip);
  clips.slice(1).forEach((c, k) => {
    const i = k + 1;
    const last = i === clips.length - 1;
    const [nv, na] = last ? ["[joined]", "[speech]"] : [`[jv${i}]`, `[ja${i}]`];
    const t = c.transition;
    if (t) {
      steps.push(
        `${v}[v${i}]xfade=transition=${t.type}:duration=${t.duration}:offset=${(length - t.duration).toFixed(6)}${nv}`,
      );
      if (audio) steps.push(`${a}[a${i}]acrossfade=d=${t.duration}${na}`);
      length += lengthOf(c) - t.duration;
    } else {
      // concat's timebase isn't xfade's: set it back.
      steps.push(`${v}[v${i}]concat=n=2:v=1:a=0,settb=1/${fps}${nv}`);
      if (audio) steps.push(`${a}[a${i}]concat=n=2:v=0:a=1${na}`);
      length += lengthOf(c);
    }
    [v, a] = [nv, na];
  });
  return steps.join(";");
}

/**
 * The filter steps that mix `sounds` (inputs `first`, `first + 1`, …) under
 * the speech, labelled [speech] if there is any and raised by `gain` dB
 * when there's something to mix under it, cut to `length` seconds and
 * left for `level` to bring to LUFS; a batch's, with `whole`, isn't cut. Ends
 * in [a] if there's any sound at all.
 */
export function mixGraph(
  sounds: Sound[],
  {
    speech: audio,
    length,
    first,
    whole = false,
    gain = 0,
  }: { speech: boolean; length: number; first: number; whole?: boolean; gain?: number },
): string[] {
  const ducked = sounds.filter((s) => s.duck).length;
  const keyLabels = sounds.flatMap((s, i) => (s.duck ? [`[key${i}]`] : [])).join("");
  // The speech brought to LUFS first (`gain`, from speechGain), so a sound's
  // volume and the duck's threshold mean the same on any recording (#212).
  const lift =
    audio && sounds.length && gain ? [`[speech]volume=${gain.toFixed(2)}dB[lifted]`] : [];
  const source = lift.length ? "[lifted]" : "[speech]";
  const speech = ducked ? "[voice]" : source;
  const keys = audio && ducked ? [`${source}asplit=${ducked + 1}${speech}${keyLabels}`] : [];
  const mixed = sounds.flatMap(({ at, volume, loop, duck }, i) => {
    // A looped sound plays to the end of the video; any other plays once.
    const trim = loop ? `atrim=duration=${Math.max(0, length - at)},` : "";
    const placed = `[${first + i}:a]${trim}adelay=${Math.round(at * 1000)}:all=1,volume=${volume}`;
    // auto-editor's defaults: down 85% while the speech is above 4%, in 100 ms, back in 500 ms.
    return audio && duck
      ? [
          `${placed}[s${i}]`,
          `[s${i}][key${i}]sidechaincompress=threshold=0.04:ratio=8:attack=100:release=500[m${i}]`,
        ]
      : [`${placed}[m${i}]`];
  });
  const tracks = [audio && speech, ...sounds.map((_, i) => `[m${i}]`)].filter(Boolean);
  // No sound runs past the picture, even a long one under a silent video.
  // A batch keeps its sound whole: concat pads each clip's sound to its
  // picture, which runs a little over from whole frames, so cutting it to
  // `length` would leave a gap where the next batch joins (#137).
  const level = whole ? "anull[a]" : `atrim=duration=${length}[a]`;
  const sound = tracks.length
    ? [
        tracks.length === 1
          ? `${tracks[0]}${level}`
          : `${tracks.join("")}amix=inputs=${tracks.length}:duration=longest:normalize=0,${level}`,
      ]
    : [];
  return [...lift, ...keys, ...mixed, ...sound];
}

/** Whether this ffmpeg can draw subtitles onto the picture. Homebrew's is built without libass. */
let burnable: Promise<boolean> | undefined;
const canBurn = () => {
  burnable ??= (async () => {
    const proc = Bun.spawn(["ffmpeg", "-hide_banner", "-filters"], { stderr: "ignore" });
    return /\ssubtitles\s/.test(await new Response(proc.stdout).text());
  })();
  return burnable;
};

/**
 * Creates `file` empty, or returns false if it exists. Calls run side by
 * side, so the name is taken when it's chosen, not when ffmpeg writes it.
 */
function claim(file: string): boolean {
  try {
    closeSync(openSync(file, "wx"));
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
}

/** The .srt that goes beside a video when ffmpeg can't draw the captions on. */
const srtFor = (video: string) => join(dirname(video), `${basename(video, extname(video))}.srt`);

/** Claims `video`, and its .srt too if `sidecar`; claims neither if either is taken. */
function claimAll(video: string, sidecar: boolean): boolean {
  if (!claim(video)) return false;
  let both = false;
  try {
    both = !sidecar || claim(srtFor(video));
  } finally {
    if (!both) rmSync(video, { force: true });
  }
  return both;
}

/** `out`, or `<name>-<kind>-N.mp4` (or `ext`) next to the source with the first N that's free; claimed. */
function outputFor(
  path: string,
  out: string | undefined,
  sidecar: boolean,
  kind = "short",
  ext = ".mp4",
): string {
  if (out) {
    if (!claimAll(out, sidecar)) {
      throw new Error(
        `${out}${sidecar ? " or its .srt" : ""} already exists; give another \`out\`.`,
      );
    }
    return out;
  }
  const base = join(dirname(path), basename(path, extname(path)));
  for (let n = 1; ; n++) {
    if (claimAll(`${base}-${kind}-${n}${ext}`, sidecar)) return `${base}-${kind}-${n}${ext}`;
  }
}

/** An SRT time: `00:01:02,345`. */
const srtClock = (seconds: number) => {
  const ms = Math.round(seconds * 1000);
  const hh = String(Math.floor(ms / 3_600_000)).padStart(2, "0");
  const mm = String(Math.floor(ms / 60_000) % 60).padStart(2, "0");
  const ss = String(Math.floor(ms / 1000) % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss},${String(ms % 1000).padStart(3, "0")}`;
};

/** Chinese and Japanese script and its punctuation (。、「」！？), written without spaces. */
const CJK = /[\u3000-\u30ff\u3400-\u9fff\uf900-\ufaff\uff00-\uffef]/;

/** Words as a line: a space between them, except between two Chinese or Japanese ones. */
const joined = (words: string[]) =>
  words.reduce(
    (line, w, i) =>
      line +
      (i && CJK.test(w.replace(/\*/g, "")) && CJK.test(words[i - 1] ?? "") ? "" : i ? " " : "") +
      w,
    "",
  );

/**
 * Word-by-word captions as SRT, timed to the video `clips` make: `words`
 * holds each clip's words, timed in the source. A cue shows up to `perCue`
 * words with the one being said written *like this*, which render draws
 * yellow (`lit: false` shows the words without it). A new cue starts at a
 * clip, after a sentence, after a pause of half a second, once its words
 * span 1.2 s (how often Remotion's TikTok template turns the page), or
 * before it would show more than 20 characters a second (Netflix's limit).
 * Chinese and Japanese have no spaces: their words are joined without one,
 * and a cue holds about four characters for each of `perCue` (#276).
 */
export function wordCaptions(
  clips: Clip[],
  words: AsrWord[][],
  { perCue = 3, lit = true, upper = false } = {},
): string {
  type Said = { text: string; start: number; end: number; ends: boolean };
  // Each page with where its clip ends in the finished video: no caption outlasts its shot.
  const pages: { words: Said[]; cut: number }[] = [];
  const { starts } = timeline(clips);
  clips.forEach((clip, i) => {
    // Captions follow the sound, which a J or L cut moves off the picture.
    const { from, to } = clip.sound ?? clip;
    const offset = (starts[i] ?? 0) + (from - clip.from) / (clip.speed ?? 1);
    // A word's time in the finished video: a clip's speed shortens or stretches it.
    const at = (t: number) => (t - from) / (clip.speed ?? 1) + offset;
    const cut = offset + (to - from) / (clip.speed ?? 1);
    let page: Said[] = [];
    pages.push({ words: page, cut });
    for (const w of words[i] ?? []) {
      const [start, end] = [w.startMs / 1000, w.endMs / 1000];
      // A word belongs to the clip its middle is in: Whisper's word times can be a little early or late.
      // Half-open, so a word right on a cut between two clips shows once.
      const middle = (start + end) / 2;
      if (middle < from || middle >= to) continue;
      const text = w.word.replace(/[,.;:]+$/, "");
      const said = {
        text: upper ? text.toLocaleUpperCase() : text,
        start: at(Math.max(start, from)),
        end: at(Math.min(end, to)),
        ends: /[.?!。！？]["')\]」』]?$/.test(w.word),
      };
      const last = page.at(-1);
      const chars = page.reduce((n, w) => n + w.text.length, 0);
      const cjk = page.length > 0 && page.every((w) => CJK.test(w.text)) && CJK.test(said.text);
      const full =
        (cjk ? chars + said.text.length > perCue * 4 : page.length >= perCue) ||
        (page[0] && (chars + said.text.length) / Math.max(0.3, said.end - page[0].start) > 20) ||
        (last && (last.ends || said.start - last.end >= 0.5)) ||
        (page[0] && said.start - page[0].start >= 1.2);
      if (full) {
        page = [];
        pages.push({ words: page, cut });
      }
      if (said.text) page.push(said);
    }
  });
  const cues = pages
    .filter(({ words }) => words.length)
    .flatMap(({ words: page, cut }, p, all) => {
      const next = all[p + 1]?.words[0]?.start ?? Number.POSITIVE_INFINITY;
      const last = page.at(-1) as Said;
      // Stays up into a short pause rather than flickering off. Across a
      // transition the next page can start before this one ends: end with it.
      const until = Math.min(
        cut,
        next <= last.end ? last.end : next - last.end <= 0.5 ? next : last.end + 0.2,
      );
      if (!lit)
        return [{ start: page[0]?.start ?? 0, end: until, text: joined(page.map((w) => w.text)) }];
      return page.map((w, j) => ({
        start: j ? w.start : (page[0]?.start ?? w.start),
        end: page[j + 1]?.start ?? until,
        text: joined(page.map((o, k) => (k === j ? `*${o.text}*` : o.text))),
      }));
    });
  return cues
    .map((c, i) => `${i + 1}\n${srtClock(c.start)} --> ${srtClock(c.end)}\n${c.text}`)
    .join("\n\n");
}

/** Text drawn over a stretch of the finished video, its middle at `y` of the height. */
export type Text = { text: string; from: number; to: number; y?: number };

/** A picture or video laid over the finished video from `from` to `to` seconds; its sound isn't used. */
export type Insert = { path: string; from: number; to: number } & Look;

/** Blend modes an insert can be laid with: ffmpeg's blend names. */
export const BLENDS = [
  "normal",
  "screen",
  "multiply",
  "overlay",
  "softlight",
  "lighten",
  "darken",
  "addition",
  "difference",
];

/**
 * How an insert is laid over the cut (#198): in a `box` (0-1 of the picture;
 * a picture in the picture), with a blend mode, through catalog effects (a
 * chroma key keys it over the cut), and moving like a clip's `moves` (a Ken
 * Burns pan over a still).
 */
export type Look = {
  /** `path`, from `track`: the box's top left over time, from the insert's start. */
  box?: { x: number; y: number; w: number; h: number; path?: TrackPoint[] };
  blend?: string;
  effects?: Effect[];
  moves?: Move[];
};

/** A size in pixels rounded to an even number, at least 2. */
const evenSize = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/**
 * ffmpeg's inputs for `clips`: the source once per clip, opened at its start
 * and read for its length. Seeking decodes only what's kept, where trimming
 * one input decodes the whole source and drifts a frame here and there (#137).
 */
export const seekClips = (path: string, clips: Clip[]) =>
  clips.flatMap((c) => {
    const { from, to } = opened(c);
    // Decoded with the hardware where there's a decoder: a minute of 4K HEVC rendered in 34.0 s against 91.1 s, frame for frame the same (#167).
    return ["-hwaccel", "auto", "-ss", String(from), "-t", String(to - from), "-i", c.path ?? path];
  });

/**
 * The most clips one ffmpeg opens at once. Each is an input with its own
 * decoder, about 23 MB at 1080p, so 100 is about 2.3 GB. More are rendered
 * in batches and joined (#137).
 */
export const CLIPS_PER_PASS = 100;

/**
 * ffmpeg's `-filter_complex graph`, read from a file in `dir`: 100 clips make
 * a graph longer than a Windows command line can be (32,767 characters, #202).
 */
function graphFile(graph: string, dir: string, name = "graph"): string[] {
  const file = join(dir, `${name}.txt`);
  writeFileSync(file, graph);
  // `-/option file` arrived in ffmpeg 7.0; 6.x (Ubuntu 24.04's) only knows
  // -filter_complex_script, which newer releases dropped (9.0 has none).
  return [ffmpegMajor() >= 7 ? "-/filter_complex" : "-filter_complex_script", file];
}

/**
 * `effects` checked, and each LUT they read there. On an insert or an
 * adjustment layer (`picture`), only effects that work on a picture laid
 * over the cut: a sound effect or interpolate there would do nothing (#257).
 */
function checkFx(effects: unknown, what: string, picture = false) {
  for (const [n, e] of checkEffects(effects, what).entries()) {
    if (picture && (EFFECTS[e.name]?.kind !== "video" || e.name === "interpolate")) {
      throw new Error(`${what}[${n}]: ${e.name} works on a clip, not on what's laid over the cut`);
    }
    if (typeof e.file === "string") requireFile(e.file, "LUT");
  }
}

/** The system ffmpeg's major version, read once; 99 for a git build, which is newer than any release. */
let major: number | undefined;
export const ffmpegMajor = () => {
  major ??= (() => {
    const r = Bun.spawnSync(["ffmpeg", "-hide_banner", "-version"], { stderr: "ignore" });
    const n = Number(r.stdout.toString().match(/^ffmpeg version n?(\d+)\./)?.[1]);
    return Number.isFinite(n) && n > 0 ? n : 99;
  })();
  return major;
};

/** Runs ffmpeg with `args`, throwing its error output if it fails. */
async function ffmpeg(args: string[], what: string): Promise<void> {
  const proc = Bun.spawn(["ffmpeg", "-nostdin", "-y", "-loglevel", "error", ...args], {
    stderr: "pipe",
  });
  if ((await proc.exited) !== 0) {
    throw new Error(`ffmpeg couldn't ${what}: ${(await new Response(proc.stderr).text()).trim()}`);
  }
}

/** `file`'s integrated loudness in LUFS, through `filter` first if given. */
/**
 * The gain that brings each source among `paths` to `target` LUFS (#265),
 * measured once a source, kept within 30 dB either way. A source with no
 * sound, or silence, gets none.
 */
export async function levelGains(
  paths: string[],
  target: number,
  measure: (path: string) => Promise<number>,
): Promise<Map<string, { measured: number; db: number }>> {
  const out = new Map<string, { measured: number; db: number }>();
  // ponytail: measured every render; cache by path and mtime if long projects make it slow.
  for (const path of new Set(paths)) {
    const measured = await measure(path);
    // No speech to level (silence, or a card with no sound): boosting it would only raise the hiss.
    if (!Number.isFinite(measured) || measured < -60) continue;
    out.set(path, {
      measured,
      db: Math.max(-30, Math.min(30, Math.round((target - measured) * 10) / 10)),
    });
  }
  return out;
}

async function loudness(file: string, filter = ""): Promise<number> {
  const proc = Bun.spawn(
    [
      ...["ffmpeg", "-nostdin", "-nostats", "-i", file, "-map", "0:a"],
      ...["-af", `${filter}ebur128=framelog=quiet`, "-f", "null", "-"],
    ],
    { stderr: "pipe" },
  );
  const said = await new Response(proc.stderr).text();
  if ((await proc.exited) !== 0) throw new Error(`ffmpeg couldn't measure ${file}: ${said.trim()}`);
  return integrated(said);
}

/** The integrated loudness in an ebur128 log: its summary's "I:" line, the last one. */
function integrated(said: string): number {
  const found = [...said.matchAll(/^\s*I:\s+(-?[\d.]+|-inf) LUFS/gm)].at(-1)?.[1];
  return found === undefined || found === "-inf" ? -Infinity : Number(found);
}

/**
 * The gain in dB that brings the speech to LUFS before sounds are mixed
 * under it (#212). Without it, a quiet recording (-31 LUFS is common) never
 * reaches the duck's threshold, and music at a given volume sits far above
 * it until `level` raises the whole mix. `input` is ffmpeg's inputs and
 * `streams` the speech in them, joined in order. 0 for silence.
 */
async function speechGain(input: string[], streams: string[]): Promise<number> {
  if (!streams.length) return 0;
  // A stream is an input's label ("[0:a]") or a chain ending in its own label.
  const labels = streams.map((s) => s.match(/\[[^\]]+\]$/)?.[0] ?? s);
  const chains = streams.filter((s, i) => s !== labels[i]);
  const graph = [
    ...chains,
    `${labels.join("")}concat=n=${streams.length}:v=0:a=1,ebur128=framelog=quiet`,
  ].join(";");
  // From a file, as the render's graph is: a hundred clips' chains are longer than a Windows command line.
  const dir = mkdtempSync(join(tmpdir(), "mockingbird-speech-"));
  let said: string;
  try {
    const proc = Bun.spawn(
      ["ffmpeg", "-nostdin", "-nostats", ...input, ...graphFile(graph, dir), "-f", "null", "-"],
      { stderr: "pipe" },
    );
    said = await new Response(proc.stderr).text();
    if ((await proc.exited) !== 0)
      throw new Error(`ffmpeg couldn't measure the speech: ${said.trim()}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const lufs = integrated(said);
  return lufs > -70 ? Math.min(MAX_GAIN, LUFS - lufs) : 0;
}

/**
 * The gain, in dB, that brings `file`'s sound to LUFS through LIMIT. The
 * limiter takes a little loudness off as it holds the peaks, so the sound is
 * measured as it is, then again through the limiter, and the gain corrected
 * once: within about half a dB (#127). Silence gets none.
 */
async function levelGain(file: string): Promise<number> {
  const before = await loudness(file);
  if (!(before > -70)) return 0;
  const first = Math.min(MAX_GAIN, LUFS - before);
  const after = await loudness(file, `volume=${first}dB,${LIMIT},`);
  return Math.min(MAX_GAIN, first + LUFS - after);
}

/**
 * `file` (render's or motion's, its sound not yet levelled) saved as the MP4
 * `out` with its sound at LUFS and its peaks held by LIMIT. The picture and
 * any subtitles are copied, not encoded again.
 */
async function level(file: string, out: string): Promise<void> {
  const gain = await levelGain(file);
  await ffmpeg(
    [
      ...["-i", file, "-map", "0", "-c", "copy", "-c:s", "mov_text"],
      ...["-af", `volume=${gain.toFixed(2)}dB,${LIMIT}`, "-c:a", "aac", "-b:a", "160k"],
      ...["-movflags", "+faststart", out],
    ],
    `bring ${out}'s sound to ${LUFS} LUFS`,
  );
}

/**
 * `clips` cut, framed and joined into one file in `dir`, CLIPS_PER_PASS at
 * a time: each batch is encoded at a high quality, and the batches are joined
 * without encoding again. The sound is levelled after render's last pass,
 * over all of it.
 */
async function joinBatches(
  path: string,
  clips: Shaped[],
  dir: string,
  look: {
    audio: boolean;
    size: string;
    fps: number;
    split?: { top: Area; bottom: Area };
  },
): Promise<string> {
  const batches: string[] = [];
  for (let i = 0; i < clips.length; i += CLIPS_PER_PASS) {
    const batch = clips.slice(i, i + CLIPS_PER_PASS);
    const file = `batch-${batches.length}.mkv`;
    await ffmpeg(
      [
        ...seekClips(path, batch),
        ...graphFile(renderGraph(batch, { ...look, whole: true }), dir),
        "-map",
        "[v]",
        ...(look.audio ? ["-map", "[a]", "-c:a", "pcm_f32le"] : []),
        // Encoded once more in the last pass, so near-lossless here.
        ...["-c:v", "libx264", "-crf", "10", "-preset", "veryfast", "-pix_fmt", "yuv420p"],
        join(dir, file),
      ],
      `render clips ${i + 1}-${i + batch.length} of ${path}`,
    );
    batches.push(file);
  }
  // Names beside the list, so no path in it needs quoting.
  const list = join(dir, "batches.txt");
  writeFileSync(list, batches.map((b) => `file '${b}'`).join("\n"));
  const joined = join(dir, "joined.mkv");
  await ffmpeg(["-f", "concat", "-i", list, "-c", "copy", joined], `join ${path}'s clips`);
  // Only the joined file is needed now, which halves the disk this takes.
  for (const b of batches) rmSync(join(dir, b), { force: true });
  return joined;
}

/** A stretch of a clip's picture, frames `a` to `b` of its source: copied as it is, or encoded. */
export type Piece = { clip: Clip; a: number; b: number; copy: boolean };

/**
 * How each clip's picture is made when render can copy: a clip that `can`
 * be copied keeps the whole groups of pictures inside it, from the first
 * keyframe in `keys` (frame numbers of its source) at or after its start to
 * the last at or before its end, and only the frames either side are
 * encoded. A clip with no whole group inside, or that can't be copied, is
 * encoded. Clips are cut to whole frames at `fps`.
 */
export function pieces(
  clips: Clip[],
  fps: number,
  keys: (c: Clip) => number[],
  can: (c: Clip) => boolean,
): Piece[] {
  return clips.flatMap((clip) => {
    const [a, b] = [Math.round(clip.from * fps), Math.round(clip.to * fps)];
    const ks = can(clip) ? keys(clip) : [];
    const first = ks.find((k) => k >= a);
    const last = ks.findLast((k) => k <= b);
    if (first === undefined || last === undefined || first >= last) {
      return [{ clip, a, b, copy: false }];
    }
    return [
      { clip, a, b: first, copy: false },
      { clip, a: first, b: last, copy: true },
      { clip, a: last, b, copy: false },
    ].filter((p) => p.b > p.a);
  });
}

/**
 * The keyframes of `path`'s picture that a copy can start at, as frame
 * numbers at `fps` from the file's start: each one starts a closed group
 * (no picture after it in decode order shows before it), and every packet
 * sits on a whole frame, so a copied stretch keeps the output's rate.
 * Empty if the frames aren't evenly `fps` apart.
 */
export async function copyKeys(path: string, fps: number): Promise<number[]> {
  const proc = Bun.spawn(
    [
      ...["ffprobe", "-v", "error", "-select_streams", "v:0"],
      ...["-show_entries", "packet=pts_time,flags:format=start_time", "-of", "csv=p=0", path],
    ],
    { stderr: "ignore" },
  );
  const lines = (await new Response(proc.stdout).text()).trim().split("\n");
  if ((await proc.exited) !== 0) return [];
  // Packets in decode order, then the format's start time last.
  const start = Number(lines.pop()) || 0;
  const packets = lines.map((l) => {
    const [pts = "", flags = ""] = l.split(",");
    return { at: (Number(pts) - start) * fps, key: flags.startsWith("K") };
  });
  if (packets.some((p) => !Number.isFinite(p.at) || Math.abs(p.at - Math.round(p.at)) > 0.01))
    return [];
  const keys: number[] = [];
  packets.forEach((p, i) => {
    if (!p.key) return;
    const frame = Math.round(p.at);
    // A leading picture (an open group) shows before its keyframe but is decoded after it.
    let open = false;
    for (let j = i + 1; j < packets.length && !packets[j]?.key; j++) {
      if ((packets[j]?.at ?? 0) < p.at) open = true;
    }
    if (!open) keys.push(frame);
  });
  return keys;
}

/**
 * Writes `unlevelled` (picture and unlevelled sound, as render's one pass
 * would) by copying the groups of pictures that need nothing done to them
 * and encoding only the rest: clip edges and reframed clips. The encoded
 * frames are one x264 stream, a keyframe forced at each piece, then split
 * at those frames. x264 numbers its parameter sets 1, so they never replace
 * the source's 0 where the two meet (#166). Returns false, having written
 * nothing usable, if there's nothing to copy.
 */
async function copyRender(
  path: string,
  clips: Shaped[],
  dir: string,
  unlevelled: string,
  {
    audio,
    size,
    fps,
    sounds,
    probes,
    gain,
  }: {
    audio: boolean;
    size: string;
    fps: number;
    sounds: (Sound & { path: string })[];
    probes: Map<string, Awaited<ReturnType<typeof probe>>>;
    gain: number;
  },
): Promise<boolean> {
  // ponytail: copies from the first source only, so its parameter sets are the only 0s; one per source if mixed edits need it.
  const from = clips[0]?.path ?? path;
  const p = probes.get(from);
  // An HDR stretch copied as it is would land in an SDR file unconverted.
  if (
    p?.codec !== "h264" ||
    p.pix !== "yuv420p" ||
    p.transfer ||
    p.size !== size ||
    p.fps !== fps
  ) {
    return false;
  }
  const keys = await copyKeys(from, fps);
  const plan = pieces(
    clips,
    fps,
    () => keys,
    (c) => (c.path ?? path) === from && (c.zoom ?? 1) === 1 && !c.moves?.length,
  );
  if (!plan.some((q) => q.copy)) return false;
  // A copied stretch keeps its source's colour tags, and the file takes the first piece's:
  // with HDR in the edit, everything is encoded so the file is tagged BT.709.
  if (clips.some((c) => c.sdr)) return false;
  const at = (q: Piece) => ({ ...q.clip, from: q.a / fps, to: q.b / fps });
  const files: string[] = plan.map((_, i) => `piece-${i}.ts`);
  // The encoded pieces, CLIPS_PER_PASS to an ffmpeg, each starting on a keyframe.
  const encoded = plan.flatMap((q, i) => (q.copy ? [] : [{ q, i }]));
  for (let n = 0; n < encoded.length; n += CLIPS_PER_PASS) {
    const batch = encoded.slice(n, n + CLIPS_PER_PASS);
    let frame = 0;
    const starts = batch.map(({ q }) => {
      const s = frame;
      frame += q.b - q.a;
      return s;
    });
    const parts = batch.map(({ q }) => at(q));
    await ffmpeg(
      [
        // Decoded in software: a source in the output's codec and size decodes
        // fast anyway, and setting up 100 hardware decoders took longer (#166).
        ...seekClips(path, parts).filter((arg) => arg !== "-hwaccel" && arg !== "auto"),
        ...graphFile(renderGraph(parts, { audio: false, size, fps }), dir),
        "-map",
        "[v]",
        ...["-c:v", "libx264", "-crf", "18", "-preset", "veryfast", "-pix_fmt", "yuv420p"],
        ...["-x264-params", "sps-id=1", "-forced-idr", "1"],
        // A quarter frame early: a time a hair past frame s would force the keyframe onto s + 1.
        ...[
          "-force_key_frames",
          starts.map((s) => (Math.max(0, s - 0.25) / fps).toFixed(6)).join(","),
        ],
        ...["-f", "segment", "-segment_format", "mpegts"],
        ...(starts.length > 1 ? ["-segment_frames", starts.slice(1).join(",")] : []),
        join(dir, `encoded-${n}-%d.ts`),
      ],
      `encode the edges of ${path}'s clips`,
    );
    batch.forEach(({ i }, k) => {
      renameSync(join(dir, `encoded-${n}-${k}.ts`), join(dir, files[i] as string));
    });
  }
  // The copied groups, a few at a time: each is a seek and a copy.
  const copied = plan.flatMap((q, i) => (q.copy ? [{ q, i }] : []));
  for (let n = 0; n < copied.length; n += 8) {
    await Promise.all(
      copied.slice(n, n + 8).map(({ q, i }) =>
        ffmpeg(
          [
            // Half a frame in, so the seek lands on this keyframe, not the one before.
            ...["-ss", ((q.a + 0.5) / fps).toFixed(6), "-i", from, "-map", "0:v:0"],
            ...["-frames:v", String(q.b - q.a), "-c", "copy", "-f", "mpegts"],
            join(dir, files[i] as string),
          ],
          `copy ${from} from ${(q.a / fps).toFixed(2)}s`,
        ),
      ),
    );
  }
  // Each piece has exactly its frames, or the picture would drift from the sound.
  await Promise.all(
    plan.map(async (q, i) => {
      const got = await packets(join(dir, files[i] as string));
      if (got !== q.b - q.a) {
        throw new Error(
          `piece ${i} of ${path} has ${got} frames, not ${q.b - q.a} (${q.copy ? "copied" : "encoded"}, ${q.a}-${q.b})`,
        );
      }
    }),
  );
  const list = join(dir, "pieces.txt");
  writeFileSync(list, files.map((f) => `file '${f}'`).join("\n"));
  // The sound, cut to the same whole frames, with the sounds mixed under it.
  const cut = clips.map((c) => ({
    ...c,
    from: Math.round(c.from * fps) / fps,
    to: Math.round(c.to * fps) / fps,
  }));
  const hasSound = audio || sounds.length > 0;
  const sound = join(dir, "sound.mkv");
  if (hasSound) {
    const speech = audio
      ? [
          ...cut.map((c, i) =>
            c.silent
              ? `aevalsrc=0:c=stereo:s=48000:d=${c.to - c.from}[a${i}]`
              : `[${i}:a]asetpts=PTS-STARTPTS[a${i}]`,
          ),
          `${cut.map((_, i) => `[a${i}]`).join("")}concat=n=${cut.length}:v=0:a=1[speech]`,
        ]
      : [];
    const length = cut.reduce((t, c) => t + c.to - c.from, 0);
    const graph = [
      ...speech,
      ...mixGraph(sounds, { speech: audio, length, first: cut.length, gain }),
    ].join(";");
    await ffmpeg(
      [
        ...seekClips(path, cut),
        ...sounds.flatMap((s) => [...(s.loop ? ["-stream_loop", "-1"] : []), "-i", s.path]),
        ...graphFile(graph, dir, "sound"),
        ...["-map", "[a]", "-c:a", "pcm_f32le", sound],
      ],
      `cut ${path}'s sound`,
    );
  }
  await ffmpeg(
    [
      ...["-f", "concat", "-safe", "0", "-i", list],
      ...(hasSound ? ["-i", sound, "-map", "0:v", "-map", "1:a"] : []),
      ...["-c", "copy", unlevelled],
    ],
    `join ${path}'s pieces`,
  );
  return true;
}

/** How many video packets `file` has: its frames, without decoding them. */
async function packets(file: string): Promise<number> {
  const proc = Bun.spawn(
    [
      ...["ffprobe", "-v", "error", "-select_streams", "v:0", "-count_packets"],
      ...["-show_entries", "stream=nb_read_packets", "-of", "csv=p=0", file],
    ],
    { stderr: "ignore" },
  );
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  // An MPEG-TS lists its stream again under its program: the first line is enough.
  return Number.parseInt(out, 10);
}

/** Files ffmpeg reads as one still picture, which then has to be repeated to last. */
const STILL = /\.(png|jpe?g|webp|heic|bmp|tiff?)$/i;

/** How long a segment runs before the cache may start another (#165). */
const SEGMENT_SECONDS = 10;

/**
 * Where a project's render is cut into cached segments (#165): runs of
 * clips, as [first, end) indexes. A segment ends at a clip edge once it's
 * SEGMENT_SECONDS long or CLIPS_PER_PASS clips, but never where a transition
 * joins two clips or an insert plays across the edge: the insert, a video,
 * would start over. Captions and texts are still pictures, so each segment
 * draws its part of one that crosses.
 */
export function segments(
  clips: Clip[],
  inserts: { from: number; to: number }[],
): [number, number][] {
  const { starts } = timeline(clips);
  const runs: [number, number][] = [];
  let first = 0;
  for (let i = 1; i < clips.length; i++) {
    const t = starts[i] as number;
    const long = t - (starts[first] as number) >= SEGMENT_SECONDS || i - first >= CLIPS_PER_PASS;
    // A J or L cut moves the sound's edge off the picture's, and concat would
    // start the next file's sound after this one's: keep that edge inside a segment.
    const next = clips[i];
    const before = clips[i - 1];
    const moved =
      (next?.sound && next.sound.from !== next.from) ||
      (before?.sound && before.sound.to !== before.to);
    const crossed = next?.transition || moved || inserts.some((s) => s.from < t && s.to > t);
    if (long && !crossed) {
      runs.push([first, i]);
      first = i;
    }
  }
  runs.push([first, clips.length]);
  return runs;
}

/** What a file is, for a cache key: a file changed on disk gets a new key. */
/** Effects with their files (a LUT) stamped, so one edited in place misses the cache. */
const stampFiles = (effects: Effect[]) =>
  effects.map((e) => (typeof e.file === "string" ? { ...e, file: stamp(e.file) } : e));

const stamp = (file: string) => {
  const s = statSync(file);
  return `${resolve(file)}:${s.size}:${s.mtimeMs}`;
};

/**
 * Every file under `dir` that `keep` accepts, by path, size and time, into a
 * cache key: a page's image in assets/, or lib/harmony.js a generator
 * imports, changes the key when it changes. Hidden entries (a kit copy being
 * rendered, a temp file) and node_modules are left out.
 */
// ponytail: at most 5,000 files, so a page kept in a big folder can't stall a render; past that the rest go unnoticed.
function stampFolder(hash: Hash, dir: string, keep: (name: string) => boolean = () => true) {
  let left = 5000;
  const walk = (at: string) => {
    for (const f of readdirSync(at).sort()) {
      if (left <= 0 || f.startsWith(".") || f === "node_modules") continue;
      const full = join(at, f);
      const s = statSync(full);
      if (s.isDirectory()) walk(full);
      else if (s.isFile() && keep(f)) {
        left--;
        hash.update(`${relative(dir, full)}:${s.size}:${s.mtimeMs}\n`);
      }
    }
  };
  walk(dir);
}

/**
 * The fonts a page draws with, for a cache key: each file's path, size and
 * time. A pinned font never changes, but a user's can be replaced under the
 * same name (#276).
 */
function fontStamps(fonts: PageFont[]): [string, number, number][] {
  return fonts.map((f) => {
    const s = statSync(fileURLToPath(f.url), { throwIfNoEntry: false });
    return [f.url, s?.size ?? 0, s?.mtimeMs ?? 0];
  });
}

/** The engine's own code, so a segment drawn by an older engine isn't used again. */
// ponytail: the files that build the picture, not everything they import; add any whose change goes unnoticed.
const ENGINE = createHash("sha256")
  .update(readFileSync(import.meta.path))
  .update(readFileSync(join(import.meta.dir, "effects/catalog.ts")))
  .update(readFileSync(join(import.meta.dir, "effects/filters.ts")))
  .update(readFileSync(join(import.meta.dir, "effects/masks.ts")))
  .update(readFileSync(Bun.resolveSync("@mockingbird/captions", import.meta.dir)))
  .digest("hex");

/**
 * A project's render from segments kept under ~/.mockingbird/cache/segments/
 * (#165): each run of clips from `segments` is rendered with the captions,
 * texts and inserts over it, keyed by all of those, the look and the engine,
 * so an edit renders again only the segments it touches. The segments are
 * joined without encoding again, then the sounds are mixed and levelled over
 * the whole video. Undefined, having made nothing, if the captions or texts
 * can't be drawn as pictures here: render's own way handles those.
 */
async function segmented(
  path: string,
  clips: Shaped[],
  {
    audio,
    size,
    fps,
    split,
    cues,
    captionsY,
    style,
    texts,
    inserts,
    adjust,
    sounds,
    out,
    named,
    kind,
    language: spoken,
  }: {
    /** The captions' language (a Whisper code), for the shapes Han characters take. */
    language?: string;
    audio: boolean;
    size: string;
    fps: number;
    split?: { top: Area; bottom: Area };
    cues: Cue[];
    captionsY: number;
    style: CaptionStyle;
    texts: Text[];
    inserts: (Insert & { sdr?: string })[];
    adjust: { from: number; to: number; effects: Effect[] }[];
    sounds: (Sound & { path: string })[];
    out?: string;
    named: string;
    kind: string;
  },
): Promise<string | undefined> {
  const dir = mkdtempSync(join(tmpdir(), "mockingbird-segments-"));
  let target: string | undefined;
  let made = false;
  try {
    const lines = [...cues.map((c) => c.text), ...texts.map((t) => t.text)];
    const [width, height] = (split ? "1080x1920" : size).split("x").map(Number);
    const chrome = lines.length ? findChrome() : undefined;
    const wrap = noNetwork();
    const fonts = captionFonts(lines, style);
    const language = spoken ?? spokenLanguage();
    // Which shapes Han characters take: in the segment key, since it changes what's drawn.
    const han = hanOrder(language, lines);
    const images = lines.length
      ? await drawCaptions(lines, dir, width ?? 1080, height, {
          chrome,
          wrap,
          fonts,
          language,
          style,
        })
      : [];
    if (!images) return undefined;
    const layers = [
      ...cues.map(({ start, end }) => ({ start, end, y: captionsY })),
      ...texts.map(({ from, to, y }) => ({ start: from, end: to, y })),
    ].map((l, i) => ({ ...l, image: images[i] as string, text: lines[i] }));
    const put = inserts.map(({ from, to, ...rest }) => ({ ...rest, start: from, end: to }));
    const adjusted = adjust.map(({ from, to, effects }) => ({ start: from, end: to, effects }));
    const { starts, length } = timeline(clips);
    const cache = join(mockingbirdHome(), "cache", "segments");
    mkdirSync(cache, { recursive: true });
    // A segment never cuts through an insert or an adjustment layer.
    const runs = segments(clips, [...inserts, ...adjust]);
    // ponytail: one segment at a time, since each is timed from the ones before; a first render is ~10% slower than one pass. Render the segments with nothing over them in parallel if that matters.
    const files: string[] = [];
    let reused = 0;
    // Where this segment starts in the joined video: concat puts each file after
    // the ones before by their length, sound included, which rounding to whole
    // frames leaves a little off the timeline's time.
    let t0 = 0;
    for (const [a, b] of runs) {
      const part = clips.slice(a, b);
      const t1 = t0 + (b < clips.length ? (starts[b] as number) : length) - (starts[a] as number);
      // What lies over this segment, timed from its first frame; a frame to spare at its end.
      const over = <T extends { start: number; end: number }>(xs: T[]) =>
        xs
          .filter((x) => x.start < t1 + 1 / fps && x.end > t0)
          .map((x) => ({ ...x, start: Math.max(0, x.start - t0), end: x.end - t0 }));
      const laid = over(layers);
      const shown = over(put);
      const adjusting = over(adjusted);
      const key = createHash("sha256")
        .update(
          JSON.stringify([
            ENGINE,
            audio,
            size,
            fps,
            split ?? null,
            // A LUT edited in place changes the grade, so effects' files are stamped too.
            part.map((c) => ({
              ...c,
              path: stamp(c.path ?? path),
              ...(c.effects && { effects: stampFiles(c.effects) }),
            })),
            // By its words, not its pixels: Chrome's antialiasing varies a little with the line drawn before.
            chrome ?? null,
            // Which fonts are there, and each file's size and time, say what they draw.
            fontStamps(fonts),
            han,
            style,
            laid.map((l) => [l.start, l.end, l.y, l.text]),
            shown.map(({ path: f, ...rest }) => ({
              ...rest,
              path: stamp(f),
              ...(rest.effects && { effects: stampFiles(rest.effects) }),
            })),
            adjusting.map((a) => ({ ...a, effects: stampFiles(a.effects) })),
          ]),
        )
        .digest("hex")
        .slice(0, 32);
      const file = join(cache, `${key}.mkv`);
      files.push(file);
      if (existsSync(file)) {
        reused++;
        t0 += (await probe(file)).seconds;
        continue;
      }
      // Its own temp name, so two renders of the same segment don't write one file.
      const tmp = join(cache, `${key}.${process.pid}-${randomUUID()}.part.mkv`);
      try {
        await ffmpeg(
          [
            ...seekClips(path, part),
            ...laid.flatMap((l) => ["-i", l.image]),
            ...shown.flatMap((s) => [...(STILL.test(s.path) ? ["-loop", "1"] : []), "-i", s.path]),
            ...graphFile(
              renderGraph(part, {
                audio,
                size,
                fps,
                split,
                overlays: laid,
                inserts: shown,
                adjust: adjusting,
                whole: true,
              }),
              dir,
              "segment",
            ),
            ...["-map", "[v]", ...(audio ? ["-map", "[a]", "-c:a", "pcm_f32le"] : [])],
            ...["-c:v", "libx264", "-crf", "18", "-preset", "veryfast", "-pix_fmt", "yuv420p", tmp],
          ],
          `render clips ${a + 1}-${b} of ${named}`,
        );
        renameSync(tmp, file);
      } finally {
        rmSync(tmp, { force: true });
      }
      t0 += (await probe(file)).seconds;
    }
    const list = join(dir, "segments.txt");
    writeFileSync(list, files.map((f) => `file '${f.replaceAll("'", "'\\''")}'`).join("\n"));
    const joined = join(dir, "joined.mkv");
    await ffmpeg(
      ["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", joined],
      `join ${named}'s segments`,
    );
    target = outputFor(named, out, false, kind);
    if (audio || sounds.length) {
      const unlevelled = join(dir, "unlevelled.mkv");
      const gain = audio && sounds.length ? await speechGain(["-i", joined], ["[0:a]"]) : 0;
      const graph = [
        ...(audio ? ["[0:a]anull[speech]"] : []),
        ...mixGraph(sounds, { speech: audio, length, first: 1, gain }),
      ].join(";");
      await ffmpeg(
        [
          "-i",
          joined,
          ...sounds.flatMap((s) => [...(s.loop ? ["-stream_loop", "-1"] : []), "-i", s.path]),
          ...["-filter_complex", graph, "-map", "0:v", "-map", "[a]"],
          ...["-c:v", "copy", "-c:a", "pcm_f32le", unlevelled],
        ],
        `mix ${target}'s sound`,
      );
      await level(unlevelled, target);
    } else {
      await ffmpeg(
        ["-i", joined, "-map", "0", "-c", "copy", "-movflags", "+faststart", target],
        `save ${target}`,
      );
    }
    made = true;
    const kept = `${reused} of ${runs.length} segments reused`;
    return `${target} (${fineClock((await probe(target)).seconds * 1000)}), ${kept}${cues.length ? ", captions drawn on the picture" : ""}`;
  } finally {
    if (!made && target) rmSync(target, { force: true });
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The pinned fonts for drawing captions: whichever are downloaded. */
function captionFonts(_lines: string[], _style: CaptionStyle): PageFont[] {
  return fontFaces();
}

/**
 * A warning for render's result when the captions' font isn't downloaded:
 * they're drawn in a fallback, not refused (#276; degrade, don't break).
 */
export function captionFontWarning(captions: string | undefined, style: CaptionStyle): string {
  if (!captions?.trim() || !findChrome() || fontFaces().some((f) => f.family === style.font))
    return "";
  return `. Warning: the captions' font, ${style.font}, isn't downloaded, so they're drawn in a fallback font; run \`mockingbird models pull chrome\``;
}

/**
 * Cuts `clips` out of a video and joins them into one MP4, optionally 9:16
 * or split, with captions, text, inserts and sounds. The client chooses all
 * of those; this only runs ffmpeg. Captions are drawn as images with Core
 * Text and laid over the picture; failing that, drawn by ffmpeg if it has
 * libass; failing that, put in a subtitle track and an .srt beside the video.
 *
 * A project's clips each have their own `path` and come with `fit`: each is
 * framed to `size` (default the first clip's source) at `fps` (default its
 * rate), so clips from different sources join.
 */
async function render(...args: Parameters<typeof renderCut>): Promise<string> {
  const said = await renderCut(...args);
  const o = args[2] ?? {};
  return said + captionFontWarning(o.captions, o.captionStyle ?? captionStyle(undefined));
}

async function renderCut(
  path: string,
  clips: Clip[],
  {
    size,
    fps,
    split,
    captions,
    captionsY = CAPTIONS_Y,
    captionStyle: style = captionStyle(undefined),
    texts = [],
    inserts = [],
    adjust = [],
    sounds = [],
    out,
    named = path,
    kind = "short",
    draft = false,
    soundOnly = false,
    cache = false,
    language,
  }: {
    /** The captions' language (a Whisper code): a project's, over the user's setting. */
    language?: string;
    size?: string;
    fps?: number;
    split?: { top: Area; bottom: Area };
    captions?: string;
    captionsY?: number;
    /** How the captions and texts look (#276); `classic` if not given. */
    captionStyle?: CaptionStyle;
    texts?: Text[];
    inserts?: Insert[];
    /** Adjustment layers (#198): effects on everything under the text, each for its stretch. */
    adjust?: { from: number; to: number; effects: Effect[] }[];
    sounds?: (Sound & { path: string })[];
    out?: string;
    /** The file the default output is named after and put beside: the source, unless this is render's last pass over joined batches. */
    named?: string;
    /** The default output is `<named>-<kind>-N.mp4`. */
    kind?: string;
    /** Half the size, encoded as fast as x264 goes: a preview to check the edit with. */
    draft?: boolean;
    /** The sound alone, as an .m4a: the picture is built but not encoded (#170). */
    soundOnly?: boolean;
    /** A project's: rendered from cached segments, so an edit renders only what it changed (#165). */
    cache?: boolean;
  },
): Promise<string> {
  requireFile(path, "File");
  if (!clips.length) throw new Error("No clips: give at least one { from, to } in seconds.");
  for (const [i, c] of clips.entries()) {
    if (!(Number.isFinite(c.from) && Number.isFinite(c.to) && c.from >= 0 && c.to > c.from)) {
      throw new Error(`A clip needs 0 <= from < to, in seconds; got ${JSON.stringify(c)}.`);
    }
    checkFx(c.effects, `clips[${i}].effects`);
  }
  for (const [i, t] of inserts.entries()) {
    if (t.blend !== undefined && !BLENDS.includes(t.blend)) {
      throw new Error(`inserts[${i}].blend must be one of ${BLENDS.join(", ")}; got ${t.blend}`);
    }
    if (t.blend && t.blend !== "normal" && t.box) {
      throw new Error(`inserts[${i}]: a blend mode covers the whole frame, so it can't have a box`);
    }
    checkFx(t.effects, `inserts[${i}].effects`, true);
  }
  for (const [i, a] of adjust.entries()) {
    if (!(a.to > a.from)) throw new Error(`adjust[${i}] needs from < to`);
    if (!a.effects.length) throw new Error(`adjust[${i}] needs effects`);
    checkFx(a.effects, `adjust[${i}].effects`, true);
  }
  const files = [...new Set([path, ...clips.map((c) => c.path ?? path)])];
  for (const file of [...files, ...inserts.map((i) => i.path), ...sounds.map((s) => s.path)]) {
    requireFile(file, "File");
  }
  const probes = new Map(await Promise.all(files.map(async (f) => [f, await probe(f)] as const)));
  const of = (c: Clip) => probes.get(c.path ?? path) as Awaited<ReturnType<typeof probe>>;
  const source = probes.get(path) as Awaited<ReturnType<typeof probe>>;
  for (const c of clips) {
    const from = of(c);
    if (!from.video) throw new Error(`${c.path ?? path} has no video, only audio.`);
    // A J or L cut's sound has to be there too.
    const range = opened(c);
    if (range.from < 0) {
      throw new Error(
        `A J cut needs sound from ${range.from.toFixed(2)}s, before the start of ${c.path ?? path}.`,
      );
    }
    // A clip past the end would come out short, and captions timed to it would drift.
    if (from.seconds && range.to > from.seconds) {
      throw new Error(
        `A clip ${c.to < range.to ? "with an L cut needs sound until" : "ends at"} ${range.to}s, after the end of ${c.path ?? path} (${from.seconds}s).`,
      );
    }
  }
  // The whole cut has sound if any clip does; a clip without fills its stretch with silence.
  const audio = clips.some((c) => of(c).audio);
  // An HDR source is brought to SDR first, or it comes out flat and grey (#252). The
  // SDR clips beside one are labelled BT.709 to match, or an untagged clip first (or
  // a segment of only SDR clips) leaves the whole file untagged.
  const hdr = clips.some((c) => of(c).transfer);
  const shaped = clips.map((c) => ({
    ...c,
    silent: audio && !of(c).audio,
    sdr: toSdrFor(of(c).transfer) ?? (hdr ? BT709 : undefined),
  }));
  // A subject mask is made before the graph: MODNet runs outside ffmpeg (#260).
  const subject = (e: Effect) => (e.mask as Mask | undefined)?.shape === "subject";
  // Said before any mask is made, which can take minutes.
  for (const fx of [...adjust.map((a) => a.effects), ...inserts.map((i) => i.effects ?? [])]) {
    if (fx.some(subject)) {
      throw new Error("A subject mask goes on a clip's effects, not a layer or insert's.");
    }
  }
  // A sound-only pass never draws the picture.
  for (const c of soundOnly ? [] : shaped) {
    if (!c.effects?.some(subject)) continue;
    const from = of(c);
    const file = await subjectMask(
      {
        ...{ path: c.path ?? path, from: c.from, to: c.to, size: from.size, fps: from.fps },
        prefix: `${c.sdr ? `${c.sdr},` : ""}${SQUARE},`,
        home: mockingbirdHome(),
      },
      (m) => console.error(m),
    );
    c.effects = c.effects.map((e) =>
      subject(e) ? { ...e, mask: { ...(e.mask as Mask), file, size: from.size } } : e,
    );
  }
  // HDR b-roll too: a video insert is probed for its transfer, a still has none.
  const placed = await Promise.all(
    inserts.map(async (i) =>
      STILL.test(i.path) ? i : { ...i, sdr: toSdrFor((await probe(i.path)).transfer) },
    ),
  );
  // A split takes its areas from one picture, so its clips are brought to the first's size.
  const frameSize = split ? source.size : (size ?? source.size);
  const rate = fps ?? source.fps;
  const bare =
    !soundOnly &&
    !captions?.trim() &&
    !texts.length &&
    !split &&
    !draft &&
    !inserts.length &&
    !adjust.length &&
    clips.every((c) => !c.transition && !c.sound && (c.speed ?? 1) === 1 && !c.effects?.length);
  // Nothing drawn and every clip as recorded: copying (#166) beats encoding segments to cache.
  if (cache && !draft && !soundOnly && !bare) {
    const made = await segmented(path, shaped, {
      audio,
      size: frameSize,
      fps: rate,
      split,
      cues: captions?.trim() ? parseSrt(captions.trim()) : [],
      captionsY,
      style,
      texts,
      inserts: placed,
      adjust,
      sounds,
      out,
      named,
      kind,
      language,
    });
    if (made) return made;
  }
  if (clips.length > CLIPS_PER_PASS) {
    // ponytail: a transition can't cross two batches; join batches with xfade if long edits need them.
    if (clips.some((c, i) => i > 0 && c.transition)) {
      throw new Error(
        `Transitions work with up to ${CLIPS_PER_PASS} clips for now; this has ${clips.length}.`,
      );
    }
    const batches = mkdtempSync(join(tmpdir(), "mockingbird-batches-"));
    try {
      const look = { audio, size: frameSize, fps: rate, split };
      const joined = await joinBatches(path, shaped, batches, look);
      // Its own length, which rounding to whole frames can leave a hair short of the clips'.
      const { seconds } = await probe(joined);
      // Framed and split already; this pass lays everything else over it.
      return await renderCut(joined, [{ from: 0, to: seconds }], {
        captions,
        captionsY,
        captionStyle: style,
        texts,
        inserts,
        adjust,
        sounds,
        out,
        named,
        kind,
        draft,
        soundOnly,
        language,
      });
    } finally {
      rmSync(batches, { recursive: true, force: true });
    }
  }
  const text = captions?.trim();
  const cues = text ? parseSrt(text) : [];

  const dir = mkdtempSync(join(tmpdir(), "mockingbird-render-"));
  let target: string | undefined;
  let sidecar = false;
  let made = false;
  try {
    const lines = [...cues.map((c) => c.text), ...texts.map((t) => t.text)];
    const [width, height] = (split ? "1080x1920" : frameSize).split("x").map(Number);
    // Drawn in the pinned Chrome, started under the no-network sandbox where there is one (#157).
    const chrome = lines.length ? findChrome() : undefined;
    const wrap = noNetwork();
    const images = chrome
      ? await drawCaptions(lines, dir, width ?? 1080, height, {
          chrome,
          wrap,
          fonts: captionFonts(lines, style),
          language: language ?? spokenLanguage(),
          style,
        })
      : undefined;
    const burn = !!text && !images && (await canBurn());
    sidecar = !!text && !images && !burn;
    target = outputFor(named, out, sidecar, kind, soundOnly ? ".m4a" : ".mp4");
    const srt = text && !images ? join(dir, CAPTIONS) : undefined;
    if (srt) writeFileSync(srt, `${text}\n`);
    const gain =
      audio && sounds.length
        ? await speechGain(
            seekClips(path, clips),
            shaped.flatMap((c, i) => {
              if (c.silent) return [];
              const ctx = { width: 1, height: 1, fps: rate, length: lengthOf(c) };
              return [`${soundOf(c, i, ctx)}[m${i}]`];
            }),
          )
        : 0;
    const graph = renderGraph(shaped, {
      audio,
      size: frameSize,
      fps: rate,
      split,
      burn,
      captionsY,
      overlays: images && [
        ...cues.map(({ start, end }) => ({ start, end, y: captionsY })),
        ...texts.map(({ from, to, y }) => ({ start: from, end: to, y })),
      ],
      inserts: placed.map(({ from, to, path: _, ...look }) => ({ start: from, end: to, ...look })),
      adjust: adjust.map(({ from, to, effects }) => ({ start: from, end: to, effects })),
      sounds,
      gain,
    });
    const extras = [
      ...(images ?? []).flatMap((image) => ["-i", image]),
      ...inserts.flatMap((i) => [...(STILL.test(i.path) ? ["-loop", "1"] : []), "-i", i.path]),
      ...sounds.flatMap((s) => [...(s.loop ? ["-stream_loop", "-1"] : []), "-i", s.path]),
    ];
    const hasSound = audio || sounds.length > 0;
    if (soundOnly && !hasSound) throw new Error("This edit has no sound to render on its own.");
    const unlevelled = join(dir, "unlevelled.mkv");
    // Nothing drawn over the picture, no split, and every clip played as it
    // was recorded: the stretches already in the output's codec, size and rate
    // can be copied (#166). If copying fails, the whole picture is encoded.
    // The sound alone still runs the picture's graph, into ffmpeg's null output: unencoded, it costs little.
    const picture = soundOnly
      ? ["-map", "[a]", "-c:a", "pcm_f32le", unlevelled, "-map", "[v]", "-f", "null", "-"]
      : undefined;
    const copied =
      bare &&
      (await copyRender(path, shaped, dir, unlevelled, {
        audio,
        size: frameSize,
        fps: rate,
        sounds,
        probes,
        gain,
      }).catch(() => false));
    if (!copied) {
      const proc = Bun.spawn(
        [
          "ffmpeg",
          ...["-nostdin", "-y", "-loglevel", "error", ...seekClips(path, clips)],
          ...extras,
          ...(sidecar ? ["-i", CAPTIONS] : []),
          // A draft is the finished picture at half the size, captions and all.
          // The sound alone maps [v] to the null output, so it's never scaled.
          ...(draft && !soundOnly
            ? graphFile(`${graph};[v]scale=trunc(iw/4)*2:trunc(ih/4)*2,setsar=1[small]`, dir)
            : graphFile(graph, dir)),
          ...(picture ?? [
            ...["-map", draft ? "[small]" : "[v]"],
            // Uncompressed until `level` sets the volume, and in floating point:
            // music and effects mixed over speech can go past full scale, which
            // 16-bit samples would clip before the limiter could hold it.
            ...(hasSound ? ["-map", "[a]", "-c:a", "pcm_f32le"] : []),
            // The subtitle file is the input after the clips and the extras.
            ...(sidecar
              ? ["-map", `${clips.length + extras.filter((a) => a === "-i").length}:s`]
              : []),
            ...(sidecar ? ["-c:s", "srt"] : []),
            ...["-c:v", "libx264", "-crf", draft ? "23" : "18"],
            ...["-preset", draft ? "ultrafast" : "veryfast", "-pix_fmt", "yuv420p"],
            unlevelled,
          ]),
        ],
        { cwd: dir, stderr: "pipe" },
      );
      if ((await proc.exited) !== 0) {
        throw new Error(
          `ffmpeg couldn't render ${target}: ${(await new Response(proc.stderr).text()).trim()}`,
        );
      }
    }
    if (hasSound) await level(unlevelled, target);
    else {
      await ffmpeg(
        [
          "-i",
          unlevelled,
          "-map",
          "0",
          "-c",
          "copy",
          "-c:s",
          "mov_text",
          "-movflags",
          "+faststart",
          target,
        ],
        `save ${target}`,
      );
    }
    const length = fineClock((await probe(target)).seconds * 1000);
    // Over the empty file outputFor claimed.
    if (srt && sidecar) copyFileSync(srt, srtFor(target));
    made = true;
    const lost =
      texts.length && !images ? "; the text couldn't be drawn here, so it's left out" : "";
    if (!text) return `${target} (${length})${lost}`;
    if (!sidecar) return `${target} (${length}), captions drawn on the picture${lost}`;
    return `${target} (${length}), captions as a subtitle track and in ${srtFor(target)}${lost}. They couldn't be drawn onto the picture here; an editor such as CapCut can burn in the .srt.`;
  } finally {
    // The claimed names stay only if the video and its .srt were both made.
    if (!made && target) {
      rmSync(target, { force: true });
      if (sidecar) rmSync(srtFor(target), { force: true });
    }
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Render's side of a motion draw, which motion/ can't import (render comes after motion). */
export const motionHost: Host = {
  outputFor,
  claim,
  ffmpeg,
  async mix(target, { audio, sounds, seconds }) {
    // A folder of its own beside the target: the same disk, so the move is a rename,
    // and a name no one else's file can have.
    const work = mkdtempSync(join(dirname(target), ".mockingbird-mix-"));
    try {
      const mixing = join(work, "mix.mkv");
      const levelled = join(work, "levelled.mp4");
      const gain = audio ? await speechGain(["-i", target], ["[0:a]"]) : 0;
      const graph = [
        ...(audio ? ["[0:a]anull[speech]"] : []),
        ...mixGraph(sounds, { speech: audio, length: seconds, first: 1, gain }),
      ].join(";");
      const mix = Bun.spawn(
        [
          ...["ffmpeg", "-nostdin", "-y", "-loglevel", "error", "-i", target],
          ...sounds.flatMap((s) => [...(s.loop ? ["-stream_loop", "-1"] : []), "-i", s.path]),
          ...["-filter_complex", graph, "-map", "0:v", "-map", "[a]", "-c:v", "copy"],
          // Floating point, as in render: the mix can go past full scale.
          ...["-c:a", "pcm_f32le", mixing],
        ],
        { stderr: "pipe" },
      );
      if ((await mix.exited) !== 0) {
        throw new Error(
          `ffmpeg couldn't mix the sound into ${target}: ${(await new Response(mix.stderr).text()).trim()}`,
        );
      }
      await level(mixing, levelled);
      renameSync(levelled, target);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  },
};
/** Draws an HTML page in Chrome (motion/), with this file's output naming and mixing. */
export const motion = makeMotion(motionHost);

/** The rate every generated track is made at. */
const MUSIC_RATE = 48000;

/**
 * Music written as code: the generator module `script` played into an
 * OfflineAudioContext in the pinned Chrome, sandboxed like `motion`, and
 * saved as a WAV at `out` brought to LUFS through LIMIT, like everything
 * mockingbird makes. The same arguments make the same track, to the last
 * bits: Chrome sums a node's inputs in an order that varies between runs.
 */
async function music(
  script: string,
  out: string,
  params: Omit<MusicParams, "sampleRate">,
): Promise<string> {
  requireFile(script, "Generator");
  if (!/\.m?js$/i.test(script)) throw new Error(`A generator is a .js module; got ${script}`);
  if (!/\.wav$/i.test(out)) throw new Error(`out must be a .wav file; got ${out}`);
  const chrome = needChrome();
  const target = outputFor(out, out, false);
  const started = performance.now();
  const work = mkdtempSync(join(dirname(target), ".mockingbird-music-"));
  let reached = LUFS;
  try {
    const raw = join(work, "raw.wav");
    await sandboxed(
      { music: true, script, chrome, out: raw, params: { ...params, sampleRate: MUSIC_RATE } },
      "the generator",
    );
    if (!((await loudness(raw)) > -70)) throw new Error(`${script} made silence.`);
    // levelGain's one correction falls short on music with big hits (cinematic
    // drums: -14.9 LUFS). A bed is short, so measure through the limiter once more.
    let gain = await levelGain(raw);
    gain = Math.min(MAX_GAIN, gain + LUFS - (await loudness(raw, `volume=${gain}dB,${LIMIT},`)));
    const levelled = join(work, "levelled.wav");
    await ffmpeg(
      ["-i", raw, "-af", `volume=${gain.toFixed(2)}dB,${LIMIT}`, "-c:a", "pcm_s16le", levelled],
      `bring ${target} to ${LUFS} LUFS`,
    );
    reached = await loudness(levelled);
    renameSync(levelled, target);
  } catch (error) {
    rmSync(target, { force: true });
    throw error;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  const took = ((performance.now() - started) / 1000).toFixed(1);
  return `${target} (${clock(params.duration * 1000)}, 48 kHz stereo, ${reached.toFixed(1)} LUFS), made in ${took} s`;
}

/** An `energy` argument: a level 0-1, or [seconds, level] points in time order. */
function energy(value: unknown): MusicParams["energy"] {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) return within(value, 0, 1, "energy");
  if (!value.length) throw new Error("energy's curve needs at least one [seconds, level] point");
  let last = -1;
  return value.map((point, i) => {
    if (!Array.isArray(point) || point.length !== 2) {
      throw new Error(`energy[${i}] must be [seconds, level]; got ${JSON.stringify(point)}`);
    }
    const at = within(point[0], 0, MOTION_MAX_SECONDS, `energy[${i}][0]`);
    if (at <= last) throw new Error(`energy's points must be in time order; energy[${i}] isn't`);
    last = at;
    return [at, within(point[1], 0, 1, `energy[${i}][1]`)];
  });
}

/** What `wanted` asks of a project in `dir`, by absolute path. */
function wantedFrom(
  p: Project,
  ops: unknown[],
  dir: string,
  heard?: Map<string, { words: Word[]; gaps: Span[] }>,
): Map<string, Span[]> {
  const out = new Map<string, Span[]>();
  const words = heard && ((path: string) => heard.get(resolve(dir, path))?.words ?? []);
  const gaps = heard && ((path: string) => heard.get(resolve(dir, path))?.gaps ?? []);
  for (const [path, spans] of wanted(p, ops, words, gaps)) {
    const full = resolve(dir, path);
    out.set(full, [...(out.get(full) ?? []), ...spans]);
  }
  return out;
}

/**
 * The transcription in effect when the batch's first cut_words runs: a set
 * before it changes which words the cut is made on. Ops that fail here fail
 * the real batch too, so the saved one stands then.
 */
export function transcriptionAt(p: Project, ops: unknown[]): ModelChoice | undefined {
  const first = ops.findIndex((o) => (o as { op?: unknown })?.op === "cut_words");
  if (first < 0) return p.transcription;
  try {
    return apply(p, ops.slice(0, first)).project.transcription;
  } catch {
    return p.transcription;
  }
}

/**
 * `ops` applied to the project in `file`, hearing first whatever cut_words
 * needs: the words of every clip there is or will be.
 */
async function editProject(file: string, ops: unknown[], log: (m: string) => void) {
  if (!ops.some((o) => (o as { op?: unknown })?.op === "cut_words")) return edit(file, ops);
  const dir = dirname(file);
  // Hearing takes a while: if what the project asks to be heard changed
  // meanwhile (another edit added a clip), hear that too, so no clip is
  // missing words (#235). A text or a size changed alongside doesn't count.
  // ponytail: an edit landing between the last check and the save isn't seen;
  // a lock file if agents edit one project at once.
  // With words heard, the cut_words ops are replayed too, so a later op on a
  // clip one of them splits off asks for its stretch, and that's heard next.
  const asks = (p: Project, heard?: Awaited<ReturnType<typeof sourceWords>>) => {
    const spans = wantedFrom(p, ops, dir, heard);
    const choice = transcriptionAt(p, ops);
    return { spans, choice, key: JSON.stringify([[...spans], choice]) };
  };
  let want = asks(load(file).project);
  let heard: Awaited<ReturnType<typeof sourceWords>>;
  // ponytail: a few rounds at most; each can only add stretches a cut made reachable.
  for (let round = 0; ; round++) {
    heard = await sourceWords(want.spans, log, want.choice);
    const now = asks(load(file).project, heard);
    if (now.key === want.key || round >= 4) break;
    want = now;
  }
  return edit(
    file,
    ops,
    (path) => heard.get(resolve(dir, path))?.words ?? [],
    (path) => heard.get(resolve(dir, path))?.gaps ?? [],
  );
}

/** The words in the project in `file`'s cut, from the word cache. */
export async function projectTranscript(
  file: string,
  log: (m: string) => void,
  choice: ModelChoice,
) {
  if (load(file).created) throw new Error(`No project at ${file}; make one with \`edit\`.`);
  checkChoice(choice);
  const models = join(mockingbirdHome(), "models");
  if (choice.model && !existsSync(join(models, choice.model))) {
    throw new Error(`${choice.model} isn't in ${models}; \`mockingbird models\` lists what is.`);
  }
  // A model or language given here is kept on the project, over what it had,
  // so cut_words, captions and render hear the words this transcript shows.
  if (choice.model || choice.language) {
    const transcription = { ...load(file).project.transcription, ...choice };
    edit(file, [{ op: "set", transcription }]);
  }
  const { project } = load(file);
  const dir = dirname(file);
  const heard = await sourceWords(wantedFrom(project, [], dir), log, project.transcription);
  return transcript(project, file, (path) => heard.get(resolve(dir, path))?.words ?? []);
}

async function captions(
  path: string,
  log: (m: string) => void,
  clips: Clip[],
  options: Parameters<typeof wordCaptions>[2],
  choice: ModelChoice = {},
): Promise<string> {
  const words = await clipWords(path, clips, log, choice);
  return wordCaptions(clips, words, options) || "No speech in those clips.";
}

/**
 * Word-by-word captions for a compiled project's cut, as SRT timed to the
 * finished video: speed, transitions and J and L cuts included. Each
 * source's words come from the word cache.
 */
async function cutCaptions(
  cut: ReturnType<typeof compile>,
  log: (m: string) => void,
  { perCue = 3, lit = true, upper = false }: { perCue?: number; lit?: boolean; upper?: boolean },
  choice: ModelChoice = {},
): Promise<string> {
  const heard = await sourceWords(
    new Map(
      [...new Set(cut.clips.map((c) => c.path))].map((path) => [
        path,
        // The sound's stretch, which a J or L cut moves off the picture's.
        cut.clips.filter((c) => c.path === path).map((c) => c.sound ?? c),
      ]),
    ),
    log,
    choice,
  );
  // Every word of the clip's source: wordCaptions keeps the ones inside each clip.
  const asr = (path: string): AsrWord[] =>
    (heard.get(path)?.words ?? []).map((w) => ({
      word: w.word,
      startMs: w.start * 1000,
      endMs: w.end * 1000,
      probability: 1,
    }));
  return wordCaptions(
    cut.clips,
    cut.clips.map((c) => asr(c.path)),
    { perCue, lit, upper },
  );
}

/** A source bigger than this on its short side is drafted from a proxy. */
const PROXY_OVER = 1080;

/**
 * `clips` with any from a source bigger than PROXY_OVER read from a proxy of
 * just the stretch it opens: 720 lines of H.264, made once and kept in
 * ~/.mockingbird/cache/proxies/. 4K HEVC decodes so slowly that a half-size
 * draft of a minute of it took 20.7 s from the source and 2.1 s from a proxy,
 * which took 22.2 s to make. Only the stretches used are proxied, so an
 * hour-long source isn't converted for a two-minute edit (#167).
 */
async function proxied(clips: Clip[]): Promise<Clip[]> {
  const sides = new Map<string, number>();
  const out: Clip[] = [];
  for (const c of clips) {
    const path = c.path as string;
    if (!sides.has(path)) sides.set(path, (await probe(path)).side);
    if ((sides.get(path) ?? 0) <= PROXY_OVER) {
      out.push(c);
      continue;
    }
    const { from, to } = opened(c);
    const { size, mtimeMs } = statSync(path);
    const key = createHash("sha256")
      .update(JSON.stringify([1, path, size, mtimeMs, from, to]))
      .digest("hex")
      .slice(0, 32);
    const file = join(mockingbirdHome(), "cache", "proxies", `${key}.mp4`);
    if (!existsSync(file)) {
      mkdirSync(dirname(file), { recursive: true });
      const temp = `${file}.${process.pid}.tmp.mp4`;
      await ffmpeg(
        [
          ...["-hwaccel", "auto", "-ss", String(from), "-t", String(to - from), "-i", path],
          ...[
            "-map",
            "0:v:0",
            "-map",
            "0:a:0?",
            "-vf",
            "scale='if(lt(iw,ih),720,-2)':'if(lt(iw,ih),-2,720)'",
          ],
          ...["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-g", "15"],
          ...["-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", temp],
        ],
        `make a draft proxy of ${path}`,
      );
      renameSync(temp, file);
    }
    // The proxy starts where the clip's input opened, and can end a frame short of it.
    const length = (await probe(file)).seconds;
    const moved = (r: { from: number; to: number }) => ({
      from: r.from - from,
      to: Math.min(r.to - from, length),
    });
    out.push({ ...c, path: file, ...moved(c), ...(c.sound && { sound: moved(c.sound) }) });
  }
  return out;
}

/**
 * The project in `file` rendered: its clips from their sources, framed to
 * its size, with captions made for the cut as it is now and everything on
 * it timed from its clips. Saved beside the project as `<name>-render-N.mp4`.
 */
/**
 * A project's overlays (#163), inserts whose picture is an HTML page: each
 * rendered alone with its transparency (ProRes 4444) at the project's size
 * and rate for its stretch, kept under ~/.mockingbird/cache/overlays/ by the
 * page's folder and the look, and laid over the cut like b-roll. A page's
 * `mockingbird.audio` joins the project's sound, timed from the overlay.
 */
async function overlays(
  inserts: Insert[],
  look: { size: string; fps: number },
  log: (m: string) => void,
): Promise<{ inserts: Insert[]; sounds: (Sound & { path: string })[] }> {
  const laid: Insert[] = [];
  const heard: (Sound & { path: string })[] = [];
  for (const insert of inserts) {
    if (!/\.html?$/i.test(insert.path)) {
      laid.push(insert);
      continue;
    }
    const page = requireFile(insert.path, "Page");
    const [width = 0, height = 0] = look.size.split("x").map(Number);
    const duration = Math.round((insert.to - insert.from) * 1000) / 1000;
    // A page loads its neighbours (CSS, images, the kit), so their sizes and times are in the key.
    // The pinned fonts are in it too, since the page draws with them. 3: pages
    // drawn before the font check (#276) are drawn again, through it.
    const fonts = fontFaces();
    const hash = createHash("sha256").update(
      JSON.stringify([3, basename(page), look, duration, fontStamps(fonts)]),
    );
    stampFolder(hash, dirname(page));
    // The kit and the styles live in the plugin, not beside the page: a rebuilt
    // kit.js or styles.js has to change the key of every page that imports it.
    const html = readFileSync(page, "utf8");
    const motionDir = join(PLUGIN, "skills", "motion-graphics");
    hash.update(
      JSON.stringify(
        [
          ['from "KIT"', "kit.js"],
          ['from "STYLES"', "styles.js"],
        ]
          .filter(([use]) => html.includes(use as string))
          .map(([, file]) => stamp(join(motionDir, file as string))),
      ),
    );
    const key = hash.digest("hex").slice(0, 32);
    const cache = join(mockingbirdHome(), "cache", "overlays");
    const mov = join(cache, `${key}.mov`);
    const listed = join(cache, `${key}.json`);
    if (existsSync(mov) && existsSync(listed)) {
      log(`${basename(page)}: reusing the overlay rendered before`);
    } else {
      mkdirSync(cache, { recursive: true });
      log(`${basename(page)}: rendering ${duration.toFixed(1)} s of overlay`);
      // Temp names of its own, so two renders of one overlay don't write the same file.
      const part = join(cache, `${key}.${process.pid}-${randomUUID()}.part`);
      // A page copied from the templates imports "KIT", which motion fills in; so does this.
      const filled = withKit(page);
      try {
        const said = await sandboxed(
          {
            script: filled,
            chrome: needChrome(),
            out: `${part}.mov`,
            width,
            height,
            fps: look.fps,
            duration,
            alpha: true,
            fonts,
          },
          "the overlay page",
        );
        const result = JSON.parse(said.trim().split("\n").at(-1) || "{}") ?? {};
        writeFileSync(`${part}.json`, JSON.stringify(result.sounds ?? []));
        // The sounds first: a reader goes by the .mov, and finds its list there.
        renameSync(`${part}.json`, listed);
        renameSync(`${part}.mov`, mov);
      } finally {
        rmSync(`${part}.mov`, { force: true });
        rmSync(`${part}.json`, { force: true });
        if (filled !== page) rmSync(filled, { force: true });
      }
    }
    laid.push({ ...insert, path: mov });
    const sounds = JSON.parse(readFileSync(listed, "utf8")) as unknown;
    for (const [i, t] of items(sounds).entries()) {
      heard.push({
        path: requireFile(String(t.path), `${basename(page)}'s audio[${i}]`),
        at: insert.from + within(t.at, 0, Number.MAX_VALUE, `audio[${i}].at`, 0),
        volume: within(t.volume, 0, 4, `audio[${i}].volume`, 1),
        loop: !!t.loop,
        duck: !!t.duck,
      });
    }
  }
  return { inserts: laid, sounds: heard };
}

/**
 * A project's generated sounds made into WAVs (#170), each as long as the
 * video from where it starts, and kept under ~/.mockingbird/cache/music/ by
 * the generator's folder of modules and its arguments, so a render after an
 * edit doesn't generate the same bed again.
 */
async function beds(
  cut: ReturnType<typeof compile>,
  log: (m: string) => void,
): Promise<(Sound & { path: string })[]> {
  const out: (Sound & { path: string })[] = [];
  for (const { generator: g, path: file, ...rest } of cut.sounds) {
    if (!g) {
      out.push({ ...rest, path: file ?? "" });
      continue;
    }
    const script = requireFile(g.generator, "Generator");
    const params = {
      // As long as asked (a bed under just the intro), never past the video's end (#266).
      duration: Math.min(
        MOTION_MAX_SECONDS,
        g.length ?? Number.POSITIVE_INFINITY,
        Math.max(1, Math.round((cut.length - rest.at) * 1000) / 1000),
      ),
      seed: g.seed ?? 1,
      tempo: g.tempo,
      key: g.key,
      energy: g.energy,
    };
    // The generator imports its neighbours (lib.js, lib/harmony.js), so all of them are in the key.
    const hash = createHash("sha256").update(JSON.stringify([2, params]));
    stampFolder(hash, dirname(script), (f) => /\.m?js$/i.test(f));
    hash.update(basename(script));
    const wav = join(mockingbirdHome(), "cache", "music", `${hash.digest("hex").slice(0, 32)}.wav`);
    if (existsSync(wav)) {
      log(`${basename(script)}: reusing the bed made before`);
    } else {
      mkdirSync(dirname(wav), { recursive: true });
      log(`${basename(script)}: generating ${params.duration.toFixed(1)} s of music`);
      // Made under a temp name and renamed when whole: music() claims its out
      // file at the start, and another render would mix that empty file.
      const part = `${wav.slice(0, -4)}.${process.pid}-${randomUUID()}.part.wav`;
      try {
        await music(script, part, params);
        renameSync(part, wav);
      } catch (error) {
        // A generator that schedules every note up front takes time that grows with the square of the length (#272).
        if (/didn't answer/.test(String(error))) {
          throw new Error(
            `${basename(script)} couldn't make ${params.duration.toFixed(0)} s of music in time. If it schedules every note up front, wrap each bar in lib.js's \`soon\` so it's made as it plays. Or give the sound a \`length\` (just the part that needs music), or make a shorter bed with \`music\` and \`loop\` it. (${(error as Error).message})`,
          );
        }
        throw error;
      } finally {
        rmSync(part, { force: true });
      }
    }
    out.push({ ...rest, path: wav });
  }
  return out;
}

async function renderProject(
  file: string,
  log: (m: string) => void,
  out?: string,
  draft = false,
  soundOnly = false,
) {
  const { project, created } = load(file);
  if (created) throw new Error(`No project at ${file}; make one with \`edit\`.`);
  // The sound alone draws nothing; any picture with graphics waits for the look,
  // a draft too, since it has every text and overlay in it (#264).
  const gate = soundOnly ? undefined : lookGate(project);
  if (gate) throw new Error(gate);
  const { approved: yes, file: lookFile } = project.look ?? {};
  const approved = yes && lookFile ? resolve(dirname(file), lookFile) : undefined;
  if (!soundOnly && approved && !existsSync(approved)) {
    throw new Error(
      `The approved look ${approved} isn't there. Draw it again with \`look\` and get the user's yes before rendering.`,
    );
  }
  const cut = compile(project, dirname(file));
  const first = cut.clips[0]?.path;
  if (!first) throw new Error(`${file} has no clips yet; add some with \`edit\`.`);
  if (project.level) {
    const gains = await levelGains(
      cut.clips.map((c) => c.path),
      project.level.target,
      (path) => loudness(path).catch(() => -Infinity),
    );
    for (const [path, { measured, db }] of gains)
      log(
        `level: ${basename(path)} ${measured.toFixed(1)} LUFS, ${db >= 0 ? "+" : ""}${db.toFixed(1)} dB`,
      );
    cut.clips = cut.clips.map((c) => {
      const db = gains.get(c.path)?.db;
      return db ? { ...c, effects: [...(c.effects ?? []), { name: "gain", db }] } : c;
    });
  }
  // The sound alone needs nothing drawn, so nothing is transcribed for captions.
  const said =
    cut.captions && !soundOnly
      ? await cutCaptions(cut, log, cut.captions, project.transcription)
      : undefined;
  // A draft reads 4K from proxies; its size is still the source's, not the proxy's.
  const clips = draft ? await proxied(cut.clips) : cut.clips;
  const source = await probe(first);
  const laid = soundOnly
    ? { inserts: [], sounds: [] }
    : await overlays(
        cut.inserts,
        { size: cut.size ?? source.size, fps: cut.fps ?? source.fps },
        log,
      );
  return render(clips[0]?.path ?? first, clips, {
    size: cut.size ?? (draft ? source.size : undefined),
    fps: cut.fps,
    split: cut.split,
    captions: said,
    captionsY: cut.captions?.y ?? CAPTIONS_Y,
    captionStyle: captionStyle(
      lookCaptions(cut.captions?.style, "captions.style"),
      "captions.style",
    ),
    texts: soundOnly ? [] : cut.texts,
    inserts: laid.inserts,
    adjust: soundOnly ? [] : cut.adjust,
    sounds: [...(await beds(cut, log)), ...laid.sounds],
    out,
    named: file,
    kind: soundOnly ? "sound" : draft ? "draft" : "render",
    draft,
    soundOnly,
    cache: true,
    // The project's language draws its Han captions; auto leaves it to the setting.
    language:
      project.transcription?.language === "auto" ? undefined : project.transcription?.language,
  });
}

/**
 * `export`: the project at `file` as FCPXML and/or OTIO (#198), each source
 * probed for its length, size and rate. Never overwrites: a taken name gets -N.
 */
async function exportProject(file: string, format: string, out: unknown): Promise<string> {
  if (!["fcpxml", "otio", "both"].includes(format)) {
    throw new Error(`format must be fcpxml, otio or both; got ${format}`);
  }
  const project = load(requireFile(file, "Project")).project;
  if (!project.clips.length) throw new Error(`${file} has no clips to export.`);
  const compiled = compile(project, dirname(file));
  // An HTML overlay is drawn by Chrome at render time, so there's no media for an editor to take.
  const pages = compiled.inserts.filter((i) => /\.html?$/i.test(i.path));
  const cut = { ...compiled, inserts: compiled.inserts.filter((i) => !pages.includes(i)) };
  const paths = [
    ...new Set([
      ...cut.clips.map((c) => c.path),
      ...cut.inserts.map((i) => i.path),
      ...cut.sounds.flatMap((s) => (s.path ? [s.path] : [])),
    ]),
  ];
  const facts = new Map<string, Source>();
  for (const p of paths) {
    const pr = await probe(requireFile(p, "Source"));
    facts.set(p, {
      seconds: pr.seconds,
      video: pr.video,
      audio: pr.audio,
      size: pr.size,
      fps: pr.fps,
    });
  }
  const info = (p: string) => facts.get(p) as Source;
  const first = info(cut.clips[0]?.path as string);
  const size = cut.size ?? (cut.split ? "1080x1920" : first.size);
  const fps = cut.fps ?? first.fps;
  const name = basename(file).replace(/\.json$/i, "");
  const dir = out === undefined ? dirname(file) : resolve(String(out));
  mkdirSync(dir, { recursive: true });
  const free = (ext: string) => {
    for (let n = 0; ; n++) {
      const f = join(dir, `${name}${n ? `-${n}` : ""}.${ext}`);
      if (!existsSync(f)) return f;
    }
  };
  const saved: string[] = [];
  let left: string[] = [];
  if (format !== "otio") {
    const x = toFcpxml(cut, name, size, fps, info);
    const f = free("fcpxml");
    writeFileSync(f, x.text);
    saved.push(f);
    left = x.left;
  }
  if (format !== "fcpxml") {
    const o = toOtio(cut, name, fps, info);
    const f = free("otio");
    writeFileSync(f, o.text);
    saved.push(f);
    // Both formats: everything either one leaves out, said once.
    left = [...new Set([...left, ...o.left])];
  }
  if (pages.length) left = [...left, `${pages.length} HTML overlay page(s)`];
  return [
    `Saved ${saved.join(" and ")} (${size}, ${fps} fps, ${cut.clips.length} clips).`,
    left.length ? `Not carried, so redo them in the editor: ${left.join("; ")}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** An insert's box: an area, and the `path` `track` gives to move it with a subject. */
function tracked(value: unknown, what: string): NonNullable<Look["box"]> {
  const path = (value as { path?: unknown } | null)?.path;
  if (path === undefined) return area(value, what);
  checkPath(path, `${what}.path`);
  return { ...area(value, what), path: path as TrackPoint[] };
}

/** The tools still defined here, until each moves to its domain's tools.ts (#300). */
export function engineTools(status: () => Promise<object>, log: (m: string) => void): Tool[] {
  const path = { type: "string", description: "Absolute path to the file" };
  const areaSchema = {
    type: "object",
    properties: {
      x: { type: "number" },
      y: { type: "number" },
      w: { type: "number" },
      h: { type: "number" },
    },
    required: ["x", "y", "w", "h"],
  };
  return [
    {
      name: "edit",
      description: `Edit a project file (project.json): an edit kept between calls, whose clips can come from several sources and whose texts, b-roll and sounds stay on their clips as the cut changes. Applies \`ops\` in order, all or none, saves, and returns an outline: each clip's place in the finished video and what's on it. Makes the file if it isn't there; no ops only reads it. You can also edit the JSON by hand. Times: a clip's from/to are seconds in its source (as \`transcribe\` gives them); a text's, insert's or sound's are seconds from the start of its \`clip\` in the finished video, or of the video without one. Ops:
- {op:"add", type:"clip", path, from, to, focus?:{x,y}, zoom?, speed?, moves?, transition?, lead?, index?}: on the main track, which plays in order with no gaps (default at the end). speed: 0.25-4. moves: [{at, focus?, zoom?, ease?}], the framing by \`at\` seconds into the clip, eased ("smooth", or "linear") from the one before: a slow push-in, a move to the other speaker. transition: {type, duration}, how the clip comes in over the end of the one before: ffmpeg xfade's fade, fadeblack, fadewhite, dissolve, wipe*, slide*, smooth*, circleopen, zoomin and others. lead: a J cut (positive: the clip's sound starts that many seconds before its picture) or an L cut (negative: the clip before's sound carries on over its picture)
- {op:"add", type:"text", text, from, to, clip?, y?}: drawn like the captions, *words* yellow
- {op:"add", type:"insert", path, from, to, clip?, box?, blend?, effects?, moves?}: a picture or video over the whole frame (b-roll). box: {x, y, w, h, path?}, 0-1 of the picture, makes it a picture in the picture; path, from track, moves it with a subject. blend: screen, multiply, overlay, softlight, lighten, darken, addition or difference (whole frame only). effects: from the catalog; chromakey keys a green screen over the cut. moves: as a clip's, a Ken Burns pan over a still
- {op:"add", type:"adjust", from, to, clip?, effects}: an adjustment layer; its effects change everything under the text (clips and inserts) for its stretch, e.g. a grade over a whole section
- {op:"add", type:"audio", path, at?, clip?, volume?, loop?, duck?}: music or a sound effect under the speech. Or generated music in place of path: generator:{generator:"/abs/lofi.js", tempo?, key?, energy?, seed?, length?} (a music generator; the bed is made at render time, as long as the video from at or \`length\` seconds if given, and kept, so it isn't made again)
- {op:"remove", id}: a clip goes with everything on it, and the cut closes up
- {op:"split", id, at}: a clip in two at a source time; what's on the second half moves with it
- {op:"trim", id, from?, to?}: a clip's source times; what's on it stays on the same picture
- {op:"move", id, index}: a clip to another place in the cut
- {op:"cut_words", text, clip?, all?} or {op:"cut_words", from, to, clip?}: cut words out of the cut by quoting them from \`transcribe\` with the project (no case or punctuation needed): \`text\` must be said once (or give \`clip\`, or \`all: true\` for every time), and from/to cuts from the first words through the last, across clips. Cuts land in the pauses, 0.2 s from the words kept; clips are split, trimmed or removed to do it
- {op:"set", id, ...fields}: change an item (null clears a field); without id, the project's size ("1080x1920" makes it vertical, cropping each clip around its focus), fps, split {top, bottom} and captions {perCue?, lit?, upper?, y?, style?} (null for none; style is as render's captionStyle). Ids are given out as c1, t1, b1, a1.`,
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string", description: "Absolute path to the project's .json file" },
          ops: { type: "array", items: { type: "object" }, description: "The ops, in order" },
        },
        required: ["project"],
      },
      run: async (a) => {
        // Unchecked, a missing project would make a file named "undefined" here.
        if (typeof a.project !== "string" || !a.project) {
          throw new Error("project must be the path to a project file");
        }
        if (!Array.isArray(a.ops ?? [])) throw new Error("ops must be a list");
        return editProject(resolve(String(a.project)), (a.ops ?? []) as unknown[], log);
      },
    },
    {
      name: "render",
      description:
        "Render an `edit` project to MP4 (`project`), or cut clips out of one video and join them (`path` and `clips`), for a Short, Reel or long-form video. You choose the clips (cut on word ends from `transcribe` with `words: true`) and write the captions; this runs ffmpeg on the Mac. A project's captions are made from its clips' words when it renders. Returns the new file's path and length. It never overwrites a file.",
      inputSchema: {
        type: "object",
        properties: {
          sound: {
            type: "boolean",
            description:
              "A project's sound alone, as <name>-sound-N.m4a at -14 LUFS, to check the mix (speech, music, effects) without rendering the picture",
          },
          draft: {
            type: "boolean",
            description:
              "A quick preview at half the size, to check the cut before the real render: a project's 4K sources are read from small proxies of the stretches it uses, made once and kept",
          },
          project: {
            type: "string",
            description:
              "Absolute path to a project file from `edit`. Takes the place of everything else but `out`; the video goes beside it as <name>-render-N.mp4",
          },
          path,
          clips: {
            type: "array",
            description: "Stretches of the source to keep, in order, in seconds",
            items: {
              type: "object",
              properties: {
                from: { type: "number" },
                to: { type: "number" },
                focus: {
                  type: "object",
                  description:
                    "The point to keep in frame, 0-1 of the source's width and height (default the middle). Find it with `frames`.",
                  properties: { x: { type: "number" }, y: { type: "number" } },
                },
                zoom: {
                  type: "number",
                  description:
                    "Punch in on the focus, 1-4 (default 1). 1.1-1.2 on alternate jump cuts hides them.",
                },
                effects: {
                  type: "array",
                  items: { type: "object" },
                  description: "Effects from the catalog (`effects` lists them), in order",
                },
              },
              required: ["from", "to"],
            },
          },
          vertical: {
            type: "boolean",
            description: "Crop to 9:16 at 1080x1920, around each clip's focus",
          },
          split: {
            type: "object",
            description:
              "Two areas of the source stacked into 1080x1920, each filling half, e.g. a screen recording on top and the webcam below. Areas are { x, y, w, h }, 0-1 of the source's width and height. Clips' focus and zoom don't apply.",
            properties: { top: areaSchema, bottom: areaSchema },
            required: ["top", "bottom"],
          },
          captions: {
            type: "string",
            description:
              "SRT text timed to the finished video, not the source: subtract each clip's start, and add the length of the clips before it. Drawn onto the picture, white with a black outline; a word written *like this* is drawn yellow, for word-by-word captions with the spoken word lit. If they can't be drawn here, a subtitle track and an .srt file beside the video.",
          },
          captionsY: {
            type: "number",
            description:
              "Where the middle of the captions sits, 0-1 of the height (default 0.7). 0.5 puts them on a split's seam.",
          },
          captionStyle: CAPTION_STYLE_SCHEMA,
          texts: {
            type: "array",
            description:
              "More text drawn like the captions over a stretch of the finished video, such as a title for the first seconds. *Words* are yellow here too.",
            items: {
              type: "object",
              properties: {
                text: { type: "string" },
                from: { type: "number" },
                to: { type: "number" },
                y: { type: "number", description: "Its middle, 0-1 of the height (default 0.7)" },
              },
              required: ["text", "from", "to"],
            },
          },
          inserts: {
            type: "array",
            description:
              "Pictures or videos (b-roll) laid over the whole frame for a stretch of the finished video while the speech carries on, under the text. Scaled to fill; a video's own sound isn't used.",
            items: {
              type: "object",
              properties: {
                path,
                from: { type: "number" },
                to: { type: "number" },
                box: {
                  type: "object",
                  description:
                    "{x, y, w, h, path?}, 0-1 of the picture: a picture in the picture, filled to the box. path: the points `track` gives, to move the box with a subject (a title that follows someone)",
                },
                blend: {
                  type: "string",
                  enum: BLENDS,
                  description: "How it mixes with the cut under it (whole frame only)",
                },
                effects: {
                  type: "array",
                  items: { type: "object" },
                  description:
                    "Effects from the catalog, on the insert alone: chromakey keys a green screen so the cut shows through",
                },
              },
              required: ["path", "from", "to"],
            },
          },
          adjust: {
            type: "array",
            description:
              "Adjustment layers: catalog effects on everything under the text (the clips and the inserts) from `from` to `to` seconds of the finished video",
            items: {
              type: "object",
              properties: {
                from: { type: "number" },
                to: { type: "number" },
                effects: { type: "array", items: { type: "object" } },
              },
              required: ["from", "to", "effects"],
            },
          },
          audio: {
            type: "array",
            description:
              "Sounds mixed under the speech: music (`loop`, `duck`, volume about 0.15) or a sound effect at a moment. The result is brought to -14 LUFS, the loudness Shorts, Reels and TikTok play at.",
            items: {
              type: "object",
              properties: {
                path,
                at: { type: "number", description: "Seconds into the finished video (default 0)" },
                volume: { type: "number", description: "0-4 (default 1)" },
                loop: { type: "boolean", description: "Repeat it to the end of the video" },
                duck: { type: "boolean", description: "Turn it down while someone speaks" },
              },
              required: ["path"],
            },
          },
          out: {
            type: "string",
            description: "Absolute path for the MP4. Default: <source>-short-N.mp4 beside it",
          },
        },
      },
      // Absolute paths, since ffmpeg runs in a temp folder.
      run: (a) => {
        const out = a.out === undefined ? undefined : resolve(String(a.out));
        if (a.project !== undefined) {
          return renderProject(resolve(String(a.project)), log, out, !!a.draft, !!a.sound);
        }
        if (a.path === undefined) throw new Error("Give a `project`, or a `path` and `clips`.");
        return render(
          resolve(String(a.path)),
          items(a.clips).map((c, i) => {
            const focus = c.focus as Record<string, unknown> | undefined;
            return {
              from: seconds(c.from) ?? Number.NaN,
              to: seconds(c.to) ?? Number.NaN,
              ...(focus && {
                focus: {
                  x: within(focus.x, 0, 1, `clips[${i}].focus.x`, 0.5),
                  y: within(focus.y, 0, 1, `clips[${i}].focus.y`, 0.5),
                },
              }),
              zoom: within(c.zoom, 1, 4, `clips[${i}].zoom`, 1),
              ...(c.effects === undefined
                ? {}
                : { effects: checkEffects(c.effects, `clips[${i}].effects`) }),
            };
          }),
          {
            // Vertical is the 9:16 frame a project would ask for by size.
            size: a.vertical ? "1080x1920" : undefined,
            split: a.split
              ? {
                  top: area((a.split as Record<string, unknown>).top, "split.top"),
                  bottom: area((a.split as Record<string, unknown>).bottom, "split.bottom"),
                }
              : undefined,
            captions: a.captions === undefined ? undefined : String(a.captions),
            captionsY: within(a.captionsY, 0, 1, "captionsY", CAPTIONS_Y),
            captionStyle: captionStyle(lookCaptions(a.captionStyle)),
            texts: items(a.texts).map((t, i) => ({
              text: String(t.text ?? ""),
              ...stretch(t, `texts[${i}]`),
              y: within(t.y, 0, 1, `texts[${i}].y`, CAPTIONS_Y),
            })),
            inserts: items(a.inserts).map((t, i) => ({
              path: resolve(String(t.path)),
              ...stretch(t, `inserts[${i}]`),
              ...(t.box === undefined ? {} : { box: tracked(t.box, `inserts[${i}].box`) }),
              ...(t.blend === undefined ? {} : { blend: String(t.blend) }),
              ...(t.effects === undefined
                ? {}
                : { effects: checkEffects(t.effects, `inserts[${i}].effects`) }),
            })),
            adjust: items(a.adjust).map((t, i) => ({
              ...stretch(t, `adjust[${i}]`),
              effects: checkEffects(t.effects ?? [], `adjust[${i}].effects`),
            })),
            sounds: items(a.audio).map((t, i) => ({
              path: resolve(String(t.path)),
              at: within(t.at, 0, Number.MAX_VALUE, `audio[${i}].at`, 0),
              volume: within(t.volume, 0, 4, `audio[${i}].volume`, 1),
              loop: !!t.loop,
              duck: !!t.duck,
            })),
            out,
            draft: !!a.draft,
          },
        );
      },
    },
    {
      name: "captions",
      description:
        "Word-by-word captions for the video `render` will make from these clips, or from an `edit` `project` (speed, transitions and J and L cuts included), as SRT timed to the finished video: up to `perCue` words a cue, the word being said marked *like this* so render draws it yellow. Edit the text if you like (fix a misheard word, mark a different word), then pass it to render's `captions`.",
      inputSchema: {
        type: "object",
        properties: {
          path,
          clips: {
            type: "array",
            description: "The same clips you'll give render, in order, in seconds",
            items: {
              type: "object",
              properties: { from: { type: "number" }, to: { type: "number" } },
              required: ["from", "to"],
            },
          },
          perCue: { type: "number", description: "Most words on screen at once, 1-8 (default 3)" },
          lit: { type: "boolean", description: "Mark the word being said (default true)" },
          upper: { type: "boolean", description: "In capitals (default false)" },
          model: {
            type: "string",
            description:
              "A Whisper model file in models/ for this call (`mockingbird models` lists them), e.g. a Bangla fine-tune for a Bangla video. Default: the one picked for the language.",
          },
          language: {
            type: "string",
            description:
              "What's spoken, as a Whisper code (en, bn, de, hi, …) or auto. Default: the user's setting. Give it for mixed speech, like Bangla and English in one sentence, where detection guesses wrong.",
          },
          project: {
            type: "string",
            description:
              "Absolute path to a project file from `edit`, in place of `path` and `clips`; perCue, lit and upper default to the project's captions",
          },
        },
      },
      run: async (a) => {
        if (a.project !== undefined) {
          if (a.model !== undefined || a.language !== undefined) {
            throw new Error(
              "A project's captions are heard with its transcription: give `model` and `language` to `transcribe` with the project.",
            );
          }
          const file = resolve(String(a.project));
          const { project, created } = load(file);
          if (created) throw new Error(`No project at ${file}; make one with \`edit\`.`);
          const cut = compile(project, dirname(file));
          if (!cut.clips.length)
            throw new Error(`${file} has no clips yet; add some with \`edit\`.`);
          const set = project.captions ?? {};
          const srt = await cutCaptions(
            cut,
            log,
            {
              perCue: Math.round(within(a.perCue, 1, 8, "perCue", set.perCue ?? 3)),
              lit: a.lit === undefined ? (set.lit ?? true) : !!a.lit,
              upper: a.upper === undefined ? (set.upper ?? false) : !!a.upper,
            },
            project.transcription,
          );
          return srt || "No speech in the cut.";
        }
        if (a.path === undefined) throw new Error("Give a `path` and `clips`, or a `project`.");
        const clips = items(a.clips).map((c, i) => stretch(c, `clips[${i}]`));
        if (!clips.length) throw new Error("No clips: give at least one { from, to } in seconds.");
        return captions(
          resolve(String(a.path)),
          log,
          clips,
          {
            perCue: Math.round(within(a.perCue, 1, 8, "perCue", 3)),
            lit: a.lit === undefined ? true : !!a.lit,
            upper: !!a.upper,
          },
          choiceOf(a),
        );
      },
    },
    {
      name: "export",
      description:
        "Save a project as FCPXML 1.10 (Final Cut Pro, DaVinci Resolve, Premiere through it) and OpenTimelineIO (.otio: Resolve, Premiere, Avid through OTIO's adapters), so a person can finish the cut in an editor. Carries the clips with their source times and transitions, inserts on video tracks above, texts as titles (markers in OTIO) and sounds on audio tracks; returns what an editor can't take this way (effects, framing, generated music). Saves beside the project as <name>.fcpxml and <name>.otio, or in `out`, a folder, and never overwrites.",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string", description: "The project file (project.json)" },
          format: {
            type: "string",
            enum: ["fcpxml", "otio", "both"],
            description: "Which to save (default both)",
          },
          out: { type: "string", description: "A folder to save in (default the project's)" },
        },
        required: ["project"],
      },
      run: async (a) =>
        exportProject(resolve(String(a.project)), String(a.format ?? "both"), a.out),
    },
    {
      name: "music",
      description:
        "Background music written as code, with no samples to license: `script` is a generator, a .js module whose `export default function (ctx, params)` schedules sound on `ctx`, an OfflineAudioContext as long as `duration`, with Web Audio nodes (oscillators, filters, gains, buffers of noise, convolvers). It runs in the pinned headless Chrome, in a sandbox with no network. `params` has duration, sampleRate (48000), seed, and the tempo, key and energy given here, for the generator to read. Math.random is seeded from `seed`, so the same arguments make the same track (Chrome's mixer can round the last bits differently between runs, never audibly). Saves a 48 kHz stereo WAV at `out`, brought to -14 LUFS with its peaks held, and never overwrites. Use it as one of render's `audio` tracks (volume about 0.1 to 0.2 under speech, `duck: true`). The plugin's generators and how to choose one are in guide(\"music\").",
      inputSchema: {
        type: "object",
        properties: {
          script: { type: "string", description: "Absolute path to the generator (.js)" },
          duration: { type: "number", description: "Seconds, 1 to 7200" },
          out: { type: "string", description: "Absolute path for the WAV" },
          tempo: { type: "number", description: "Beats a minute, 30 to 240, for the generator" },
          key: { type: "string", description: 'A key for the generator, like "A minor"' },
          energy: {
            description:
              "0 to 1, or a curve of [seconds, level] points in time order, eased between: how busy the music is",
            oneOf: [
              { type: "number" },
              { type: "array", items: { type: "array", items: { type: "number" } } },
            ],
          },
          seed: {
            type: "number",
            description: "Another whole number makes a variation (default 1)",
          },
        },
        required: ["script", "duration", "out"],
      },
      run: async (a) =>
        music(resolve(String(a.script)), resolve(String(a.out)), {
          duration: within(a.duration, 1, MOTION_MAX_SECONDS, "duration"),
          seed: Math.round(within(a.seed, 0, 2 ** 32 - 1, "seed", 1)),
          tempo: a.tempo === undefined ? undefined : within(a.tempo, 30, 240, "tempo"),
          key: a.key === undefined ? undefined : String(a.key).slice(0, 40),
          energy: energy(a.energy),
        }),
    },
    {
      name: "guide",
      description: `How to edit with these tools: one job's playbook, from mockingbird's plugin. Call it before an edit and follow it. Topics: ${playbooks()
        .map((p) => p.topic)
        .join(", ")}.`,
      inputSchema: {
        type: "object",
        properties: {
          topic: { type: "string", enum: playbooks().map((p) => p.topic) },
        },
        required: ["topic"],
      },
      run: async (a) => guide(String(a.topic)),
    },
    {
      name: "status",
      description:
        "Whether mockingbird is ready: the transcription model in use, and whether ffmpeg and whisper-server are installed. A non-null `oldPlugin` means Claude Code still has the out-of-date mockingbird-studio plugin; tell the user how to switch.",
      inputSchema: { type: "object", properties: {} },
      run: async () => JSON.stringify(await status()),
    },
  ];
}
