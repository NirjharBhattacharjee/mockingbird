import { describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseVerboseJson, speedFlags, startWhisperServer, stripNonSpeech } from "../src/index.ts";

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

describe("startWhisperServer flags", () => {
  /**
   * A stand-in whisper-server: answers --help with `help` (after `helpDelay`
   * seconds), and otherwise records its arguments and exits, which
   * startWhisperServer reports as a failed start.
   */
  function fakeServer(help: string, helpDelay = 0) {
    const dir = mkdtempSync(join(tmpdir(), "mockingbird-whisper-"));
    const args = join(dir, "args");
    const binary = join(dir, "whisper-server");
    writeFileSync(
      binary,
      `#!/bin/sh
if [ "$1" = "--help" ]; then sleep ${helpDelay}; echo "${help}"; exit 0; fi
echo "$@" > "${args}"
exit 3
`,
    );
    chmodSync(binary, 0o755);
    return { binary, args: () => readFileSync(args, "utf8") };
  }

  const start = (binary: string, helpTimeoutMs?: number) =>
    startWhisperServer({
      binary,
      modelPath: "/m.bin",
      port: 1,
      readyTimeoutMs: 5_000,
      helpTimeoutMs,
    });

  test("starts with -nlp when this whisper-server has it", async () => {
    const server = fakeServer("  -nlp, --no-language-probabilities");
    await expect(start(server.binary)).rejects.toThrow("exited with 3");
    expect(server.args().trim().split(" ")).toContain("-nlp");
  });

  test("starts without it when it doesn't", async () => {
    const server = fakeServer("  -t N, --threads N");
    await expect(start(server.binary)).rejects.toThrow("exited with 3");
    expect(server.args()).not.toContain("-nlp");
  });

  test("a --help that hangs doesn't hold up the start", async () => {
    const server = fakeServer("  -nlp, --no-language-probabilities", 30);
    const started = performance.now();
    await expect(start(server.binary, 200)).rejects.toThrow("exited with 3");
    expect(performance.now() - started).toBeLessThan(3_000);
    expect(server.args()).not.toContain("-nlp");
  });
});
