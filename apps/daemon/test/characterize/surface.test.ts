// Pins the MCP surface as it is before the refactor (#300): every tool's
// schema, the server's replies, and each tool's reply to bad arguments. A
// move that changes any of it fails here. Don't update these snapshots in a
// refactor PR; a change to them is a change to the product.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { playbooks } from "../../src/guide.ts";
import { handle, PROMPTS } from "../../src/mcp/server.ts";
import { mcpTools } from "../../src/mcp/tools.ts";

const repo = resolve(import.meta.dir, "../../../..");
const wav = join(repo, "bench/fixtures/hello.wav");
const home = mkdtempSync(join(tmpdir(), "mb-characterize-"));
const saved = process.env.MOCKINGBIRD_HOME;
// A home of its own: dictionary_add writes to data.db.
// And a working folder of its own: tools resolve a missing path against it, and it
// mustn't be the repo, so those replies read the same wherever the tests start.
const cwd = process.cwd();
beforeAll(() => {
  process.env.MOCKINGBIRD_HOME = home;
  mkdirSync(join(home, "cwd"));
  process.chdir(join(home, "cwd"));
});
afterAll(() => {
  process.chdir(cwd);
  if (saved === undefined) delete process.env.MOCKINGBIRD_HOME;
  else process.env.MOCKINGBIRD_HOME = saved;
  rmSync(home, { recursive: true, force: true });
});

const tools = mcpTools(
  async () => ({ ready: true }),
  () => {},
);
const topics = playbooks().map((p) => p.topic);

const windows = process.platform === "win32";
const literal = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Paths and process ids that differ by machine and run, made the same
 * everywhere. The longest path goes first, so a run from apps/daemon still
 * reads `<cwd>`. On Windows, paths are matched as JSON escapes them and in
 * any drive-letter case, then their separators read `/` and a leftover
 * drive (`D:\\x`) is dropped; elsewhere a backslash stays as it is.
 */
const steady = (v: unknown): unknown => {
  let json = JSON.stringify(v);
  const paths: [string, string][] = [
    [process.cwd(), "<cwd>"],
    [repo, "<repo>"],
    [home, "<home>"],
  ];
  for (const [path, tag] of paths.sort((a, b) => b[0].length - a[0].length)) {
    const re = new RegExp(literal(JSON.stringify(path).slice(1, -1)), windows ? "gi" : "g");
    json = json.replace(re, tag);
  }
  if (windows) json = json.replaceAll("\\\\", "/").replace(/\b[A-Za-z]:\//g, "/");
  return JSON.parse(
    json.replaceAll(topics.join(", "), "<topics>").replace(/\.\d+\.tmp/g, ".<pid>.tmp"),
  );
};

let id = 0;
const call = (method: string, params?: object) =>
  handle({ jsonrpc: "2.0", id: ++id, method, params } as never, tools, PROMPTS);

test("every tool's name, description and input schema", () => {
  // A copy: the tools themselves keep their real schemas for the tests after this one.
  const surface = structuredClone(
    tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
  );
  // The playbooks change with the plugin, not the engine: their list is checked, not pinned.
  const guide = surface.find((t) => t.name === "guide") as {
    inputSchema: { properties: { topic: { enum: string[] } } };
  };
  expect(guide.inputSchema.properties.topic.enum).toEqual(topics);
  guide.inputSchema.properties.topic.enum = ["<topics>"];
  expect(steady(surface)).toMatchSnapshot();
});

test("the server's replies: initialize, ping, tools/list, prompts, unknown methods", async () => {
  expect(await call("initialize", { protocolVersion: "2025-03-26" })).toMatchSnapshot();
  expect(
    ((await call("initialize", { protocolVersion: "1999-01-01" })) as { result: object }).result,
  ).toHaveProperty("protocolVersion", "2025-06-18");
  expect(await call("ping")).toEqual({ jsonrpc: "2.0", id, result: {} });
  const listed = (await call("tools/list")) as { result: { tools: { name: string }[] } };
  expect(listed.result.tools.map((t) => t.name)).toEqual(tools.map((t) => t.name));
  expect(await call("prompts/list")).toMatchSnapshot();
  expect(
    await call("prompts/get", { name: "make_short", arguments: { path: "/v.mp4" } }),
  ).toMatchSnapshot();
  expect(await call("prompts/get", { name: "make_short", arguments: {} })).toMatchSnapshot();
  expect(await call("prompts/get", { name: "nope" })).toMatchSnapshot();
  expect(await call("tools/call", { name: "nope", arguments: {} })).toMatchSnapshot();
  expect(await call("resources/list")).toMatchSnapshot();
  // A notification has no id and gets no reply.
  expect(
    await handle({ jsonrpc: "2.0", method: "notifications/initialized" }, tools),
  ).toBeUndefined();
});

// Each fails before any ffmpeg or model runs, so this needs neither.
const BAD: [string, Record<string, unknown>][] = [
  ...tools
    .map((t) => t.name)
    .filter((n) => !["guide", "status", "effects", "dictionary_list"].includes(n))
    .flatMap((n): [string, Record<string, unknown>][] => [
      [n, {}],
      [
        n,
        {
          path: "/nonexistent/x.mp4",
          project: "/nonexistent/p.json",
          paths: ["/nonexistent/a.mp4", "/nonexistent/b.mp4"],
        },
      ],
    ])
    // screen_render and screen_normalize need ffprobe to get as far as their checks; edit
    // would write at the root, which fails with the OS's own words (checked below instead).
    .filter(
      ([n, a]) => !(["screen_render", "screen_normalize", "edit"].includes(n) && "project" in a),
    ),
  ["transcribe", { path: wav, from: -1 }],
  ["transcribe", { path: wav, from: "soon" }],
  ["transcribe", { path: wav, model: "../data.db" }],
  ["edit", { project: "/nonexistent/p.json", ops: "add" }],
  ["render", { path: wav, clips: [] }],
  ["render", { path: wav, clips: [{ from: 2, to: 1 }] }],
  ["render", { path: wav, clips: [{ from: 0, to: 1, zoom: 9 }] }],
  ["render", { path: wav, clips: [{ from: 0, to: 1, focus: { x: 2 } }] }],
  [
    "render",
    {
      path: wav,
      clips: [{ from: 0, to: 1 }],
      split: { top: { x: 0, y: 0, w: 1, h: 1 }, bottom: { x: 0.5, y: 0, w: 0.6, h: 1 } },
    },
  ],
  ["render", { path: wav, clips: [{ from: 0, to: 1 }], captionsY: 2 }],
  ["render", { path: wav, clips: [{ from: 0, to: 1 }], texts: [{ text: "hi", from: 3, to: 1 }] }],
  ["render", { path: wav, clips: [{ from: 0, to: 1 }], audio: [{ path: wav, volume: 9 }] }],
  ["render", { path: wav, clips: [{ from: 0, to: 1, effects: [{ name: "nope" }] }] }],
  ["render", { path: wav, clips: [{ from: 0, to: 1, effects: [{ name: "color", exposure: 9 }] }] }],
  ["captions", { path: wav, clips: [] }],
  ["captions", { path: wav, clips: [{ from: 0, to: 1 }], perCue: 20 }],
  ["sync", { paths: [wav] }],
  ["sync", { paths: [wav, wav], window: 1 }],
  ["music", { duration: 0 }],
  ["music", { duration: 10, tempo: 500 }],
  ["music", { duration: 10, energy: "loud" }],
  ["music", { duration: 10, seed: -1 }],
  ["export", { project: wav, format: "avi" }],
  ["screen_frames", { path: wav, outDir: "rel", times: [1] }],
  ["screen_frames", { path: wav, outDir: "/nonexistent/out", times: [] }],
  ["screen_changes", { path: wav, threshold: 200 }],
  ["screen_privacy", { path: "relative.mp4" }],
  ["screen_watch", { path: wav, every: 0 }],
];

test("each tool's reply to missing or bad arguments", async () => {
  const replies: Record<string, unknown>[] = [];
  for (const [name, args] of BAD) {
    const reply = (await call("tools/call", { name, arguments: args })) as { result: object };
    replies.push({ name, args, reply: reply.result });
  }
  expect(steady(replies)).toMatchSnapshot();
  const unwritable = (await call("tools/call", {
    name: "edit",
    arguments: { project: "/nonexistent/p.json", ops: [] },
  })) as { result: { isError?: boolean } };
  expect(unwritable.result.isError).toBe(true);
});

test("the tools that need no arguments", async () => {
  const text = async (name: string, args = {}) =>
    (
      (await call("tools/call", { name, arguments: args })) as {
        result: { content: { text: string }[] };
      }
    ).result.content[0]?.text;
  expect(await text("status")).toBe('{"ready":true}');
  expect(await text("effects")).toMatchSnapshot();
  expect(await text("dictionary_list")).toMatchSnapshot();
  expect(await text("guide", { topic: "nope" })).toBe(
    `No playbook "nope". Topics: ${topics.join(", ")}.`,
  );
});
