import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  apply,
  check,
  compile,
  edit,
  framing,
  outline,
  type Project,
  transcript,
  type Word,
  wanted,
} from "../src/index.ts";

const base = (): Project =>
  check({
    version: 1,
    size: "1080x1920",
    clips: [
      { id: "c1", path: "talk.mp4", from: 10, to: 16 },
      { id: "c2", path: "/abs/take2.mov", from: 3, to: 7, zoom: 1.2 },
    ],
    texts: [
      { id: "t1", text: "Title", clip: "c1", from: 0, to: 2, y: 0.2 },
      { id: "t2", text: "Later", clip: "c1", from: 4, to: 5 },
    ],
    inserts: [{ id: "b1", path: "broll.jpg", clip: "c2", from: 1, to: 3 }],
    audio: [{ id: "a1", path: "music.m4a", at: 0, volume: 0.15, loop: true, duck: true }],
  });

describe("check", () => {
  test("names a misspelt field instead of ignoring it", () => {
    expect(() =>
      check({ version: 1, clips: [{ id: "c1", path: "a.mp4", from: 0, to: 1, zoomz: 2 }] }),
    ).toThrow("clips[0] has no zoomz");
  });

  test("refuses a clip that ends before it starts, a duplicate id, and an attachment to no clip", () => {
    expect(() => check({ version: 1, clips: [{ id: "c1", path: "a", from: 2, to: 1 }] })).toThrow(
      "from < to",
    );
    expect(() =>
      check({
        version: 1,
        clips: [{ id: "x", path: "a", from: 0, to: 1 }],
        texts: [{ id: "x", text: "hi", from: 0, to: 1 }],
      }),
    ).toThrow("Two items have the id x");
    expect(() =>
      check({ version: 1, texts: [{ id: "t1", text: "hi", clip: "c9", from: 0, to: 1 }] }),
    ).toThrow("t1 is on clip c9");
  });

  test("a split's size can only be the 1080x1920 it comes out at", () => {
    const split = { top: { x: 0, y: 0, w: 1, h: 0.5 }, bottom: { x: 0, y: 0.5, w: 1, h: 0.5 } };
    expect(() => check({ version: 1, split, size: "1920x1080" })).toThrow(
      "always comes out 1080x1920",
    );
    expect(check({ version: 1, split, size: "1080x1920" }).size).toBe("1080x1920");
  });

  test("takes only an even WIDTHxHEIGHT", () => {
    expect(() => check({ version: 1, size: "1081x1920" })).toThrow("size must be");
    expect(check({ version: 1, size: "1920x1080" }).size).toBe("1920x1080");
  });
});

describe("apply", () => {
  test("removing a clip closes the cut and takes what's on it", () => {
    const { project, notes } = apply(base(), [{ op: "remove", id: "c1" }]);
    expect(project.clips.map((c) => c.id)).toEqual(["c2"]);
    expect(project.texts).toEqual([]);
    expect(notes).toEqual(["removed t1, t2 with c1"]);
    // b1 was 1 s into c2, which now starts the video.
    expect(compile(project, "/p").inserts[0]).toEqual({ path: "/p/broll.jpg", from: 1, to: 3 });
  });

  test("split moves what starts in the second half onto the new clip", () => {
    const { project } = apply(base(), [{ op: "split", id: "c1", at: 13 }]);
    expect(project.clips.map(({ id, from, to }) => [id, from, to])).toEqual([
      ["c1", 10, 13],
      ["c3", 13, 16],
      ["c2", 3, 7],
    ]);
    expect(project.texts.map(({ id, clip, from, to }) => [id, clip, from, to])).toEqual([
      ["t1", "c1", 0, 2],
      ["t2", "c3", 1, 2],
    ]);
    // Same place in the finished video as before the split.
    expect(compile(project, "/p").texts.map((t) => [t.from, t.to])).toEqual([
      [0, 2],
      [4, 5],
    ]);
  });

  test("a trim off a clip's start keeps what's on it on the same picture, and drops what was cut", () => {
    const { project, notes } = apply(base(), [{ op: "trim", id: "c1", from: 12.5 }]);
    expect(project.clips[0]).toMatchObject({ from: 12.5, to: 16 });
    expect(project.texts.map(({ id, from, to }) => [id, from, to])).toEqual([["t2", 1.5, 2.5]]);
    expect(notes).toEqual(["removed t1: what they were on was cut"]);
  });

  test("a trim off a clip's end drops what was on the part cut away", () => {
    const { project, notes } = apply(base(), [{ op: "trim", id: "c1", to: 13 }]);
    // t2 was 4 s into c1, which is now 3 s long; t1 (0-2 s) stays.
    expect(project.texts.map((t) => t.id)).toEqual(["t1"]);
    expect(notes).toEqual(["removed t2: what they were on was cut"]);
  });

  test("move, add at an index, and set; a null clears a field", () => {
    const { project } = apply(base(), [
      { op: "move", id: "c2", index: 0 },
      { op: "add", type: "clip", path: "intro.mp4", from: 0, to: 1, index: 0 },
      { op: "set", id: "c2", zoom: null, focus: { x: 0.3, y: 0.5 } },
      { op: "set", captions: { perCue: 2 }, size: "1920x1080" },
      { op: "add", type: "audio", path: "whoosh.wav", clip: "c1", at: 0 },
    ]);
    expect(project.clips.map((c) => c.id)).toEqual(["c3", "c2", "c1"]);
    expect(project.clips[1]).toEqual({
      id: "c2",
      path: "/abs/take2.mov",
      from: 3,
      to: 7,
      focus: { x: 0.3, y: 0.5 },
    });
    expect(project.size).toBe("1920x1080");
    expect(project.captions).toEqual({ perCue: 2 });
    // The whoosh lands where c1 now starts: after the 1 s intro and c2's 4 s.
    expect(compile(project, "/p").sounds.at(-1)).toMatchObject({ path: "/p/whoosh.wav", at: 5 });
  });

  test("all or nothing: a bad op names itself and leaves the project as it was", () => {
    const before = base();
    expect(() =>
      apply(before, [
        { op: "remove", id: "c1" },
        { op: "split", id: "c2", at: 99 },
      ]),
    ).toThrow("ops[1] (split)");
    expect(before.clips).toHaveLength(2);
    expect(() => apply(before, [{ op: "set", id: "c1", zoom: 9 }])).toThrow("clips[0].zoom");
    expect(() => apply(before, [{ op: "fly" }])).toThrow("op must be one of");
  });
});

describe("compile and outline", () => {
  test("times everything in the finished video", () => {
    const c = compile(base(), "/proj");
    expect(c.clips.map((x) => x.path)).toEqual(["/proj/talk.mp4", "/abs/take2.mov"]);
    expect(c.texts).toEqual([
      { text: "Title", from: 0, to: 2, y: 0.2 },
      { text: "Later", from: 4, to: 5 },
    ]);
    expect(c.inserts).toEqual([{ path: "/proj/broll.jpg", from: 7, to: 9 }]);
    expect(c.sounds).toEqual([
      { path: "/proj/music.m4a", at: 0, volume: 0.15, loop: true, duck: true },
    ]);
  });

  test("outline lists each clip in the finished video with what's on it", () => {
    expect(outline(base(), "/proj/edit.json")).toBe(
      [
        "/proj/edit.json: 1080x1920, 0:10.00",
        "c1  0:00.00-0:06.00  talk.mp4 10-16",
        '    t1  0:00.00-0:02.00  text "Title" y 0.2',
        '    t2  0:04.00-0:05.00  text "Later"',
        "c2  0:06.00-0:10.00  take2.mov 3-7  zoom 1.2",
        "    b1  0:07.00-0:09.00  insert broll.jpg",
        "a1  0:00.00  audio music.m4a volume 0.15 loop duck",
      ].join("\n"),
    );
  });
});

describe("edit", () => {
  test("makes the file, saves ops, and leaves a bad file alone", () => {
    const dir = mkdtempSync(join(tmpdir(), "timeline-"));
    try {
      const file = join(dir, "edit.json");
      expect(edit(file, [])).toStartWith(`Made ${file}.`);
      edit(file, [{ op: "add", type: "clip", path: "a.mp4", from: 1, to: 2 }]);
      expect(JSON.parse(readFileSync(file, "utf8")).clips).toEqual([
        { id: "c1", path: "a.mp4", from: 1, to: 2 },
      ]);
      expect(() => edit(file, [{ op: "trim", id: "c1", to: 0.5 }])).toThrow("from < to");
      expect(JSON.parse(readFileSync(file, "utf8")).clips[0].to).toBe(2);
      writeFileSync(file, "{nope");
      expect(() => edit(file, [])).toThrow("isn't JSON");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// "So today I want to um show you this. Then you go on." in a.mp4, with a pause after "um".
const said: Word[] = (
  [
    ["So", 0.5, 0.7],
    [" today", 0.8, 1.1],
    [" I", 1.2, 1.3],
    [" want", 1.35, 1.5],
    [" to", 1.5, 1.6],
    [" um", 2.0, 2.3],
    [" show", 2.9, 3.1],
    [" you", 3.15, 3.3],
    [" this.", 3.35, 3.7],
    [" Then", 5.0, 5.2],
    [" you", 5.3, 5.4],
    [" go", 5.45, 5.6],
    [" on.", 5.65, 5.9],
  ] as const
).map(([word, start, end]) => ({ word, start, end }));
const words = (path: string) => (path === "a.mp4" ? said : []);
const talk = (): Project =>
  check({
    version: 1,
    clips: [{ id: "c1", path: "a.mp4", from: 0, to: 10 }],
    texts: [{ id: "t1", text: "show!", clip: "c1", from: 3, to: 3.5 }],
  });
const spans = (p: Project) => p.clips.map(({ id, from, to }) => [id, from, to]);

describe("cut_words", () => {
  test("cuts a word from the middle of a clip, a margin into the pauses either side", () => {
    const { project, notes } = apply(talk(), [{ op: "cut_words", text: "um" }], words);
    // After "to" (1.6) + 0.2, and 0.2 before "show" (2.9).
    expect(spans(project)).toEqual([
      ["c1", 0, 1.8],
      ["c2", 2.7, 10],
    ]);
    expect(notes).toEqual(['cut "um" (1 word, 0.90 s)']);
    // The text on "show" stays on it: 3 s in the source, 0.9 s earlier in the finished video.
    expect(compile(project, "/").texts[0]).toMatchObject({ from: 2.1, to: 2.6 });
  });

  test("cuts at a clip's edge with a trim, and a run of words across clips", () => {
    const first = apply(talk(), [{ op: "cut_words", text: "So, TODAY" }], words).project;
    // Up to just before "I" starts: no margin fits in a 0.1 s gap.
    expect(spans(first)).toEqual([["c1", 1.1, 10]]);
    const across = apply(
      talk(),
      [
        { op: "cut_words", text: "um" },
        { op: "cut_words", from: "want to", to: "show you" },
      ],
      words,
    ).project;
    // From where "want" starts: "I" ends 0.05 s before it, too close for a margin.
    expect(spans(across)).toEqual([
      ["c1", 0, 1.35],
      ["c2", 3.3, 10],
    ]);
  });

  test("cut edges move into the measured silences, where Whisper's times are off", () => {
    // The talk at 0:25 (#160): Whisper heard "pretty generic generic" about
    // 0.4 s late; silencedetect found the pauses either side of the first "generic".
    const late: Word[] = [
      { word: " pretty", start: 24.62, end: 25.1 },
      { word: " generic", start: 25.1, end: 25.27 },
      { word: " generic", start: 25.76, end: 26.5 },
      { word: " output", start: 26.5, end: 27.13 },
    ];
    const gaps = () => [
      { from: 24.72, to: 24.86 },
      { from: 24.92, to: 25.0 },
      { from: 25.64, to: 25.85 },
      { from: 25.97, to: 26.09 },
      { from: 26.19, to: 27.04 },
    ];
    const p = check({ version: 1, clips: [{ id: "c1", path: "t.mp4", from: 20, to: 30 }] });
    const ops = [{ op: "cut_words", from: "generic generic", to: "generic" }];
    // Whisper alone would cut 25.1-25.56, through the middle of the word.
    expect(spans(apply(p, ops, () => late).project)).toEqual([
      ["c1", 20, 25.1],
      ["c2", 25.56, 30],
    ]);
    // From the middle of the silence after "pretty" to 0.2 s before the next "generic" starts.
    expect(spans(apply(p, ops, () => late, gaps).project)).toEqual([
      ["c1", 20, 24.96],
      ["c2", 25.745, 30],
    ]);
  });

  test("a phrase said twice needs more words, its clip, or all", () => {
    expect(() => apply(talk(), [{ op: "cut_words", text: "you" }], words)).toThrow(
      '"you" is said 2 times (in c1, c1)',
    );
    const { project, notes } = apply(talk(), [{ op: "cut_words", text: "you", all: true }], words);
    expect(project.clips).toHaveLength(3);
    expect(notes).toHaveLength(2);
    // Whisper's curly apostrophe matches a typed straight one.
    const curly = () => [
      { word: " I’m", start: 1, end: 1.2 },
      { word: " here", start: 3, end: 3.2 },
    ];
    expect(spans(apply(talk(), [{ op: "cut_words", text: "i'm" }], curly).project)).toEqual([
      ["c1", 2.8, 10],
    ]);
    expect(() => apply(talk(), [{ op: "cut_words", text: "nope" }], words)).toThrow(
      "isn't said in the cut",
    );
    expect(() => apply(talk(), [{ op: "cut_words", text: "um" }])).toThrow("only the engine has");
  });

  test("cutting a whole clip's words removes it with what's on it", () => {
    const p = check({
      version: 1,
      clips: [
        { id: "c1", path: "a.mp4", from: 4.8, to: 6 },
        { id: "c2", path: "a.mp4", from: 0, to: 4 },
      ],
      texts: [{ id: "t1", text: "x", clip: "c1", from: 0, to: 1 }],
    });
    const { project, notes } = apply(p, [{ op: "cut_words", text: "then you go on" }], words);
    expect(spans(project)).toEqual([["c2", 0, 4]]);
    expect(notes[0]).toBe("removed t1 with c1");
  });
});

test("transcript shows each clip's words at their time in the finished video", () => {
  const p = check({
    version: 1,
    clips: [
      { id: "c1", path: "a.mp4", from: 4.8, to: 6 },
      { id: "c2", path: "b.mov", from: 0, to: 2 },
      { id: "c3", path: "a.mp4", from: 0, to: 4 },
    ],
  });
  expect(transcript(p, "/e.json", words)).toBe(
    [
      "/e.json: the words in the cut (0:07.20)",
      "c1  0:00.00  a.mp4 4.8-6",
      "    [0:00.20] Then you go on.",
      "c2  0:01.20  b.mov 0-2",
      "    (no speech)",
      "c3  0:03.20  a.mp4 0-4",
      "    [0:03.70] So today I want to um show you this.",
    ].join("\n"),
  );
  expect(wanted(p, [{ op: "add", type: "clip", path: "c.mp4", from: 1, to: 2 }])).toEqual(
    new Map([
      [
        "a.mp4",
        [
          { from: 4.8, to: 6 },
          { from: 0, to: 4 },
        ],
      ],
      ["b.mov", [{ from: 0, to: 2 }]],
      ["c.mp4", [{ from: 1, to: 2 }]],
    ]),
  );
});

describe("speed, moves and transitions", () => {
  const moving = (): Project =>
    check({
      version: 1,
      clips: [
        { id: "c1", path: "a.mp4", from: 0, to: 4 },
        {
          id: "c2",
          path: "a.mp4",
          from: 10,
          to: 18,
          speed: 2,
          zoom: 1,
          moves: [
            { at: 2, zoom: 1.5 },
            { at: 4, focus: { x: 0.3, y: 0.5 }, ease: "linear" },
          ],
          transition: { type: "fadeblack", duration: 0.5 },
        },
      ],
      texts: [{ id: "t1", text: "x", clip: "c2", from: 3, to: 3.5 }],
    });

  test("framing eases between moves and holds after the last", () => {
    const c = moving().clips[1] as Parameters<typeof framing>[0];
    expect(framing(c, 0)).toEqual({ focus: { x: 0.5, y: 0.5 }, zoom: 1 });
    // Halfway through a smooth move is halfway; a quarter is less than a quarter.
    expect(framing(c, 1).zoom).toBeCloseTo(1.25);
    expect(framing(c, 0.5).zoom).toBeCloseTo(1 + 0.5 * 0.15625);
    // The linear move to the new focus, half done; the zoom holds.
    expect(framing(c, 3)).toEqual({ focus: { x: 0.4, y: 0.5 }, zoom: 1.5 });
    expect(framing(c, 9)).toEqual({ focus: { x: 0.3, y: 0.5 }, zoom: 1.5 });
  });

  test("a clip twice as fast lasts half as long, and a transition starts it over the clip before", () => {
    const p = moving();
    // c2 is 8 s of source at 2x: 4 s, starting 0.5 s before c1 ends.
    expect(outline(p, "/e.json").split("\n").slice(0, 3)).toEqual([
      "/e.json: size of the first clip's source, 0:07.50",
      "c1  0:00.00-0:04.00  a.mp4 0-4",
      "c2  0:03.50-0:07.50  a.mp4 10-18  fadeblack in 0.5 s  speed 2x  moves 2s zoom 1.5; 4s focus 0.3,0.5",
    ]);
    expect(compile(p, "/").texts[0]).toMatchObject({ from: 6.5, to: 7 });
    expect(compile(p, "/").clips[1]).toMatchObject({ speed: 2, transition: { type: "fadeblack" } });
  });

  test("split and trim keep a fast clip's moves and attachments on the same picture", () => {
    // 14 s of source is 2 s into c2 at 2x: right at the first move.
    const { project } = apply(moving(), [{ op: "split", id: "c2", at: 14 }]);
    const [, first, second] = project.clips;
    expect(first).toMatchObject({ from: 10, to: 14, moves: [{ at: 2, zoom: 1.5 }] });
    expect(first?.transition).toEqual({ type: "fadeblack", duration: 0.5 });
    expect(second).toMatchObject({ from: 14, to: 18, zoom: 1.5 });
    expect(second?.moves).toEqual([{ at: 2, focus: { x: 0.3, y: 0.5 }, ease: "linear" }]);
    expect(second?.transition).toBeUndefined();
    // t1 was 3 s into c2: 1 s into the second half.
    expect(project.texts[0]).toMatchObject({ clip: second?.id, from: 1, to: 1.5 });

    // 2 s of source off the start at 2x is 1 s of the clip: its framing there becomes its start.
    const trimmed = apply(moving(), [{ op: "trim", id: "c2", from: 12 }]).project.clips[1];
    expect(trimmed?.zoom).toBeCloseTo(1.25);
    expect(trimmed?.moves?.map((m) => m.at)).toEqual([1, 3]);
  });

  test("refuses a transition on the first clip, one longer than a clip, an unknown one, and moves out of order", () => {
    const one = (c: object) => () => check({ version: 1, clips: [c] });
    expect(
      one({ id: "c1", path: "a", from: 0, to: 2, transition: { type: "fade", duration: 1 } }),
    ).toThrow("can't have a transition");
    expect(
      one({ id: "c1", path: "a", from: 0, to: 2, transition: { type: "spin", duration: 1 } }),
    ).toThrow("must be one of fade");
    expect(
      one({
        id: "c1",
        path: "a",
        from: 0,
        to: 2,
        moves: [
          { at: 1, zoom: 2 },
          { at: 0.5, zoom: 1 },
        ],
      }),
    ).toThrow("rising times");
    expect(one({ id: "c1", path: "a", from: 0, to: 2, moves: [{ at: 3, zoom: 2 }] })).toThrow(
      "within the clip's 2.00 s",
    );
    expect(() =>
      apply(moving(), [{ op: "set", id: "c2", transition: { type: "fade", duration: 4.5 } }]),
    ).toThrow("longer than c2 or the clip before it");
  });
});
