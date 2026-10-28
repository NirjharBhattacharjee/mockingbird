import { Database } from "bun:sqlite";
import type { DictionaryEntry } from "@mockingbird/llm";

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
];

/** A dictionary entry, and whether it was learned rather than added by the user. */
export type StoredEntry = DictionaryEntry & { learned?: true };

/** A dictionary row as a person sees it: every column, empty ones null. */
export type DictionaryRow = {
  term: string;
  heard: string | null;
  hint: string | null;
  uses: number;
  learned: boolean;
  /** Milliseconds since the epoch. */
  createdAt: number;
};

/** One sentence read during calibration, and how well it was heard. */
export type Take = {
  /** When the run started, in milliseconds since the epoch. */
  run: number;
  /** The sentence's place in the script. */
  sentence: number;
  text: string;
  heard: string;
  /** Words wrong, missing or extra, out of `words` in the sentence. */
  edits: number;
  words: number;
  model: string;
};

/** A calibration run's totals. */
export type CalibrationRun = Pick<Take, "run" | "model" | "edits" | "words"> & { takes: number };

export type Store = {
  /** Every term, most used first. */
  dictionary(): StoredEntry[];
  /** The same terms with their counts and dates, for showing the dictionary. */
  table(): DictionaryRow[];
  /**
   * Adds terms, or updates the ones already there; a missing heard or hint
   * keeps the old one. A term the user adds stops counting as learned.
   */
  addTerms(entries: DictionaryEntry[], options?: { learned?: boolean }): void;
  /** Whether there was such a term. Case doesn't matter. Its corrections go too. */
  removeTerm(term: string): boolean;
  /** Counts one sighting of the user correcting `from` to `to`; returns how many so far. */
  recordCorrection(from: string, to: string): number;
  /** Deletes every learned term and every correction; returns how many terms went. */
  forgetLearned(): number;
  /** One more use for each of these terms. */
  countUses(terms: string[]): void;
  /** Saves a take; reading the same sentence again in a run replaces it. */
  saveTake(take: Take): void;
  /** Each calibration run's totals, newest first. */
  calibrationRuns(): CalibrationRun[];
  /** One run's takes, in script order. */
  takes(run: number): Take[];
  /** Deletes every take; returns how many went. */
  forgetCalibration(): number;
  /** A setting, or undefined if it was never set (or the schema predates settings). */
  setting(key: string): string | undefined;
  /** Sets a setting; undefined deletes it, so the default applies again. */
  setSetting(key: string, value: string | undefined): void;
  close(): void;
};

/**
 * Opens `data.db`. Only the daemon opens it to write (docs/DATABASE.md §1);
 * anything else passes `readonly`, which also skips the migrations, so it
 * sees the schema the daemon left.
 */
export function openStore(path: string, { readonly = false } = {}): Store {
  const db = readonly
    ? new Database(path, { readonly: true })
    : new Database(path, { create: true });
  db.run("PRAGMA busy_timeout = 5000");
  if (!readonly) {
    db.run("PRAGMA journal_mode = WAL");
    // Immediate, so two mockingbirds starting at once can't both read version 0.
    db.transaction(() => {
      const { user_version: version } = db.query("PRAGMA user_version").get() as {
        user_version: number;
      };
      for (const sql of MIGRATIONS.slice(version)) db.run(sql);
      db.run(`PRAGMA user_version = ${MIGRATIONS.length}`);
    }).immediate();
  }

  const upsert = db.query(
    `INSERT INTO dictionary (term, heard, hint, learned, created_at, updated_at)
     VALUES ($term, $heard, $hint, $learned, $now, $now)
     ON CONFLICT (term) DO UPDATE SET
       term = excluded.term,
       heard = coalesce(excluded.heard, heard),
       hint = coalesce(excluded.hint, hint),
       learned = learned AND excluded.learned,
       updated_at = excluded.updated_at`,
  );
  const correction = db.query<{ count: number }, [string, string, number]>(
    `INSERT INTO correction (from_text, to_text, created_at, updated_at) VALUES (?1, ?2, ?3, ?3)
     ON CONFLICT (from_text, to_text) DO UPDATE SET
       count = count + 1,
       updated_at = excluded.updated_at
     RETURNING count`,
  );
  const use = db.query("UPDATE dictionary SET uses = uses + 1 WHERE term = ?");

  return {
    dictionary: () =>
      db
        .query<{ term: string; heard: string | null; hint: string | null; learned: number }, []>(
          "SELECT term, heard, hint, learned FROM dictionary ORDER BY uses DESC, term",
        )
        .all()
        .map(({ term, heard, hint, learned }) => ({
          term,
          ...(heard && { heard }),
          ...(hint && { hint }),
          ...(learned && { learned: true as const }),
        })),
    table: () =>
      db
        .query<Omit<DictionaryRow, "learned"> & { learned: number }, []>(
          "SELECT term, heard, hint, uses, learned, created_at AS createdAt FROM dictionary ORDER BY uses DESC, term",
        )
        .all()
        .map((row) => ({ ...row, learned: row.learned === 1 })),
    addTerms: db.transaction((entries: DictionaryEntry[], { learned = false } = {}) => {
      const now = Date.now();
      for (const { term, heard, hint } of entries) {
        upsert.run({
          $term: term,
          $heard: heard ?? null,
          $hint: hint ?? null,
          $learned: learned ? 1 : 0,
          $now: now,
        });
      }
    }),
    removeTerm: db.transaction((term: string) => {
      db.run("DELETE FROM correction WHERE to_text = ? COLLATE NOCASE", [term]);
      return db.run("DELETE FROM dictionary WHERE term = ?", [term]).changes > 0;
    }),
    recordCorrection: (from, to) => correction.get(from, to, Date.now())?.count ?? 1,
    forgetLearned: db.transaction(() => {
      db.run("DELETE FROM correction");
      return db.run("DELETE FROM dictionary WHERE learned").changes;
    }),
    countUses: db.transaction((terms: string[]) => {
      for (const term of terms) use.run(term);
    }),
    saveTake: (take) => {
      db.run(
        `INSERT OR REPLACE INTO calibration
           (run, sentence, text, heard, edits, words, model, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          take.run,
          take.sentence,
          take.text,
          take.heard,
          take.edits,
          take.words,
          take.model,
          Date.now(),
        ],
      );
    },
    calibrationRuns: () => {
      try {
        return db
          .query<CalibrationRun, []>(
            `SELECT run, max(model) AS model, sum(edits) AS edits, sum(words) AS words,
                    count(*) AS takes
             FROM calibration GROUP BY run ORDER BY run DESC`,
          )
          .all();
      } catch {
        // A read-only open of a data.db the daemon hasn't migrated yet.
        return [];
      }
    },
    takes: (run) =>
      db
        .query<Take, [number]>(
          `SELECT run, sentence, text, heard, edits, words, model
           FROM calibration WHERE run = ? ORDER BY sentence`,
        )
        .all(run),
    forgetCalibration: () => db.run("DELETE FROM calibration").changes,
    setting: (key) => {
      try {
        return (
          db.query<{ value: string }, [string]>("SELECT value FROM settings WHERE key = ?").get(key)
            ?.value ?? undefined
        );
      } catch {
        // A read-only open of a data.db the daemon hasn't migrated yet.
        return undefined;
      }
    },
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
