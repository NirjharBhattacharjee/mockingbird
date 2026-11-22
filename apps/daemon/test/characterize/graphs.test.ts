// Pins the filter graphs render builds today (#300): one snapshot per input,
// so moving the render code can show it builds the same graph, byte for byte.
// Don't update these snapshots in a refactor PR.
import { expect, test } from "bun:test";
import {
  mixGraph,
  moving,
  renderGraph,
  seekClips,
  soundOf,
  timeline,
  wordCaptions,
} from "../../src/mcp.ts";

type Clips = Parameters<typeof renderGraph>[0];
type Options = Parameters<typeof renderGraph>[1];

const two: Clips = [
  { from: 1, to: 2.5 },
  { from: 10, to: 12 },
];
const blur = { name: "blur", radius: 10 };
const rect = { shape: "rect", x: 0.1, y: 0.1, w: 0.5, h: 0.5 };

const GRAPHS: [string, Clips, Options][] = [
  ["two clips, sound", two, { audio: true, fps: 30 }],
  [
    "no sound, 9:16, libass captions",
    [{ from: 0, to: 5 }],
    { audio: false, fps: 30, size: "1080x1920", burn: true },
  ],
  [
    "focus and zoom",
    [
      { from: 0, to: 2 },
      { from: 2, to: 4, focus: { x: 0.3, y: 0.4 }, zoom: 1.2 },
    ],
    { audio: false, fps: 30, size: "1280x720" },
  ],
  [
    "sources of their own, a silent one",
    [
      { from: 0, to: 2, path: "/wide.mp4" },
      { from: 1, to: 4, path: "/phone.mov", focus: { x: 0.3, y: 0.5 }, zoom: 1.5, silent: true },
    ],
    { audio: true, size: "1080x1920", fps: 30 },
  ],
  [
    "speed and a transition",
    [
      { from: 0, to: 2, path: "/a.mp4" },
      { from: 0, to: 2, path: "/b.mp4", transition: { type: "fadeblack", duration: 0.5 } },
      { from: 4, to: 6, path: "/a.mp4", speed: 2 },
    ],
    { audio: true, size: "1280x720", fps: 30 },
  ],
  [
    "J and L cuts",
    [
      { from: 10, to: 13.5, path: "/a.mp4", sound: { from: 10, to: 13 } },
      { from: 20, to: 24, path: "/b.mp4", sound: { from: 19.5, to: 24 } },
    ],
    { audio: true, size: "640x360", fps: 30 },
  ],
  [
    "moves",
    [{ from: 0, to: 4, zoom: 1, moves: [{ at: 2, zoom: 1.5, focus: { x: 0.3, y: 0.5 } }] }],
    { audio: false, size: "1080x1920", fps: 30 },
  ],
  [
    "split",
    [{ from: 0, to: 4, zoom: 2 }],
    {
      audio: false,
      fps: 30,
      split: { top: { x: 0, y: 0, w: 0.8, h: 1 }, bottom: { x: 0.8, y: 0.7, w: 0.2, h: 0.3 } },
    },
  ],
  [
    "texts, an insert, music ducked and a sound effect",
    two,
    {
      audio: true,
      fps: 30,
      size: "1080x1920",
      overlays: [{ start: 0, end: 1, y: 0.5 }],
      inserts: [{ start: 1, end: 2 }],
      sounds: [
        { at: 0, volume: 0.15, loop: true, duck: true },
        { at: 3, volume: 1, loop: false, duck: false },
      ],
      gain: 6.5,
    },
  ],
  ["a batch's whole sound", [{ from: 0, to: 4 }], { audio: true, fps: 30, whole: true }],
  [
    "libass captions over an insert",
    [{ from: 0, to: 4 }],
    {
      audio: false,
      fps: 30,
      size: "1080x1920",
      burn: true,
      captionsY: 0.5,
      inserts: [{ start: 1, end: 2 }],
    },
  ],
  [
    "music under a silent video",
    [{ from: 0, to: 4 }],
    {
      audio: false,
      fps: 30,
      sounds: [
        { at: 0, volume: 0.5, loop: true, duck: true },
        { at: 1, volume: 1, loop: false, duck: false },
      ],
    },
  ],
  [
    "caption images",
    [{ from: 0, to: 5 }],
    {
      audio: false,
      fps: 30,
      overlays: [
        { start: 0, end: 1.5 },
        { start: 1.5, end: 3 },
      ],
    },
  ],
  [
    "HDR clips and b-roll",
    [
      { from: 0, to: 2, path: "/iphone.mov", sdr: "lut3d=file=/hlg.cube" },
      { from: 0, to: 2, path: "/screen.mp4" },
    ],
    {
      audio: false,
      size: "1920x1080",
      fps: 30,
      inserts: [
        { start: 0.5, end: 1.5, sdr: "lut3d=file=/hlg.cube" },
        { start: 2.5, end: 3 },
      ],
    },
  ],
  [
    "picture and sound effects",
    [
      {
        from: 0,
        to: 2,
        effects: [
          { name: "color", exposure: 1 },
          { name: "highpass" },
          { name: "denoise", amount: 0.4 },
        ],
      },
    ],
    { audio: true, size: "640x360", fps: 30 },
  ],
  [
    "a moving masked blur",
    [
      {
        from: 0,
        to: 4,
        effects: [{ ...blur, mask: { ...rect, end: { x: 0.4, y: 0.1, w: 0.5, h: 0.5 } } }],
      },
    ],
    { audio: false, size: "640x360", fps: 25 },
  ],
  [
    "an ellipse mask, feathered and inverted",
    [
      {
        from: 0,
        to: 2,
        effects: [
          {
            ...blur,
            mask: { shape: "ellipse", x: 0.2, y: 0.2, w: 0.4, h: 0.4, feather: 0.05, invert: true },
          },
        ],
      },
    ],
    { audio: false, size: "640x360", fps: 30 },
  ],
  [
    "inserts with a box, a blend and an adjustment layer",
    [{ from: 0, to: 4 }],
    {
      audio: false,
      size: "640x360",
      fps: 30,
      inserts: [
        { start: 1, end: 3, box: { x: 0.5, y: 0.1, w: 0.25, h: 0.25 } },
        { start: 1, end: 3, blend: "screen" },
      ],
      adjust: [{ start: 2, end: 3, effects: [{ name: "color", saturation: 0 }] }],
      overlays: [{ start: 0, end: 4 }],
    },
  ],
  [
    "an insert following a tracked path",
    [{ from: 0, to: 4 }],
    {
      audio: false,
      size: "640x360",
      fps: 30,
      inserts: [
        {
          start: 1,
          end: 3,
          box: {
            x: 0,
            y: 0,
            w: 0.25,
            h: 0.25,
            path: [
              { at: 0, x: 0, y: 0.5 },
              { at: 2, x: 0.5, y: 0.5 },
            ],
          },
        },
      ],
    },
  ],
  [
    "slow motion by interpolation",
    [{ from: 0, to: 1, speed: 0.25, effects: [{ name: "interpolate" }] }],
    { audio: false, size: "640x360", fps: 30 },
  ],
];

for (const [name, clips, options] of GRAPHS) {
  test(`render graph: ${name}`, () => {
    expect(renderGraph(clips, options)).toMatchSnapshot();
  });
}

test("each clip's input, and where each starts in the finished video", () => {
  const clips: Clips = [
    { from: 1, to: 2, path: "/phone.mov" },
    { from: 10, to: 13.5, path: "/a.mp4", sound: { from: 9.5, to: 13 }, speed: 1.5 },
    { from: 0, to: 2, path: "/b.mp4", transition: { type: "fade", duration: 0.5 } },
  ];
  expect(seekClips("/x.mp4", clips)).toMatchSnapshot();
  expect(timeline(clips)).toMatchSnapshot();
});

test("a clip's sound, and the moves filter", () => {
  const ctx = { width: 640, height: 360, length: 4, fps: 30 };
  expect(
    soundOf({ from: 2, to: 6, speed: 2, effects: [{ name: "deess" }] }, 3, ctx as never),
  ).toMatchSnapshot();
  expect(
    moving(
      {
        from: 0,
        to: 6,
        zoom: 1.2,
        moves: [
          { at: 2, zoom: 2, ease: "linear" },
          { at: 4, focus: { x: 0.7, y: 0.3 } },
        ],
      },
      "1920x1080",
      25,
    ),
  ).toMatchSnapshot();
});

test("sounds mixed under the speech", () => {
  const sounds = [
    { at: 1, volume: 1, loop: false, duck: true },
    { at: 0, volume: 0.2, loop: true, duck: false },
  ];
  expect(mixGraph(sounds, { speech: true, length: 4, first: 1 })).toMatchSnapshot();
  expect(
    mixGraph(sounds, { speech: true, length: 4, first: 2, whole: true, gain: 12 }),
  ).toMatchSnapshot();
  expect(mixGraph(sounds, { speech: false, length: 4, first: 1 })).toMatchSnapshot();
});

test("captions for a cut: pages, lit words, speed and a J cut", () => {
  const w = (word: string, start: number, end: number) => ({
    word,
    startMs: start * 1000,
    endMs: end * 1000,
    probability: 1,
  });
  const clips: Clips = [
    { from: 0, to: 3 },
    { from: 10, to: 12, speed: 2, sound: { from: 9.5, to: 12 } },
  ];
  const words = [
    [
      w(" Hello", 0.1, 0.4),
      w(" there,", 0.45, 0.8),
      w(" this", 1, 1.2),
      w(" is", 1.25, 1.4),
      w(" a", 1.45, 1.5),
      w(" test.", 1.55, 2.4),
    ],
    [w(" Second", 9.6, 10.2), w(" clip", 10.3, 10.8), w(" here.", 10.9, 11.5)],
  ];
  expect(wordCaptions(clips, words)).toMatchSnapshot();
  expect(wordCaptions(clips, words, { perCue: 2, lit: false, upper: true })).toMatchSnapshot();
  const han = [..."今日は新しいカメラを試しました"].map((c, i) => w(c, i * 0.1, i * 0.1 + 0.1));
  expect(wordCaptions([{ from: 0, to: 2 }], [han], { lit: false })).toMatchSnapshot();
});
