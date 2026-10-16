import { existsSync, mkdirSync, readdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { type Encoder, type SystemAudio, startEncoder, startSystemAudio } from "@mockingbird/audio";
import type { Cue } from "@mockingbird/cue";
import { tellDaemon } from "./dictionary.ts";

/** Written under this suffix while it runs, so a file without it is complete. */
const PART = ".part";
const HOUR = 3_600_000;
/** A reminder sound this often while a recording runs: otherwise only macOS's orange dot shows it. */
const REMINDER_MS = 30 * 60_000;

/** `2026-10-15-1430.m4a` for a recording started at 14:30 that day, local time. */
export function recordingName(at: Date): string {
  const two = (n: number) => String(n).padStart(2, "0");
  const date = `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())}`;
  return `${date}-${two(at.getHours())}${two(at.getMinutes())}.m4a`;
}

/** How long a recording may run, from MOCKINGBIRD_RECORD_MAX_HOURS (default 3). */
export function maxRecordingMs(env = process.env): number {
  const hours = Number(env.MOCKINGBIRD_RECORD_MAX_HOURS);
  return Number.isFinite(hours) && hours > 0 ? hours * HOUR : 3 * HOUR;
}

/**
 * Recordings kept on purpose, in `<home>/recordings` (0700): one at a time,
 * the microphone fed the same samples dictation reads, so dictating during one
 * cuts no gap, mixed with system audio when the tap works (#94). Each stops
 * when asked, after `maxMs`, when ffmpeg exits (the disk filled, say), or when
 * mockingbird stops. A crash leaves a `.part` file that still plays; the next
 * start finishes it.
 */
type Running = {
  path: string;
  encoder: Encoder;
  system?: SystemAudio;
  timer: Timer;
  reminder: Timer;
};

export class Recordings {
  private current: Running | undefined;
  private starting: Promise<string> | undefined;
  private saving: Promise<string | undefined> | undefined;
  readonly dir: string;

  constructor(
    home: string,
    private readonly options: {
      log: (message: string) => void;
      cue: Cue;
      maxMs?: number;
      encode?: (path: string, systemDevice?: string) => Encoder;
      /** The other side of a call; undefined records the microphone only. */
      systemAudio?: () => Promise<SystemAudio | undefined>;
      now?: () => Date;
    },
  ) {
    this.dir = join(home, "recordings");
  }

  /** Where the running recording will be once it stops. */
  get active(): string | undefined {
    return this.current?.path;
  }

  /** Starts a recording, or returns the one already running or starting. */
  start(): Promise<string> {
    if (this.current) return Promise.resolve(this.current.path);
    this.starting ??= this.begin().finally(() => {
      this.starting = undefined;
    });
    return this.starting;
  }

  private async begin(): Promise<string> {
    const system = await (this.options.systemAudio ?? (() => startSystemAudio(this.options.log)))();
    mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    const name = recordingName((this.options.now ?? (() => new Date()))());
    let path = join(this.dir, name);
    // Two in the same minute: 2026-10-15-1430-2.m4a.
    for (let n = 2; existsSync(path) || existsSync(path + PART); n++) {
      path = join(this.dir, name.replace(/\.m4a$/, `-${n}.m4a`));
    }
    const encode =
      this.options.encode ?? ((p, systemDevice) => startEncoder({ path: p, systemDevice }));
    const encoder = encode(path + PART, system?.device);
    const maxMs = this.options.maxMs ?? maxRecordingMs();
    const timer = setTimeout(
      () => void this.stop(`it reached the ${maxMs / HOUR}-hour limit`),
      maxMs,
    );
    const reminder = setInterval(() => this.options.cue("record-start"), REMINDER_MS);
    this.current = { path, encoder, system, timer, reminder };
    void encoder.exited.then((code) => {
      if (this.current?.encoder === encoder) void this.stop(`ffmpeg exited with ${code}`);
    });
    this.options.cue("record-start");
    this.options.log(`recording to ${path}${system ? ", with system audio" : ""}`);
    return path;
  }

  push(samples: Int16Array): void {
    this.current?.encoder.write(samples);
  }

  /**
   * Stops the running recording and returns its file, or undefined if none was
   * running. A stop that comes while one is saving (the time limit firing as
   * the user stops, say) gets that save's file too.
   */
  stop(why?: string): Promise<string | undefined> {
    const current = this.current;
    if (!current) return this.saving ?? Promise.resolve(undefined);
    this.current = undefined;
    clearTimeout(current.timer);
    clearInterval(current.reminder);
    const saving = this.save(current, why).finally(() => {
      if (this.saving === saving) this.saving = undefined;
    });
    this.saving = saving;
    return saving;
  }

  private async save(current: Running, why?: string): Promise<string | undefined> {
    const code = await current.encoder.finish();
    await current.system?.close();
    this.options.cue("record-stop");
    try {
      renameSync(current.path + PART, current.path);
    } catch {
      this.options.log(`recording failed: ffmpeg wrote nothing (exit ${code})`);
      return undefined;
    }
    this.options.log(`recording saved: ${current.path}${why ? ` (stopped: ${why})` : ""}`);
    return current.path;
  }

  /** Finishes recordings a crash left as `.part`: each plays up to where it was cut off. */
  finishLeftovers(): void {
    let names: string[];
    try {
      names = readdirSync(this.dir);
    } catch {
      return; // No recordings yet.
    }
    for (const name of names.filter((n) => n.endsWith(`.m4a${PART}`))) {
      const path = join(this.dir, name.slice(0, -PART.length));
      renameSync(join(this.dir, name), path);
      this.options.log(`recording saved: ${path} (it was cut off when mockingbird last stopped)`);
    }
  }
}

/** `mockingbird record [stop]`: asks the running agent, which owns the microphone. */
export async function recordCommand(args: string[], home?: string): Promise<number> {
  const [command = "start"] = args;
  if (command !== "start" && command !== "stop") {
    console.error(
      "Usage: mockingbird record        start recording the microphone and system audio\n" +
        "       mockingbird record stop   stop, and print where the file is",
    );
    return command === "-h" || command === "--help" ? 0 : 2;
  }
  let response: Response;
  try {
    response = await tellDaemon(`/record/${command}`, "", home);
  } catch {
    console.error("mockingbird isn't running. Start it with `mockingbird start`, then try again.");
    return 1;
  }
  const reply = await response.text();
  if (!response.ok) {
    console.error(`error: ${reply}`);
    return 1;
  }
  console.log(
    command === "start"
      ? `recording to ${reply}\nStop it with \`mockingbird record stop\`. Only record people who agreed to it.`
      : reply,
  );
  return 0;
}

/** The running recording's file, or null when there's none or no agent to ask. */
export const activeRecording = (home?: string): Promise<string | null> =>
  tellDaemon("/record", undefined, home)
    // An agent from before recordings answers 404.
    .then((r) => (r.ok ? r.text() : ""))
    .then((path) => path || null)
    .catch(() => null);
