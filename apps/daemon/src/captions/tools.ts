import { dirname, resolve } from "node:path";
import { compile, load } from "@mockingbird/timeline";
import { items, stretch, within } from "../mcp/args.ts";
import type { Tool } from "../mcp/types.ts";
import { choiceOf } from "../transcript/transcribe.ts";
import { clipCaptions, cutCaptions } from "./cues.ts";

const path = { type: "string", description: "Absolute path to the file" };

/** The captions tool; `log` is where model downloads and transcription report. */
export function captionsTools(log: (m: string) => void): Tool[] {
  return [
    {
      name: "captions",
      description:
        "Word-by-word captions for the video `render` will make from these clips, or from an `edit` `project` (speed, transitions and J and L cuts included), as SRT timed to the finished video: up to `perCue` words a cue, the word being said marked *like this* so render draws it yellow. Edit the text if you like (fix a misheard word, mark a different word), then pass it to render's `captions`.",
      inputSchema: {
        type: "object",
        properties: {
          path,
          clips: {
            type: "array",
            description: "The same clips you'll give render, in order, in seconds",
            items: {
              type: "object",
              properties: { from: { type: "number" }, to: { type: "number" } },
              required: ["from", "to"],
            },
          },
          perCue: { type: "number", description: "Most words on screen at once, 1-8 (default 3)" },
          lit: { type: "boolean", description: "Mark the word being said (default true)" },
          upper: { type: "boolean", description: "In capitals (default false)" },
          model: {
            type: "string",
            description:
              "A Whisper model file in models/ for this call (`mockingbird models` lists them), e.g. a Bangla fine-tune for a Bangla video. Default: the one picked for the language.",
          },
          language: {
            type: "string",
            description:
              "What's spoken, as a Whisper code (en, bn, de, hi, …) or auto. Default: the user's setting. Give it for mixed speech, like Bangla and English in one sentence, where detection guesses wrong.",
          },
          project: {
            type: "string",
            description:
              "Absolute path to a project file from `edit`, in place of `path` and `clips`; perCue, lit and upper default to the project's captions",
          },
        },
      },
      run: async (a) => {
        if (a.project !== undefined) {
          if (a.model !== undefined || a.language !== undefined) {
            throw new Error(
              "A project's captions are heard with its transcription: give `model` and `language` to `transcribe` with the project.",
            );
          }
          const file = resolve(String(a.project));
          const { project, created } = load(file);
          if (created) throw new Error(`No project at ${file}; make one with \`edit\`.`);
          const cut = compile(project, dirname(file));
          if (!cut.clips.length)
            throw new Error(`${file} has no clips yet; add some with \`edit\`.`);
          const set = project.captions ?? {};
          const srt = await cutCaptions(
            cut,
            log,
            {
              perCue: Math.round(within(a.perCue, 1, 8, "perCue", set.perCue ?? 3)),
              lit: a.lit === undefined ? (set.lit ?? true) : !!a.lit,
              upper: a.upper === undefined ? (set.upper ?? false) : !!a.upper,
            },
            project.transcription,
          );
          return srt || "No speech in the cut.";
        }
        if (a.path === undefined) throw new Error("Give a `path` and `clips`, or a `project`.");
        const clips = items(a.clips).map((c, i) => stretch(c, `clips[${i}]`));
        if (!clips.length) throw new Error("No clips: give at least one { from, to } in seconds.");
        return clipCaptions(
          resolve(String(a.path)),
          log,
          clips,
          {
            perCue: Math.round(within(a.perCue, 1, 8, "perCue", 3)),
            lit: a.lit === undefined ? true : !!a.lit,
            upper: !!a.upper,
          },
          choiceOf(a),
        );
      },
    },
  ];
}
