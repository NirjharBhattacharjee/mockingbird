import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CHROME_VERSION,
  findChrome,
  listModels,
  MODEL_FILES,
  type ModelFile,
  modelsCommand,
  pinnedChrome,
  progressLine,
  pullChrome,
  pullFile,
  pullModels,
  resolveModel,
  sha256Of,
  speechName,
} from "../src/models.ts";
import { savedModelFor } from "../src/runtime.ts";

/** Where pullFile keeps an unfinished download of `model`: named for its checksum. */
const partOf = (model: ModelFile) => `model.bin.${model.sha256.slice(0, 12)}.part`;

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
    expect(existsSync(join(dir, partOf(modelOf("weights"))))).toBe(false);
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
    writeFileSync(join(dir, partOf(modelOf("weights"))), "wei");
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
    writeFileSync(join(dir, partOf(modelOf("weights"))), "wei");
    const { get } = serving("weights");
    expect(await pullFile(modelOf("weights"), dir, { fetch: get })).toBe(true);
    expect(readFileSync(join(dir, "model.bin"), "utf8")).toBe("weights");
  });

  test("a part too long to continue is thrown away and the file fetched again", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, partOf(modelOf("weights"))), "garbage, longer than the model");
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
    writeFileSync(join(dir, partOf(modelOf("weights"))), "weights");
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

  test("a model for one language is used for it, and the rest keep the one for all", () => {
    const f = fake({ MOCKINGBIRD_LANGUAGE: "bn" });
    expect(modelsCommand(["use", "ggml-base.en.bin"], f.deps)).toBe(0);
    expect(modelsCommand(["use", "ggml-large-v3-q5_0.bin", "--language", "bn"], f.deps)).toBe(0);
    expect(savedModelFor("bn", f.deps.home)).toBe("ggml-large-v3-q5_0.bin");
    expect(savedModelFor("de", f.deps.home)).toBe("ggml-base.en.bin");
    expect(listModels(f.deps).find((m) => m.inUse)?.file).toBe("ggml-large-v3-q5_0.bin");
    f.lines.length = 0;
    modelsCommand([], f.deps);
    expect(f.lines.join("\n")).toMatch(/By language:\n\s+bn\s+ggml-large-v3-q5_0\.bin/);
    // --default for bn goes back to the one for every language.
    expect(modelsCommand(["use", "--default", "--language", "bn"], f.deps)).toBe(0);
    expect(savedModelFor("bn", f.deps.home)).toBe("ggml-base.en.bin");
    expect(modelsCommand(["use", "ggml-base.en.bin", "--language", "xx"], f.deps)).toBe(2);
    expect(modelsCommand(["use", "ggml-base.en.bin", "--language"], f.deps)).toBe(2);
  });

  test("--language is read like MOCKINGBIRD_LANGUAGE, and a deleted one gives way", () => {
    const f = fake();
    expect(modelsCommand(["use", "ggml-base.en.bin", "--language", "DE-de"], f.deps)).toBe(0);
    expect(savedModelFor("de", f.deps.home)).toBe("ggml-base.en.bin");
    expect(modelsCommand(["use", "ggml-large-v3-q5_0.bin"], f.deps)).toBe(0);
    rmSync(join(f.deps.modelsDir, "ggml-base.en.bin"));
    expect(savedModelFor("de", f.deps.home)).toBe("ggml-large-v3-q5_0.bin");
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

describe("resolveModel", () => {
  const sha = "a".repeat(64);
  /** Hugging Face's reply to a HEAD: the file's sha256, size and commit in headers. */
  const hf = (headers: Record<string, string> = {}, status = 302) => {
    const seen: { url: string; method?: string; redirect?: string }[] = [];
    const get = (async (url: string, init?: RequestInit) => {
      seen.push({ url, method: init?.method, redirect: init?.redirect });
      return new Response(null, { status, headers });
    }) as unknown as typeof fetch;
    return { get, seen };
  };

  test("a name is whisper.cpp's file, pinned to the commit Hugging Face names", async () => {
    const { get, seen } = hf({
      "x-linked-etag": `"${sha}"`,
      "x-linked-size": "1624555275",
      "x-repo-commit": "5359861",
    });
    const model = await resolveModel("large-v3-turbo", { fetch: get });
    expect(seen[0]).toEqual({
      url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin",
      method: "HEAD",
      redirect: "manual",
    });
    expect(model).toEqual({
      name: "large-v3-turbo",
      file: "ggml-large-v3-turbo.bin",
      url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861/ggml-large-v3-turbo.bin",
      sha256: sha,
      bytes: 1624555275,
    });
  });

  test("a URL without a sha256 in its headers needs --sha256, and a wrong one is refused", async () => {
    const plain = "https://example.com/models/ggml-bangla.bin";
    await expect(resolveModel(plain, { fetch: hf({}, 200).get })).rejects.toThrow(
      "give the one its publisher lists with --sha256",
    );
    expect((await resolveModel(plain, { sha256: sha, fetch: hf({}, 200).get })).sha256).toBe(sha);
    await expect(
      resolveModel("tiny", {
        sha256: "b".repeat(64),
        fetch: hf({ "x-linked-etag": `"${sha}"` }).get,
      }),
    ).rejects.toThrow(`not the ${"b".repeat(64)} given`);
  });

  test("only Hugging Face's reply is trusted for a checksum", async () => {
    const claims = hf({ "x-linked-etag": `"${sha}"`, "x-repo-commit": "abcdef1" }, 200).get;
    await expect(resolveModel("https://example.com/ggml-x.bin", { fetch: claims })).rejects.toThrow(
      "--sha256",
    );
  });

  test("a page link is the file, and any branch is pinned to the commit checked", async () => {
    const { get, seen } = hf({ "x-linked-etag": `"${sha}"`, "x-repo-commit": "abcdef1" });
    const model = await resolveModel("https://huggingface.co/someone/bangla/blob/dev/ggml-bn.bin", {
      fetch: get,
    });
    expect(seen[0]?.url).toBe("https://huggingface.co/someone/bangla/resolve/dev/ggml-bn.bin");
    expect(model.url).toBe("https://huggingface.co/someone/bangla/resolve/abcdef1/ggml-bn.bin");
  });

  test("refuses plain http, a file not named like a model, and a missing one", async () => {
    const ok = hf({ "x-linked-etag": `"${sha}"` }).get;
    await expect(resolveModel("http://example.com/ggml-x.bin", { fetch: ok })).rejects.toThrow(
      "only https",
    );
    await expect(resolveModel("https://example.com/model.bin", { fetch: ok })).rejects.toThrow(
      "--as ggml-<name>.bin",
    );
    const named = { as: "ggml-bn.bin", sha256: sha, fetch: ok };
    expect((await resolveModel("https://example.com/model.bin", named)).file).toBe("ggml-bn.bin");
    await expect(resolveModel("nope", { fetch: hf({}, 404).get })).rejects.toThrow("HTTP 404");
  });
});

describe("Chrome", () => {
  test("is pinned per Mac, in ~/.mockingbird/bin, and not yet anywhere else", () => {
    const pin = pinnedChrome("/home", "darwin-arm64");
    expect(pin?.program).toBe(
      `/home/bin/chrome-headless-shell-${CHROME_VERSION}/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
    );
    expect(pin?.zip.url).toContain(`/${CHROME_VERSION}/mac-arm64/`);
    expect(pin?.zip.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(pinnedChrome("/home", "darwin-x64")?.zip.sha256).not.toBe(pin?.zip.sha256);
    expect(pinnedChrome("/home", "linux-x64")?.zip.url).toEndWith(
      "/linux64/chrome-headless-shell-linux64.zip",
    );
    expect(pinnedChrome("/home", "win32-x64")?.program).toEndWith("chrome-headless-shell.exe");
    expect(pinnedChrome("/home", "linux-arm64")).toBeUndefined();
  });

  test("MOCKINGBIRD_CHROME wins; the pinned one counts once it's there", () => {
    const home = tempDir();
    // A program that runs, standing in for Chrome; a path that isn't one doesn't count.
    expect(findChrome({ MOCKINGBIRD_CHROME: process.execPath }, home)).toBe(process.execPath);
    expect(findChrome({ MOCKINGBIRD_CHROME: "/no/chrome" }, home)).toBeUndefined();
    expect(findChrome({ MOCKINGBIRD_CHROME: home }, home)).toBeUndefined();
    expect(findChrome({}, home)).toBeUndefined();
    const program = pinnedChrome(home)?.program;
    if (!program) return; // a platform with no pin yet
    mkdirSync(join(program, ".."), { recursive: true });
    writeFileSync(program, "");
    expect(findChrome({}, home)).toBe(program);
  });

  test("pull downloads nothing when it's there, and clears out other versions", async () => {
    const home = tempDir();
    const pin = pinnedChrome(home);
    if (!pin) return;
    mkdirSync(join(pin.program, ".."), { recursive: true });
    writeFileSync(pin.program, "");
    const old = join(home, "bin", "chrome-headless-shell-1.0.0.0");
    mkdirSync(old);
    const { get, calls } = serving("");
    expect(await pullChrome({ home, fetch: get, log: () => {} })).toBe(0);
    expect(calls).toEqual([]);
    expect(existsSync(old)).toBe(false);
    expect(existsSync(pin.program)).toBe(true);
  });

  test("one pull at a time; a lock left by a pull that died is taken over", async () => {
    const home = tempDir();
    const pin = pinnedChrome(home);
    if (!pin) return;
    mkdirSync(join(pin.program, ".."), { recursive: true });
    writeFileSync(pin.program, "");
    const lock = join(home, "bin", ".chrome-pull.lock");
    const said: string[] = [];
    const { get, calls } = serving("");
    writeFileSync(lock, String(process.pid));
    expect(await pullChrome({ home, fetch: get, log: (m) => said.push(m) })).toBe(1);
    expect(said.join("\n")).toContain(`pid ${process.pid}`);
    expect(existsSync(lock)).toBe(true);

    const gone = Bun.spawnSync(["true"]).pid; // exited, so not running
    writeFileSync(lock, String(gone));
    expect(await pullChrome({ home, fetch: get, log: () => {} })).toBe(0);
    expect(existsSync(lock)).toBe(false);
    expect(calls).toEqual([]);
  });
});
