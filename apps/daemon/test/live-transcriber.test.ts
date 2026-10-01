import { describe, expect, test } from "bun:test";
import type { AsrEngine, AsrResult, AsrWord, TranscribeOptions } from "@mockingbird/asr";
import type { PcmAudio } from "@mockingbird/audio";
import type { SpeechSegment } from "@mockingbird/vad";
import { gapsBetween, LiveTranscriber, sentenceCut } from "../src/live-transcriber.ts";
import { runPipeline } from "../src/pipeline.ts";

const RATE = 16000;
const s = (seconds: number) => Math.round(seconds * RATE);
const seg = (from: number, to: number): SpeechSegment => ({
  startSample: s(from),
  endSample: s(to),
});
const word = (text: string, from: number, to: number): AsrWord => ({
  word: text,
  startMs: from * 1000,
  endMs: to * 1000,
  probability: 0.9,
});
const silent = (seconds: number): PcmAudio => ({
  sampleRate: RATE,
  samples: new Int16Array(s(seconds)),
});

/** Speech everywhere except the given pauses, in seconds, within whatever audio it's handed. */
const speechWithPauses =
  (pauses: [number, number][]) =>
  async (audio: PcmAudio): Promise<SpeechSegment[]> => {
    const length = audio.samples.length / RATE;
    const segments: SpeechSegment[] = [];
    let from = 0;
    for (const [start, end] of pauses) {
      if (start >= length) break;
      segments.push(seg(from, start));
      from = end;
    }
    if (from < length) segments.push(seg(from, length));
    return segments;
  };

/** Speech up to `until` seconds into the audio it's handed, then silence. */
const speechUntil =
  (until: number, pauses: [number, number][] = []) =>
  async (audio: PcmAudio): Promise<SpeechSegment[]> => {
    const segments = await speechWithPauses(pauses)(audio);
    return segments
      .filter((x) => x.startSample < s(until))
      .map((x) => ({ ...x, endSample: Math.min(x.endSample, s(until)) }));
  };

type Call = { audio: PcmAudio; options?: TranscribeOptions };

function fakeAsr(replies: AsrWord[][]): AsrEngine & { calls: Call[] } {
  const calls: Call[] = [];
  return {
    model: "fake",
    calls,
    async transcribe(audio, options) {
      calls.push({ audio, options });
      const words = replies[calls.length - 1] ?? [];
      return {
        text: words
          .map((w) => w.word)
          .join("")
          .trim(),
        confidence: 0.9,
        words,
      };
    },
    health: async () => true,
  };
}

/** No padding in these fakes, so silences are exactly where the test says. */
const options = { minPieceMs: 5_000, pauseMs: 400, speechPadMs: 0, checkEveryMs: 100 };

/** Grows the recording to `seconds` the way the session does, and lets a check run. */
async function grow(live: LiveTranscriber, seconds: number) {
  live.update(s(seconds), () => silent(seconds));
  await Bun.sleep(5);
}

describe("gapsBetween", () => {
  test("takes the VAD's padding back off, so short pauses count", () => {
    // 0.5s of real silence at 4–4.5s; each segment is padded by 0.3s, so they overlap.
    expect(gapsBetween([seg(0, 4.3), seg(4.2, 8)], s(0.3))).toEqual([{ start: s(4), end: s(4.5) }]);
  });

  test("no silence between segments that really touch", () => {
    expect(gapsBetween([seg(0, 4.3), seg(3.7, 8)], s(0.3))).toEqual([]);
  });
});

describe("sentenceCut", () => {
  const at = { offset: 0, sampleRate: RATE, snap: s(0.3) };
  const words = [
    word(" I", 0, 0.2),
    word(" woke", 0.2, 0.6),
    word(" up.", 0.6, 1),
    word(" It's", 1.6, 1.8),
    word(" late", 1.8, 2.2),
  ];

  test("after the last sentence that ends in a real silence", () => {
    expect(sentenceCut(words, [{ start: s(1.1), end: s(1.5) }], at)).toEqual({
      keep: 3,
      at: s(1.3),
    });
  });

  test("not at a sentence end with no silence near it", () => {
    expect(sentenceCut(words, [{ start: s(3), end: s(3.5) }], at)).toBeUndefined();
  });

  test("not at a pause in the middle of a sentence", () => {
    const midSentence = [word(" with", 0, 0.3), word(" the", 0.3, 0.6), word(" chat", 1.4, 1.8)];
    expect(sentenceCut(midSentence, [{ start: s(0.7), end: s(1.3) }], at)).toBeUndefined();
  });

  test("never after the last word: a sentence isn't over until speech moves on", () => {
    expect(
      sentenceCut([word(" Done.", 0, 0.5)], [{ start: s(0.6), end: s(1) }], at),
    ).toBeUndefined();
  });
});

describe("LiveTranscriber", () => {
  test("a short recording is never looked at", async () => {
    let snapshots = 0;
    const live = new LiveTranscriber(
      { detectSpeech: speechWithPauses([]), asr: fakeAsr([]) },
      options,
    );
    for (let t = 1; t <= 4; t++) {
      live.update(s(t), () => {
        snapshots++;
        return silent(t);
      });
    }
    expect(await live.finish()).toEqual({ results: [], fromSample: 0, pending: undefined });
    expect(snapshots).toBe(0);
  });

  test("leaves Whisper alone while the user is still talking", async () => {
    const asr = fakeAsr([]);
    const live = new LiveTranscriber({ detectSpeech: speechWithPauses([]), asr }, options);
    await grow(live, 6);
    await grow(live, 7);
    expect(asr.calls).toHaveLength(0);
  });

  test("at a pause, commits whole sentences and keeps the rest as pending", async () => {
    // Speech 0–3s, silence 3–3.5s, speech 3.5–6s, then quiet until 6.5s.
    const asr = fakeAsr([
      [word(" My", 0, 0.5), word(" day.", 0.5, 2.9), word(" It", 3.6, 4), word(" went.", 4, 5.9)],
    ]);
    const live = new LiveTranscriber({ detectSpeech: speechUntil(6, [[3, 3.5]]), asr }, options);
    await grow(live, 6.5);
    const done = await live.finish();
    expect(done.results.map((r) => r.text)).toEqual(["My day."]);
    expect(done.fromSample).toBe(s(3.25));
    expect(done.pending?.result.text).toBe("It went.");
    expect(done.pending?.toSample).toBe(s(6.5));
  });

  test("the next question to Whisper carries what was said before", async () => {
    const asr = fakeAsr([
      [word(" My", 0, 0.5), word(" day.", 0.5, 2.9), word(" It", 3.6, 4)],
      [word(" It", 0.3, 0.6), word(" went.", 0.6, 3)],
    ]);
    const live = new LiveTranscriber({ detectSpeech: speechUntil(6, [[3, 3.5]]), asr }, options);
    await grow(live, 6.5);
    // From the cut at 3.25s, speech again up to 6s of that, then quiet.
    await grow(live, 9.75);
    await live.finish();
    expect(asr.calls).toHaveLength(2);
    expect(asr.calls[1]?.options?.context).toBe("My day.");
  });

  test("a piece that fails leaves everything for the end", async () => {
    const asr: AsrEngine = {
      model: "fake",
      transcribe: async () => {
        throw new Error("whisper-server died");
      },
      health: async () => false,
    };
    const live = new LiveTranscriber({ detectSpeech: speechUntil(6, [[3, 3.5]]), asr }, options);
    await grow(live, 6.5);
    expect(await live.finish()).toEqual({ results: [], fromSample: 0, pending: undefined });
  });

  test("Whisper isn't asked once the user has let go", async () => {
    const asr = fakeAsr([]);
    const live = new LiveTranscriber({ detectSpeech: speechUntil(6, [[3, 3.5]]), asr }, options);
    const done = live.finish();
    await grow(live, 6.5);
    await done;
    expect(asr.calls).toHaveLength(0);
  });
});

describe("runPipeline with a live transcript", () => {
  const llm = { model: "fake-llm", complete: async () => "", health: async () => true };
  const result = (text: string): AsrResult => ({ text, confidence: 0.95, words: [] });

  test("transcribes only what's left, and joins it to what came before", async () => {
    const asr = fakeAsr([[word(" I just woke up.", 0, 1)]]);
    const out = await runPipeline(
      {
        audio: silent(14),
        live: Promise.resolve({ results: [result("My day.")], fromSample: s(11.5) }),
      },
      { detectSpeech: speechWithPauses([]), asr, llm },
    );
    expect(out.rawText).toBe("My day. I just woke up.");
    expect(out.livePieces).toBe(1);
    // Only the 2.5s after the cut went to Whisper, prompted with what came before.
    expect(asr.calls[0]?.audio.samples.length).toBe(s(2.5));
    expect(asr.calls[0]?.options?.context).toBe("My day.");
  });

  test("uses the reading taken at the last pause when nothing was said after it", async () => {
    const asr = fakeAsr([]);
    const out = await runPipeline(
      {
        audio: silent(14),
        live: Promise.resolve({
          results: [result("My day.")],
          fromSample: s(10),
          pending: { result: result("It went."), toSample: s(13.5) },
        }),
      },
      // Of the rest (10–14s), speech ends 3s in: before the reading was taken.
      { detectSpeech: speechUntil(3), asr, llm },
    );
    expect(out.rawText).toBe("My day. It went.");
    expect(asr.calls).toHaveLength(0);
  });

  test("transcribes again when the user spoke after that reading", async () => {
    const asr = fakeAsr([[word(" It went well.", 0, 1)]]);
    const out = await runPipeline(
      {
        audio: silent(14),
        live: Promise.resolve({
          results: [],
          fromSample: 0,
          pending: { result: result("It went."), toSample: s(12) },
        }),
      },
      { detectSpeech: speechWithPauses([]), asr, llm },
    );
    expect(out.rawText).toBe("It went well.");
    expect(asr.calls).toHaveLength(1);
  });

  test("silence after the last piece still returns what was said", async () => {
    const asr = fakeAsr([]);
    const out = await runPipeline(
      {
        audio: silent(14),
        live: Promise.resolve({ results: [result("That's all.")], fromSample: s(11.5) }),
      },
      { detectSpeech: async () => [], asr, llm },
    );
    expect(out.rawText).toBe("That's all.");
    expect(asr.calls).toHaveLength(0);
  });
});
