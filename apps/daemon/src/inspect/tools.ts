import { resolve } from "node:path";
import { toSdrFor } from "../hdr.ts";
import { items, seconds, within } from "../mcp/args.ts";
import type { Tool } from "../mcp/types.ts";
import { requireFile } from "../runtime.ts";
import { audioStats } from "./audio-stats.ts";
import { frames } from "./frames.ts";
import { INPUT } from "./inspect.schema.ts";
import { clipsFrom, findPauses, measure } from "./pauses.ts";
import { probe } from "./probe.ts";
import { scenes } from "./scenes.ts";
import { scopes } from "./scopes.ts";
import { sync } from "./sync.ts";
import { track } from "./track.ts";

/** The tools that read a file's picture, sound or motion and change nothing. */
export const inspectTools: Tool[] = [
  {
    name: "frames",
    description:
      "Save stills from a video file, one every `every` seconds (default 60), and return their paths with [mm:ss] times, to see slides and screen shares next to the transcript, or where the speaker is before framing a clip. `from`/`to` (seconds) take stills from one stretch only.",
    inputSchema: INPUT.frames,
    run: (a) =>
      frames(String(a.path), Math.max(1, Number(a.every ?? 60)), {
        from: seconds(a.from),
        to: seconds(a.to),
      }),
  },
  {
    name: "scenes",
    description:
      "The cuts in a video: each shot change's time ([mm:ss.cc]) and how big a change it is (0-100), plus cuts a minute and seconds a shot. To find the shots in b-roll, a screen recording or multi-camera footage without looking at every frame, or to measure a reference video's pace. `from`/`to` (seconds) look at one stretch. `threshold` (0-100, default 10) is how different two frames must be: lower finds subtler cuts, such as a jump cut within one shot.",
    inputSchema: INPUT.scenes,
    run: (a) =>
      scenes(String(a.path), {
        from: seconds(a.from),
        to: seconds(a.to),
        threshold: within(a.threshold, 0, 100, "threshold", 10),
      }),
  },
  {
    name: "scopes",
    description:
      "Measure a video's picture, as a colourist reads the scopes, since you can't judge a grade from a few stills: mean and 5th to 95th percentile luma, the histogram's shadows, mids and highlights, crushed blacks and clipped whites, mean saturation, and how far skin sits from the skin-tone line. Each number comes with what a graded picture usually shows. `from`/`to` (seconds) measure one stretch; it samples up to 60 frames. Grade with `effect`s, render, and measure again.",
    inputSchema: INPUT.scopes,
    run: async (a) => {
      const file = requireFile(resolve(String(a.path)), "File");
      const info = await probe(file);
      if (!info.video) throw new Error(`${file} has no video, only audio.`);
      const from = seconds(a.from) ?? 0;
      return scopes(file, info.size, {
        from,
        to: Math.min(seconds(a.to) ?? info.seconds, info.seconds),
        every: within(a.every, 0.04, 600, "every", 1),
        sdr: toSdrFor(info.transfer),
      });
    },
  },
  {
    name: "pauses",
    description:
      "The pauses in a file's sound (ffmpeg's silencedetect), and render's clips that keep the speech between them: each pause at least `minPause` seconds long is cut, `margin` seconds kept into it either side, and a stretch of 0.3 s or less is joined to the next so no word is lost. Returns one line per pause (start end length, in seconds of the file), then the clips as JSON for render. Short: minPause 0.3, margin 0.1. Long-form: 0.5 and 0.2. Whisper's word times smear across silences, so cut pauses with this, not with word gaps.",
    inputSchema: INPUT.pauses,
    run: async (a) => {
      const file = requireFile(String(a.path), "File");
      const from = seconds(a.from) ?? 0;
      const length = (await probe(file)).seconds;
      const end = Math.min(seconds(a.to) ?? length, length);
      if (!(end > from))
        throw new Error(`Nothing to look at from ${from}s: ${file} is ${length}s.`);
      const found = await findPauses(file, {
        from,
        to: end,
        noise: within(a.noise, -90, 0, "noise", -35),
        shortest: within(a.shortest, 0.01, 10, "shortest", 0.25),
      });
      const clips = clipsFrom(found, from, end, {
        min: within(a.minPause, 0.05, 30, "minPause", 0.4),
        margin: within(a.margin, 0, 5, "margin", 0.15),
      });
      const lines = found.map(
        (p) => `${p.start.toFixed(2)} ${p.end.toFixed(2)} ${p.length.toFixed(2)}`,
      );
      return `${lines.length ? lines.join("\n") : "no pauses"}\n\nclips: ${JSON.stringify(clips)}`;
    },
  },
  {
    name: "measure",
    description:
      "A finished video's picture size (WxH), length and loudness (EBU R128 integrated LUFS and true peak), to match a reference's style or check a render. Its cuts come from `scenes`.",
    inputSchema: INPUT.measure,
    run: (a) => measure(requireFile(String(a.path), "File")),
  },
  {
    name: "audio_stats",
    description:
      "Measure a file's sound, since you can't listen to it: integrated loudness (aim for -14 LUFS), loudness range, true and sample peak (clipping), and noise floor. With speech: how much of it is speech, and how far under the voice the sound between phrases sits (music under speech: 18 to 24 dB under) and how much of the 1 to 4 kHz speech band it fills. The beat (tempo and where beats fall, to cut on) when there's a steady one: measure the music file itself, since speech over it hides the beat; and the sections where the energy changes for a while. `from`/`to` (seconds) measure one stretch; times come back from the start of the file.",
    inputSchema: INPUT.audio_stats,
    run: (a) => audioStats(resolve(String(a.path)), { from: seconds(a.from), to: seconds(a.to) }),
  },
  {
    name: "sync",
    description:
      "Line up recordings of one take (two or more cameras, or a camera and a separate recorder) by their sound, for a multicam edit. Gives each file's offset against the first: a moment at t seconds in it is at t + offset in the first. To cut to another angle at T seconds of the first's clock, add a project clip from that file with from = T - offset. Reads the first `window` seconds of each (default 120); a score under about 0.3 means the sound didn't match and the offset is a guess. It finds offsets up to half the window: for recordings started more than a minute apart, give a window over twice the gap.",
    inputSchema: INPUT.sync,
    run: async (a) => {
      const paths = items(a.paths as unknown).map((p) => requireFile(resolve(String(p)), "File"));
      const done = await sync(paths, within(a.window, 10, 1200, "window", 120));
      return done
        .map((d, i) =>
          i === 0
            ? `${d.path}: the reference`
            : `${d.path}: offset ${d.offset >= 0 ? "+" : ""}${d.offset.toFixed(3)} s (score ${d.score.toFixed(2)}${d.score < 0.3 ? ", a guess" : ""})`,
        )
        .join("\n");
    },
  },
  {
    name: "track",
    description:
      "Follow a box through a video: give where the subject is at `from` (x, y, w, h, 0-1 of the picture) and get its top left over time, five points a second, `at` seconds from `from`. Give the points as a mask's `path` (with the box's w and h) to keep a blur or a grade on a moving face, plate or logo. They're in the source picture, so they line up with the clip when it isn't reframed. `worst` is the weakest match on the way: under about 0.5 the subject was probably lost there; track shorter stretches. Up to two minutes a call.",
    inputSchema: INPUT.track,
    run: async (a) => {
      const path = requireFile(resolve(String(a.path)), "File");
      const source = await probe(path);
      const from = within(a.from, 0, source.seconds, "from", 0);
      // Two minutes at most: every frame is held at 320 wide, about 330 MB for a 9:16 window.
      const end = Math.min(source.seconds, from + 120);
      const to = within(a.to, from, end, "to", end);
      const b = (a.box ?? {}) as Record<string, unknown>;
      const box = {
        x: within(b.x, 0, 1, "box.x", 0),
        y: within(b.y, 0, 1, "box.y", 0),
        w: within(b.w, 0.01, 1, "box.w", 0.2),
        h: within(b.h, 0.01, 1, "box.h", 0.2),
      };
      if (box.x + box.w > 1 || box.y + box.h > 1) throw new Error("box must fit in the picture");
      const [w, h] = source.size.split("x").map(Number) as [number, number];
      return JSON.stringify(await track(path, from, to, box, w / h));
    },
  },
];
