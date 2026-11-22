import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { loadAudio, type PcmAudio } from "@mockingbird/audio";
import type { Word } from "@mockingbird/timeline";
import { probe } from "../inspect/probe.ts";
import {
  asrChoice,
  checkChoice,
  choiceEnv,
  type Engines,
  enginesFor,
  languageModels,
  type ModelChoice,
  mockingbirdHome,
  requireFile,
} from "../runtime.ts";
import { hear, speller, timedWords } from "./transcribe.ts";

/** A stretch of a source, in seconds. */
export type Span = { from: number; to: number };

/** `spans` in order, joined where they overlap or are less than `gap` seconds apart. */
export function union(spans: Span[], gap = 0): Span[] {
  const out: Span[] = [];
  for (const s of [...spans].sort((a, b) => a.from - b.from)) {
    const last = out.at(-1);
    if (last && s.from <= last.to + gap) last.to = Math.max(last.to, s.to);
    else out.push({ ...s });
  }
  return out;
}

/** The parts of `needed` that `covered` leaves out. */
export function uncovered(needed: Span[], covered: Span[]): Span[] {
  const have = union(covered);
  const out: Span[] = [];
  for (const n of union(needed)) {
    let at = n.from;
    for (const c of have) {
      if (c.to <= at || c.from >= n.to) continue;
      if (c.from > at) out.push({ from: at, to: c.from });
      at = Math.max(at, c.to);
    }
    if (at < n.to) out.push({ from: at, to: n.to });
  }
  return out.filter((s) => s.to - s.from > 0.01);
}

/**
 * Each word's start and end from where DTW put it and the silences around
 * it: it starts where the last silence before its first point ends, and
 * ends where the first silence after its last point begins, never past the
 * points of the words either side. With no silence there, halfway to the
 * next word's point. A word with no point keeps Whisper's times, which drift
 * up to half a second over a 30-second window; on a recorded talk they put
 * "create" 0.5 s early, inside the pause before it.
 */
export function align(words: (Word & { at?: [number, number] })[], gaps: Span[]): Word[] {
  const ms = (t: number) => Math.round(t * 1000) / 1000;
  return words.map((w, i) => {
    const { word, start, end, at } = w;
    if (!at) return { word, start, end };
    const [first, last] = at;
    const prev = words[i - 1]?.at?.[1];
    const next = words[i + 1]?.at?.[0];
    const before = gaps.filter((g) => g.to <= first && (prev === undefined || g.to >= prev)).at(-1);
    const after = gaps.find((g) => g.from >= last && (next === undefined || g.from <= next));
    const from = before
      ? before.to
      : prev === undefined
        ? Math.min(start, first)
        : (prev + first) / 2;
    const to = after ? after.from : next === undefined ? Math.max(end, last) : (last + next) / 2;
    return { word, start: ms(from), end: ms(Math.max(from, to)) };
  });
}

/**
 * A source's words and silences as heard so far, and the stretches they
 * cover. `language` is the one detected for it on auto, and `model` the one
 * that heard it, kept so every later stretch is heard the same way.
 */
type Heard = { covered: Span[]; words: Word[]; gaps: Span[]; language?: string; model?: string };

/**
 * The silences in `source` from `from` to `to` seconds: 80 ms or more under
 * -35 dBFS, the gaps between words that a cut can land in.
 * ponytail: a fixed level; from the recording's noise floor once audio_stats (#171) measures it.
 */
async function silences(source: string, { from, to }: Span): Promise<Span[]> {
  const proc = Bun.spawn(
    [
      ...["ffmpeg", "-nostdin", "-nostats", "-ss", String(from), "-t", String(to - from)],
      ...["-i", source, "-map", "0:a:0", "-af", "silencedetect=n=-35dB:d=0.08", "-f", "null", "-"],
    ],
    { stderr: "pipe" },
  );
  const said = await new Response(proc.stderr).text();
  if ((await proc.exited) !== 0) {
    throw new Error(`ffmpeg couldn't find the pauses in ${source}: ${said.trim()}`);
  }
  const ms = (t: number) => Math.round(t * 1000) / 1000;
  const out: Span[] = [];
  let start: number | undefined;
  for (const [, edge, at] of said.matchAll(/silence_(start|end): (-?[\d.]+)/g)) {
    const t = from + Number(at);
    if (edge === "start") start = Math.max(from, t);
    else if (start !== undefined) {
      out.push({ from: ms(start), to: ms(t) });
      start = undefined;
    }
  }
  // A silence still going at the end of the stretch.
  if (start !== undefined) out.push({ from: ms(start), to: ms(to) });
  return out;
}

/**
 * Where a source's words are kept: a file per source, model and language
 * under ~/.mockingbird/cache/words/. A source that changes on disk gets a new
 * one, so its old words are never used.
 */
function heardFile(source: string, model: string, language: string): string {
  const { size, mtimeMs } = statSync(source);
  const key = createHash("sha256")
    // "3": words placed by DTW and the silences between them.
    .update(JSON.stringify([3, source, size, mtimeMs, resolve(model), language]))
    .digest("hex")
    .slice(0, 32);
  return join(mockingbirdHome(), "cache", "words", `${key}.json`);
}

/** The cache file each call is filling now: a second call for it waits (#235). */
const filling = new Map<string, Promise<unknown>>();

/** `fn` once no other call in this process is filling `file`. */
async function serially<T>(file: string, fn: () => Promise<T>): Promise<T> {
  const run = (filling.get(file) ?? Promise.resolve()).catch(() => {}).then(fn);
  filling.set(file, run);
  try {
    return await run;
  } finally {
    if (filling.get(file) === run) filling.delete(file);
  }
}

/**
 * Each source's words and silences over the stretches asked for (absolute
 * paths), heard once and kept, so a later call hears only what no call
 * before it did. A new stretch is decoded and heard with 2 s either side, as
 * captions are, and keeps the words whose middle is in it. Names are fixed
 * from the dictionary as the words are read, so a word added to the
 * dictionary later still applies. `choice` is the project's transcription;
 * with the language on auto it's detected from the first stretch heard, as
 * `transcribe` does.
 * ponytail: calls are serialised per cache file in this process only; two
 * engine processes filling one file at once keep the last one's words.
 */
export async function sourceWords(
  sources: Map<string, Span[]>,
  log: (m: string) => void,
  choice: ModelChoice = {},
): Promise<Map<string, { words: Word[]; gaps: Span[] }>> {
  checkChoice(choice);
  // The cache file for `source` under the settings as they are now: the model
  // and language, and on auto the language map detection picks the model from.
  const settings = (say = log) => asrChoice(say, choiceEnv(choice, process.env));
  const { language } = settings();
  const keyFor = (source: string) => {
    const { whisperModel, language: l } = settings(() => {});
    return heardFile(
      source,
      whisperModel,
      l === "auto" ? `auto ${JSON.stringify(languageModels())}` : l,
    );
  };
  const out = new Map<string, { words: Word[]; gaps: Span[] }>();
  let engines: Engines | undefined;
  try {
    for (const [source, spans] of sources) {
      const file = keyFor(requireFile(source, "File"));
      const heard = await serially(file, async () => {
        let heard: Heard = { covered: [], words: [], gaps: [] };
        try {
          heard = JSON.parse(readFileSync(file, "utf8"));
        } catch {
          // Not heard yet, or a file from a crash: hear it again.
        }
        // Stretches less than 4 s apart are heard as one: their padding would overlap anyway.
        const todo = union(uncovered(spans, heard.covered), 4);
        if (!todo.length) return heard;
        // On auto, each source is detected on its own, once: the language heard
        // first is kept with its words, and later stretches are held to it.
        let mine: Engines | undefined;
        const enginesHere = async (piece: PcmAudio) => {
          if (language !== "auto") {
            engines ??= (await enginesFor(piece, choice, log, process.env, { dtw: true })).engines;
            return engines;
          }
          if (!mine) {
            // The model detection chose comes back with the language: an
            // English-only global model can't hear the Italian it found (#282).
            const held = heard.language
              ? { model: choice.model ?? heard.model, language: heard.language }
              : choice;
            const picked = await enginesFor(piece, held, log, process.env, { dtw: true });
            mine = picked.engines;
            if (picked.language !== "auto") {
              heard.language = picked.language;
              heard.model = picked.model;
            }
          }
          return mine;
        };
        try {
          if ((await probe(source)).audio) {
            const before = heard.covered;
            const fresh = (middle: number, s: Span) =>
              middle >= s.from &&
              middle < s.to &&
              !before.some((c) => middle >= c.from && middle < c.to);
            for (const s of todo) {
              // Silences either side too, for a cut at the stretch's edge to land in.
              const around = { from: Math.max(0, s.from - 2), to: s.to + 2 };
              heard.gaps = union([...heard.gaps, ...(await silences(source, around))]);
              // Only this stretch decoded: a minute of an 8-hour source isn't 880 MiB of PCM.
              const piece = await loadAudio(source, around);
              const using = await enginesHere(piece);
              const placed: (Word & { at?: [number, number] })[] = [];
              for await (const c of hear(piece, around.from * 1000, using)) {
                for (const w of timedWords(c.heard, c.offsetMs)) {
                  const at: [number, number] | undefined =
                    w.atMs === undefined
                      ? undefined
                      : [w.atMs / 1000, (w.atEndMs ?? w.atMs) / 1000];
                  placed.push({ word: w.word, start: w.startMs / 1000, end: w.endMs / 1000, at });
                }
              }
              // A word belongs to the stretch its middle is in: by its DTW points where it has them.
              for (const w of align(placed, heard.gaps)) {
                if (fresh((w.start + w.end) / 2, s)) heard.words.push(w);
              }
            }
          }
          heard.covered = union([...heard.covered, ...todo]);
          heard.words.sort((a, b) => a.start - b.start);
          // Settings changed while these were heard (`models use`): they're this
          // call's, but kept under the old model's name they'd be wrong (#282).
          if (keyFor(source) !== file) {
            log(
              "warning: the transcription settings changed while words were heard; they aren't kept",
            );
            return heard;
          }
          mkdirSync(dirname(file), { recursive: true });
          const temp = `${file}.${process.pid}.tmp`;
          writeFileSync(temp, JSON.stringify(heard));
          renameSync(temp, file);
          return heard;
        } finally {
          await (mine as Engines | undefined)?.close();
        }
      });
      // Names are fixed as English ones only when the words are English.
      const spell = speller(log, heard.language ?? language);
      out.set(source, {
        words: heard.words.map((w) => ({ ...w, word: spell(w.word) })),
        gaps: heard.gaps,
      });
    }
  } finally {
    await engines?.close();
  }
  return out;
}
