import { type Ctx, DEFAULT_CTX, EFFECTS, type Effect } from "./catalog.ts";
import { checkMask, type Mask, maskSteps } from "./masks.ts";

/** `effects`, checked against the catalog: each one's numbers in range, its files given. */
export function checkEffects(effects: unknown, what: string): Effect[] {
  if (effects === undefined) return [];
  if (!Array.isArray(effects)) throw new Error(`${what} must be a list of { name, ... }`);
  return effects.map((e, i) => {
    const at = `${what}[${i}]`;
    if (typeof e !== "object" || e === null) throw new Error(`${at} must be an object`);
    const { name, ...given } = e as Record<string, unknown>;
    const entry = EFFECTS[String(name)];
    if (!entry) {
      throw new Error(`${at}.name must be one of ${Object.keys(EFFECTS).join(", ")}; got ${name}`);
    }
    for (const [key, value] of Object.entries(given)) {
      if (key === "mask") {
        if (entry.kind !== "video") throw new Error(`${at}: only a picture effect takes a mask`);
        // Its new frames are made for the whole clip before any effect runs (#257).
        if (name === "interpolate")
          throw new Error(`${at}: interpolate makes the whole clip's frames; it takes no mask`);
        checkMask(value, `${at}.mask`);
        continue;
      }
      if (entry.colors && key in entry.colors) {
        if (typeof value !== "string" || !/^#?[0-9a-f]{6}$/i.test(value)) {
          throw new Error(
            `${at}.${key} must be a colour like "#00ff00"; got ${JSON.stringify(value)}`,
          );
        }
        continue;
      }
      if (entry.files?.includes(key)) {
        if (typeof value !== "string" || !value) throw new Error(`${at}.${key} must be a path`);
        continue;
      }
      const p = entry.params[key];
      if (!p) {
        const known = [
          ...Object.keys(entry.params),
          ...(entry.files ?? []),
          ...Object.keys(entry.colors ?? {}),
          ...(entry.kind === "video" && name !== "interpolate" ? ["mask"] : []),
        ].join(", ");
        throw new Error(`${at}: ${name} has no ${key}; it takes ${known}`);
      }
      const n = Number(value);
      if (typeof value !== "number" || !Number.isFinite(n) || n < p.min || n > p.max) {
        throw new Error(
          `${at}.${key} must be from ${p.min} to ${p.max}; got ${JSON.stringify(value)}`,
        );
      }
    }
    for (const file of entry.files ?? []) {
      if (given[file] === undefined) throw new Error(`${at}: ${name} needs ${file}`);
    }
    return { name: String(name), ...given };
  });
}

/** One effect's filter for its picture or sound, and for the sound too if it changes both. */
function built(
  { name, ...given }: Effect,
  ctx: Ctx,
): { kind: "video" | "audio"; filter: string; sound: string } | undefined {
  const entry = EFFECTS[name];
  if (!entry) return undefined;
  const numbers: Record<string, number> = {};
  for (const [key, p] of Object.entries(entry.params)) {
    numbers[key] = typeof given[key] === "number" ? (given[key] as number) : p.default;
  }
  const strings: Record<string, string> = {
    ...entry.colors,
    ...Object.fromEntries(
      [...(entry.files ?? []), ...Object.keys(entry.colors ?? {})]
        .filter((k) => given[k] !== undefined)
        .map((k) => [k, String(given[k])]),
    ),
  };
  return {
    kind: entry.kind,
    filter: entry.build(numbers, strings, ctx),
    sound: entry.sound?.(numbers) ?? "",
  };
}

/**
 * A clip's effects as filter chains for its picture and its sound ("" for
 * none). Masked picture effects are left to pictureSteps, which needs a graph.
 */
export function effectFilters(
  effects: Effect[] = [],
  ctx: Ctx = DEFAULT_CTX,
): { video: string; audio: string } {
  const chains = { video: [] as string[], audio: [] as string[] };
  for (const e of effects) {
    const b = built(e, ctx);
    if (!b) continue;
    if (b.filter && !e.mask) chains[b.kind].push(b.filter);
    if (b.sound) chains.audio.push(b.sound);
  }
  return { video: chains.video.join(","), audio: chains.audio.join(",") };
}

/** Whether any of `effects` is masked, so the picture needs pictureSteps' graph. */
export const masked = (effects: Effect[] = []) => effects.some((e) => e.mask);

/**
 * The picture effects from `input` to `output` as graph steps; each masked
 * one is split off, put through its effect, given the mask as its alpha and
 * laid back over the picture. `tag` keeps the labels apart between clips.
 */
export function pictureSteps(
  effects: Effect[],
  input: string,
  output: string,
  ctx: Ctx,
  tag: string,
): string[] {
  const steps: string[] = [];
  let at = input;
  let chain: string[] = [];
  const flush = (to: string) => {
    steps.push(`${at}${chain.join(",") || "null"}${to}`);
    at = to;
    chain = [];
  };
  effects.forEach((e, n) => {
    const b = built(e, ctx);
    if (!b?.filter || b.kind !== "video") return;
    if (!e.mask) {
      chain.push(b.filter);
      return;
    }
    const l = (s: string) => `[${tag}${s}${n}]`;
    flush(l("p"));
    steps.push(
      `${at}split${l("k")}${l("e")}`,
      // A letter between tag and index, as l() has: clip 1's effect 10 and clip 11's effect 0 differ.
      ...maskSteps(e.mask as Mask, ctx, l("m"), `${tag}q${n}`),
      `${l("e")}${b.filter},format=yuva420p${l("f")}`,
      `${l("f")}${l("m")}alphamerge${l("x")}`,
      `${l("k")}${l("x")}overlay=format=auto${l("o")}`,
    );
    at = l("o");
  });
  flush(output);
  return steps;
}
