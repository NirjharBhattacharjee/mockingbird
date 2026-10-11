import { existsSync, readFileSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { type DictionaryEntry, mentions, parseDictionary } from "@mockingbird/llm";
import { openStore, type Store } from "@mockingbird/store";
import { mockingbirdHome } from "./runtime.ts";

/** Where the daemon listens for dictionary edits, inside the mockingbird home. */
const SOCKET = "mockingbird.sock";

const USAGE = `Usage: mockingbird dictionary [list | add <entry> | remove <term>]

Words mockingbird should get right: names, places, jargon. The cleanup model
is told how to spell them, and words that sound like one are corrected to it.

  mockingbird dictionary                                   list every entry
  mockingbird dictionary add "Nirjhar Bhattacharjee"       spell it this way
  mockingbird dictionary add "Catppuccin (a colour theme)" with a note for the cleanup model
  mockingbird dictionary add "cat puck => Catppuccin"      what it hears => what to write
  mockingbird dictionary remove Catppuccin

Changes take effect on the next dictation. Adding and removing go through the
background agent, so it has to be running (\`mockingbird start\`).`;

/** An entry as `add` takes it, so a listed line can be pasted back. */
export const formatEntry = ({ term, heard, hint }: DictionaryEntry) =>
  `${heard ? `${heard} => ` : ""}${term}${hint ? ` (${hint})` : ""}`;

/**
 * Moves the old `dictionary.txt` into the store, once: the file is renamed so
 * nobody edits a file that's no longer read. Adding is an upsert, so if the
 * rename fails the next start imports the same words again, harmlessly.
 */
export function importDictionaryFile(store: Store, home: string, log: (m: string) => void): void {
  const path = join(home, "dictionary.txt");
  if (!existsSync(path)) return;
  const entries = parseDictionary(readFileSync(path, "utf8"));
  store.addTerms(entries);
  renameSync(path, `${path}.imported`);
  log(
    `moved ${entries.length} dictionary words from dictionary.txt into data.db ` +
      "(it's now dictionary.txt.imported). Edit them with `mockingbird dictionary`.",
  );
}

/**
 * The daemon's store: data.db, with the old dictionary file imported. If it
 * can't be opened, dictation goes on without a dictionary.
 */
export function openDaemonStore(home: string, log: (m: string) => void): Store | undefined {
  try {
    const store = openStore(join(home, "data.db"));
    importDictionaryFile(store, home, log);
    return store;
  } catch (error) {
    log(`warning: couldn't open data.db, so dictation runs without the dictionary: ${error}`);
  }
}

/** The dictionary for a process that only reads it: every one but the daemon. */
export function readDictionary(home = mockingbirdHome()): DictionaryEntry[] {
  const path = join(home, "data.db");
  if (!existsSync(path)) return [];
  const store = openStore(path, { readonly: true });
  try {
    return store.dictionary();
  } finally {
    store.close();
  }
}

/** Counts a use of each dictionary term the final text contains. */
export function recordUses(store: Store, dictionary: DictionaryEntry[], text: string): void {
  const used = mentions(text, dictionary);
  if (used.length) store.countUses(used);
}

/** Sends one request to the daemon's socket. Rejects if nothing is listening. */
const ask = (socket: string, path: string, body?: string) =>
  fetch(`http://mockingbird${path}`, {
    unix: socket,
    method: body === undefined ? "GET" : "POST",
    body,
  });

/**
 * Takes dictionary edits from `mockingbird dictionary` over a Unix socket only
 * this user can open, so the daemon stays the only writer to data.db. If
 * another mockingbird (the agent, or `listen`) already answers there, edits go
 * to it and this one doesn't listen.
 */
export async function serveDictionary(
  store: Store,
  changed: (dictionary: DictionaryEntry[]) => void,
  log: (m: string) => void,
  home = mockingbirdHome(),
): Promise<{ stop(): void } | undefined> {
  const socket = join(home, SOCKET);
  if (
    await ask(socket, "/").then(
      () => true,
      () => false,
    )
  ) {
    log("another mockingbird is taking dictionary edits; this one picks them up on restart");
    return;
  }
  // Left behind by a mockingbird that didn't stop cleanly.
  rmSync(socket, { force: true });
  // Created 0600 from the start, not chmod-ed after anyone could connect.
  const umask = process.umask(0o177);
  const server = Bun.serve({
    unix: socket,
    async fetch(request) {
      const { pathname } = new URL(request.url);
      if (request.method === "GET" && pathname === "/") return new Response("mockingbird");
      if (request.method !== "POST") return new Response("not found", { status: 404 });
      const body = await request.text();
      let reply: string;
      if (pathname === "/dictionary/add") {
        const entries = parseDictionary(body);
        if (!entries.length) return new Response("nothing to add", { status: 400 });
        store.addTerms(entries);
        reply = `added ${entries.map((e) => e.term).join(", ")}`;
      } else if (pathname === "/dictionary/remove") {
        const term = body.trim();
        if (!store.removeTerm(term)) {
          return new Response(`"${term}" isn't in the dictionary`, { status: 404 });
        }
        reply = `removed ${term}`;
      } else {
        return new Response("not found", { status: 404 });
      }
      changed(store.dictionary());
      return new Response(reply);
    },
    error: (error) => new Response(String(error), { status: 500 }),
  });
  process.umask(umask);
  return {
    stop() {
      server.stop(true);
      rmSync(socket, { force: true });
    },
  };
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
  if ((command !== "add" && command !== "remove") || !value) {
    console.error(`error: unknown \`mockingbird dictionary ${args.join(" ")}\`\n\n${USAGE}`);
    return 2;
  }
  let response: Response;
  try {
    response = await ask(join(home, SOCKET), `/dictionary/${command}`, value);
  } catch {
    console.error(
      "mockingbird isn't running, so the dictionary can't be changed. " +
        "Start it with `mockingbird start`, then try again.",
    );
    return 1;
  }
  const reply = await response.text();
  if (!response.ok) {
    console.error(`error: ${reply}`);
    return 1;
  }
  console.log(reply);
  return 0;
}
