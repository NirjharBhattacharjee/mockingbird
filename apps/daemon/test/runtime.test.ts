import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  DEFAULT_ASR_MODEL,
  englishOnly,
  ffmpegMissing,
  findAsrModel,
  findWhisperServer,
  pinnedWhisper,
  spokenLanguage,
  WHISPER_BUILD,
} from "../src/runtime.ts";

const modelsWith = (...names: string[]) => {
  const dir = mkdtempSync(join(tmpdir(), "mockingbird-models-"));
  for (const name of names) writeFileSync(join(dir, name), "");
  return dir;
};

describe("findAsrModel", () => {
  test("the default, when it's downloaded", () => {
    const models = modelsWith(DEFAULT_ASR_MODEL, "ggml-base.en.bin");
    const logged: string[] = [];
    expect(findAsrModel(models, undefined, (m) => logged.push(m))).toBe(
      join(models, DEFAULT_ASR_MODEL),
    );
    expect(logged).toEqual([]);
  });

  test("an install from before the default changed keeps its model, with a warning", () => {
    const models = modelsWith("ggml-base.en.bin");
    const logged: string[] = [];
    expect(findAsrModel(models, undefined, (m) => logged.push(m))).toBe(
      join(models, "ggml-base.en.bin"),
    );
    expect(logged[0]).toContain("mockingbird models pull");
  });

  test("no model at all still fails with the setup hint", () => {
    expect(() => findAsrModel(modelsWith(), undefined, () => {})).toThrow(
      "mockingbird models pull",
    );
  });

  test("the saved choice comes before the default; a deleted one falls back, with a warning", () => {
    const models = modelsWith(DEFAULT_ASR_MODEL, "ggml-base.en.bin");
    const logged: string[] = [];
    expect(findAsrModel(models, undefined, (m) => logged.push(m), "ggml-base.en.bin")).toBe(
      join(models, "ggml-base.en.bin"),
    );
    // The environment still wins over it.
    expect(findAsrModel(models, DEFAULT_ASR_MODEL, () => {}, "ggml-base.en.bin")).toBe(
      join(models, DEFAULT_ASR_MODEL),
    );
    expect(findAsrModel(models, undefined, (m) => logged.push(m), "ggml-gone.bin")).toBe(
      join(models, DEFAULT_ASR_MODEL),
    );
    expect(logged).toEqual([expect.stringContaining("ggml-gone.bin, isn't in")]);
    // A saved value that isn't a Whisper file is ignored too.
    writeFileSync(join(models, "silero_vad.onnx"), "");
    expect(findAsrModel(models, undefined, () => {}, "silero_vad.onnx")).toBe(
      join(models, DEFAULT_ASR_MODEL),
    );
  });

  test("a model asked for by name has to exist", () => {
    const models = modelsWith("ggml-base.en.bin");
    expect(() => findAsrModel(models, "ggml-small.en-q5_1.bin", () => {})).toThrow("not found");
    expect(findAsrModel(models, "ggml-base.en.bin", () => {})).toBe(
      join(models, "ggml-base.en.bin"),
    );
  });
});

describe("spokenLanguage", () => {
  test("English unless MOCKINGBIRD_LANGUAGE names a language, or auto", () => {
    expect(spokenLanguage({})).toBe("en");
    expect(spokenLanguage({ MOCKINGBIRD_LANGUAGE: " DE " })).toBe("de");
    expect(spokenLanguage({ MOCKINGBIRD_LANGUAGE: "auto" })).toBe("auto");
    // Whisper takes the language without its region.
    expect(spokenLanguage({ MOCKINGBIRD_LANGUAGE: "pt-BR" })).toBe("pt");
    expect(spokenLanguage({ MOCKINGBIRD_LANGUAGE: "en_US" })).toBe("en");
  });

  test("a language Whisper doesn't know falls back to English, with a warning", () => {
    const logged: string[] = [];
    // "chr" (Cherokee) is a real language, but not one Whisper knows.
    for (const wrong of ["german", "xx", "Deutsch!", "chr"])
      expect(spokenLanguage({ MOCKINGBIRD_LANGUAGE: wrong }, (m) => logged.push(m))).toBe("en");
    expect(logged).toHaveLength(4);
    expect(logged[0]).toContain("MOCKINGBIRD_LANGUAGE=german");
  });
});

test("englishOnly knows the .en Whisper builds", () => {
  expect(englishOnly("/m/ggml-base.en.bin")).toBe(true);
  expect(englishOnly("ggml-small.en-q5_1.bin")).toBe(true);
  expect(englishOnly("ggml-large-v3-turbo-q5_0.bin")).toBe(false);
});

test("pinnedWhisper: whisper.cpp's build on Linux and Windows, Homebrew's on macOS", () => {
  expect(pinnedWhisper("/h", "darwin-arm64")).toBeUndefined();
  const linux = pinnedWhisper("/h", "linux-x64");
  expect(linux?.archive.url).toBe(
    `https://github.com/ggml-org/whisper.cpp/releases/download/${WHISPER_BUILD}/whisper-bin-ubuntu-x64.tar.gz`,
  );
  expect(linux?.program).toBe(
    join(
      "/h",
      "bin",
      `whisper-cpp-${WHISPER_BUILD}-linux-x64`,
      "whisper-bin-ubuntu-x64",
      "whisper-server",
    ),
  );
  expect(pinnedWhisper("/h", "win32-x64")?.program).toEndWith(
    join("Release", "whisper-server.exe"),
  );
});

test("findWhisperServer: the environment, then the pulled one, then the PATH", () => {
  const home = mkdtempSync(join(tmpdir(), "mb-whisper-"));
  const onPath = () => "/usr/bin/whisper-server";
  expect(findWhisperServer({ MOCKINGBIRD_WHISPER_SERVER: "/x/ws" }, home, onPath)).toBe("/x/ws");
  expect(findWhisperServer({}, home, onPath)).toBe("/usr/bin/whisper-server");
  expect(findWhisperServer({}, home, () => null)).toBeUndefined();
  const pin = pinnedWhisper(home);
  if (pin) {
    mkdirSync(dirname(pin.program), { recursive: true });
    writeFileSync(pin.program, "");
    expect(findWhisperServer({}, home, onPath)).toBe(pin.program);
  }
});

test("ffmpegMissing names what a system ffmpeg was built without", () => {
  const encoders =
    " V....D libx264              libx264 H.264 (codec h264)\n A....D aac                  AAC";
  const filters = [
    " ... sidechaincompress AA->A      Sidechain compressor.",
    " ... ebur128           A->N       EBU R128 scanner.",
    " ... alimiter          A->A       Audio lookahead limiter.",
    " ... aevalsrc          |->A       Generate an audio signal.",
    " ... amix              N->A       Audio mixing.",
    " ... adelay            A->A       Delay channels.",
    " ... overlay           VV->V      Overlay a video source.",
    " ... scale             V->V       Scale the input video size.",
  ].join("\n");
  expect(ffmpegMissing((what) => (what === "-encoders" ? encoders : filters))).toEqual([]);
  // ffmpeg-free: no libx264, and "libx264rgb" alone doesn't count.
  const free = " V....D libx264rgb           libx264 RGB\n A....D aac                  AAC";
  expect(ffmpegMissing((what) => (what === "-encoders" ? free : ""))).toEqual([
    "libx264",
    "sidechaincompress",
    "ebur128",
    "alimiter",
    "aevalsrc",
    "amix",
    "adelay",
    "overlay",
    "scale",
  ]);
});

test("findAsrModel takes a path with either separator, as Windows writes one", () => {
  // Backslashes only, to a file that's nowhere: named as a path in the
  // error, not looked for inside models/.
  const gone = "C:\\gone\\ggml-mine.bin";
  expect(() => findAsrModel(modelsWith(), gone, () => {})).toThrow(
    `Whisper model not found at ${gone}`,
  );
  const dir = modelsWith("ggml-mine.bin");
  expect(findAsrModel(modelsWith(), join(dir, "ggml-mine.bin"), () => {})).toBe(
    join(dir, "ggml-mine.bin"),
  );
});
