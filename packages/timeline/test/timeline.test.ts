import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { apply, check, compile, edit, outline, type Project } from "../src/index.ts";

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
