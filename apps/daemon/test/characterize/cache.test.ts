// Pins what the word cache and the segment cache compute today (#300): the
// stretches still to hear, where words land, the lines and chunks a
// transcript is cut into, and where a render is cut into segments.
// Don't update these snapshots in a refactor PR.
import { expect, test } from "bun:test";
import {
  align,
  CLIPS_PER_PASS,
  chunks,
  pieces,
  segments,
  spans,
  timedLines,
  timedWords,
  uncovered,
  union,
} from "../../src/mcp.ts";

const s = (from: number, to: number) => ({ from, to });

test("spans joined, and the parts left to hear", () => {
  const heard = [s(0, 10), s(30, 40), s(12, 15)];
  expect(union([s(5, 6), s(0, 2), s(1.5, 3), s(3.4, 4)])).toMatchSnapshot();
  expect(union([s(5, 6), s(0, 2), s(1.5, 3), s(3.4, 4)], 0.5)).toMatchSnapshot();
  expect(uncovered([s(0, 50)], heard)).toMatchSnapshot();
  expect(uncovered([s(8, 13), s(14, 31), s(39.995, 40.005)], heard)).toMatchSnapshot();
  expect(uncovered([s(1, 9)], heard)).toEqual([]);
});

test("words placed between silences from their DTW points", () => {
  const words = [
    { word: "so", start: 0.2, end: 0.5, at: [0.35, 0.45] as [number, number] },
    { word: "today", start: 0.5, end: 1.1, at: [0.9, 1.05] as [number, number] },
    { word: "we", start: 1.1, end: 1.3 },
    { word: "create", start: 1.8, end: 2.4, at: [2.3, 2.6] as [number, number] },
    { word: "things", start: 2.4, end: 3, at: [2.7, 2.95] as [number, number] },
  ];
  const gaps = [s(0, 0.3), s(1.4, 2.2), s(3.1, 4)];
  expect(align(words, gaps)).toMatchSnapshot();
  expect(align(words, [])).toMatchSnapshot();
});

test("speech cut into chunks, and words into timed lines", () => {
  const seg = (startSample: number, endSample: number) => ({ startSample, endSample });
  const segments_ = [seg(0, 16000), seg(20000, 300000), seg(310000, 900000), seg(910000, 920000)];
  expect(chunks(segments_ as never, 480000)).toMatchSnapshot();
  const w = (word: string, startMs: number, endMs: number, atMs?: number) => ({
    word,
    startMs,
    endMs,
    probability: 0.9,
    ...(atMs === undefined ? {} : { atMs }),
  });
  const words = [
    w(" Hello", 0, 400, 200),
    w(" world.", 450, 900),
    w(" [MUSIC]", 1000, 4000),
    w(" Next", 9000, 9300, 9100),
    w(" line", 9350, 9800),
    w(" goes", 15000, 15400),
    w(" on", 15450, 15600),
  ];
  expect(timedLines(words as never, 60_000)).toMatchSnapshot();
  expect(timedWords(words as never, 60_000)).toMatchSnapshot();
});

test("where a render is cut into cached segments", () => {
  const clips = Array.from({ length: 8 }, (_, i) => s(i * 10, i * 10 + 3.5));
  expect(segments(clips, [])).toMatchSnapshot();
  expect(segments(clips, [{ from: 6, to: 8 }])).toMatchSnapshot();
  const faded = clips.map((c, i) =>
    i === 3 ? { ...c, transition: { type: "fade", duration: 0.5 } } : c,
  );
  expect(segments(faded, [])).toMatchSnapshot();
  const jcut = clips.map((c, i) =>
    i === 4 ? { ...c, sound: { from: c.from - 0.5, to: c.to } } : c,
  );
  expect(segments(jcut, [])).toMatchSnapshot();
  const many = Array.from({ length: CLIPS_PER_PASS + 5 }, (_, i) => s(i, i + 0.05));
  expect(segments(many, [])).toMatchSnapshot();
});

test("what render copies and what it encodes, and the stretches it hears", () => {
  const keys = () => [0, 60, 120, 180, 240];
  const clips = [s(0.5, 7.5), s(2.1, 2.9), s(0, 8)];
  expect(pieces(clips, 30, keys, () => true)).toMatchSnapshot();
  expect(pieces(clips, 30, keys, (c) => c.from > 0)).toMatchSnapshot();
  expect(spans([s(30, 31), s(1, 3), s(4, 6), s(4, 6), s(12, 13)])).toMatchSnapshot();
  expect(spans([s(30, 31), s(1, 3)], 0.5)).toMatchSnapshot();
});
