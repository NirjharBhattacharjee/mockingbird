import { describe, expect, test } from "bun:test";
import { parseVerboseJson, stripNonSpeech } from "../src/index.ts";

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
