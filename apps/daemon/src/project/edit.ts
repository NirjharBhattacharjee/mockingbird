import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  apply,
  edit,
  load,
  type Project,
  transcript,
  type Word,
  wanted,
} from "@mockingbird/timeline";
import { checkChoice, type ModelChoice, mockingbirdHome } from "../runtime.ts";
import { type Span, sourceWords } from "../transcript/words.ts";

/** What `wanted` asks of a project in `dir`, by absolute path. */
function wantedFrom(
  p: Project,
  ops: unknown[],
  dir: string,
  heard?: Map<string, { words: Word[]; gaps: Span[] }>,
): Map<string, Span[]> {
  const out = new Map<string, Span[]>();
  const words = heard && ((path: string) => heard.get(resolve(dir, path))?.words ?? []);
  const gaps = heard && ((path: string) => heard.get(resolve(dir, path))?.gaps ?? []);
  for (const [path, spans] of wanted(p, ops, words, gaps)) {
    const full = resolve(dir, path);
    out.set(full, [...(out.get(full) ?? []), ...spans]);
  }
  return out;
}

/**
 * The transcription in effect when the batch's first cut_words runs: a set
 * before it changes which words the cut is made on. Ops that fail here fail
 * the real batch too, so the saved one stands then.
 */
export function transcriptionAt(p: Project, ops: unknown[]): ModelChoice | undefined {
  const first = ops.findIndex((o) => (o as { op?: unknown })?.op === "cut_words");
  if (first < 0) return p.transcription;
  try {
    return apply(p, ops.slice(0, first)).project.transcription;
  } catch {
    return p.transcription;
  }
}

/**
 * `ops` applied to the project in `file`, hearing first whatever cut_words
 * needs: the words of every clip there is or will be.
 */
export async function editProject(file: string, ops: unknown[], log: (m: string) => void) {
  if (!ops.some((o) => (o as { op?: unknown })?.op === "cut_words")) return edit(file, ops);
  const dir = dirname(file);
  // Hearing takes a while: if what the project asks to be heard changed
  // meanwhile (another edit added a clip), hear that too, so no clip is
  // missing words (#235). A text or a size changed alongside doesn't count.
  // ponytail: an edit landing between the last check and the save isn't seen;
  // a lock file if agents edit one project at once.
  // With words heard, the cut_words ops are replayed too, so a later op on a
  // clip one of them splits off asks for its stretch, and that's heard next.
  const asks = (p: Project, heard?: Awaited<ReturnType<typeof sourceWords>>) => {
    const spans = wantedFrom(p, ops, dir, heard);
    const choice = transcriptionAt(p, ops);
    return { spans, choice, key: JSON.stringify([[...spans], choice]) };
  };
  let want = asks(load(file).project);
  let heard: Awaited<ReturnType<typeof sourceWords>>;
  // ponytail: a few rounds at most; each can only add stretches a cut made reachable.
  for (let round = 0; ; round++) {
    heard = await sourceWords(want.spans, log, want.choice);
    const now = asks(load(file).project, heard);
    if (now.key === want.key || round >= 4) break;
    want = now;
  }
  return edit(
    file,
    ops,
    (path) => heard.get(resolve(dir, path))?.words ?? [],
    (path) => heard.get(resolve(dir, path))?.gaps ?? [],
  );
}

/** The words in the project in `file`'s cut, from the word cache. */
export async function projectTranscript(
  file: string,
  log: (m: string) => void,
  choice: ModelChoice,
) {
  if (load(file).created) throw new Error(`No project at ${file}; make one with \`edit\`.`);
  checkChoice(choice);
  const models = join(mockingbirdHome(), "models");
  if (choice.model && !existsSync(join(models, choice.model))) {
    throw new Error(`${choice.model} isn't in ${models}; \`mockingbird models\` lists what is.`);
  }
  // A model or language given here is kept on the project, over what it had,
  // so cut_words, captions and render hear the words this transcript shows.
  if (choice.model || choice.language) {
    const transcription = { ...load(file).project.transcription, ...choice };
    edit(file, [{ op: "set", transcription }]);
  }
  const { project } = load(file);
  const dir = dirname(file);
  const heard = await sourceWords(wantedFrom(project, [], dir), log, project.transcription);
  return transcript(project, file, (path) => heard.get(resolve(dir, path))?.words ?? []);
}
