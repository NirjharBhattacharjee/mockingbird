/**
 * `mockingbird record <file>` (#142): the mic, through ffmpeg, into a file,
 * for "audio in, video out": a voiceover an agent builds a video around.
 * macOS asks for the microphone once, for the terminal it runs in. There's
 * no background agent and no system audio.
 */
import { existsSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { UsageError } from "./transcribe.ts";

export const RECORD_USAGE = `Usage: mockingbird record <file> [--for <seconds>] [--device <index or name>]
       mockingbird record --devices

Records the microphone into <file> until you press Enter or Ctrl-C, for a
voiceover your agent can build a video around. .wav is 48 kHz mono; .m4a is
AAC. It never overwrites a file. macOS asks once whether the terminal may use
the microphone.

Options:
  --for <seconds>   stop after this long, for when no one's at a keyboard
  --device <d>      an input from --devices (default: the one System
                    Settings → Sound picked)
  --devices         list the inputs
  -h, --help        show this help`;

/** The codec options for `out`, from its extension: mono, as a voice is. */
export function codecFor(out: string): string[] {
  switch (extname(out).toLowerCase()) {
    case ".wav":
      return ["-ac", "1", "-ar", "48000", "-c:a", "pcm_s16le"];
    case ".m4a":
    case ".aac":
      return ["-ac", "1", "-c:a", "aac", "-b:a", "192k"];
    default:
      return ["-ac", "1"];
  }
}

/** The inputs in `ffmpeg -f avfoundation -list_devices true`'s output, after its "audio devices" line. */
export function parseDevices(listing: string): { index: number; name: string }[] {
  const audio = listing.split(/AVFoundation audio devices:/)[1] ?? "";
  return [...audio.matchAll(/\[(\d+)\] (.+)$/gm)].map((m) => ({
    index: Number(m[1]),
    name: (m[2] ?? "").trim(),
  }));
}

/** The loudest sample in `file`, in dB; -Infinity for silence. */
async function loudest(file: string): Promise<number> {
  const proc = Bun.spawn(
    ["ffmpeg", "-nostdin", "-hide_banner", "-i", file, "-af", "volumedetect", "-f", "null", "-"],
    { stderr: "pipe" },
  );
  const said = await new Response(proc.stderr).text();
  await proc.exited;
  const found = said.match(/max_volume:\s*(-?[\d.]+|-inf) dB/)?.[1];
  return found === undefined || found === "-inf" ? -Infinity : Number(found);
}

export type RecordDeps = {
  /** ffmpeg's input arguments; the mic unless a test gives another. */
  input?: (device: string) => string[];
  /** Resolves when the person asks to stop (Enter). */
  enter?: () => Promise<void>;
  log?: (line: string) => void;
  platform?: string;
};

/** The first line typed on stdin, or never, if it isn't a terminal. */
async function firstLine(): Promise<void> {
  if (!process.stdin.isTTY) return new Promise(() => {});
  for await (const _ of Bun.stdin.stream()) return;
}

export async function main(argv: string[], deps: RecordDeps = {}): Promise<number> {
  const log = deps.log ?? ((line: string) => console.error(line));
  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse(argv);
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }
  const { values, positionals } = parsed;
  if (values.help) {
    console.log(RECORD_USAGE);
    return 0;
  }
  if ((deps.platform ?? process.platform) !== "darwin" && !deps.input) {
    log("mockingbird record needs macOS for now; Linux and Windows come with the ports (#134).");
    return 1;
  }
  if (values.devices) {
    const r = Bun.spawnSync([
      "ffmpeg",
      "-hide_banner",
      "-f",
      "avfoundation",
      "-list_devices",
      "true",
      "-i",
      "",
    ]);
    for (const d of parseDevices(r.stderr.toString())) console.log(`${d.index}  ${d.name}`);
    return 0;
  }
  if (positionals.length !== 1 || !positionals[0])
    throw new UsageError("expected one file to record into");
  const out = resolve(positionals[0]);
  if (existsSync(out)) throw new UsageError(`${out} already exists; give another name`);
  if (!existsSync(dirname(out))) throw new UsageError(`${dirname(out)} doesn't exist`);
  const length = values.for === undefined ? undefined : Number(values.for);
  if (length !== undefined && !(length > 0))
    throw new UsageError(`not a length in seconds: ${values.for}`);

  const device = values.device ?? "default";
  // avfoundation's "default" is the input System Settings picked, not device 0,
  // which on a Mac near an iPhone can be the phone's microphone.
  const input = (deps.input ?? ((d: string) => ["-f", "avfoundation", "-i", `:${d}`]))(device);
  const proc = Bun.spawn(
    [
      ...["ffmpeg", "-hide_banner", "-nostats", "-loglevel", "error", ...input],
      ...(length ? ["-t", String(length)] : []),
      ...codecFor(out),
      out,
    ],
    { stdin: "pipe", stderr: "pipe" },
  );
  log(
    `Recording to ${out}${length ? ` for ${length} s` : ""}. Press Enter${length ? " to stop early" : " to stop"}.`,
  );
  // Ctrl-C reaches ffmpeg too, which closes the file properly; this waits for it.
  const ignore = () => {};
  process.on("SIGINT", ignore);
  try {
    const stopped = (deps.enter ?? firstLine)().then(() => {
      // ffmpeg's own "quit" key: it finishes the file and exits.
      proc.stdin.write("q");
      proc.stdin.end();
    });
    const code = await proc.exited;
    void stopped;
    const why = (await new Response(proc.stderr).text()).trim();
    if (!existsSync(out)) {
      log(`ffmpeg couldn't record: ${why || `exit ${code}`}`);
      return 1;
    }
  } finally {
    process.off("SIGINT", ignore);
  }
  const probe = Bun.spawnSync([
    ...["ffprobe", "-v", "error", "-show_entries", "format=duration"],
    ...["-of", "csv=p=0", out],
  ]);
  log(`Saved ${out} (${Number(probe.stdout.toString()).toFixed(1)} s).`);
  if ((await loudest(out)) < -80) {
    log(
      "It's silent. If macOS didn't let this terminal use the microphone, allow it in System " +
        "Settings → Privacy & Security → Microphone, then record again. Or pick another input: --devices.",
    );
    return 1;
  }
  return 0;
}

const parse = (args: string[]) =>
  parseArgs({
    args,
    options: {
      for: { type: "string" },
      device: { type: "string" },
      devices: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });
