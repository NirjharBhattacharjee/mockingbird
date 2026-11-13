import { expect, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handle, mcpTools } from "../src/mcp.ts";

const tools = mcpTools(
  async () => {
    throw new Error("speech recognition is not needed");
  },
  () => {},
);

test("MCP exposes both local voice operations without starting speech recognition", () => {
  expect(tools.map((t) => t.name)).toContain("voice_list");
  expect(tools.map((t) => t.name)).toContain("voice_audition");
});

test("MCP discovers actual local voices or reports the unsupported platform", async () => {
  const response = await handle(
    { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "voice_list" } },
    tools,
  );
  const result = (response as { result: { content: { text: string }[]; isError?: boolean } })
    .result;
  const text = result.content[0]?.text ?? "";
  if (process.platform !== "darwin") {
    expect(result.isError).toBe(true);
    expect(text).toContain("needs macOS say");
    return;
  }
  const discovered = JSON.parse(text);
  expect(result.isError).toBeUndefined();
  expect(discovered.voices.length).toBeGreaterThan(0);
  expect(discovered.voices[0]).toEqual({
    name: expect.any(String),
    language: expect.stringMatching(/^[a-z]{2,3}_[A-Z]{2}$/),
    accent: expect.stringMatching(/^[A-Z]{2}$/),
    sample: expect.any(String),
  });
  expect(discovered.note).toContain("Only installed voices");
  const first = discovered.voices[0];
  const filteredResponse = await handle(
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "voice_list", arguments: { language: first.language, accent: first.accent } },
    },
    tools,
  );
  const filteredResult = (filteredResponse as { result: { content: { text: string }[] } }).result;
  const filtered = JSON.parse(filteredResult.content[0]?.text ?? "");
  expect(filtered.voices).toContainEqual(first);
  expect(
    filtered.voices.every(
      (v: { language: string; accent: string }) =>
        v.language === first.language && v.accent === first.accent,
    ),
  ).toBe(true);
});

test("MCP validates voice argument types", async () => {
  const list = tools.find((t) => t.name === "voice_list");
  const audition = tools.find((t) => t.name === "voice_audition");
  if (!list || !audition) throw new Error("Voice tools are missing");
  await expect(list.run({ language: 1 })).rejects.toThrow("language must be a string");
  await expect(audition.run({ voice: "A", text: "test" })).rejects.toThrow("Give voice");
  await expect(
    audition.run({ voice: "A", text: "test", out: "test.wav", rate: "fast" }),
  ).rejects.toThrow("rate must be");
});

test("MCP formats the audition result with voice and source metadata", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mockingbird-voice-mcp-"));
  const out = join(dir, "audition.wav");
  const platform = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
  const spawn = spyOn(Bun, "spawn").mockImplementation(((args: string[]) => {
    const listing = args[0] === "/usr/bin/say" && args[2] === "?";
    if (args[0] === "ffmpeg") writeFileSync(args.at(-1) as string, "encoded audio");
    return {
      stdout: new Response(listing ? "Voice One en_AU # Hello" : "").body,
      stderr: new Response("").body,
      exited: Promise.resolve(0),
    } as unknown as ReturnType<typeof Bun.spawn>;
  }) as typeof Bun.spawn);
  try {
    const response = await handle(
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "voice_audition", arguments: { voice: "Voice One", text: "Hello", out } },
      },
      tools,
    );
    const result = (response as { result: { content: { text: string }[]; isError?: boolean } })
      .result;
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0]?.text ?? "")).toEqual({
      out,
      voice: { name: "Voice One", language: "en_AU", accent: "AU", sample: "Hello" },
      rate: 175,
      source: "local macOS say",
      note: "Accent is installed voice metadata. Listen to the audition before choosing.",
    });
  } finally {
    spawn.mockRestore();
    if (platform) Object.defineProperty(process, "platform", platform);
    rmSync(dir, { recursive: true, force: true });
  }
});
