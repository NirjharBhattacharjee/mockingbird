/**
 * Runs one motion script and prints, as one JSON line, how many frames it
 * drew and the sounds its `audio` export asks for. `mockingbird mcp`
 * starts this in its own process under macOS's sandbox with the network
 * denied, so a client's script can't break mockingbird's one-download rule
 * (ARCHITECTURE.md §9) or take the server down with it. Arguments are one
 * JSON object: renderMotion's options plus `script`.
 */
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { type Draw, renderMotion } from "@mockingbird/motion";

const { script, ...options } = JSON.parse(process.argv[2] ?? "{}");
try {
  const module = await import(script);
  const draw: Draw = module.default;
  if (typeof draw !== "function") {
    throw new Error(`${script} needs \`export default function draw(ctx, t, m)\`.`);
  }
  // `export const audio = [...]`, or a function of the scene that returns one.
  const { width, height, fps, duration, cues } = options;
  const listed =
    typeof module.audio === "function"
      ? await module.audio({ width, height, fps, duration, cues })
      : module.audio;
  if (listed !== undefined && !Array.isArray(listed)) {
    throw new Error(`${script}'s \`audio\` must be a list of { path, at, volume, loop, duck }.`);
  }
  // From the script's folder, as an import would be; checked before drawing, so a typo costs no render.
  const sounds = (listed ?? []).map((sound: { path?: unknown }, i: number) => {
    const path = resolve(dirname(script), String(sound?.path));
    if (!existsSync(path)) throw new Error(`audio[${i}]: there's no file at ${path}`);
    return { ...sound, path };
  });
  const frames = await renderMotion(draw, options);
  console.log(JSON.stringify({ frames, sounds }));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
