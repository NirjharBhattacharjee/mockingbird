import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { type WordDiff, wordDiff } from "@mockingbird/asr";
import { concatSamples, encodeWav } from "@mockingbird/audio";
import { applyCorrections, correctNames, type DictionaryEntry, mentions } from "@mockingbird/llm";
import { openStore, type Store } from "@mockingbird/store";
import scriptMarkdown from "./calibration.md" with { type: "text" };
import { formatEntry, type Routes, tellDaemon } from "./dictionary.ts";
import { hear, type PipelineDeps } from "./pipeline.ts";
import { mockingbirdHome } from "./runtime.ts";
import { tuneCommand } from "./tune.ts";

/** The sentences the user reads: the `- ` lines of calibration.md. */
export const SCRIPT = scriptMarkdown
  .split("\n")
  .filter((line) => line.startsWith("- "))
  .map((line) => line.slice(2).trim());

/** A take nobody stopped (the screen was killed, say) is dropped after this. */
const MAX_TAKE_MS = 60_000;
const SAMPLE_RATE = 16_000;

/** What `stop` answers: the sentence and what was heard, word by word. */
export type TakeResult = WordDiff & { heard: string; model: string };

/**
 * What `term` answers: what Whisper heard the user say, whether dictation
 * would have written the term from that, and the entry saved.
 */
export type TermResult = { term: string; heard: string; right: boolean; saved: string };

/** A name misheard as this many more words than it has is something else. */
const MAX_EXTRA_WORDS = 2;

/** macOS's English word list. */
const WORDS = "/usr/share/dict/words";
let english: Set<string> | undefined;

/**
 * Whether every word of `text` is an English word (or one with an s on the
 * end). Kept as a mishearing, "Childhood => Tadhg" would rewrite every
 * "childhood" anyone dictates, the way learn.ts warns of. With no word list,
 * everything counts as English, so nothing is kept.
 */
export function isEnglish(text: string): boolean {
  english ??= new Set(
    existsSync(WORDS) ? readFileSync(WORDS, "utf8").toLowerCase().split("\n") : [],
  );
  const known = english;
  const words = text.toLowerCase().match(/[\p{L}']+/gu) ?? [];
  return !known.size || words.every((w) => known.has(w) || known.has(w.replace(/s$/, "")));
}

type HearDeps = Parameters<typeof hear>[1] & Pick<PipelineDeps, "asr">;

/**
 * Takes for `mockingbird calibrate`, recorded from the microphone the agent
 * already has open, one at a time. Each is heard the way a dictation is (the
 * VAD and Whisper, no cleanup), saved as a WAV in `<home>/calibration`
 * (0700) and as a row in data.db, and compared with its sentence.
 */
export class Calibration {
  private take: Int16Array[] | undefined;
  private timer: Timer | undefined;
  /** Goes up on every forget, so a take heard across one isn't saved after it. */
  private forgets = 0;
  readonly dir: string;

  constructor(
    home: string,
    private readonly store: Store,
    private readonly deps: () => HearDeps,
    private readonly changed: (dictionary: DictionaryEntry[]) => void = () => {},
  ) {
    this.dir = join(home, "calibration");
  }

  push(samples: Int16Array): void {
    this.take?.push(samples);
  }

  /** False if a take is already recording. */
  start(): boolean {
    if (this.take) return false;
    this.take = [];
    this.timer = setTimeout(() => this.cancel(), MAX_TAKE_MS);
    return true;
  }

  cancel(): void {
    clearTimeout(this.timer);
    this.take = undefined;
  }

  /** Ends the take for sentence `sentence` of run `run`; undefined if none was recording. */
  async stop(run: number, sentence: number): Promise<TakeResult | undefined> {
    const take = this.take;
    this.cancel();
    const text = SCRIPT[sentence];
    if (!take || text === undefined) return undefined;
    const audio = { sampleRate: SAMPLE_RATE, samples: concatSamples(take) };
    const forgets = this.forgets;
    const deps = this.deps();
    // Heard before anything is written: if Whisper fails, a sentence read
    // before keeps its audio and its row, which still describe each other.
    const heard = (await hear(audio, deps)).asr?.text.trim() ?? "";
    const diff = wordDiff(text, heard);
    const model = deps.asr.model;
    if (forgets !== this.forgets) return { ...diff, heard, model };
    mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    // mkdir leaves a folder that already exists as it was, open or not.
    chmodSync(this.dir, 0o700);
    // Reading a sentence again replaces its file, as it replaces its row.
    // Renamed into place, so a crash never leaves half a file under the name.
    const path = join(this.dir, `${run}-${sentence}.wav`);
    writeFileSync(`${path}.part`, encodeWav(audio), { mode: 0o600 });
    renameSync(`${path}.part`, path);
    this.store.saveTake({
      run,
      sentence,
      text,
      heard,
      edits: diff.edits,
      words: diff.words,
      model,
    });
    return { ...diff, heard, model };
  }

  /**
   * Ends a take of the user reading one of their own names or terms, and adds
   * it to the dictionary. If dictation still wouldn't write it from what
   * Whisper heard, even with the term in the dictionary, what it heard is
   * kept as the term's mishearing (`heard => term`), unless that's ordinary
   * English. Its audio isn't kept.
   */
  async stopTerm(term: string): Promise<TermResult | undefined> {
    const take = this.take;
    this.cancel();
    if (!take) return undefined;
    const deps = this.deps();
    const audio = { sampleRate: SAMPLE_RATE, samples: concatSamples(take) };
    const heard = (await hear(audio, deps)).asr?.text.trim() ?? "";
    // What a dictation would write: the dictionary's fixes, with the term in it.
    const entry: DictionaryEntry = { term };
    const others = (deps.dictionary ?? []).filter(
      (e) => e.term.toLowerCase() !== term.toLowerCase(),
    );
    const dictionary = [...others, entry];
    const right =
      mentions(correctNames(applyCorrections(heard, dictionary), dictionary), [entry]).length > 0;
    // The take is only the term, so all of it is what the term was heard as.
    const said = heard.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    const words = (text: string) => text.split(/\s+/).filter(Boolean).length;
    // Anything longer is the user saying more, or Whisper making it up.
    const misheard =
      !right && said && words(said) <= words(term) + MAX_EXTRA_WORDS && !isEnglish(said);
    const saved: DictionaryEntry = misheard ? { term, heard: said } : entry;
    this.store.addTerms([saved]);
    this.changed(this.store.dictionary());
    return { term, heard, right, saved: formatEntry(saved) };
  }

  /** Deletes every take, files and rows; returns how many rows went. */
  forget(): number {
    this.forgets++;
    this.cancel();
    rmSync(this.dir, { recursive: true, force: true });
    return this.store.forgetCalibration();
  }

  routes(): Routes {
    return {
      "POST /calibrate/start": () =>
        this.start()
          ? new Response("recording")
          : new Response("a take is already recording", { status: 409 }),
      "POST /calibrate/stop": async (body) => {
        let run: unknown;
        let sentence: unknown;
        try {
          ({ run, sentence } = JSON.parse(body));
        } catch {}
        if (!Number.isInteger(run) || !Number.isInteger(sentence)) {
          return new Response("stop needs a run and a sentence", { status: 400 });
        }
        const result = await this.stop(run as number, sentence as number);
        return result
          ? Response.json(result)
          : new Response("no take is recording", { status: 409 });
      },
      "POST /calibrate/term": async (body) => {
        const term = body.trim();
        if (!term) return new Response("term needs the word you read", { status: 400 });
        const result = await this.stopTerm(term);
        return result
          ? Response.json(result)
          : new Response("no take is recording", { status: 409 });
      },
      "POST /calibrate/cancel": () => {
        this.cancel();
        return new Response("cancelled");
      },
      "POST /calibrate/forget": () => {
        const n = this.forget();
        return new Response(`deleted ${n} calibration take${n === 1 ? "" : "s"}, with the audio`);
      },
    };
  }
}

const USAGE = `Usage: mockingbird calibrate [--forget]

Read a short script aloud, one sentence at a time, and see how many of your
words the transcription model gets right. Run it in a terminal window at least
64×16; the background agent has to be running (\`mockingbird start\`).

Each sentence you read is kept in ~/.mockingbird/calibration, with what the
model heard in data.db, so later runs can tune mockingbird to your voice.
Nothing leaves this Mac.

  mockingbird calibrate            your past runs, in a small window
  mockingbird calibrate names      read your own names and terms aloud, so the
                                   dictionary learns how the model hears them
  mockingbird calibrate tune       compare your models on your latest run, and
                                   tune speech detection to your voice
  mockingbird calibrate --forget   delete every take and its audio`;

/** Percent of words right, rounded down so 99.6% never shows as 100%. */
export const percentRight = (edits: number, words: number) =>
  words ? Math.max(0, Math.floor((100 * (words - edits)) / words)) : 0;

/**
 * `mockingbird calibrate`. The screen is the Go command's; these are the
 * calls it makes: `script --json`, `start`, `stop <run> <sentence>`,
 * `term <words>` and `cancel`, each but the first answered by the agent,
 * which has the microphone and is the only writer to data.db.
 */
export async function calibrateCommand(args: string[], home = mockingbirdHome()): Promise<number> {
  const [command = "", ...rest] = args;
  if (command === "-h" || command === "--help") {
    console.log(USAGE);
    return 0;
  }
  if (command === "tune" && !rest.length) return tuneCommand({ home });
  if (command === "script" && rest[0] === "--json") {
    console.log(JSON.stringify({ sentences: SCRIPT }));
    return 0;
  }
  if (!command) {
    console.log(USAGE);
    const path = join(home, "data.db");
    const runs = existsSync(path) ? readRuns(path) : [];
    if (runs.length) console.log("\nPast runs:");
    for (const { run, model, edits, words, takes } of runs) {
      const when = new Date(run).toLocaleString();
      console.log(
        `  ${when}  ${model}  ${percentRight(edits, words)}% of ${words} words right (${takes} sentences)`,
      );
    }
    return 0;
  }
  if (command === "names") {
    console.error("`mockingbird calibrate names` needs a terminal window at least 64×16.");
    return 1;
  }
  const route = {
    start: "start",
    cancel: "cancel",
    stop: "stop",
    term: "term",
    "--forget": "forget",
  }[command];
  const [run, sentence] = rest.map(Number);
  const term = rest.join(" ").trim();
  if (
    !route ||
    (route === "stop" && (rest.length !== 2 || !Number.isInteger(sentence))) ||
    (route === "term" && !term)
  ) {
    console.error(`error: unknown \`mockingbird calibrate ${args.join(" ")}\`\n\n${USAGE}`);
    return 2;
  }
  let response: Response;
  try {
    const body =
      route === "stop" ? JSON.stringify({ run, sentence }) : route === "term" ? term : "";
    response = await tellDaemon(`/calibrate/${route}`, body, home);
  } catch {
    console.error("mockingbird isn't running. Start it with `mockingbird start`, then try again.");
    return 1;
  }
  const reply = await response.text();
  if (response.status === 404) {
    // An agent from before calibration.
    console.error("the running mockingbird is older than calibrate: run `mockingbird restart`");
    return 1;
  }
  if (!response.ok) {
    console.error(`error: ${reply}`);
    return 1;
  }
  console.log(reply);
  return 0;
}

function readRuns(path: string) {
  const store = openStore(path, { readonly: true });
  try {
    return store.calibrationRuns();
  } finally {
    store.close();
  }
}
