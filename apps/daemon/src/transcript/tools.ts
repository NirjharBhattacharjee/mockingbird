import { resolve } from "node:path";
import { seconds } from "../mcp/args.ts";
import type { Tool } from "../mcp/types.ts";
import type { ModelChoice } from "../runtime.ts";
import { addEntries, formatEntry, readDictionary } from "./dictionary.ts";
import { choiceOf, transcribe } from "./transcribe.ts";

/**
 * transcribe and the dictionary. `project` reads a project's words from the
 * word cache; it lives with the project's edit ops, not here.
 */
export function transcriptTools(
  log: (m: string) => void,
  project: (file: string, choice: ModelChoice) => Promise<string>,
): Tool[] {
  return [
    {
      name: "transcribe",
      description:
        "Transcribe an audio or video file on this Mac (anything ffmpeg reads: m4a, mp3, wav, mp4, mov, mkv) with mockingbird's local Whisper. Returns the text in lines timestamped [mm:ss], with names fixed from the user's dictionary. Takes a few minutes for an hour of audio. `from`/`to` (seconds) transcribe one stretch only; `words: true` gives every word's start and end ([mm:ss.cc-mm:ss.cc] word) to cut a clip on, so keep that to a few minutes at a time. With `project` (an `edit` project file) instead of `path`: the words in its cut, clip by clip, each line at its time in the finished video, to read the edit and choose words for `cut_words`. A project's sources are heard once and kept, so this is quick after the first time. `model` and `language` given with a project are kept on it, so cut_words, captions and render hear the same words.",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string", description: "Absolute path to a project file from `edit`" },
          path: { type: "string", description: "Absolute path to the file" },
          from: { type: "number", description: "Start, in seconds from the start of the file" },
          to: { type: "number", description: "End, in seconds from the start of the file" },
          words: { type: "boolean", description: "One line per word, with start and end" },
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
        },
      },
      run: (a) => {
        if (a.project !== undefined) {
          // A project's words come from the word cache, heard with its transcription or the user's settings.
          return project(resolve(String(a.project)), choiceOf(a));
        }
        if (a.path === undefined) throw new Error("Give a `path`, or a `project`.");
        return transcribe(
          String(a.path),
          log,
          { from: seconds(a.from), to: seconds(a.to) },
          !!a.words,
          choiceOf(a),
        );
      },
    },
    {
      name: "dictionary_list",
      description: "The words mockingbird spells a particular way: names, places, jargon.",
      inputSchema: { type: "object", properties: {} },
      run: async () => readDictionary().map(formatEntry).join("\n") || "The dictionary is empty.",
    },
    {
      name: "dictionary_add",
      description:
        'Teach mockingbird a word for transcripts and captions: "Catppuccin", "Catppuccin (a colour theme)", or "cat puck => Catppuccin" (what it hears => what to write).',
      inputSchema: {
        type: "object",
        properties: { entry: { type: "string" } },
        required: ["entry"],
      },
      run: async (a) => addEntries(String(a.entry)),
    },
  ];
}
