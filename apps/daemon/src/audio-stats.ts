import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  bandShare,
  beat,
  decodeWithFfmpeg,
  levelOf,
  noiseFloor,
  sections,
} from "@mockingbird/audio";
import { detectSpeech, SileroVad } from "@mockingbird/vad";
import { mockingbirdHome, requireFile } from "./runtime.ts";

/** Seconds as m:ss.s, or with `places` decimals, for times an agent cuts on. */
const time = (s: number, places = 1) =>
  `${Math.floor(s / 60)}:${(s % 60).toFixed(places).padStart(3 + places, "0")}`;

const db = (v: number, unit = "dBFS") =>
  Number.isFinite(v) ? `${v.toFixed(1)} ${unit}` : "silent";

/** ebur128's summary of `path` from `from` to `to`: loudness, range, sample and true peak. */
async function ebur128(path: string, from?: number, to?: number) {
  const proc = Bun.spawn(
    [
      ...["ffmpeg", "-nostdin", "-nostats"],
      ...(from ? ["-ss", String(from)] : []),
      ...(to !== undefined ? ["-to", String(to)] : []),
      ...["-i", path, "-map", "0:a:0", "-af", "ebur128=peak=sample+true:framelog=quiet"],
      ...["-f", "null", "-"],
    ],
    { stderr: "pipe" },
  );
  const said = await new Response(proc.stderr).text();
  if ((await proc.exited) !== 0) {
    const why = said.trim().split("\n").at(-1);
    throw new Error(`ffmpeg couldn't measure ${path}: ${why}`);
  }
  // The summary is at the end; each figure's last match is the summary's.
  const last = (re: RegExp) => {
    const v = [...said.matchAll(re)].at(-1)?.[1];
    return v === undefined || v === "-inf" ? -Infinity : Number(v);
  };
  const summary = said.slice(said.lastIndexOf("Summary:"));
  const peaks = [...summary.matchAll(/Peak:\s+(-?[\d.]+|-inf) dBFS/g)].map((m) =>
    m[1] === "-inf" ? -Infinity : Number(m[1]),
  );
  return {
    integrated: last(/^\s*I:\s+(-?[\d.]+|-inf) LUFS/gm),
    range: last(/^\s*LRA:\s+(-?[\d.]+|-inf) LU/gm),
    samplePeak: peaks[0] ?? -Infinity,
    truePeak: peaks[1] ?? -Infinity,
  };
}

/**
 * What a file's sound measures, for an agent that can't listen: loudness,
 * peaks, noise floor; with speech, how far under the voice the rest sits
 * and how much of the speech band it fills; and the beat and the sections,
 * to cut on. From `from` to `to` seconds, or all of it.
 */
export async function audioStats(
  path: string,
  { from, to }: { from?: number; to?: number } = {},
  home = mockingbirdHome(),
): Promise<string> {
  requireFile(path, "File");
  const start = from ?? 0;
  const [levels, audio] = await Promise.all([
    ebur128(path, from, to),
    decodeWithFfmpeg(path, { from, to }),
  ]);
  if (!audio.samples.length) throw new Error(`${path} has no sound there.`);
  const seconds = audio.samples.length / audio.sampleRate;
  const lines = [
    `${path}, ${time(start)} to ${time(start + seconds)}`,
    `loudness: ${db(levels.integrated, "LUFS")} integrated, range ${db(levels.range, "LU")}, true peak ${db(levels.truePeak, "dBTP")}${levels.truePeak > -1 ? " (over -1: a platform's encoder may clip it)" : ""}`,
    `sample peak: ${db(levels.samplePeak)}${levels.samplePeak >= -0.01 ? ", at full scale: probably clipped" : ""}`,
    `noise floor: ${Number.isFinite(noiseFloor(audio)) ? `${db(noiseFloor(audio))} (the quietest tenth; under -60 is clean)` : "digital silence in the quietest tenth"}`,
  ];

  // Speech and the gaps between it, if the VAD model is there.
  let spoken = 0;
  const model = join(home, "models", "silero_vad.onnx");
  if (existsSync(model)) {
    const vad = await SileroVad.load(model);
    let speech: [number, number][];
    try {
      // Padded segments can overlap; merged, no sample counts twice.
      speech = [];
      for (const { startSample: a, endSample: b } of await detectSpeech(vad, audio)) {
        const last = speech.at(-1);
        if (last && a <= last[1]) last[1] = Math.max(last[1], b);
        else speech.push([a, Math.min(b, audio.samples.length)]);
      }
    } finally {
      await vad.close();
    }
    const gap = Math.round(0.4 * audio.sampleRate);
    const gaps: [number, number][] = [];
    let after = 0;
    const end: [number, number] = [audio.samples.length, audio.samples.length];
    for (const [a, b] of [...speech, end]) {
      if (a - after >= gap) gaps.push([after, a]);
      after = Math.max(after, b);
    }
    spoken = speech.reduce((n, [a, b]) => n + b - a, 0) / audio.samples.length;
    if (!speech.length) {
      lines.push("speech: none");
    } else {
      const voice = levelOf(audio, speech);
      const between = levelOf(audio, gaps);
      lines.push(`speech: ${Math.round(spoken * 100)}% of it, at ${db(voice)}`);
      if (gaps.length) {
        const under = voice - between;
        lines.push(
          `between phrases: ${db(between)}, ${Number.isFinite(under) ? `${under.toFixed(1)} dB` : "far"} under the voice (music under speech: aim for 18 to 24; ducking lowers it further under words)`,
        );
        lines.push(
          `1 to 4 kHz between phrases: ${Math.round(bandShare(audio, { spans: gaps }) * 100)}% of the energy (the band speech needs; music that fills it covers words)`,
        );
      }
    }
  } else {
    lines.push("speech: not measured, the VAD model is missing (`mockingbird models pull`)");
  }

  const found = beat(audio);
  lines.push(
    found.strength >= 0.3
      ? `beat: ${found.bpm.toFixed(1)} BPM, one every ${(60 / found.bpm).toFixed(3)} s from ${time(start + found.first, 2)} (steadiness ${found.strength.toFixed(2)})`
      : `beat: no steady beat (steadiness ${found.strength.toFixed(2)})`,
  );
  // Mostly speech, the level moves with the speaker, not with any music under it.
  const changes = spoken < 0.5 ? sections(audio) : undefined;
  lines.push(
    `sections: ${!changes ? "not measured, it's mostly speech (measure the music file itself)" : changes.length ? changes.map((t) => time(start + t)).join(", ") : "none, the energy doesn't change for long"}`,
  );
  return lines.join("\n");
}
