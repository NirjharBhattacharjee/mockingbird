import { Database } from "bun:sqlite";
import type { DictionaryEntry } from "./dictionary.ts";

export {
  applyCorrections,
  correctNames,
  type DictionaryEntry,
  parseDictionary,
  soundOf,
} from "./dictionary.ts";

/**
 * The schema, one step per release that changed it. `PRAGMA user_version`
 * records how many have run, so each runs once. Append, never edit.
 */
const MIGRATIONS = [
  `CREATE TABLE dictionary (
     term        TEXT PRIMARY KEY COLLATE NOCASE,
     heard       TEXT,
     hint        TEXT,
     uses        INTEGER NOT NULL DEFAULT 0,
     created_at  INTEGER NOT NULL,
     updated_at  INTEGER NOT NULL
   )`,
  // Learning from the user's corrections (#62): the word pairs, counted, and
  // which dictionary words came from them, so they can all be forgotten.
  `CREATE TABLE correction (
     id          INTEGER PRIMARY KEY AUTOINCREMENT,
     from_text   TEXT NOT NULL,
     to_text     TEXT NOT NULL,
     count       INTEGER NOT NULL DEFAULT 1,
     created_at  INTEGER NOT NULL,
     updated_at  INTEGER NOT NULL,
     UNIQUE (from_text, to_text)
   );
   ALTER TABLE dictionary ADD COLUMN learned INTEGER NOT NULL DEFAULT 0`,
  // Choices the user makes with a command, like the cleanup model (#51).
  `CREATE TABLE settings (
     key    TEXT PRIMARY KEY,
     value  TEXT NOT NULL
   )`,
  // Voice calibration (#106): each sentence the user read, what the model
  // heard, and how many words it got wrong. The audio is a file per take.
  `CREATE TABLE calibration (
     run         INTEGER NOT NULL,
     sentence    INTEGER NOT NULL,
     text        TEXT NOT NULL,
     heard       TEXT NOT NULL,
     edits       INTEGER NOT NULL,
     words       INTEGER NOT NULL,
     model       TEXT NOT NULL,
     created_at  INTEGER NOT NULL,
     PRIMARY KEY (run, sentence)
   )`,
  // Dictation is gone (#135): learning, use counts and calibration with it.
  `DROP TABLE correction;
   DROP TABLE calibration;
   ALTER TABLE dictionary DROP COLUMN learned;
   ALTER TABLE dictionary DROP COLUMN uses`,
];

export type Store = {
  /** Every term, alphabetically. */
  dictionary(): DictionaryEntry[];
  /** Adds terms, or updates the ones already there; a missing heard or hint keeps the old one. */
  addTerms(entries: DictionaryEntry[]): void;
  /** Whether there was such a term. Case doesn't matter. */
  removeTerm(term: string): boolean;
  /** A setting, or undefined if it was never set. */
  setting(key: string): string | undefined;
  /** Sets a setting; undefined deletes it, so the default applies again. */
  setSetting(key: string, value: string | undefined): void;
  close(): void;
};

/**
 * Opens `data.db`, creating it and bringing its schema up to date. Every
 * mockingbird process opens it this way; WAL and the busy timeout let a
 * command and an MCP server write at once.
 */
export function openStore(path: string): Store {
  const db = new Database(path, { create: true });
  db.run("PRAGMA busy_timeout = 5000");
  db.run("PRAGMA journal_mode = WAL");
  // Immediate, so two mockingbirds starting at once can't both read version 0.
  db.transaction(() => {
    const { user_version: version } = db.query("PRAGMA user_version").get() as {
      user_version: number;
    };
    for (const sql of MIGRATIONS.slice(version)) db.run(sql);
    db.run(`PRAGMA user_version = ${MIGRATIONS.length}`);
  }).immediate();

  const upsert = db.query(
    `INSERT INTO dictionary (term, heard, hint, created_at, updated_at)
     VALUES ($term, $heard, $hint, $now, $now)
     ON CONFLICT (term) DO UPDATE SET
       term = excluded.term,
       heard = coalesce(excluded.heard, heard),
       hint = coalesce(excluded.hint, hint),
       updated_at = excluded.updated_at`,
  );

  return {
    dictionary: () =>
      db
        .query<{ term: string; heard: string | null; hint: string | null }, []>(
          "SELECT term, heard, hint FROM dictionary ORDER BY term",
        )
        .all()
        .map(({ term, heard, hint }) => ({ term, ...(heard && { heard }), ...(hint && { hint }) })),
    addTerms: db.transaction((entries: DictionaryEntry[]) => {
      const now = Date.now();
      for (const { term, heard, hint } of entries) {
        upsert.run({ $term: term, $heard: heard ?? null, $hint: hint ?? null, $now: now });
      }
    }),
    removeTerm: (term) => db.run("DELETE FROM dictionary WHERE term = ?", [term]).changes > 0,
    setting: (key) =>
      db.query<{ value: string }, [string]>("SELECT value FROM settings WHERE key = ?").get(key)
        ?.value ?? undefined,
    setSetting: (key, value) => {
      if (value === undefined) db.run("DELETE FROM settings WHERE key = ?", [key]);
      else {
        db.run(
          "INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT (key) DO UPDATE SET value = ?2",
          [key, value],
        );
      }
    },
    close: () => db.close(),
  };
}
