import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  listModels,
  MODEL_FILES,
  type ModelFile,
  modelsCommand,
  progressLine,
  pullFile,
  pullModels,
  sha256Of,
  speechName,
} from "../src/models.ts";

const tempDir = () => mkdtempSync(join(tmpdir(), "mockingbird-pull-"));

const sha256 = (text: string) => new Bun.CryptoHasher("sha256").update(text).digest("hex");

const modelOf = (content: string): ModelFile => ({
  name: "Model",
  file: "model.bin",
  url: "https://example.invalid/model.bin",
  sha256: sha256(content),
});

/** A fetch that serves `body` and counts its calls. */
function serving(body: string, status = 200) {
  const calls: string[] = [];
  const get = (async (url: string) => {
    calls.push(url);
    return new Response(status === 200 ? body : null, { status });
  }) as unknown as typeof fetch;
  return { get, calls };
}

describe("pullFile", () => {
  test("downloads a missing model and checks it", async () => {
    const dir = tempDir();
    const { get, calls } = serving("weights");
    expect(await pullFile(modelOf("weights"), dir, { fetch: get })).toBe(true);
    expect(readFileSync(join(dir, "model.bin"), "utf8")).toBe("weights");
    expect(calls).toEqual(["https://example.invalid/model.bin"]);
  });

  test("leaves a model with the right checksum alone", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "model.bin"), "weights");
    const { get, calls } = serving("weights");
    expect(await pullFile(modelOf("weights"), dir, { fetch: get })).toBe(false);
    expect(calls).toEqual([]);
  });

  test("replaces a corrupt model", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "model.bin"), "truncated");
    const { get } = serving("weights");
    expect(await pullFile(modelOf("weights"), dir, { fetch: get })).toBe(true);
    expect(readFileSync(join(dir, "model.bin"), "utf8")).toBe("weights");
  });

  test("a download that doesn't match is thrown away, not kept", async () => {
    const dir = tempDir();
    const { get } = serving("something else");
    await expect(pullFile(modelOf("weights"), dir, { fetch: get })).rejects.toThrow(
      "expected checksum",
    );
    expect(existsSync(join(dir, "model.bin"))).toBe(false);
    expect(existsSync(join(dir, "model.bin.part"))).toBe(false);
  });

  test("reports the bytes as they arrive, against the size the server gave", async () => {
    const seen: [number, number][] = [];
    const get = (async () =>
      new Response("weights", { headers: { "content-length": "7" } })) as unknown as typeof fetch;
    await pullFile(modelOf("weights"), tempDir(), {
      fetch: get,
      onProgress: (d, t) => seen.push([d, t]),
    });
    expect(seen.at(-1)).toEqual([7, 7]);
  });

  test("continues an interrupted download instead of starting over", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "model.bin.part"), "wei");
    const asked: (string | null)[] = [];
    const seen: [number, number][] = [];
    const get = (async (_url: string, init?: RequestInit) => {
      const range = new Headers(init?.headers).get("range");
      asked.push(range);
      return new Response("ghts", { status: 206, headers: { "content-length": "4" } });
    }) as unknown as typeof fetch;
    expect(
      await pullFile(modelOf("weights"), dir, {
        fetch: get,
        onProgress: (d, t) => seen.push([d, t]),
      }),
    ).toBe(true);
    expect(asked).toEqual(["bytes=3-"]);
    expect(readFileSync(join(dir, "model.bin"), "utf8")).toBe("weights");
    expect(seen.at(-1)).toEqual([7, 7]);
  });

  test("starts over when the server sends the whole file instead of the rest", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "model.bin.part"), "wei");
    const { get } = serving("weights");
    expect(await pullFile(modelOf("weights"), dir, { fetch: get })).toBe(true);
    expect(readFileSync(join(dir, "model.bin"), "utf8")).toBe("weights");
  });

  test("a part too long to continue is thrown away and the file fetched again", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "model.bin.part"), "garbage, longer than the model");
    const asked: (string | null)[] = [];
    const get = (async (_url: string, init?: RequestInit) => {
      const range = new Headers(init?.headers).get("range");
      asked.push(range);
      return range ? new Response(null, { status: 416 }) : new Response("weights");
    }) as unknown as typeof fetch;
    expect(await pullFile(modelOf("weights"), dir, { fetch: get })).toBe(true);
    expect(asked).toEqual(["bytes=30-", null]);
    expect(readFileSync(join(dir, "model.bin"), "utf8")).toBe("weights");
  });

  test("a finished download that was never renamed is kept, not fetched again", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "model.bin.part"), "weights");
    const { get, calls } = serving("weights");
    expect(await pullFile(modelOf("weights"), dir, { fetch: get })).toBe(true);
    expect(calls).toEqual([]);
    expect(readFileSync(join(dir, "model.bin"), "utf8")).toBe("weights");
  });

  test("an HTTP error says so", async () => {
    const { get } = serving("", 404);
    await expect(pullFile(modelOf("weights"), tempDir(), { fetch: get })).rejects.toThrow(
      "HTTP 404",
    );
  });
});

describe("pullModels", () => {
  test("downloads every model file, and leaves the ones already there", async () => {
    const home = tempDir();
    const files = [modelOf("weights"), { ...modelOf("vad"), name: "VAD", file: "vad.onnx" }];
    writeFileSync(join(home, "vad.onnx"), "vad");
    const server = serving("weights");
    expect(
      await pullModels({ home, files, modelsDir: home, fetch: server.get, log: () => {} }),
    ).toBe(0);
    expect(server.calls).toHaveLength(1);
    expect(readFileSync(join(home, "model.bin"), "utf8")).toBe("weights");
  });

  test("a download of unknown size still leaves the line when it finishes", async () => {
    const lines: string[] = [];
    await pullModels({
      home: tempDir(),
      files: [modelOf("weights")],
      fetch: serving("weights").get,
      log: () => {},
      progress: (line) => lines.push(line),
    });
    expect(lines.at(-1)).toBe("");
  });

  test("pins every model it downloads", () => {
    for (const m of MODEL_FILES) expect(m.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("progressLine", () => {
  test("shows each running download with a bar, and drops finished ones", () => {
    expect(
      progressLine([
        { name: "Whisper", done: 540e6, total: 1081e6 },
        { name: "VAD", done: 2e6, total: 2e6 },
        { name: "Other", done: 0.3e9, total: 2.5e9 },
      ]),
    ).toBe("Whisper ████░░░░ 0.5/1.1 GB   Other █░░░░░░░ 0.3/2.5 GB");
  });

  test("small files in MB, an unknown size as bytes so far", () => {
    expect(progressLine([{ name: "VAD", done: 1e6, total: 2e6 }])).toBe("VAD ████░░░░ 1/2 MB");
    expect(progressLine([{ name: "Whisper", done: 30e6, total: 0 }])).toBe("Whisper 30 MB");
  });

  test("empty once everything has finished", () => {
    expect(progressLine([{ name: "VAD", done: 2e6, total: 2e6 }])).toBe("");
  });
});

test("sha256Of matches a known digest", async () => {
  const path = join(tempDir(), "abc");
  writeFileSync(path, "abc");
  expect(await sha256Of(path)).toBe(
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

describe("modelsCommand", () => {
  /** A home with two Whisper files and the VAD model, which isn't one. */
  function fake(env: Record<string, string | undefined> = {}) {
    const lines: string[] = [];
    const home = tempDir();
    const modelsDir = join(home, "models");
    mkdirSync(modelsDir);
    writeFileSync(join(modelsDir, "ggml-large-v3-q5_0.bin"), "x".repeat(30));
    writeFileSync(join(modelsDir, "ggml-base.en.bin"), "x".repeat(10));
    writeFileSync(join(modelsDir, "silero_vad.onnx"), "x");
    const deps = {
      home,
      modelsDir,
      out: (l: string) => lines.push(l),
      log: (l: string) => lines.push(l),
      env,
    };
    return { deps, lines };
  }

  test("lists the Whisper files, largest first, marking the one in use", () => {
    const f = fake();
    expect(modelsCommand([], f.deps)).toBe(0);
    const all = f.lines.join("\n");
    expect(all).toMatch(/ggml-large-v3-q5_0\.bin\s+0\.0 GB\s+in use, default/);
    expect(all).toContain("ggml-base.en.bin");
    expect(all).not.toContain("silero_vad");
  });

  test("use saves the choice in data.db, --default clears it, and listModels follows", () => {
    const f = fake();
    expect(modelsCommand(["use", "ggml-base.en.bin"], f.deps)).toBe(0);
    expect(listModels(f.deps).find((m) => m.inUse)?.file).toBe("ggml-base.en.bin");
    expect(modelsCommand(["use", "--default"], f.deps)).toBe(0);
    expect(listModels(f.deps).find((m) => m.inUse)?.file).toBe("ggml-large-v3-q5_0.bin");
  });

  test("refuses a file that isn't a Whisper model in models/", () => {
    const f = fake();
    expect(modelsCommand(["use", "ggml-tiny.bin"], f.deps)).toBe(1);
    expect(modelsCommand(["use", "../data.db"], f.deps)).toBe(1);
    expect(modelsCommand(["use", "silero_vad.onnx"], f.deps)).toBe(1);
    expect(modelsCommand(["use"], f.deps)).toBe(2);
  });

  test("says when MOCKINGBIRD_ASR_MODEL will win over the choice", () => {
    const f = fake({ MOCKINGBIRD_ASR_MODEL: "ggml-large-v3-q5_0.bin" });
    modelsCommand(["use", "ggml-base.en.bin"], f.deps);
    expect(f.lines.join("\n")).toContain("wins over this choice");
  });

  test("in another language the .en models are left out, unless one is in use", () => {
    const f = fake({ MOCKINGBIRD_LANGUAGE: "de" });
    expect(listModels(f.deps).map((m) => m.file)).toEqual(["ggml-large-v3-q5_0.bin"]);
    modelsCommand(["use", "ggml-base.en.bin"], f.deps);
    expect(listModels(f.deps).map((m) => m.file)).toEqual([
      "ggml-large-v3-q5_0.bin",
      "ggml-base.en.bin",
    ]);
  });

  test("a Whisper entry that can't be read is left out, not the whole list", () => {
    const f = fake();
    symlinkSync(join(f.deps.modelsDir, "nowhere"), join(f.deps.modelsDir, "ggml-broken.bin"));
    expect(listModels(f.deps).map((m) => m.file)).toEqual([
      "ggml-large-v3-q5_0.bin",
      "ggml-base.en.bin",
    ]);
  });

  test("names Whisper files the way a person would", () => {
    expect(speechName("ggml-large-v3-turbo-q8_0.bin")).toBe("large-v3-turbo Q8_0");
    expect(speechName("ggml-small.en-q5_1.bin")).toBe("small.en Q5_1");
    expect(speechName("ggml-large-v3.bin")).toBe("large-v3");
  });
});
