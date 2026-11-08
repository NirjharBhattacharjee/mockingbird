import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { renderMusic, wavHeader } from "../src/music.ts";

/** MOCKINGBIRD_CHROME, or the one `mockingbird models pull chrome` put in ~/.mockingbird/bin. */
function chrome(): string {
  if (process.env.MOCKINGBIRD_CHROME) return process.env.MOCKINGBIRD_CHROME;
  const bin = join(process.env.MOCKINGBIRD_HOME ?? join(homedir(), ".mockingbird"), "bin");
  for (const version of existsSync(bin) ? readdirSync(bin) : []) {
    if (!version.startsWith("chrome-headless-shell-")) continue;
    for (const build of readdirSync(join(bin, version))) {
      const program = join(bin, version, build, "chrome-headless-shell");
      if (existsSync(program)) return program;
    }
  }
  throw new Error("No Chrome: run `mockingbird models pull chrome`, or set MOCKINGBIRD_CHROME.");
}

const dir = mkdtempSync(join(tmpdir(), "music-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function generator(name: string, body: string): string {
  const path = join(dir, name);
  writeFileSync(path, body);
  return path;
}

/** A WAV's samples, interleaved, past its 44-byte header. */
const samples = (path: string) => new Float32Array(readFileSync(path).buffer.slice(44));

test("the WAV header says 32-bit float stereo at the rate, with the data's length", () => {
  const h = wavHeader(1000, 48000);
  expect(h.toString("ascii", 0, 4)).toBe("RIFF");
  expect(h.readUInt16LE(20)).toBe(3);
  expect(h.readUInt16LE(22)).toBe(2);
  expect(h.readUInt32LE(24)).toBe(48000);
  expect(h.readUInt32LE(40)).toBe(8000);
  expect(h.readUInt32LE(4)).toBe(8036);
});

describe.skipIf(!process.env.MOCKINGBIRD_INTEGRATION)("renderMusic (integration)", () => {
  const params = { duration: 25, sampleRate: 48000, seed: 1 };

  test("every sample comes back in place, across the chunks it's read in", async () => {
    // A 1 Hz ramp on the left and its negative on the right: a sample's value says where it is.
    const path = generator(
      "ramp.js",
      `export default (ctx) => {
        const b = ctx.createBuffer(2, ctx.length, ctx.sampleRate);
        const l = b.getChannelData(0), r = b.getChannelData(1);
        for (let i = 0; i < ctx.length; i++) { l[i] = (i % ctx.sampleRate) / ctx.sampleRate; r[i] = -l[i]; }
        const s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0);
      };`,
    );
    const out = join(dir, "ramp.wav");
    await renderMusic(path, { chrome: chrome(), out, params });
    const got = samples(out);
    expect(got.length).toBe(25 * 48000 * 2);
    for (const frame of [0, 479_999, 480_000, 480_001, 1_000_123, 25 * 48000 - 1]) {
      const want = (frame % 48000) / 48000;
      expect(got[2 * frame]).toBeCloseTo(want, 6);
      expect(got[2 * frame + 1]).toBeCloseTo(-want, 6);
    }
  }, 60_000);

  test("Math.random is seeded: one seed makes one track, another seed another", async () => {
    const path = generator(
      "noise.js",
      `export default (ctx) => {
        const b = ctx.createBuffer(1, ctx.length, ctx.sampleRate);
        const d = b.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        const s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0);
      };`,
    );
    const short = { ...params, duration: 2 };
    const make = async (name: string, seed: number) => {
      const out = join(dir, name);
      await renderMusic(path, { chrome: chrome(), out, params: { ...short, seed } });
      return readFileSync(out);
    };
    const [a, b, c] = [await make("a.wav", 7), await make("b.wav", 7), await make("c.wav", 8)];
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  }, 60_000);

  test("a generator without a default export, or one that throws, says why", async () => {
    const none = generator("none.js", "export const x = 1;");
    await expect(
      renderMusic(none, { chrome: chrome(), out: join(dir, "none.wav"), params }),
    ).rejects.toThrow("export default function (ctx, params)");
    const bad = generator("bad.js", "export default () => { throw new Error('no key'); };");
    await expect(
      renderMusic(bad, { chrome: chrome(), out: join(dir, "bad.wav"), params }),
    ).rejects.toThrow("no key");
  }, 60_000);
});
