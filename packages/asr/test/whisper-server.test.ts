import { describe, expect, test } from "bun:test";
import { joinResults, parseVerboseJson, speedFlags, stripNonSpeech } from "../src/index.ts";

describe("parseVerboseJson", () => {
  test("joins segments that split a word without inserting a space", () => {
    const result = parseVerboseJson({
      segments: [
        { text: " a test of the dict", words: [] },
        { text: "ation pipeline.\n", words: [] },
      ],
    });
    expect(result.text).toBe("a test of the dictation pipeline.");
  });

  test("confidence is the mean probability of spoken words, ignoring punctuation", () => {
    const result = parseVerboseJson({
      segments: [
        {
          text: " yes, please.",
          words: [
            { word: " yes", start: 0, end: 0.2, probability: 0.9 },
            { word: ",", start: 0.2, end: 0.2, probability: 0.1 },
            { word: " please", start: 0.2, end: 0.5, probability: 0.7 },
            { word: ".", start: 0.5, end: 0.5, probability: 0.1 },
          ],
        },
      ],
    });
    expect(result.confidence).toBeCloseTo(0.8);
    expect(result.words[2]).toEqual({
      word: " please",
      startMs: 200,
      endMs: 500,
      probability: 0.7,
    });
  });

  test("empty response yields empty text and zero confidence", () => {
    expect(parseVerboseJson({})).toEqual({ text: "", confidence: 0, words: [] });
  });
});

describe("stripNonSpeech", () => {
  test("drops the dots Whisper writes for a pause", () => {
    expect(stripNonSpeech("But... I think so.")).toBe("But I think so.");
    expect(stripNonSpeech("Wait. . . really?")).toBe("Wait really?");
    expect(stripNonSpeech("So… anyway.")).toBe("So anyway.");
  });

  test("drops bracketed sounds", () => {
    expect(stripNonSpeech("[BLANK_AUDIO]")).toBe("");
    expect(stripNonSpeech("Hello [MUSIC] there.")).toBe("Hello there.");
  });

  test("keeps round brackets, which can be dictated", () => {
    expect(stripNonSpeech("See the docs (page 3).")).toBe("See the docs (page 3).");
  });

  test("keeps ordinary sentences and their full stops", () => {
    expect(stripNonSpeech("One. Two. Three.")).toBe("One. Two. Three.");
    expect(stripNonSpeech("  Hello   world. ")).toBe("Hello world.");
  });
});

describe("joinResults", () => {
  const word = (w: string, probability: number) => ({ word: w, startMs: 0, endMs: 0, probability });

  test("joins the pieces of one dictation with a space", () => {
    const result = joinResults([
      { text: "My day has been good.", confidence: 0.9, words: [word(" good", 0.9)] },
      { text: "I just woke up.", confidence: 0.5, words: [word(" up", 0.5)] },
    ]);
    expect(result.text).toBe("My day has been good. I just woke up.");
    expect(result.confidence).toBeCloseTo(0.7);
    expect(result.words).toHaveLength(2);
  });

  test("skips pieces where nothing was said", () => {
    const result = joinResults([
      { text: "Hello.", confidence: 0.8, words: [word(" Hello", 0.8)] },
      { text: "", confidence: 0, words: [] },
    ]);
    expect(result.text).toBe("Hello.");
  });

  test("a single piece passes through as it is", () => {
    const one = { text: "Yes please.", confidence: 0.97, words: [] };
    expect(joinResults([one])).toBe(one);
  });

  test("pieces without words average their confidence by length", () => {
    const result = joinResults([
      { text: "aaaa", confidence: 1, words: [] },
      { text: "bb", confidence: 0.4, words: [] },
    ]);
    expect(result.confidence).toBeCloseTo(0.8);
  });

  test("nothing at all is an empty result", () => {
    expect(joinResults([])).toEqual({ text: "", confidence: 0, words: [] });
  });
});

describe("speedFlags", () => {
  test("skips the language pass when this whisper-server can", () => {
    expect(
      speedFlags(
        "  -nlp,      --no-language-probabilities [false  ] exclude language probabilities",
      ),
    ).toEqual(["-nlp"]);
  });

  test("passes nothing to a version that doesn't know the flag", () => {
    expect(speedFlags("usage: whisper-server [options]\n  -t N, --threads N")).toEqual([]);
    expect(speedFlags("")).toEqual([]);
  });
});
