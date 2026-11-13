import { constants, copyFileSync, existsSync, linkSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export type Voice = { name: string; language: string; accent: string; sample: string };
export type VoiceFilters = { language?: string; accent?: string };
export type VoiceAudition = { voice: string; text: string; out: string; rate?: number };
export type VoiceAuditionResult = {
  out: string;
  voice: Voice;
  rate: number;
  source: "local macOS say";
};

type Publisher = {
  link: (source: string, destination: string) => void;
  copy: (source: string, destination: string) => void;
};

const defaultPublisher: Publisher = {
  link: linkSync,
  copy: (source, destination) => copyFileSync(source, destination, constants.COPYFILE_EXCL),
};

function codeOf(error: unknown) {
  return error instanceof Error && "code" in error ? error.code : undefined;
}

export function publishVoiceWav(wav: string, out: string, publisher = defaultPublisher) {
  try {
    publisher.link(wav, out);
    return;
  } catch (error) {
    if (codeOf(error) === "EEXIST") throw new Error("Output already exists; choose a new path");
    if (!["EPERM", "EOPNOTSUPP", "ENOTSUP", "EXDEV"].includes(String(codeOf(error)))) throw error;
  }
  try {
    publisher.copy(wav, out);
  } catch (error) {
    if (codeOf(error) === "EEXIST") throw new Error("Output already exists; choose a new path");
    throw error;
  }
}

export function parseVoices(text: string): Voice[] {
  return text.split("\n").flatMap((line) => {
    const m = /^(.+?)\s+([a-z]{2,3}_[A-Z]{2})\s+#\s*(.*)$/.exec(line);
    return m
      ? [
          {
            name: (m[1] ?? "").trim(),
            language: m[2] ?? "",
            accent: (m[2] ?? "").split("_")[1] ?? "",
            sample: m[3] ?? "",
          },
        ]
      : [];
  });
}

export function filterVoices(voices: readonly Voice[], { language, accent }: VoiceFilters = {}) {
  return voices.filter(
    (v) =>
      (!language ||
        v.language.toLowerCase() === language.toLowerCase() ||
        v.language.split("_")[0] === language.toLowerCase()) &&
      (!accent || v.accent === accent.toUpperCase()),
  );
}

async function command(args: string[]) {
  const p = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
  const [out, error] = await Promise.all([
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
  ]);
  if (await p.exited) throw new Error(`${args[0]} failed: ${error.trim()}`);
  return out;
}

export async function installedVoices(): Promise<Voice[]> {
  if (process.platform !== "darwin")
    throw new Error(
      "Local voice discovery currently needs macOS say. Other tools remain available.",
    );
  return parseVoices(await command(["/usr/bin/say", "-v", "?"]));
}

export async function auditionVoice(request: VoiceAudition): Promise<VoiceAuditionResult> {
  const { text, voice: name } = request;
  if (!text.trim() || text.length > 5000)
    throw new Error("Give voice, text (1–5000 characters), and an output .wav path");
  const out = resolve(request.out);
  if (!out.toLowerCase().endsWith(".wav")) throw new Error("out must end with .wav");
  if (existsSync(out)) throw new Error("Output already exists; choose a new path");
  if (!existsSync(dirname(out))) throw new Error("Output folder does not exist");
  const rate = request.rate ?? 175;
  if (typeof rate !== "number" || !Number.isInteger(rate) || rate < 80 || rate > 350)
    throw new Error("rate must be 80–350 words per minute");
  const voice = (await installedVoices()).find((v) => v.name === name);
  if (!voice) throw new Error("Voice is not installed; use voice_list. No voice was downloaded.");

  const dir = mkdtempSync(join(dirname(out), ".mockingbird-voice-"));
  try {
    const audio = join(dir, "speech.aiff");
    const wav = join(dir, "audition.wav");
    await command(["/usr/bin/say", "-v", voice.name, "-r", String(rate), "-o", audio, "--", text]);
    try {
      await command([
        "ffmpeg",
        "-nostdin",
        "-v",
        "error",
        "-abort_on",
        "empty_output",
        "-n",
        "-i",
        audio,
        "-ar",
        "48000",
        "-c:a",
        "pcm_s16le",
        wav,
      ]);
    } catch (error) {
      if (error instanceof Error && error.message.includes("Output file is empty"))
        throw new Error(`Local voice synthesis produced no audio. ${error.message}`);
      throw error;
    }
    publishVoiceWav(wav, out);
    return { out, voice, rate, source: "local macOS say" };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
