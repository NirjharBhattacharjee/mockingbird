/**
 * A project as FCPXML 1.10 and OpenTimelineIO (#198), so a person can finish
 * the agent's cut in Final Cut, Resolve or Premiere: the clips with their
 * source times and transitions, inserts on video tracks above, texts as
 * titles (markers in OTIO), and sounds on their own audio tracks. What an
 * editor can't take this way (effects, framing, generated music) is listed
 * back, not dropped silently.
 */
import { basename } from "node:path";
import { pathToFileURL } from "node:url";
import type { Compiled } from "./index.ts";

/** What the engine measured of a source file. */
export type Source = { seconds: number; video: boolean; audio: boolean; size: string; fps: number };

type Placed = {
  path: string;
  /** In the finished video, after transitions take half their length off each side. */
  at: number;
  length: number;
  /** In the source. */
  from: number;
  speed: number;
  /** The transition into this clip, centred on the cut. */
  transition?: { type: string; duration: number };
  /** The transition's frames before the cut and after it, whole frames, so the cut adds up. */
  before: number;
  after: number;
  /** Its sound's stretch in the source, trimmed as the picture is; a J or L cut moves it off the picture's. */
  sound: { from: number; length: number };
};

/**
 * The main track as cut-to-cut clips: a transition's overlap is split around
 * its cut, as editors model it. The clip before the cut keeps the frames after
 * it as a handle (OTIO's out_offset) and the clip after keeps the frames before
 * it (in_offset). Each cut lands on a whole frame, so durations add up to the
 * timeline instead of each rounding on its own.
 */
function placed(cut: Compiled, fps: number): Placed[] {
  // A transition's whole frames, the odd one before the cut.
  const split = (d = 0) => {
    const n = Math.round(d * fps);
    return [Math.ceil(n / 2) / fps, Math.floor(n / 2) / fps] as const;
  };
  const snap = (s: number) => Math.round(s * fps) / fps;
  let start = 0;
  return cut.clips.map((c, i) => {
    const speed = c.speed ?? 1;
    const length = (c.to - c.from) / speed;
    const [before, after] = split(c.transition?.duration);
    const tail = split(cut.clips[i + 1]?.transition?.duration)[1];
    start = Math.max(0, start - (before + after));
    const at = snap(start + before);
    const end = snap(start + length - tail);
    const p = {
      path: c.path,
      at,
      length: end - at,
      from: c.from + before * speed,
      speed,
      transition: c.transition,
      before,
      after,
      sound: {
        from: (c.sound?.from ?? c.from) + before * speed,
        length: ((c.sound?.to ?? c.to) - (c.sound?.from ?? c.from)) / speed - before - tail,
      },
    };
    start += length;
    return p;
  });
}

/** Items laid in lanes: each goes in the first lane free by its start. */
function lanes<T extends { from: number; to: number }>(items: T[]): T[][] {
  const out: T[][] = [];
  for (const item of [...items].sort((a, b) => a.from - b.from)) {
    const lane = out.find((l) => (l.at(-1) as T).to <= item.from + 1e-6);
    if (lane) lane.push(item);
    else out.push([item]);
  }
  return out;
}

/**
 * The sounds as stretches: one plays for its file's length, and a looped one
 * is repeated to the end, since neither format has a loop.
 */
function heard(cut: Compiled, info: (path: string) => Source) {
  return cut.sounds
    .filter((s) => s.path)
    .flatMap((s) => {
      const path = s.path as string;
      const seconds = info(path).seconds;
      const end = s.loop ? cut.length : Math.min(cut.length, s.at + seconds);
      const out: { path: string; from: number; to: number; volume: number }[] = [];
      for (let t = s.at; t < end - 1e-6 && seconds > 0; t += seconds) {
        out.push({ path, from: t, to: Math.min(t + seconds, end), volume: s.volume });
      }
      return out;
    });
}

/** What the export leaves out, said plainly. */
function left(cut: Compiled, fcpxml: boolean): string[] {
  const notes: string[] = [];
  const fx = [...cut.clips, ...cut.inserts].filter((c) => c.effects?.length).length;
  if (fx) notes.push(`${fx} clips' and inserts' effects (grade, key, masks)`);
  if (cut.adjust.length) notes.push(`${cut.adjust.length} adjustment layers`);
  const framed = cut.clips.filter((c) => (c.zoom ?? 1) !== 1 || c.focus || c.moves?.length).length;
  if (framed) notes.push(`the framing of ${framed} clips (focus, zoom, moves)`);
  if (cut.split) notes.push("the split screen");
  if (cut.inserts.some((i) => i.box || i.blend || i.moves?.length)) {
    notes.push("inserts' boxes, blend modes and moves (they come in full frame)");
  }
  const generated = cut.sounds.filter((s) => !s.path).length;
  if (generated)
    notes.push(`${generated} generated music beds (render one with sound: true and add the file)`);
  if (fcpxml && cut.clips.some((c) => (c.speed ?? 1) !== 1))
    notes.push("speed changes (OTIO keeps them)");
  if (fcpxml && cut.clips.some((c) => c.sound)) notes.push("J and L cuts (OTIO keeps them)");
  if (cut.captions) notes.push("the word captions (export them with `captions`)");
  const wipes = cut.clips.filter(
    (c) => c.transition && !["fade", "dissolve"].includes(c.transition.type),
  ).length;
  if (wipes) notes.push(`${wipes} transitions other than a fade (they come in as dissolves)`);
  if (!fcpxml && cut.sounds.some((s) => s.path && s.volume !== 1)) {
    notes.push("the sounds' volumes (OTIO has no standard gain; FCPXML keeps them)");
  }
  return notes;
}

// --- OpenTimelineIO ---------------------------------------------------------

const rt = (seconds: number, fps: number) => ({
  OTIO_SCHEMA: "RationalTime.1",
  rate: fps,
  value: Math.round(seconds * fps),
});
const range = (from: number, length: number, fps: number) => ({
  OTIO_SCHEMA: "TimeRange.1",
  start_time: rt(from, fps),
  duration: rt(length, fps),
});
const gap = (length: number, fps: number) => ({
  OTIO_SCHEMA: "Gap.1",
  name: "",
  source_range: range(0, length, fps),
  effects: [],
  markers: [],
  enabled: true,
  metadata: {},
});

function otioClip(
  path: string,
  from: number,
  length: number,
  fps: number,
  info: Source,
  extra: { effects?: unknown[]; markers?: unknown[] } = {},
) {
  return {
    OTIO_SCHEMA: "Clip.2",
    name: basename(path),
    source_range: range(from, length, fps),
    media_references: {
      DEFAULT_MEDIA: {
        OTIO_SCHEMA: "ExternalReference.1",
        name: basename(path),
        target_url: pathToFileURL(path).href,
        available_range: range(0, info.seconds, fps),
        available_image_bounds: null,
        metadata: {},
      },
    },
    active_media_reference_key: "DEFAULT_MEDIA",
    effects: extra.effects ?? [],
    markers: extra.markers ?? [],
    enabled: true,
    metadata: {},
  };
}

const track = (name: string, kind: "Video" | "Audio", children: unknown[]) => ({
  OTIO_SCHEMA: "Track.1",
  name,
  kind,
  children,
  source_range: null,
  effects: [],
  markers: [],
  enabled: true,
  metadata: {},
});

/** Stretches on a track, with gaps between them. */
function spaced(items: { from: number; to: number; clip: unknown }[], fps: number) {
  const out: unknown[] = [];
  let t = 0;
  for (const i of items) {
    if (i.from > t + 1e-6) out.push(gap(i.from - t, fps));
    out.push(i.clip);
    t = i.to;
  }
  return out;
}

/** `cut` as an OpenTimelineIO timeline (JSON), and what it leaves out. */
export function toOtio(
  cut: Compiled,
  name: string,
  fps: number,
  info: (path: string) => Source,
): { text: string; left: string[] } {
  const main = placed(cut, fps);
  const pieces = (sound: boolean) =>
    main.flatMap((c) => {
      const [from, length] = sound ? [c.sound.from, c.sound.length] : [c.from, c.length];
      const warp =
        c.speed === 1
          ? []
          : [
              {
                OTIO_SCHEMA: "LinearTimeWarp.1",
                name: "",
                effect_name: "LinearTimeWarp",
                time_scalar: c.speed,
                metadata: {},
              },
            ];

      return [
        ...(c.transition
          ? [
              {
                OTIO_SCHEMA: "Transition.1",
                name: c.transition.type,
                transition_type: "SMPTE_Dissolve",
                in_offset: rt(c.before, fps),
                out_offset: rt(c.after, fps),
                metadata: {},
              },
            ]
          : []),
        otioClip(c.path, from, length, fps, info(c.path), { effects: warp }),
      ];
    });
  const markers = cut.texts.map((t) => ({
    OTIO_SCHEMA: "Marker.2",
    name: t.text,
    marked_range: range(t.from, t.to - t.from, fps),
    color: "YELLOW",
    comment: t.text,
    metadata: {},
  }));
  const video = [
    { ...track("V1", "Video", pieces(false)), markers },
    ...lanes(cut.inserts).map((lane, k) =>
      track(
        `V${k + 2}`,
        "Video",
        spaced(
          lane.map((i) => ({ ...i, clip: otioClip(i.path, 0, i.to - i.from, fps, info(i.path)) })),
          fps,
        ),
      ),
    ),
  ];
  const audio = [
    ...(main.some((c) => info(c.path).audio) ? [track("A1", "Audio", pieces(true))] : []),
    ...lanes(heard(cut, info)).map((lane, k) =>
      track(
        `A${k + 2}`,
        "Audio",
        spaced(
          lane.map((s) => ({
            ...s,
            clip: {
              ...otioClip(s.path, 0, s.to - s.from, fps, info(s.path)),
              metadata: { mockingbird: { volume: s.volume } },
            },
          })),
          fps,
        ),
      ),
    ),
  ];
  const timeline = {
    OTIO_SCHEMA: "Timeline.1",
    name,
    global_start_time: null,
    tracks: {
      OTIO_SCHEMA: "Stack.1",
      name: "tracks",
      children: [...video, ...audio],
      source_range: null,
      effects: [],
      markers: [],
      enabled: true,
      metadata: {},
    },
    metadata: { mockingbird: { size: cut.size } },
  };
  return { text: `${JSON.stringify(timeline, null, 2)}\n`, left: left(cut, false) };
}

// --- FCPXML 1.10 ------------------------------------------------------------

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c] as string,
  );

/** A frame's length as FCPXML writes it: 1/30s, or 1001/30000s at 29.97. */
function frameDuration(fps: number): [number, number] {
  if (Number.isInteger(fps)) return [1, fps];
  const r = Math.round(fps);
  // NTSC rates: 23.976, 29.97, 59.94.
  if (Math.abs(fps - (r * 1000) / 1001) < 0.01) return [1001, r * 1000];
  return [100, Math.round(fps * 100)];
}

/** `cut` as an FCPXML 1.10 document, and what it leaves out. */
export function toFcpxml(
  cut: Compiled,
  name: string,
  size: string,
  fps: number,
  info: (path: string) => Source,
): { text: string; left: string[] } {
  const [num, den] = frameDuration(fps);
  const frames = (s: number) => Math.round((s * den) / num);
  const t = (s: number) => (frames(s) ? `${frames(s) * num}/${den}s` : "0s");
  const [width, height] = size.split("x");
  const formats = new Map<string, string>([[`${size}@${fps}`, "r1"]]);
  const res: string[] = [
    `<format id="r1" frameDuration="${num}/${den}s" width="${width}" height="${height}"/>`,
  ];
  const assets = new Map<string, string>();
  let next = 2;
  const asset = (path: string) => {
    const known = assets.get(path);
    if (known) return known;
    const s = info(path);
    let format = "";
    if (s.video) {
      const key = `${s.size}@${s.fps}`;
      if (!formats.has(key)) {
        const [w, h] = s.size.split("x");
        const [n, d] = frameDuration(s.fps);
        formats.set(key, `r${next}`);
        res.push(`<format id="r${next++}" frameDuration="${n}/${d}s" width="${w}" height="${h}"/>`);
      }
      format = ` format="${formats.get(key)}"`;
    }
    const id = `r${next++}`;
    assets.set(path, id);
    res.push(
      `<asset id="${id}" name="${esc(basename(path))}" start="0s" duration="${t(s.seconds)}" hasVideo="${s.video ? 1 : 0}" hasAudio="${s.audio ? 1 : 0}"${format}${s.audio ? ' audioSources="1" audioChannels="2" audioRate="48000"' : ""}>`,
      `  <media-rep kind="original-media" src="${esc(pathToFileURL(path).href)}"/>`,
      "</asset>",
    );
    return id;
  };
  const main = placed(cut, fps);
  // Connected items hang off the spine clip under their start, timed in that clip's source.
  // FCPXML gets no speed changes, so a clip's source runs at 1x there and so does this.
  const host = (at: number) => {
    const i = Math.max(
      0,
      main.findLastIndex((c) => c.at <= at + 1e-6),
    );
    return {
      i,
      offset: (main[i] as Placed).from + (at - (main[i] as Placed).at),
    };
  };
  const hung = main.map(() => [] as string[]);
  const insertLanes = lanes(cut.inserts);
  insertLanes.forEach((lane, k) => {
    for (const ins of lane) {
      const h = host(ins.from);
      hung[h.i]?.push(
        `<asset-clip ref="${asset(ins.path)}" lane="${k + 1}" offset="${t(h.offset)}" start="0s" duration="${t(ins.to - ins.from)}" srcEnable="video" name="${esc(basename(ins.path))}"/>`,
      );
    }
  });
  let titled = false;
  lanes(cut.texts).forEach((lane, k) => {
    for (const [j, x] of lane.entries()) {
      titled = true;
      const h = host(x.from);
      const style = `ts${k}-${j}`;
      hung[h.i]?.push(
        [
          `<title ref="rTitle" lane="${insertLanes.length + k + 1}" offset="${t(h.offset)}" duration="${t(x.to - x.from)}" name="${esc(x.text.slice(0, 40))}">`,
          `  <text><text-style ref="${style}">${esc(x.text)}</text-style></text>`,
          `  <text-style-def id="${style}"><text-style font="Helvetica" fontSize="63" fontColor="1 1 1 1" alignment="center"/></text-style-def>`,
          "</title>",
        ].join("\n"),
      );
    }
  });
  lanes(heard(cut, info)).forEach((lane, k) => {
    for (const s of lane) {
      const h = host(s.from);
      const db = s.volume > 0 ? (20 * Math.log10(s.volume)).toFixed(1) : "-96";
      hung[h.i]?.push(
        [
          `<asset-clip ref="${asset(s.path)}" lane="${-(k + 1)}" offset="${t(h.offset)}" start="0s" duration="${t(s.to - s.from)}" name="${esc(basename(s.path))}">`,
          `  <adjust-volume amount="${db}dB"/>`,
          "</asset-clip>",
        ].join("\n"),
      );
    }
  });
  if (titled) {
    res.push(
      '<effect id="rTitle" name="Basic Title" uid=".../Titles.localized/Bumper:Opener.localized/Basic Title.localized/Basic Title.moti"/>',
    );
  }
  let dissolve = false;
  const spine = main.flatMap((c, i) => {
    const out: string[] = [];
    if (c.transition) {
      dissolve = true;
      out.push(
        `<transition name="Cross Dissolve" offset="${t(c.at - c.before)}" duration="${t(c.before + c.after)}"><filter-video ref="rDissolve" name="Cross Dissolve"/></transition>`,
      );
    }
    const inner = (hung[i] ?? []).map((l) => l.replace(/^/gm, "  ")).join("\n");
    const open = `<asset-clip ref="${asset(c.path)}" offset="${t(c.at)}" start="${t(c.from)}" duration="${t(c.length)}" name="${esc(basename(c.path))}"`;
    out.push(inner ? `${open}>\n${inner}\n</asset-clip>` : `${open}/>`);
    return out;
  });
  if (dissolve) {
    res.push(
      '<effect id="rDissolve" name="Cross Dissolve" uid="FxPlug:4731E73A-8DAC-4113-9A30-AE85B1761265"/>',
    );
  }
  const indent = (lines: string[], n: number) =>
    lines
      .flatMap((l) => l.split("\n"))
      .map((l) => `${" ".repeat(n)}${l}`)
      .join("\n");
  const text = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<!DOCTYPE fcpxml>",
    '<fcpxml version="1.10">',
    "  <resources>",
    indent(res, 4),
    "  </resources>",
    "  <library>",
    `    <event name="${esc(name)}">`,
    `      <project name="${esc(name)}">`,
    `        <sequence format="r1" duration="${t(cut.length)}" tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="48k">`,
    "          <spine>",
    indent(spine, 12),
    "          </spine>",
    "        </sequence>",
    "      </project>",
    "    </event>",
    "  </library>",
    "</fcpxml>",
    "",
  ].join("\n");
  return { text, left: left(cut, true) };
}
