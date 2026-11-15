import { expect, test } from "bun:test";
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
  expect(text).toContain('<transition name="Cross Dissolve" offset="44/30s" duration="15/30s">');
  expect(text).toContain('<text-style ref="ts0-0">Tom &amp; &lt;Jerry&gt;</text-style>');
  expect(text).toContain('src="file:///m/a.mp4"');
  expect(left.join("; ")).toContain("effects");
  expect(left.join("; ")).toContain("speed changes");
  // 29.97 is written NTSC-style.
  expect(toFcpxml(cut, "cut", "1280x720", 30000 / 1001, () => source).text).toContain(
    'frameDuration="1001/30000s"',
  );
});
