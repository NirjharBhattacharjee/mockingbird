/** A word of a diff, and whether it matched the other side. */
export type DiffWord = { word: string; ok: boolean };

export type WordDiff = {
  /** Substitutions, insertions and deletions. */
  edits: number;
  /** The reference's length. */
  words: number;
  reference: DiffWord[];
  hypothesis: DiffWord[];
};

/** Words as written, without punctuation: `7:45` is two, `don't` one. */
const words = (text: string) => text.match(/[\p{L}\p{N}']+/gu) ?? [];

/**
 * The fewest word edits that turn `reference` into `hypothesis`, ignoring
 * case and punctuation, with each side's words marked matched or not. Sum
 * `edits` and `words` over a corpus for its word error rate: averaging
 * per-sentence rates would weight short sentences more.
 */
export function wordDiff(reference: string, hypothesis: string): WordDiff {
  const r = words(reference);
  const h = words(hypothesis);
  const same = (i: number, j: number) => r[i]?.toLowerCase() === h[j]?.toLowerCase();
  // d[i][j]: edits between the first i reference words and the first j heard.
  const d = Array.from({ length: r.length + 1 }, (_, i) =>
    Array.from({ length: h.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  const at = (i: number, j: number) => d[i]?.[j] ?? 0;
  for (let i = 1; i <= r.length; i++) {
    for (let j = 1; j <= h.length; j++) {
      (d[i] as number[])[j] = Math.min(
        at(i - 1, j) + 1,
        at(i, j - 1) + 1,
        at(i - 1, j - 1) + (same(i - 1, j - 1) ? 0 : 1),
      );
    }
  }
  // Walk back from the end to mark which words matched.
  const rMarks = r.map((word) => ({ word, ok: false }));
  const hMarks = h.map((word) => ({ word, ok: false }));
  for (let i = r.length, j = h.length; i > 0 || j > 0; ) {
    if (i > 0 && j > 0 && at(i, j) === at(i - 1, j - 1) + (same(i - 1, j - 1) ? 0 : 1)) {
      if (same(i - 1, j - 1)) {
        (rMarks[i - 1] as DiffWord).ok = true;
        (hMarks[j - 1] as DiffWord).ok = true;
      }
      i--;
      j--;
    } else if (i > 0 && at(i, j) === at(i - 1, j) + 1) i--;
    else j--;
  }
  return { edits: at(r.length, h.length), words: r.length, reference: rMarks, hypothesis: hMarks };
}
