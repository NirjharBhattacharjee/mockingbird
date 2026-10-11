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
];

export type Store = {
  /** Every term, most used first. */
  dictionary(): DictionaryEntry[];
  /** Adds terms, or updates the ones already there; a missing heard or hint keeps the old one. */
  addTerms(entries: DictionaryEntry[]): void;
  /** Whether there was such a term. Case doesn't matter. */
  removeTerm(term: string): boolean;
  /** One more use for each of these terms. */
  countUses(terms: string[]): void;
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
    `INSERT INTO dictionary (term, heard, hint, created_at, updated_at)
     VALUES ($term, $heard, $hint, $now, $now)
     ON CONFLICT (term) DO UPDATE SET
       term = excluded.term,
       heard = coalesce(excluded.heard, heard),
       hint = coalesce(excluded.hint, hint),
       updated_at = excluded.updated_at`,
  );
  const use = db.query("UPDATE dictionary SET uses = uses + 1 WHERE term = ?");

  return {
    dictionary: () =>
      db
        .query<{ term: string; heard: string | null; hint: string | null }, []>(
          "SELECT term, heard, hint FROM dictionary ORDER BY uses DESC, term",
        )
        .all()
        .map(({ term, heard, hint }) => ({
          term,
          ...(heard && { heard }),
          ...(hint && { hint }),
        })),
    addTerms: db.transaction((entries: DictionaryEntry[]) => {
      const now = Date.now();
      for (const { term, heard, hint } of entries) {
        upsert.run({ $term: term, $heard: heard ?? null, $hint: hint ?? null, $now: now });
      }
    }),
    removeTerm: (term) => db.run("DELETE FROM dictionary WHERE term = ?", [term]).changes > 0,
    countUses: db.transaction((terms: string[]) => {
      for (const term of terms) use.run(term);
    }),
    close: () => db.close(),
  };
}
