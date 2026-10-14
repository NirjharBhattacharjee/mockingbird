import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  MODEL_FILES,
  type ModelFile,
  modelsCommand,
  progressLine,
  pullFile,
  pullModels,
  sha256Of,
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
        ollamaPull: async (_url, model) => {
          pulled.push(model);
        },
        which: () => "/opt/homebrew/bin/ollama",
        log: () => {},
      });
      expect(code).toBe(0);
      expect(pulled).toEqual(["tiny:latest"]);
    } finally {
      server.stop(true);
    }
  });

  test("downloads the files and the cleanup model at the same time", async () => {
    // The download only finishes once the Ollama pull has started, so pulling
    // one after the other would never finish and the test would time out.
    let ollamaStarted = () => {};
    const started = new Promise<void>((resolve) => {
      ollamaStarted = resolve;
    });
    const get = (async () => {
      await started;
      return new Response("weights");
    }) as unknown as typeof fetch;
    const server = Bun.serve({ port: 0, fetch: () => new Response("{}") });
    try {
      const code = await pullModels({
        home: tempDir(),
        llmUrl: `http://127.0.0.1:${server.port}`,
        files: [modelOf("weights")],
        fetch: get,
        ollamaPull: async () => {
          ollamaStarted();
        },
        which: () => "/opt/homebrew/bin/ollama",
        log: () => {},
      });
      expect(code).toBe(0);
    } finally {
      server.stop(true);
    }
  });

  test("a failed download waits for the Ollama pull before it's reported", async () => {
    let pullDone = false;
    const server = Bun.serve({ port: 0, fetch: () => new Response("{}") });
    try {
      await expect(
        pullModels({
          home: tempDir(),
          llmUrl: `http://127.0.0.1:${server.port}`,
          files: [modelOf("weights")],
          fetch: serving("", 404).get,
          ollamaPull: async () => {
            await Bun.sleep(50);
            pullDone = true;
          },
          which: () => "/opt/homebrew/bin/ollama",
          log: () => {},
        }),
      ).rejects.toThrow("HTTP 404");
      expect(pullDone).toBe(true);
    } finally {
      server.stop(true);
    }
  });

  test("when both fail, the Ollama error is logged and the download error thrown", async () => {
    const logged: string[] = [];
    const server = Bun.serve({ port: 0, fetch: () => new Response("{}") });
    try {
      await expect(
        pullModels({
          home: tempDir(),
          llmUrl: `http://127.0.0.1:${server.port}`,
          files: [modelOf("weights")],
          fetch: serving("", 404).get,
          ollamaPull: async () => {
            throw new Error("ollama exploded");
          },
          which: () => "/opt/homebrew/bin/ollama",
          log: (m) => logged.push(m),
        }),
      ).rejects.toThrow("HTTP 404");
      expect(logged.at(-1)).toContain("ollama exploded");
    } finally {
      server.stop(true);
    }
  });

  test("a running Ollama still needs the ollama command, which does the pull", async () => {
    const logged: string[] = [];
    const server = Bun.serve({ port: 0, fetch: () => new Response("{}") });
    try {
      const code = await pullModels({
        home: tempDir(),
        llmUrl: `http://127.0.0.1:${server.port}`,
        files: [],
        ollamaPull: async () => {},
        which: () => null,
        log: (m) => logged.push(m),
      });
      expect(code).toBe(1);
      expect(logged.at(-1)).toContain("brew install ollama");
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
      ollamaPull: async () => {},
      log: (m) => logged.push(m),
    });
    expect(code).toBe(1);
    expect(logged.at(-1)).toContain("No Ollama answers");
  });
});

test("a download of unknown size still leaves the line when it finishes", async () => {
  const lines: string[] = [];
  const server = Bun.serve({ port: 0, fetch: () => new Response("{}") });
  try {
    await pullModels({
      home: tempDir(),
      llmUrl: `http://127.0.0.1:${server.port}`,
      files: [modelOf("weights")],
      fetch: serving("weights").get,
      ollamaPull: async () => {},
      which: () => "/opt/homebrew/bin/ollama",
      log: () => {},
      progress: (line) => lines.push(line),
    });
    expect(lines.at(-1)).toBe("");
  } finally {
    server.stop(true);
  }
});

describe("progressLine", () => {
  test("shows each running download with a bar, and drops finished ones", () => {
    expect(
      progressLine([
        { name: "Whisper", done: 540e6, total: 1081e6 },
        { name: "VAD", done: 2e6, total: 2e6 },
        { name: "cleanup model", done: 0.3e9, total: 2.5e9 },
      ]),
    ).toBe("Whisper ████░░░░ 0.5/1.1 GB   cleanup model █░░░░░░░ 0.3/2.5 GB");
  });

  test("small files in MB, an unknown size as bytes so far", () => {
    expect(progressLine([{ name: "VAD", done: 1e6, total: 2e6 }])).toBe("VAD ████░░░░ 1/2 MB");
    expect(progressLine([{ name: "Whisper", done: 30e6, total: 0 }])).toBe("Whisper 30 MB");
  });

  test("empty once everything has finished", () => {
    expect(progressLine([{ name: "VAD", done: 2e6, total: 2e6 }])).toBe("");
  });
});

test("pullModels hands the progress line to deps.progress", async () => {
  const lines: string[] = [];
  const server = Bun.serve({ port: 0, fetch: () => new Response("{}") });
  try {
    await pullModels({
      home: tempDir(),
      llmUrl: `http://127.0.0.1:${server.port}`,
      files: [],
      ollamaPull: async (_url, _model, onProgress) => onProgress(1e9, 2.5e9),
      which: () => "/opt/homebrew/bin/ollama",
      log: () => {},
      progress: (line) => lines.push(line),
    });
    // The last line comes once the pull has ended, however soon after.
    expect(lines).toEqual(["cleanup model ███░░░░░ 1.0/2.5 GB", ""]);
  } finally {
    server.stop(true);
  }
});

test("sha256Of matches a known digest", async () => {
  const path = join(tempDir(), "abc");
  writeFileSync(path, "abc");
  expect(await sha256Of(path)).toBe(
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

describe("modelsCommand", () => {
  const ollama = [
    { name: "mistral:instruct", size: 4.1e9, writes: true },
    { name: "gemma3:1b", size: 0.8e9, writes: true },
    { name: "nomic-embed-text:latest", size: 0.3e9, writes: false },
    { name: "qwen3:4b-instruct-2507-q4_K_M", size: 2.5e9, writes: true },
  ];
  /** Deps that answer like a running mockingbird and Ollama, and record what they're told. */
  function fake(saved?: string, env: Record<string, string | undefined> = {}) {
    const lines: string[] = [];
    const told: string[] = [];
    let restarted = 0;
    const deps = {
      restart: async () => {
        restarted++;
        return 0;
      },
      list: async () => [...ollama],
      tell: async (path: string, body: string) => {
        told.push(`${path} ${body}`);
        return new Response(`cleanup model: ${body || "the default"}`);
      },
      saved: () => saved,
      out: (l: string) => lines.push(l),
      log: (l: string) => lines.push(l),
      env,
    };
    return { deps, lines, told, restarts: () => restarted };
  }

  test("lists the measured models first, with scores, and marks the one in use", async () => {
    const f = fake("gemma3:1b");
    expect(await modelsCommand([], f.deps)).toBe(0);
    expect(f.lines.slice(1, 4).map((l) => l.split(/\s+/)[0])).toEqual([
      "qwen3:4b-instruct-2507-q4_K_M",
      "gemma3:1b",
      "mistral:instruct",
    ]);
    expect(f.lines[2]).toMatch(/26\/37\s+10\/16\s+in use$/);
    expect(f.lines[3]).toContain("not measured");
    expect(f.lines.join("\n")).not.toContain("nomic-embed-text");
  });

  test("use saves the choice through the daemon and restarts the agent", async () => {
    const f = fake();
    expect(await modelsCommand(["use", "gemma3:1b"], f.deps)).toBe(0);
    expect(f.told).toEqual(["/settings/llm_model gemma3:1b"]);
    expect(f.restarts()).toBe(1);

    const back = fake("gemma3:1b");
    expect(await modelsCommand(["use", "--default"], back.deps)).toBe(0);
    expect(back.told).toEqual(["/settings/llm_model "]);
  });

  test("refuses a model Ollama doesn't have, naming the pull", async () => {
    const f = fake();
    expect(await modelsCommand(["use", "phi4"], f.deps)).toBe(1);
    expect(f.lines.join("\n")).toContain("ollama pull phi4");
    expect(await modelsCommand(["use", "nomic-embed-text"], f.deps)).toBe(1);
    expect(f.lines.at(-1)).toContain("embedding model");
    expect(f.told).toEqual([]);
    expect(f.restarts()).toBe(0);
  });

  test("says when MOCKINGBIRD_LLM_MODEL will win over the choice", async () => {
    const f = fake(undefined, { MOCKINGBIRD_LLM_MODEL: "mistral:instruct" });
    await modelsCommand(["use", "gemma3:1b"], f.deps);
    expect(f.lines.join("\n")).toContain("wins over this choice");
  });

  test("a stopped mockingbird can't save the choice", async () => {
    const f = fake();
    f.deps.tell = async () => {
      throw new Error("ECONNREFUSED");
    };
    expect(await modelsCommand(["use", "gemma3:1b"], f.deps)).toBe(1);
    expect(f.lines.join("\n")).toContain("`mockingbird start`");
    expect(f.restarts()).toBe(0);
  });
});
