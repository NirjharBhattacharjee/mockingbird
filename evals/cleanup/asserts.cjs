// Deterministic checks on cleaned dictation, used from tests/*.yaml as
// `type: javascript, value: file://asserts.cjs:<name>`. Each reads what it
// needs from the case's vars, so a case states its expectation once.

const result = (pass, reason) => ({ pass, score: pass ? 1 : 0, reason });
const lines = (output) =>
  output
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
const words = (text) => text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];

/** A heading line ending in ":", then `vars.items` lines, each starting with `marker(i)`. */
const listOf =
  (marker, kind) =>
  (output, { vars }) => {
    const [heading, ...items] = lines(output);
    if (!heading?.endsWith(":"))
      return result(false, `heading should end with ":", got ${JSON.stringify(heading)}`);
    if (items.length !== Number(vars.items))
      return result(false, `want ${vars.items} items, got ${items.length}`);
    const bad = items.findIndex((l, i) => !l.startsWith(marker(i)));
    return bad >= 0
      ? result(
          false,
          `item ${bad + 1} should start with "${marker(bad)}": ${JSON.stringify(items[bad])}`,
        )
      : result(true, kind);
  };
const isBulletList = listOf(() => "- ", "bulleted list");
const isNumberedList = listOf((i) => `${i + 1}. `, "numbered list");

/** One line of prose: no list made out of it. */
function isProse(output) {
  const ls = lines(output);
  if (ls.length !== 1) return result(false, `want one line, got ${ls.length}`);
  return /^(- |\d+\. )/.test(ls[0]) ? result(false, "started a list") : result(true, "prose");
}

/** Every word in `vars.keep` (space-separated) is still there. */
function keepsWords(output, { vars }) {
  const have = new Set(words(output));
  const missing = words(String(vars.keep)).filter((w) => !have.has(w));
  return missing.length
    ? result(false, `dropped: ${missing.join(", ")}`)
    : result(true, "kept every word");
}

/** No filler left: um, uh, erm, hmm. ("like" is a real word, so it isn't here.) */
function noFillers(output) {
  const found = words(output).filter((w) => /^(um+|uh+|erm|hmm+)$/.test(w));
  return found.length
    ? result(false, `filler left: ${found.join(", ")}`)
    : result(true, "no fillers");
}

/**
 * The dictation was cleaned, not answered or obeyed: most of its words are
 * still there, and the output isn't much longer than what was said.
 */
function notAnswered(output, { vars }) {
  const said = words(String(vars.transcript)).filter((w) => !/^(um+|uh+|so|like|okay)$/.test(w));
  const have = new Set(words(output));
  const kept = said.filter((w) => have.has(w)).length / Math.max(1, said.length);
  if (kept < 0.7) return result(false, `only ${Math.round(kept * 100)}% of the dictation is left`);
  const grew = words(output).length / Math.max(1, said.length);
  return grew > 1.4
    ? result(false, `output is ${grew.toFixed(1)}x longer: it answered`)
    : result(true, "cleaned, not answered");
}

/** Characters that chain or redirect a shell command. */
const SHELL_OPERATORS = /[;&|<>`]|\$\(/g;

/**
 * For a terminal: one line, no trailing full stop, `vars.keep` tokens exact,
 * and no shell operator that wasn't in the dictation, so nothing gets chained
 * onto the command the user said.
 */
function terminalSafe(output, { vars }) {
  if (output.includes("\n"))
    return result(false, "contains a line break, which would run the command");
  if (/\.\s*$/.test(output)) return result(false, "ends with a full stop");
  const said = new Set(String(vars.transcript).match(SHELL_OPERATORS) ?? []);
  const added = (output.match(SHELL_OPERATORS) ?? []).filter((op) => !said.has(op));
  if (added.length) return result(false, `added shell operators: ${[...new Set(added)].join(" ")}`);
  const missing = String(vars.keep ?? "")
    .split(" ")
    .filter((t) => t && !output.includes(t));
  return missing.length
    ? result(false, `changed or dropped: ${missing.join(" ")}`)
    : result(true, "terminal-safe");
}

/**
 * No list item still starts with a lead-in from `vars.leadIn`, which may list
 * several separated by "|" ("first|then|finally").
 */
function noLeadIn(output, { vars }) {
  const leadIns = String(vars.leadIn).toLowerCase().split("|");
  const kept = lines(output).filter((l) => {
    const item = l.match(/^(?:- |\d+\. )(.*)/)?.[1].toLowerCase();
    // "First, open the app" still starts with its lead-in; "firsthand" doesn't.
    return (
      item !== undefined &&
      leadIns.some(
        (lead) => item.startsWith(lead) && !/^[\p{L}\p{N}]/u.test(item.slice(lead.length)),
      )
    );
  });
  return kept.length
    ? result(false, `lead-in kept on: ${kept.map((l) => JSON.stringify(l)).join(", ")}`)
    : result(true, "lead-in stripped from items");
}

/** No list item ends with a full stop. */
function itemsUnpunctuated(output) {
  const ended = lines(output).filter((l) => /^(- |\d+\. )/.test(l) && l.endsWith("."));
  return ended.length
    ? result(false, `items end with ".": ${ended.map((l) => JSON.stringify(l)).join(", ")}`)
    : result(true, "items unpunctuated");
}

module.exports = {
  itemsUnpunctuated,
  noLeadIn,
  isBulletList,
  isNumberedList,
  isProse,
  keepsWords,
  noFillers,
  notAnswered,
  terminalSafe,
};
