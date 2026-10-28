import { existsSync } from "node:fs";
import { join } from "node:path";
import { type AsrEngine, startWhisperServer, wordDiff } from "@mockingbird/asr";
import { loudestWindowRms, type PcmAudio, peak, readWavFile } from "@mockingbird/audio";
import { openStore, type Take } from "@mockingbird/store";
import { detectSpeech, SileroVad } from "@mockingbird/vad";
import { ASR_MODEL_SETTING, tellDaemon, VAD_THRESHOLD_SETTING } from "./dictionary.ts";
import { listModels } from "./models.ts";
import { hear } from "./pipeline.ts";
import { mockingbirdHome } from "./runtime.ts";

/** detectSpeech's default first, then lower ones, for voices it hears too little of. */
export const THRESHOLDS = [0.5, 0.4, 0.3, 0.2];
/** A model this close to the best, in points of words right, counts as as good. */
const CLOSE_ENOUGH = 0.01;

export type ModelScore = {
  name: string;
  inUse: boolean;
  edits: number;
  words: number;
  /** Median time to transcribe one sentence, warm. */
  medianMs: number;
};

const rate = ({ edits, words }: { edits: number; words: number }) => (words ? edits / words : 1);

/** The fastest model within a point of the best for this voice. */
export function recommend(scores: ModelScore[]): ModelScore | undefined {
  const best = Math.min(...scores.map(rate));
  return scores
    .filter((s) => rate(s) <= best + CLOSE_ENOUGH)
    .sort((a, b) => a.medianMs - b.medianMs || Number(b.inUse) - Number(a.inUse))[0];
}

/**
 * The threshold to save, or undefined to keep the default. A lower one is
 * only worth it when it hears clearly more words: at least two, and at
 * least 1% of them. Otherwise it only lets in more of the room.
 */
export function pickThreshold(edits: Map<number, number>, words: number): number | undefined {
  const base = edits.get(THRESHOLDS[0] as number) ?? 0;
  let chosen: number | undefined;
  for (const t of THRESHOLDS.slice(1)) {
    const e = edits.get(t);
    if (e === undefined) continue;
    const gain = base - e;
    if (gain >= Math.max(2, Math.ceil(0.01 * words)) && e < (edits.get(chosen ?? -1) ?? base)) {
      chosen = t;
    }
  }
  return chosen;
}

const db = (x: number) => (x > 0 ? `${Math.round(20 * Math.log10(x))} dB` : "silence");

/** RMS of the quietest 200 ms: the room, between words. */
function quietestWindowRms({ samples, sampleRate }: PcmAudio): number {
  const size = Math.round(sampleRate / 5);
  let quietest = Number.POSITIVE_INFINITY;
  for (let start = 0; start + size <= samples.length; start += size) {
    let sum = 0;
    for (let i = start; i < start + size; i++) sum += (samples[i] ?? 0) ** 2;
    quietest = Math.min(quietest, Math.sqrt(sum / size) / 32768);
  }
  return Number.isFinite(quietest) ? quietest : 0;
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;

/**
 * What the takes say about the microphone: clipping, which can't be undone,
 * speech too quiet for normalizeLoudness to bring up (it stops at 20×), and
 * a room nearly as loud as the voice, which turning it up can't fix either.
 */
export function loudnessNotes(takes: PcmAudio[]): string[] {
  const level = median(takes.map((a) => loudestWindowRms(a)));
  const room = median(takes.map(quietestWindowRms));
  const apart = room > 0 ? 20 * Math.log10(level / room) : Number.POSITIVE_INFINITY;
  // peak is a fraction of full scale; one step short of it is the top.
  const clipped = takes.filter((a) => peak(a.samples) >= 32767 / 32768).length;
  const notes: string[] = [];
  if (clipped) {
    notes.push(
      `${clipped} of ${takes.length} sentences hit full scale, so they were cut off at the loudest. ` +
        "Turn the input volume down in System Settings → Sound → Input.",
    );
  }
  if (level < 0.006) {
    notes.push(
      `Your speech is very quiet (${db(level)}), quieter than mockingbird can turn up. ` +
        "Move closer to the microphone, or turn the input volume up.",
    );
  }
  // 14 dB apart still heard 98.7% of a test voice; 4 dB apart, 6%.
  if (apart < 10) {
    notes.push(
      `The room is nearly as loud as your voice (${Math.max(0, Math.round(apart))} dB apart). ` +
        "Move somewhere quieter, or closer to the microphone.",
    );
  }
  if (!notes.length) notes.push(`Fine: your speech peaks around ${db(level)}.`);
  return notes;
}

export type TuneDeps = {
  home?: string;
  out?: (line: string) => void;
  tell?: typeof tellDaemon;
  /** Starts a model's whisper-server; the real one by default. */
  whisper?: (modelPath: string) => Promise<{ engine: AsrEngine; stop: () => Promise<void> }>;
};

const pct = (s: { edits: number; words: number }) => `${(100 * (1 - rate(s))).toFixed(1)}% right`;

/**
 * `mockingbird calibrate tune`: the latest calibration run, heard again by
 * every installed Whisper model and at lower VAD thresholds. It recommends a
 * model (the user switches in `mockingbird models`; it never switches by
 * itself) and saves a threshold only when one measurably helps. Each model
 * gets its own whisper-server for the comparison, one at a time, beside the
 * agent's.
 */
export async function tuneCommand(deps: TuneDeps = {}): Promise<number> {
  const home = deps.home ?? mockingbirdHome();
  const out = deps.out ?? console.log;
  const path = join(home, "data.db");
  const store = existsSync(path) ? openStore(path, { readonly: true }) : undefined;
  let takes: Take[];
  let saved: string | undefined;
  let savedSpeech: string | undefined;
  try {
    const run = store?.calibrationRuns()[0]?.run;
    takes = run === undefined ? [] : (store?.takes(run) ?? []);
    saved = store?.setting(VAD_THRESHOLD_SETTING);
    savedSpeech = store?.setting(ASR_MODEL_SETTING);
  } finally {
    store?.close();
  }
  const wavs = takes
    .map((t) => ({ take: t, file: join(home, "calibration", `${t.run}-${t.sentence}.wav`) }))
    .filter(({ file }) => existsSync(file));
  if (!wavs.length) {
    out("No calibration to tune with yet. Run `mockingbird calibrate` first.");
    return 1;
  }
  const audio = await Promise.all(wavs.map(({ file }) => readWavFile(file)));
  const words = wavs.reduce((n, { take }) => n + take.words, 0);
  const when = new Date(wavs[0]?.take.run ?? 0).toLocaleString();
  out(`Your latest calibration: ${wavs.length} sentences, ${words} words, read ${when}.\n`);

  out("Loudness");
  for (const note of loudnessNotes(audio)) out(`  ${note}`);

  const models = join(home, "models");
  const listing = await listModels({
    restart: async () => 0,
    list: async () => [],
    modelsDir: models,
    savedSpeech: () => savedSpeech,
  });
  const vad = await SileroVad.load(join(models, "silero_vad.onnx"));
  const whisper =
    deps.whisper ??
    ((modelPath: string) =>
      startWhisperServer({
        modelPath,
        port: Number(process.env.MOCKINGBIRD_TUNE_PORT ?? 8795),
        readyTimeoutMs: 120_000,
      }));
  out(
    `\nTranscription models, each hearing your ${wavs.length} sentences (this takes a few minutes)`,
  );

  const scores: ModelScore[] = [];
  const byThreshold = new Map<number, number>();
  let inUseName: string | undefined;
  for (const model of listing.transcription) {
    let server: Awaited<ReturnType<typeof whisper>>;
    try {
      server = await whisper(join(models, model.file));
    } catch (error) {
      out(
        `  ${model.name.padEnd(22)} couldn't start: ${error instanceof Error ? error.message : error}`,
      );
      continue;
    }
    try {
      // Each clip's transcript, by where the speech starts and ends: two
      // thresholds that find the same span hear the same thing.
      const heard = new Map<string, string>();
      const score = async (threshold: number, times?: number[]) => {
        let edits = 0;
        for (const [i, { take }] of wavs.entries()) {
          let span = "";
          const result = await hear(audio[i] as PcmAudio, {
            detectSpeech: async (a) => {
              const segments = await detectSpeech(vad, a, { threshold });
              span = `${i}:${segments[0]?.startSample}-${segments.at(-1)?.endSample}`;
              return segments;
            },
            asr: {
              model: server.engine.model,
              health: () => server.engine.health(),
              transcribe: async (a, o) => {
                const known = heard.get(span);
                if (known !== undefined) return { text: known, confidence: 1, words: [] };
                const t = performance.now();
                const r = await server.engine.transcribe(a, o);
                times?.push(performance.now() - t);
                heard.set(span, r.text);
                return r;
              },
            },
          });
          edits += wordDiff(take.text, result.asr?.text ?? "").edits;
        }
        return edits;
      };
      const first = audio[0];
      if (first) await server.engine.transcribe(first); // warm
      const times: number[] = [];
      const edits = await score(THRESHOLDS[0] as number, times);
      times.sort((a, b) => a - b);
      const s = {
        name: model.name,
        inUse: model.inUse,
        edits,
        words,
        medianMs: times[Math.floor(times.length / 2)] ?? 0,
      };
      scores.push(s);
      out(
        `  ${model.name.padEnd(22)} ${pct(s).padStart(12)}   ${(s.medianMs / 1000).toFixed(1)} s a sentence${model.inUse ? "   ● in use" : ""}`,
      );
      if (model.inUse) {
        inUseName = model.name;
        byThreshold.set(THRESHOLDS[0] as number, edits);
        for (const t of THRESHOLDS.slice(1)) byThreshold.set(t, await score(t));
      }
    } finally {
      // Always, so a failing model doesn't leave a server on the port for the next.
      await server.stop();
    }
  }
  await vad.close();

  const pick = recommend(scores);
  if (pick?.inUse) {
    out(`→ ${pick.name}, the one in use, is already the best choice for your voice.`);
  } else if (pick) {
    out(
      `→ ${pick.name} is the fastest within a point of the best for your voice. ` +
        "Switch to it with `mockingbird models`.",
    );
  }

  if (!inUseName) return 0;
  out(`\nSpeech detection, with ${inUseName}`);
  for (const t of THRESHOLDS) {
    const e = byThreshold.get(t) ?? 0;
    out(
      `  threshold ${t}${t === THRESHOLDS[0] ? " (default)" : "          "} ${pct({ edits: e, words })}`,
    );
  }
  const threshold = pickThreshold(byThreshold, words);
  const value = threshold === undefined ? "" : String(threshold);
  if (value === (saved ?? "")) {
    out(
      threshold === undefined
        ? "→ The default hears all it can of your voice; nothing to change."
        : `→ ${threshold} is still the best for your voice, and already saved.`,
    );
    return 0;
  }
  try {
    const response = await (deps.tell ?? tellDaemon)(
      `/settings/${VAD_THRESHOLD_SETTING}`,
      value,
      home,
    );
    if (!response.ok) throw new Error(await response.text());
  } catch {
    out("→ Couldn't save it: mockingbird isn't running. Start it, then run this again.");
    return 1;
  }
  const gained =
    (byThreshold.get(THRESHOLDS[0] as number) ?? 0) - (byThreshold.get(threshold ?? -1) ?? 0);
  out(
    threshold === undefined
      ? "→ The default now hears your voice best, so the saved threshold is cleared. It applies after `mockingbird restart`."
      : `→ ${threshold} heard ${gained} more of your words than the default: saved. It applies after \`mockingbird restart\`.`,
  );
  return 0;
}
