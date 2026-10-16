import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Encoder, encoderArgs, startEncoder } from "@mockingbird/audio";
import { Recordings, recordingName } from "../src/recordings.ts";

/** No system audio: tests never open a real tap. */
const micOnly = async () => undefined;

/** Writes what it's given to the file, and exits when told to or when `die` is called. */
function fakeEncoder(path: string): Encoder & { die(code: number): void } {
  let exit: (code: number) => void = () => {};
  const exited = new Promise<number>((r) => {
    exit = r;
  });
  writeFileSync(path, "");
  return {
    write: (samples) => writeFileSync(path, Buffer.from(samples.buffer), { flag: "a" }),
    finish: async () => {
      exit(0);
      return exited;
    },
    exited,
    die: exit,
  };
}

test("a recording is a .part file until it stops, then the name it said", async () => {
  const home = mkdtempSync(join(tmpdir(), "mb-rec-"));
  const sounds: string[] = [];
  const encoders: ReturnType<typeof fakeEncoder>[] = [];
  const recordings = new Recordings(home, {
    log: () => {},
    cue: (k) => sounds.push(k),
    now: () => new Date(2026, 9, 15, 14, 30),
    encode: (p) => {
      encoders.push(fakeEncoder(p));
      return encoders.at(-1) as Encoder;
    },
    systemAudio: micOnly,
  });
  // Two starts at once share one recording.
  const [path, again] = await Promise.all([recordings.start(), recordings.start()]);
  expect(path).toBe(join(home, "recordings", "2026-10-15-1430.m4a"));
  expect(again).toBe(path);
  expect(await recordings.start()).toBe(path); // one at a time
  expect(statSync(join(home, "recordings")).mode & 0o777).toBe(0o700);
  recordings.push(new Int16Array([1, 2, 3]));
  expect(existsSync(`${path}.part`)).toBe(true);
  // Two stops at once (the limit firing as the user stops): both get the file.
  expect(await Promise.all([recordings.stop(), recordings.stop()])).toEqual([path, path]);
  expect(statSync(path).size).toBe(6);
  expect(await recordings.stop()).toBeUndefined();

  // A second one that minute gets its own name, and ffmpeg dying ends it.
  const second = await recordings.start();
  expect(second).toEndWith("2026-10-15-1430-2.m4a");
  encoders.at(-1)?.die(1);
  await Bun.sleep(10);
  expect(recordings.active).toBeUndefined();
  expect(existsSync(second)).toBe(true);
  expect(sounds).toEqual(["record-start", "record-stop", "record-start", "record-stop"]);

  // A crash's leftover is finished on the next start.
  writeFileSync(join(home, "recordings", "2026-10-14-0900.m4a.part"), "x");
  recordings.finishLeftovers();
  expect(readdirSync(join(home, "recordings")).sort()).toEqual([
    "2026-10-14-0900.m4a",
    "2026-10-15-1430-2.m4a",
    "2026-10-15-1430.m4a",
  ]);
});

test("a recording stops by itself at its limit", async () => {
  const home = mkdtempSync(join(tmpdir(), "mb-rec-"));
  const recordings = new Recordings(home, {
    log: () => {},
    cue: () => {},
    maxMs: 20,
    encode: fakeEncoder,
    systemAudio: micOnly,
  });
  const path = await recordings.start();
  await Bun.sleep(60);
  expect(recordings.active).toBeUndefined();
  expect(existsSync(path)).toBe(true);
});

test("system audio goes to the encoder, and its tap closes once the file is saved", async () => {
  const home = mkdtempSync(join(tmpdir(), "mb-rec-"));
  const events: string[] = [];
  const recordings = new Recordings(home, {
    log: () => {},
    cue: () => {},
    encode: (p, systemDevice) => {
      events.push(`encode with ${systemDevice}`);
      const encoder = fakeEncoder(p);
      return {
        ...encoder,
        finish: () => {
          events.push("encoder finished");
          return encoder.finish();
        },
      };
    },
    systemAudio: async () => ({
      device: "tap 1",
      close: async () => void events.push("tap closed"),
    }),
  });
  await recordings.start();
  await recordings.stop();
  expect(events).toEqual(["encode with tap 1", "encoder finished", "tap closed"]);
});

test("a stop while the tap is still starting stops that recording, not nothing", async () => {
  const home = mkdtempSync(join(tmpdir(), "mb-rec-"));
  let tapReady: () => void = () => {};
  let closed = false;
  const recordings = new Recordings(home, {
    log: () => {},
    cue: () => {},
    encode: fakeEncoder,
    systemAudio: () =>
      new Promise((resolve) => {
        tapReady = () =>
          resolve({
            device: "tap 1",
            close: async () => {
              closed = true;
            },
          });
      }),
  });
  const starting = recordings.start();
  const stopping = recordings.stop("mockingbird is stopping");
  tapReady();
  const path = await starting;
  expect(await stopping).toBe(path);
  expect(recordings.active).toBeUndefined();
  expect(closed).toBe(true);
});

test("the encoder mixes the system device into the microphone, at full level", () => {
  const args = encoderArgs({
    path: "x.m4a",
    sampleRate: 16000,
    ffmpeg: "ffmpeg",
    systemDevice: "tap 1",
  });
  expect(args).toContain(":tap 1");
  expect(args.join(" ")).toContain("amix=inputs=2:duration=first:normalize=0");
  // Without one, the microphone alone, as before.
  expect(encoderArgs({ path: "x.m4a", sampleRate: 16000, ffmpeg: "ffmpeg" })).not.toContain(
    "-filter_complex",
  );
});

test("names are local time, to the minute", () => {
  expect(recordingName(new Date(2026, 0, 5, 9, 7, 59))).toBe("2026-01-05-0907.m4a");
});

test.skipIf(!Bun.which("ffmpeg"))(
  "the real encoder's file plays even when ffmpeg is killed",
  async () => {
    const path = join(mkdtempSync(join(tmpdir(), "mb-enc-")), "a.m4a");
    const encoder = startEncoder({ path });
    const second = new Int16Array(16000).map((_, i) => Math.round(8000 * Math.sin(i / 5)));
    for (let s = 0; s < 5; s++) {
      encoder.write(second);
      await Bun.sleep(50);
    }
    await Bun.sleep(500);
    Bun.spawnSync(["pkill", "-9", "-f", path]);
    await encoder.exited;
    const probe = Bun.spawnSync([
      "ffprobe",
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "csv=p=0",
      path,
    ]);
    expect(Number(probe.stdout.toString())).toBeGreaterThan(1);
  },
);

test("a stalled ffmpeg is killed rather than holding up a stop", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mb-enc-"));
  // Ignores its input and never exits on its own.
  const stalled = join(dir, "ffmpeg");
  writeFileSync(stalled, "#!/bin/sh\nexec sleep 60\n", { mode: 0o755 });
  const encoder = startEncoder({ path: join(dir, "a.m4a"), ffmpeg: stalled });
  const t = performance.now();
  await encoder.finish(200);
  expect(performance.now() - t).toBeLessThan(2000);
});
