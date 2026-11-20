// bun test skills/motion-graphics: the kit's timing helpers, which every template leans on.
import { expect, test } from "bun:test";
import {
  type CameraMove,
  cameraAt,
  cutPoints,
  expo,
  handheld,
  hash,
  move,
  noise,
  type Preset,
  presence,
  project,
  REST,
  shake,
  words,
} from "./kit.ts";

const cues = [
  { start: 0.2, end: 0.5, text: "*So* if you" },
  { start: 0.5, end: 0.9, text: "So *if* you" },
  { start: 0.9, end: 1.4, text: "So if *you*" },
  { start: 2.6, end: 3.0, text: "*escape* the tutorial" },
  { start: 3.0, end: 3.4, text: "escape *the* tutorial" },
  { start: 4.9, end: 5.6, text: "*hell*" },
];

test("words come out of the marked cues with their own times", () => {
  expect(words(cues).map((w) => w.text)).toEqual(["So", "if", "you", "escape", "the", "hell"]);
  expect(words(cues)[3]).toEqual({ text: "escape", start: 2.6, end: 3.0 });
});

test("cut points land on word starts, at least `every` seconds apart", () => {
  expect(cutPoints(cues, 2)).toEqual([2.6, 4.9]);
  expect(cutPoints(cues, 3)).toEqual([3]);
});

test("presence fades in, holds, fades out, and is 0 outside", () => {
  expect(presence(0.9, 1, 3)).toBe(0);
  expect(presence(2, 1, 3)).toBe(1);
  expect(presence(3.1, 1, 3)).toBe(0);
  expect(presence(1.1, 1, 3)).toBeGreaterThan(0);
  expect(presence(1.1, 1, 3)).toBeLessThan(1);
});

test("the curve and the random are fixed functions", () => {
  expect(expo(0)).toBe(0);
  expect(expo(1)).toBe(1);
  expect(expo(0.3)).toBeGreaterThan(0.8);
  expect(hash(7)).toBe(hash(7));
  expect(hash(7)).not.toBe(hash(8));
});

test("kit.js is kit.ts built (`bun run kit` after changing kit.ts)", () => {
  const built = Bun.spawnSync(
    ["bun", "build", `${import.meta.dir}/kit.ts`, "--no-bundle", "--target=browser"],
    { stderr: "pipe" },
  );
  expect(built.exitCode).toBe(0);
  const committed = require("node:fs").readFileSync(`${import.meta.dir}/kit.js`, "utf8");
  expect(committed).toBe(built.stdout.toString());
});

test("styles.js is styles/ built (`bun run styles` after changing a style)", () => {
  const built = Bun.spawnSync(
    ["bun", "build", `${import.meta.dir}/styles/index.ts`, "--target=browser"],
    { stderr: "pipe" },
  );
  expect(built.exitCode).toBe(0);
  const committed = require("node:fs").readFileSync(`${import.meta.dir}/styles.js`, "utf8");
  expect(committed).toBe(built.stdout.toString());
});

// ---- the camera (#274)

const PRESETS: Preset[] = [
  "push-in",
  "dolly",
  "crash-zoom",
  "whip-pan",
  "orbit",
  "handheld",
  "dolly-zoom",
];

test("every preset is at rest until it starts, and settles where it's going", () => {
  for (const preset of PRESETS) {
    const mv: CameraMove = { preset, at: 1, dur: 1.2 };
    expect(move(0.5, mv)).toEqual(REST);
    if (preset === "handheld") continue;
    // Settled: a tenth of a second apart, it has stopped moving.
    const [a, b] = [move(6, mv), move(6.1, mv)];
    for (const k of ["x", "y", "zoom", "roll", "z"] as const) expect(a[k]).toBeCloseTo(b[k], 4);
  }
  // A push-in dollies: the subject grows by 1 / (1 - 0.12 x strength).
  const subject = (cam: ReturnType<typeof move>) => project(0, 0, 0, cam, 1920, 1080).scale;
  expect(subject(move(6, { preset: "push-in", at: 1 }))).toBeCloseTo(1 / 0.88, 3);
  expect(subject(move(6, { preset: "push-in", at: 1, strength: 2 }))).toBeCloseTo(1 / 0.76, 3);
  // A crash zoom overshoots on the way in; a push doesn't.
  const peak = (preset: Preset) =>
    Math.max(
      ...Array.from({ length: 100 }, (_, i) =>
        subject(move(1 + i * 0.03, { preset, at: 1, dur: 1 })),
      ),
    );
  expect(peak("crash-zoom")).toBeGreaterThan(1.46);
  expect(peak("push-in")).toBeLessThan(1 / 0.88 + 1e-3);
});

test("a dolly zoom keeps the subject's size while the background moves away", () => {
  const cam = move(6, { preset: "dolly-zoom", at: 1 });
  expect(project(100, 100, 0, cam, 1920, 1080).scale).toBeCloseTo(1, 6);
  expect(project(100, 100, 1, cam, 1920, 1080).scale).toBeLessThan(
    project(100, 100, 1, REST, 1920, 1080).scale,
  );
});

test("depth: at rest nothing moves; a far layer moves half as much as the subject", () => {
  for (const d of [-0.4, 0, 1, 3]) {
    const p = project(300, 200, d, REST, 1920, 1080);
    expect([p.x, p.y, p.scale]).toEqual([300, 200, 1]);
  }
  const cam = { ...REST, x: 0.1 };
  const near = project(960, 540, 0, cam, 1920, 1080);
  const far = project(960, 540, 1, cam, 1920, 1080);
  expect(near.x).toBeCloseTo(960 - 192, 6);
  expect(far.x).toBeCloseTo(960 - 96, 6);
  // In front of the subject, more.
  expect(960 - project(960, 540, -0.5, cam, 1920, 1080).x).toBeCloseTo(384, 6);
});

test("noise stays inside its amplitude, is smooth, and repeats", () => {
  let worst = 0;
  let jump = 0;
  for (let i = 0; i < 5000; i++) {
    const x = i * 0.013;
    worst = Math.max(worst, Math.abs(noise(x, 3)));
    jump = Math.max(jump, Math.abs(noise(x + 0.013, 3) - noise(x, 3)));
  }
  expect(worst).toBeLessThanOrEqual(1);
  expect(jump).toBeLessThan(0.05);
  expect(noise(1.37, 2)).toBe(noise(1.37, 2));
  for (let i = 0; i < 200; i++) {
    const h = handheld(i * 0.05, 1);
    expect(Math.abs(h.x)).toBeLessThanOrEqual(17);
    expect(Math.abs(h.y)).toBeLessThanOrEqual(13);
  }
});

test("a shake fades out inside its amount and is gone after it", () => {
  for (let i = 0; i <= 50; i++) {
    const k = shake(2 + i * 0.01, 2, { amount: 20 });
    expect(Math.hypot(k.x, k.y)).toBeLessThanOrEqual(
      20 * Math.SQRT2 * (1 - (i * 0.01) / 0.5) ** 2 + 1e-9,
    );
  }
  expect(shake(2.6, 2, { amount: 20 })).toEqual({ x: 0, y: 0, roll: 0 });
  expect(shake(1.9, 2)).toEqual({ x: 0, y: 0, roll: 0 });
  // Not a sine: the same shake at two seeds differs.
  expect(shake(2.1, 2, { seed: 1 }).x).not.toBe(shake(2.1, 2, { seed: 2 }).x);
  expect(cameraAt(2.1, { shakes: [{ at: 2 }] })).toEqual(cameraAt(2.1, { shakes: [{ at: 2 }] }));
});
