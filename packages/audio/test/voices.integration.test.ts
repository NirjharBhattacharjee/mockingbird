import { describe, expect, spyOn, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditionVoice, encodeWav, readWavFile } from "../src/index.ts";

function mockSay(audio: Uint8Array) {
  const platform = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
  const spawn = Bun.spawn.bind(Bun);
  const spy = spyOn(Bun, "spawn").mockImplementation(((args: string[]) => {
    if (args[0] === "ffmpeg") return spawn(args, { stdout: "pipe", stderr: "pipe" });
    const listing = args[2] === "?";
    if (!listing) writeFileSync(args[args.indexOf("-o") + 1] as string, audio);
    return {
      stdout: new Response(listing ? "Voice One en_AU # Hello" : "").body,
      stderr: new Response("").body,
      exited: Promise.resolve(0),
    } as unknown as ReturnType<typeof Bun.spawn>;
  }) as typeof Bun.spawn);
  return () => {
    spy.mockRestore();
    if (platform) Object.defineProperty(process, "platform", platform);
  };
}

describe.skipIf(!process.env.MOCKINGBIRD_INTEGRATION)("voice audition with ffmpeg", () => {
  test("rejects a successful speech command that produces no audio", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mockingbird-voice-empty-"));
    const out = join(dir, "audition.wav");
    const restore = mockSay(encodeWav({ sampleRate: 16000, samples: new Int16Array(0) }));
    try {
      await expect(auditionVoice({ voice: "Voice One", text: "Hello", out })).rejects.toThrow(
        "Local voice synthesis produced no audio",
      );
      expect(existsSync(out)).toBe(false);
      expect(readdirSync(dir)).toEqual([]);
    } finally {
      restore();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("publishes a playable 48 kHz WAV after encoding succeeds", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mockingbird-voice-encoded-"));
    const out = join(dir, "audition.wav");
    const restore = mockSay(
      readFileSync(join(import.meta.dir, "../../../bench/fixtures/hello.wav")),
    );
    try {
      await auditionVoice({ voice: "Voice One", text: "Hello", out });
      const audio = await readWavFile(out);
      expect(audio.sampleRate).toBe(48000);
      expect(audio.samples.length).toBeGreaterThan(48000);
      expect(readdirSync(dir)).toEqual(["audition.wav"]);
    } finally {
      restore();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
