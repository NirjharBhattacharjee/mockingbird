import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MODEL_FILES, type ModelFile, pullFile, pullModels, sha256Of } from "../src/models.ts";

const tempDir = () => mkdtempSync(join(tmpdir(), "mockingbird-pull-"));

const sha256 = (text: string) => new Bun.CryptoHasher("sha256").update(text).digest("hex");

const modelOf = (content: string): ModelFile => ({
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

  test("an HTTP error says so", async () => {
    const { get } = serving("", 404);
    await expect(pullFile(modelOf("weights"), tempDir(), { fetch: get })).rejects.toThrow(
      "HTTP 404",
    );
  });
});

describe("pullModels", () => {
  test("downloads every model file, then the cleanup model through a running Ollama", async () => {
    const home = tempDir();
    // Every pinned file already in place, so only the Ollama step does anything.
    const fake = MODEL_FILES.map((m) => ({ ...m, sha256: sha256(m.file) }));
    for (const m of fake) {
      writeFileSync(join(home, m.file), m.file);
    }
    const pulled: string[] = [];
    const server = Bun.serve({ port: 0, fetch: () => new Response("{}") });
    try {
      const code = await pullModels({
        home,
        llmUrl: `http://127.0.0.1:${server.port}`,
        llmModel: "tiny:latest",
        files: fake,
        modelsDir: home,
        ollamaPull: async (model) => {
          pulled.push(model);
          return 0;
        },
        log: () => {},
      });
      expect(code).toBe(0);
      expect(pulled).toEqual(["tiny:latest"]);
    } finally {
      server.stop(true);
    }
  });

  test("won't start an Ollama somewhere other than this Mac", async () => {
    const logged: string[] = [];
    const code = await pullModels({
      home: tempDir(),
      llmUrl: "http://192.0.2.1:11434",
      files: [],
      ollamaPull: async () => 0,
      log: (m) => logged.push(m),
    });
    expect(code).toBe(1);
    expect(logged.at(-1)).toContain("No Ollama answers");
  });
});

test("sha256Of matches a known digest", async () => {
  const path = join(tempDir(), "abc");
  writeFileSync(path, "abc");
  expect(await sha256Of(path)).toBe(
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});
