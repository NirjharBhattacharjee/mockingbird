import { chmodSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type WordDiff, wordDiff } from "@mockingbird/asr";
import { concatSamples, encodeWav } from "@mockingbird/audio";
import { openStore, type Store } from "@mockingbird/store";
import scriptMarkdown from "./calibration.md" with { type: "text" };
import { type Routes, tellDaemon } from "./dictionary.ts";
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
  mockingbird calibrate tune       compare your models on your latest run, and
                                   tune speech detection to your voice
  mockingbird calibrate --forget   delete every take and its audio`;

/** Percent of words right, rounded down so 99.6% never shows as 100%. */
export const percentRight = (edits: number, words: number) =>
  words ? Math.max(0, Math.floor((100 * (words - edits)) / words)) : 0;

/**
 * `mockingbird calibrate`. The screen is the Go command's; these are the
 * calls it makes: `script --json`, `start`, `stop <run> <sentence>` and
 * `cancel`, each but the first answered by the agent, which has the
 * microphone and is the only writer to data.db.
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
  const route = { start: "start", cancel: "cancel", stop: "stop", "--forget": "forget" }[command];
  const [run, sentence] = rest.map(Number);
  if (!route || (route === "stop" && (rest.length !== 2 || !Number.isInteger(sentence)))) {
    console.error(`error: unknown \`mockingbird calibrate ${args.join(" ")}\`\n\n${USAGE}`);
    return 2;
  }
  let response: Response;
  try {
    const body = route === "stop" ? JSON.stringify({ run, sentence }) : "";
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
