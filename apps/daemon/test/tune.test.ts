import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encodeWav } from "@mockingbird/audio";
import { openStore } from "@mockingbird/store";
import { vadThreshold } from "../src/runtime.ts";
import { loudnessNotes, missedWords, pickThreshold, recommend, tuneCommand } from "../src/tune.ts";

const model = (name: string, edits: number, medianMs: number, inUse = false) => ({
  name,
  inUse,
  edits,
  words: 300,
  medianMs,
});

test("recommends the fastest model within a point of the best", () => {
  const scores = [
    model("large-v3", 3, 1100, true), // 99.0%, best
    model("large-v3-turbo", 5, 500), // 98.3%, within a point
    model("base.en", 30, 120), // 90.0%, fastest but far off
  ];
  expect(recommend(scores)?.name).toBe("large-v3-turbo");
  // The one in use wins a tie on speed.
  expect(recommend([model("a", 3, 500), model("b", 3, 500, true)])?.name).toBe("b");
  expect(recommend([])).toBeUndefined();
});

test("a lower threshold is saved only when it hears clearly more words", () => {
  const edits = (pairs: [number, number][]) => new Map(pairs);
  // 14 more words heard at 0.3, and 0.2 no better.
  expect(
    pickThreshold(
      edits([
        [0.5, 20],
        [0.4, 12],
        [0.3, 6],
        [0.2, 6],
      ]),
      300,
    ),
  ).toBe(0.3);
  // One word is noise.
  expect(
    pickThreshold(
      edits([
        [0.5, 4],
        [0.4, 3],
        [0.3, 3],
        [0.2, 4],
      ]),
      300,
    ),
  ).toBeUndefined();
  // Two words, but under 1% of 1000.
  expect(
    pickThreshold(
      edits([
        [0.5, 12],
        [0.4, 10],
      ]),
      1000,
    ),
  ).toBeUndefined();
  // Worse is never picked.
  expect(
    pickThreshold(
      edits([
        [0.5, 2],
        [0.4, 9],
      ]),
      300,
    ),
  ).toBeUndefined();
});

test("loudness notes catch clipping, speech too quiet to bring up, and a loud room", () => {
  // A second of speech at `level`, then a second of the room at `room`.
  const take = (level: number, room = 0) => ({
    sampleRate: 16000,
    samples: Int16Array.from(
      { length: 32000 },
      (_, i) => (i % 2 ? 1 : -1) * Math.round((i < 16000 ? level : room) * 32767),
    ),
  });
  expect(loudnessNotes([take(0.1), take(0.12)])).toEqual([
    "Fine: your speech peaks around -18 dB.",
  ]);
  expect(loudnessNotes([take(1), take(0.1)])[0]).toStartWith("1 of 2 sentences hit full scale");
  expect(loudnessNotes([take(0.002), take(0.003)])[0]).toStartWith(
    "Your speech is very quiet (-50 dB)",
  );
  // The room at half the voice's level: 6 dB apart.
  expect(loudnessNotes([take(0.1, 0.05), take(0.1, 0.05)])).toEqual([
    "The room is nearly as loud as your voice (6 dB apart). Move somewhere quieter, or closer to the microphone.",
  ]);
});

test("only words missed in two takes or more are reported, most missed first", () => {
  const takes = [
    { text: "Very few wolves were seen.", heard: "Berry few walls were seen." },
    { text: "The wolves howled very late.", heard: "The walls howled berry late." },
    { text: "The wolves came back.", heard: "The walls came back." },
  ];
  expect(missedWords(takes)).toEqual(["wolves", "very"]);
  expect(missedWords(takes.slice(0, 1))).toEqual([]);
});

test("a saved threshold is used only if it's one detectSpeech can take", () => {
  expect(vadThreshold("0.3")).toBe(0.3);
  expect(vadThreshold(undefined)).toBeUndefined();
  expect(vadThreshold("")).toBeUndefined();
  expect(vadThreshold("1.5")).toBeUndefined();
  expect(vadThreshold("loud")).toBeUndefined();
});

test("with no calibration, tune says to run one and changes nothing", async () => {
  const lines: string[] = [];
  const code = await tuneCommand({
    home: mkdtempSync(join(tmpdir(), "tune-test-")),
    out: (l) => lines.push(l),
  });
  expect(code).toBe(1);
  expect(lines).toEqual(["No calibration to tune with yet. Run `mockingbird calibrate` first."]);
});

describe("tuneCommand, end to end with fakes", () => {
  const SENTENCE = "one two three four five";
  /** A home with a two-sentence run, its WAVs, and these Whisper files. */
  const home = (files = ["ggml-large-v3-q5_0.bin", "ggml-base.en.bin"], saved?: string) => {
    const dir = mkdtempSync(join(tmpdir(), "tune-test-"));
    mkdirSync(join(dir, "models"));
    mkdirSync(join(dir, "calibration"));
    for (const f of files) writeFileSync(join(dir, "models", f), "");
    const store = openStore(join(dir, "data.db"));
    for (const sentence of [0, 1]) {
      store.saveTake({
        run: 9,
        sentence,
        text: SENTENCE,
        heard: SENTENCE,
        edits: 0,
        words: 5,
        model: "x",
      });
      const samples = Int16Array.from({ length: 16000 }, (_, i) => (i % 2 ? 3000 : -3000));
      writeFileSync(
        join(dir, "calibration", `9-${sentence}.wav`),
        encodeWav({ sampleRate: 16000, samples }),
      );
    }
    if (saved) store.setSetting("vad_threshold", saved);
    store.close();
    return dir;
  };
  /** Whisper servers that hear `SENTENCE` right only with the large model. */
  const servers = (fail?: (path: string) => boolean) => {
    const log = { started: 0, stopped: 0 };
    const whisper = async (path: string) => {
      log.started++;
      return {
        engine: {
          model: path,
          health: async () => true,
          transcribe: async () => {
            if (fail?.(path)) throw new Error("whisper-server died");
            return {
              text: path.includes("large") || path.includes("custom") ? SENTENCE : "one too",
              confidence: 1,
              words: [],
            };
          },
        },
        stop: async () => {
          log.stopped++;
        },
      };
    };
    return { whisper, log };
  };
  /** Speech found only at or below `below`. */
  const vad =
    (below = 1) =>
    async () => ({
      detect: async (a: { samples: Int16Array }, threshold: number) =>
        threshold <= below ? [{ startSample: 0, endSample: a.samples.length }] : [],
      close: async () => {},
    });
  const daemon = (status = 200) => {
    const calls: [string, string | undefined][] = [];
    const tell = async (path: string, body?: string) => {
      calls.push([path, body]);
      return new Response("ok", { status });
    };
    return { tell, calls };
  };
  const run = async (deps: Parameters<typeof tuneCommand>[0]) => {
    const lines: string[] = [];
    const code = await tuneCommand({ env: {}, out: (l) => lines.push(l), ...deps });
    return { code, text: lines.join("\n") };
  };

  test("saves a lower threshold that hears clearly more, and recommends the model that hears best", async () => {
    const { whisper, log } = servers();
    const { tell, calls } = daemon();
    const { code, text } = await run({ home: home(), whisper, vad: vad(0.3), tell });
    expect(code).toBe(0);
    expect(text).toContain("large-v3 Q5_0, the one in use, is already the best choice");
    expect(text).toContain("threshold 0.3           100.0% right");
    expect(calls).toEqual([["/settings/vad_threshold", "0.3"]]);
    expect(text).toContain("0.3 heard 10 more of your words than the default: saved.");
    expect(log.stopped).toBe(log.started);
  });

  test("clears a saved threshold once the default hears as well", async () => {
    const { whisper } = servers();
    const { tell, calls } = daemon();
    const { text } = await run({ home: home(undefined, "0.3"), whisper, vad: vad(), tell });
    expect(calls).toEqual([["/settings/vad_threshold", ""]]);
    expect(text).toContain("the saved threshold is cleared");
  });

  test("one model failing mid-run leaves the rest, and stops its server", async () => {
    const { whisper, log } = servers((path) => path.includes("base"));
    const { text, code } = await run({ home: home(), whisper, vad: vad(), tell: daemon().tell });
    expect(code).toBe(0);
    expect(text).toMatch(/base\.en +failed: whisper-server died/);
    expect(text).toContain("large-v3 Q5_0, the one in use");
    expect(log.stopped).toBe(log.started);
  });

  test("a failing model in use saves no threshold", async () => {
    const { whisper } = servers((path) => path.includes("large"));
    const { tell, calls } = daemon();
    const { text } = await run({ home: home(), whisper, vad: vad(0.3), tell });
    expect(calls).toEqual([]);
    expect(text).not.toContain("Speech detection");
  });

  test("nothing measured is an error, with what to do", async () => {
    const whisper = async () => {
      throw new Error("no model");
    };
    const { code, text } = await run({ home: home(), whisper, vad: vad() });
    expect(code).toBe(1);
    expect(text).toContain("No model could be measured. `mockingbird models pull`");
  });

  test("an agent from before the setting is told to restart, not to start", async () => {
    const { whisper } = servers();
    const { code, text } = await run({
      home: home(),
      whisper,
      vad: vad(0.3),
      tell: daemon(404).tell,
    });
    expect(code).toBe(1);
    expect(text).toContain("older than tune. Run `mockingbird restart`");
  });

  test("a model outside the models folder (MOCKINGBIRD_ASR_MODEL) is the one tuned", async () => {
    const outside = join(mkdtempSync(join(tmpdir(), "tune-model-")), "ggml-custom.bin");
    writeFileSync(outside, "");
    const { whisper } = servers();
    const { text } = await run({
      home: home(["ggml-base.en.bin"]),
      env: { MOCKINGBIRD_ASR_MODEL: outside },
      whisper,
      vad: vad(),
      tell: daemon().tell,
    });
    expect(text).toMatch(/custom +100\.0% right .*● in use/);
    expect(text).toContain("Speech detection, with custom");
  });

  test("the model in use, named by another path to the same file, runs once", async () => {
    const dir = home(["ggml-base.en.bin"]);
    const { whisper, log } = servers();
    const { text } = await run({
      home: dir,
      env: { MOCKINGBIRD_ASR_MODEL: join(dir, "models", ".", "ggml-base.en.bin") },
      whisper,
      vad: vad(),
      tell: daemon().tell,
    });
    expect(log.started).toBe(1);
    expect(text).toMatch(/base\.en +.*● in use/);
  });
});
