import { expect, spyOn, test } from "bun:test";
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { auditionVoice, filterVoices, installedVoices, parseVoices } from "../src/index.ts";
import { publishVoiceWav } from "../src/voices.ts";

const voiceList = "Voice One          en_AU    # Hello\nVoice Two          en_US    # Hi";

function mockVoiceCommands(encode: (path: string) => { error?: string }) {
  const platform = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
  const calls: string[][] = [];
  const result = (stdout = "", error = "") =>
    ({
      stdout: new Response(stdout).body,
      stderr: new Response(error).body,
      exited: Promise.resolve(error ? 1 : 0),
    }) as unknown as ReturnType<typeof Bun.spawn>;
  const spy = spyOn(Bun, "spawn").mockImplementation(((args: string[]) => {
    calls.push(args);
    if (args[0] === "/usr/bin/say" && args[2] === "?") return result(voiceList);
    if (args[0] === "/usr/bin/say") return result();
    if (args[0] !== "ffmpeg") throw new Error(`Unexpected command: ${args[0]}`);
    const { error } = encode(args.at(-1) as string);
    return result("", error);
  }) as typeof Bun.spawn);
  return {
    calls,
    restore() {
      spy.mockRestore();
      if (platform) Object.defineProperty(process, "platform", platform);
    },
  };
}

test("voice metadata preserves names and supports exact language and accent filters", () => {
  const voices = parseVoices(`${voiceList}\nOther fr_FR # Bonjour\ninvalid`);
  expect(voices[0]).toEqual({
    name: "Voice One",
    language: "en_AU",
    accent: "AU",
    sample: "Hello",
  });
  expect(filterVoices(voices, { language: "en", accent: "au" }).map((v) => v.name)).toEqual([
    "Voice One",
  ]);
  expect(filterVoices(voices, { language: "en_US" }).map((v) => v.name)).toEqual(["Voice Two"]);
  expect(filterVoices(voices, { language: "en", accent: "NZ" })).toEqual([]);
});

test("voice discovery fails without affecting other tools on unsupported systems", async () => {
  const platform = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", { value: "linux", configurable: true });
  try {
    await expect(installedVoices()).rejects.toThrow("Other tools remain available");
  } finally {
    if (platform) Object.defineProperty(process, "platform", platform);
  }
});

test("audition rejects invalid text, output and rate before speaking", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mockingbird-voice-validation-"));
  try {
    const base = { voice: "Voice One", text: "Hello", out: join(dir, "audition.wav") };
    await expect(auditionVoice({ ...base, text: "  " })).rejects.toThrow("Give voice");
    await expect(auditionVoice({ ...base, text: "a".repeat(5001) })).rejects.toThrow("5000");
    await expect(auditionVoice({ ...base, out: join(dir, "audition.mp3") })).rejects.toThrow(
      ".wav",
    );
    await expect(auditionVoice({ ...base, rate: 79 })).rejects.toThrow("80–350");
    await expect(auditionVoice({ ...base, rate: 350.5 })).rejects.toThrow("80–350");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("audition requires an exact installed voice name", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mockingbird-voice-match-"));
  const mock = mockVoiceCommands(() => {
    throw new Error("should not encode");
  });
  try {
    await expect(
      auditionVoice({ voice: "voice one", text: "Hello", out: join(dir, "audition.wav") }),
    ).rejects.toThrow("Voice is not installed");
    expect(mock.calls).toEqual([["/usr/bin/say", "-v", "?"]]);
    expect(readdirSync(dir)).toEqual([]);
  } finally {
    mock.restore();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an existing output is left untouched without starting speech", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mockingbird-voice-existing-"));
  const out = join(dir, "audition.wav");
  const mock = mockVoiceCommands(() => {
    throw new Error("should not encode");
  });
  try {
    writeFileSync(out, "existing file");
    await expect(auditionVoice({ voice: "Voice One", text: "Hello", out })).rejects.toThrow(
      "Output already exists",
    );
    expect(readFileSync(out, "utf8")).toBe("existing file");
    expect(mock.calls).toEqual([]);
  } finally {
    mock.restore();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a failed encode leaves no partial final WAV or owned temporary files", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mockingbird-voice-regression-"));
  const out = join(dir, "audition.wav");
  const mock = mockVoiceCommands((path) => {
    expect(dirname(dirname(path))).toBe(dir);
    writeFileSync(path, "partial WAV");
    return { error: "simulated encoder failure" };
  });
  try {
    writeFileSync(join(dir, "unrelated.txt"), "keep");
    await expect(auditionVoice({ voice: "Voice One", text: "Hello", out })).rejects.toThrow(
      "ffmpeg failed: simulated encoder failure",
    );
    expect(existsSync(out)).toBe(false);
    expect(readdirSync(dir)).toEqual(["unrelated.txt"]);
    expect(readFileSync(join(dir, "unrelated.txt"), "utf8")).toBe("keep");
  } finally {
    mock.restore();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("publication preserves a destination created during encoding", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mockingbird-voice-race-"));
  const out = join(dir, "audition.wav");
  const mock = mockVoiceCommands((path) => {
    writeFileSync(path, "complete WAV");
    writeFileSync(out, "other writer");
    return {};
  });
  try {
    await expect(auditionVoice({ voice: "Voice One", text: "Hello", out })).rejects.toThrow(
      "Output already exists",
    );
    expect(readFileSync(out, "utf8")).toBe("other writer");
    expect(readdirSync(dir)).toEqual(["audition.wav"]);
  } finally {
    mock.restore();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("publication falls back to an exclusive copy when hard links are unsupported", () => {
  const calls: string[][] = [];
  const unsupported = Object.assign(new Error("hard links are unsupported"), { code: "EPERM" });
  publishVoiceWav("source.wav", "audition.wav", {
    link: () => {
      throw unsupported;
    },
    copy: (source, destination) => calls.push([source, destination]),
  });
  expect(calls).toEqual([["source.wav", "audition.wav"]]);
});

test("fallback copy preserves a concurrently created destination", () => {
  const unsupported = Object.assign(new Error("hard links are unsupported"), {
    code: "EOPNOTSUPP",
  });
  const exists = Object.assign(new Error("exists"), { code: "EEXIST" });
  expect(() =>
    publishVoiceWav("source.wav", "audition.wav", {
      link: () => {
        throw unsupported;
      },
      copy: () => {
        throw exists;
      },
    }),
  ).toThrow("Output already exists");
});

test.skipIf(process.platform === "win32")(
  "a dangling destination symlink is not replaced",
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "mockingbird-voice-symlink-"));
    const out = join(dir, "audition.wav");
    const mock = mockVoiceCommands((path) => {
      writeFileSync(path, "complete WAV");
      return {};
    });
    try {
      symlinkSync("missing.wav", out);
      await expect(auditionVoice({ voice: "Voice One", text: "Hello", out })).rejects.toThrow(
        "Output already exists",
      );
      expect(lstatSync(out).isSymbolicLink()).toBe(true);
      expect(existsSync(join(dir, "missing.wav"))).toBe(false);
      expect(readdirSync(dir)).toEqual(["audition.wav"]);
    } finally {
      mock.restore();
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test("successful audition uses literal arguments and publishes complete encoded audio", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mockingbird-voice-success-"));
  const out = join(dir, "audition.wav");
  const text = "-- literal $(not a command); 'quoted'";
  const mock = mockVoiceCommands((path) => {
    writeFileSync(path, "complete WAV");
    return {};
  });
  try {
    const result = await auditionVoice({ voice: "Voice One", text, out, rate: 200 });
    expect(result).toEqual({
      out,
      voice: { name: "Voice One", language: "en_AU", accent: "AU", sample: "Hello" },
      rate: 200,
      source: "local macOS say",
    });
    expect(mock.calls[1]).toEqual([
      "/usr/bin/say",
      "-v",
      "Voice One",
      "-r",
      "200",
      "-o",
      expect.any(String),
      "--",
      text,
    ]);
    expect(mock.calls[2]).toContain("-n");
    expect(mock.calls[2]).toContain("empty_output");
    expect(mock.calls[2]).toContain("48000");
    expect(mock.calls[2]).toContain("pcm_s16le");
    expect(readFileSync(out, "utf8")).toBe("complete WAV");
    expect(readdirSync(dir)).toEqual(["audition.wav"]);
  } finally {
    mock.restore();
    rmSync(dir, { recursive: true, force: true });
  }
});
