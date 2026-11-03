import { existsSync, readFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { type DictionaryEntry, openStore, parseDictionary, type Store } from "@mockingbird/store";
import { mockingbirdHome } from "./runtime.ts";

const USAGE = `Usage: mockingbird dictionary [list | add <entry> | remove <term>]

Words mockingbird should get right in transcripts and captions: names,
places, jargon. A word that sounds like one is written the dictionary's way.

  mockingbird dictionary                                   list every entry
  mockingbird dictionary add "Nirjhar Bhattacharjee"       spell it this way
  mockingbird dictionary add "Catppuccin (a colour theme)" with a note
  mockingbird dictionary add "cat puck => Catppuccin"      what it hears => what to write
  mockingbird dictionary remove Catppuccin`;

/** An entry as `add` takes it, so a listed line can be pasted back. */
export const formatEntry = ({ term, heard, hint }: DictionaryEntry) =>
  `${heard ? `${heard} => ` : ""}${term}${hint ? ` (${hint})` : ""}`;

/**
 * Moves the old `dictionary.txt` into the store, once: the file is renamed so
 * nobody edits a file that's no longer read. It's renamed before anything is
 * written, so a file that can't be renamed isn't imported again over edits
 * made since.
 */
export function importDictionaryFile(store: Store, home: string, log: (m: string) => void): void {
  const path = join(home, "dictionary.txt");
  if (!existsSync(path)) return;
  const imported = `${path}.imported`;
  renameSync(path, imported);
  let entries: DictionaryEntry[];
  try {
    entries = parseDictionary(readFileSync(imported, "utf8"));
    store.addTerms(entries);
  } catch (error) {
    // Put it back, so the next run tries again.
    renameSync(imported, path);
    throw error;
  }
  log(
    `moved ${entries.length} dictionary words from dictionary.txt into data.db ` +
      "(it's now dictionary.txt.imported). Edit them with `mockingbird dictionary`.",
  );
}

/** Runs `use` on data.db in `home`, with any old dictionary.txt imported first. */
export function withStore<T>(
  use: (store: Store) => T,
  home = mockingbirdHome(),
  log: (m: string) => void = (m) => console.error(m),
): T {
  const store = openStore(join(home, "data.db"));
  try {
    try {
      importDictionaryFile(store, home, log);
    } catch (error) {
      // The words already in data.db still work; the next run tries again.
      log(`warning: couldn't import dictionary.txt: ${error}`);
    }
    return use(store);
  } finally {
    store.close();
  }
}

/** The dictionary, or none when there's no data.db yet. */
export function readDictionary(home = mockingbirdHome()): DictionaryEntry[] {
  if (!existsSync(join(home, "data.db")) && !existsSync(join(home, "dictionary.txt"))) return [];
  return withStore((store) => store.dictionary(), home);
}

/** Adds entries in `add`'s format; returns what to tell the user. */
export function addEntries(text: string, home = mockingbirdHome()): string {
  const entries = parseDictionary(text);
  if (!entries.length) throw new Error("nothing to add");
  withStore((store) => store.addTerms(entries), home);
  return `added ${entries.map((e) => e.term).join(", ")}`;
}

/** `mockingbird dictionary`. */
export async function main(args: string[], home = mockingbirdHome()): Promise<number> {
  const [command = "list", ...rest] = args;
  const value = rest.join(" ").trim();
  if (command === "-h" || command === "--help") {
    console.log(USAGE);
    return 0;
  }
  if (command === "list" && !value) {
    const entries = readDictionary(home);
    if (!entries.length)
      console.error(
        "The dictionary is empty. Add a word with `mockingbird dictionary add <word>`.",
      );
    for (const entry of entries) console.log(formatEntry(entry));
    return 0;
  }
  if (command === "add" && value) {
    console.log(addEntries(value, home));
    return 0;
  }
  if (command === "remove" && value) {
    if (!withStore((store) => store.removeTerm(value), home)) {
      console.error(`error: "${value}" isn't in the dictionary`);
      return 1;
    }
    console.log(`removed ${value}`);
    return 0;
  }
  console.error(`error: unknown \`mockingbird dictionary ${args.join(" ")}\`\n\n${USAGE}`);
  return 2;
}
