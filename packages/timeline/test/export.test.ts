import { expect, test } from "bun:test";
import { pathToFileURL } from "node:url";
import { toFcpxml, toOtio } from "../src/export.ts";
import { check, compile } from "../src/index.ts";

const source = { seconds: 10, video: true, audio: true, size: "1280x720", fps: 30 };
const cut = compile(
  check({
    version: 1,
    clips: [
      { id: "c1", path: "/m/a.mp4", from: 0, to: 2 },
      { id: "c2", path: "/m/a.mp4", from: 3, to: 5, transition: { type: "fade", duration: 0.5 } },
      { id: "c3", path: "/m/a.mp4", from: 1, to: 3, speed: 2, lead: 0.3 },
    ],
    texts: [{ id: "t1", text: "Tom & <Jerry>", from: 0, to: 1 }],
    inserts: [{ id: "b1", path: "/m/b.mp4", from: 2, to: 3, effects: [{ name: "blur" }] }],
    audio: [],
  }),
  "/m",
);

test("OTIO: the main track adds up to the cut, the transition split by whole frames (#198)", () => {
  const t = JSON.parse(toOtio(cut, "cut", 30, () => source).text);
  const frames = (track: {
    children: { OTIO_SCHEMA: string; source_range?: { duration: { value: number } } }[];
  }) => track.children.reduce((n, c) => n + (c.source_range?.duration.value ?? 0), 0);
  const [v1, v2, a1] = t.tracks.children;
  // 2 + 2 - 0.5 + 1 = 4.5 s: 135 frames on the picture and on the sound, J cut and all.
  expect(frames(v1)).toBe(135);
  expect(frames(a1)).toBe(135);
  const tr = v1.children[1];
  expect([tr.in_offset.value, tr.out_offset.value]).toEqual([8, 7]);
  expect(v1.markers[0].name).toBe("Tom & <Jerry>");
  expect(v2.children[0].OTIO_SCHEMA).toBe("Gap.1");
  expect(v1.children[3].effects[0].time_scalar).toBe(2);
});

test("FCPXML: frame-exact times, escaped text, and what it can't carry", () => {
  const { text, left } = toFcpxml(cut, "cut", "1280x720", 30, () => source);
  expect(text).toContain('<sequence format="r1" duration="135/30s"');
  expect(text).toContain('<transition name="Cross Dissolve" offset="45/30s" duration="15/30s">');
  expect(text).toContain('<text-style ref="ts0-0">Tom &amp; &lt;Jerry&gt;</text-style>');
  expect(text).toContain(`src="${pathToFileURL("/m/a.mp4").href}"`);
  expect(left.join("; ")).toContain("effects");
  expect(left.join("; ")).toContain("speed changes");
  // 29.97 is written NTSC-style.
  expect(toFcpxml(cut, "cut", "1280x720", 30000 / 1001, () => source).text).toContain(
    'frameDuration="1001/30000s"',
  );
});

test("cuts land on whole frames, so 100 clips of 1.05 s don't drift (#198)", () => {
  const many = compile(
    check({
      version: 1,
      clips: Array.from({ length: 100 }, (_, i) => ({
        id: `c${i}`,
        path: "/m/a.mp4",
        from: 0,
        to: 1.05,
      })),
      audio: [],
    }),
    "/m",
  );
  const t = JSON.parse(toOtio(many, "cut", 30, () => source).text);
  const v1 = t.tracks.children[0];
  const n = v1.children.reduce(
    (s: number, c: { source_range: { duration: { value: number } } }) =>
      s + c.source_range.duration.value,
    0,
  );
  expect(n).toBe(3150);
  // The sound track too, clip after clip.
  const a1 = t.tracks.children.find((k: { name: string }) => k.name === "A1");
  const heard = a1.children.reduce(
    (s: number, c: { source_range: { duration: { value: number } } }) =>
      s + c.source_range.duration.value,
    0,
  );
  expect(heard).toBe(3150);
});

test("a looped sound repeats, a wipe and OTIO's lost gain are reported, b-roll is picture only", () => {
  const looped = compile(
    check({
      version: 1,
      clips: [
        { id: "c1", path: "/m/a.mp4", from: 0, to: 4 },
        {
          id: "c2",
          path: "/m/a.mp4",
          from: 5,
          to: 9,
          transition: { type: "wipeleft", duration: 0.5 },
        },
      ],
      inserts: [{ id: "b1", path: "/m/b.mp4", from: 1, to: 2 }],
      audio: [{ id: "s1", path: "/m/bed.wav", at: 0, volume: 0.15, loop: true }],
    }),
    "/m",
  );
  const info = (p: string) =>
    p.endsWith(".wav") ? { ...source, video: false, seconds: 3 } : source;
  const o = toOtio(looped, "cut", 30, info);
  const bed = JSON.parse(o.text).tracks.children.find((k: { name: string }) => k.name === "A2");
  // 7.5 s of cut from a 3 s bed: 3 + 3 + 1.5.
  expect(
    bed.children.map(
      (c: { source_range: { duration: { value: number } } }) => c.source_range.duration.value,
    ),
  ).toEqual([90, 90, 45]);
  expect(o.left.join("; ")).toContain("1 transitions other than a fade");
  expect(o.left.join("; ")).toContain("volumes");
  const x = toFcpxml(looped, "cut", "1280x720", 30, info);
  expect(x.text).toContain('srcEnable="video" name="b.mp4"');
  expect(x.left.join("; ")).not.toContain("volumes");
});

test("an insert over an earlier one stays above it in both formats (#257)", () => {
  // A[0,1], B[0,5], C[1,4]: the render draws C over B.
  const stacked = compile(
    check({
      version: 1,
      clips: [{ id: "c1", path: "/m/a.mp4", from: 0, to: 6 }],
      inserts: [
        { id: "A", path: "/m/A.mp4", from: 0, to: 1 },
        { id: "B", path: "/m/B.mp4", from: 0, to: 5 },
        { id: "C", path: "/m/C.mp4", from: 1, to: 4 },
      ],
    }),
    "/m",
  );
  const tracks = JSON.parse(toOtio(stacked, "cut", 30, () => source).text).tracks.children;
  const lane = (file: string) =>
    tracks.findIndex((k: { children: { name?: string }[] }) =>
      k.children.some((c) => c.name === file),
    );
  // Every insert is there (a lost one would read -1 or NaN), then in order.
  for (const f of ["A.mp4", "B.mp4", "C.mp4"]) expect(lane(f)).toBeGreaterThan(0);
  expect(lane("C.mp4")).toBeGreaterThan(lane("B.mp4"));
  expect(lane("B.mp4")).toBeGreaterThan(lane("A.mp4"));
  const x = toFcpxml(stacked, "cut", "1280x720", 30, () => source).text;
  const fcpLane = (file: string) =>
    Number(x.match(new RegExp(`lane="(\\d+)"[^>]*name="${file}"`))?.[1]);
  for (const f of ["A.mp4", "B.mp4", "C.mp4"]) expect(fcpLane(f)).toBeGreaterThan(0);
  expect(fcpLane("C.mp4")).toBeGreaterThan(fcpLane("B.mp4"));
  expect(fcpLane("B.mp4")).toBeGreaterThan(fcpLane("A.mp4"));
});

test("OTIO: transitions with no room in their clips come in as cuts, and ducking is reported (#257)", () => {
  // Three 2 s clips with 1.5 s fades into the second and third: the middle one is too short for both.
  const fades = compile(
    check({
      version: 1,
      clips: [
        { id: "c1", path: "/m/a.mp4", from: 0, to: 2 },
        { id: "c2", path: "/m/a.mp4", from: 2, to: 4, transition: { type: "fade", duration: 1.5 } },
        { id: "c3", path: "/m/a.mp4", from: 4, to: 6, transition: { type: "fade", duration: 1.5 } },
      ],
      audio: [{ id: "s1", path: "/m/bed.wav", at: 0, duck: true }],
    }),
    "/m",
  );
  const o = toOtio(fades, "cut", 30, () => source);
  const v1 = JSON.parse(o.text).tracks.children[0].children as {
    OTIO_SCHEMA: string;
    in_offset?: { value: number };
    out_offset?: { value: number };
  }[];
  // The middle clip is 15 frames cut to cut; each fade needs 22 or 23 of them, so neither fits.
  expect(v1.filter((c) => c.OTIO_SCHEMA === "Transition.1")).toHaveLength(0);
  expect(o.left.join("; ")).toContain("2 transitions longer than a clip beside them");
  expect(o.left.join("; ")).toContain("the ducking of 1 sounds");
  expect(toFcpxml(fades, "cut", "1280x720", 30, () => source).left.join("; ")).toContain(
    "the ducking of 1 sounds",
  );
});

test("a still insert gets media as long as the cut, not ffprobe's 0 s (#257)", () => {
  const card = compile(
    check({
      version: 1,
      clips: [{ id: "c1", path: "/m/a.mp4", from: 0, to: 6 }],
      inserts: [{ id: "b1", path: "/m/card.png", from: 1, to: 4 }],
    }),
    "/m",
  );
  const info = (p: string) =>
    p.endsWith(".png") ? { ...source, audio: false, seconds: 0 } : source;
  const x = toFcpxml(card, "cut", "1280x720", 30, info).text;
  expect(x).toMatch(/name="card.png" start="0s" duration="180\/30s"/);
  const o = JSON.parse(toOtio(card, "cut", 30, info).text);
  const v2 = o.tracks.children[1].children.find((c: { name?: string }) => c.name === "card.png");
  expect(v2.media_references.DEFAULT_MEDIA.available_range.duration.value).toBe(180);
});

test("OTIO: a transition that fits to the frame stays, and a J cut's short sound gets a cut on A1 (#257)", () => {
  const otio = (clips: unknown[]) => {
    const o = toOtio(compile(check({ version: 1, clips }), "/m"), "cut", 30, () => source);
    const [v1, , a1] = JSON.parse(o.text).tracks.children as {
      children: { OTIO_SCHEMA: string }[];
    }[];
    const n = (t?: { children: { OTIO_SCHEMA: string }[] }) =>
      (t?.children ?? []).filter((c) => c.OTIO_SCHEMA === "Transition.1").length;
    return { picture: n(v1), sound: n(a1), left: o.left.join("; ") };
  };
  // 2.3 s and 1.51 s with a 1.5 s fade: the incoming clip has exactly the 22 frames it needs.
  const exact = otio([
    { id: "c1", path: "/m/a.mp4", from: 0, to: 2.3 },
    { id: "c2", path: "/m/a.mp4", from: 3, to: 4.51, transition: { type: "fade", duration: 1.5 } },
  ]);
  expect(exact.picture).toBe(1);
  // A 1 s fade into c2 and a 1.4 s J cut into c3: c2's picture has room, its sound doesn't.
  const j = otio([
    { id: "c1", path: "/m/a.mp4", from: 0, to: 2 },
    { id: "c2", path: "/m/a.mp4", from: 2, to: 4, transition: { type: "fade", duration: 1 } },
    { id: "c3", path: "/m/a.mp4", from: 4, to: 6, lead: 1.4 },
  ]);
  expect(j.picture).toBe(1);
  expect(j.sound).toBe(0);
  expect(j.left).toContain("transitions' sound");
});
