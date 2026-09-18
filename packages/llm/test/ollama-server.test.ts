import { afterAll, describe, expect, test } from "bun:test";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isLocalUrl, ollamaRunning, startOllamaServer } from "../src/index.ts";

const dir = await mkdtemp(join(tmpdir(), "mockingbird-ollama-"));
afterAll(() => rm(dir, { recursive: true, force: true }));

/** A stand-in for the ollama binary: `serve` answers /api/version on OLLAMA_HOST. */
async function fakeOllama(body: string): Promise<string> {
  const path = join(dir, `ollama-${crypto.randomUUID()}`);
  await writeFile(path, `#!/usr/bin/env bun\n${body}\n`);
  await chmod(path, 0o755);
  return path;
}

const serves = `
const [hostname, port] = process.env.OLLAMA_HOST.split(":");
Bun.serve({ hostname, port: Number(port), fetch: () => Response.json({ version: "fake" }) });`;

function freePort(): number {
  const server = Bun.serve({ port: 0, fetch: () => new Response() });
  const port = server.port;
  server.stop(true);
  return port as number;
}

describe("isLocalUrl", () => {
  test("accepts this Mac and rejects other hosts", () => {
    expect(isLocalUrl("http://127.0.0.1:11434")).toBe(true);
    expect(isLocalUrl("http://localhost:11434")).toBe(true);
    expect(isLocalUrl("http://[::1]:11434")).toBe(true);
    expect(isLocalUrl("http://gpu-box.lan:11434")).toBe(false);
    expect(isLocalUrl("not a url")).toBe(false);
  });
});

describe("ollamaRunning", () => {
  test("gives up on a server that never replies", async () => {
    const hung = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
    const started = Date.now();
    expect(await ollamaRunning(`http://127.0.0.1:${hung.port}`, 100)).toBe(false);
    expect(Date.now() - started).toBeLessThan(1_000);
    hung.stop(true);
  });
});

describe("startOllamaServer", () => {
  test("gives up at readyTimeoutMs when the server never replies", async () => {
    const hung = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
    const started = Date.now();
    await expect(
      startOllamaServer({
        binary: await fakeOllama("await Bun.sleep(60_000);"),
        baseUrl: `http://127.0.0.1:${hung.port}`,
        readyTimeoutMs: 300,
      }),
    ).rejects.toThrow("ollama serve not ready after 300ms");
    expect(Date.now() - started).toBeLessThan(2_000);
    hung.stop(true);
  });

  test("starts ollama serve on the URL's port and stops it", async () => {
    const baseUrl = `http://127.0.0.1:${freePort()}`;
    const server = await startOllamaServer({ binary: await fakeOllama(serves), baseUrl });
    expect(await ollamaRunning(baseUrl)).toBe(true);
    await server.stop();
    expect(await ollamaRunning(baseUrl)).toBe(false);
  });

  test("reports why ollama serve exited", async () => {
    const binary = await fakeOllama(`console.error("bind: address in use"); process.exit(1);`);
    const baseUrl = `http://127.0.0.1:${freePort()}`;
    await expect(startOllamaServer({ binary, baseUrl })).rejects.toThrow(
      "ollama serve exited with 1: bind: address in use",
    );
  });

  test("uses an Ollama that came up meanwhile, and leaves it running", async () => {
    const other = Bun.serve({ port: 0, fetch: () => Response.json({ version: "app" }) });
    const baseUrl = `http://127.0.0.1:${other.port}`;
    const server = await startOllamaServer({
      binary: await fakeOllama("process.exit(1);"),
      baseUrl,
    });
    await server.stop();
    expect(await ollamaRunning(baseUrl)).toBe(true);
    other.stop(true);
  });
});
