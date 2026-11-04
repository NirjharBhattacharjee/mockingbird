/**
 * Runs one motion script or HTML page and prints, as one JSON line, how
 * many frames it drew and the sounds it asks for. `mockingbird mcp` starts
 * this in its own process under macOS's sandbox with the network denied, so
 * a client's script, or the Chrome a page renders in, can't break
 * mockingbird's one-download rule (ARCHITECTURE.md §9) or take the server
 * down with it. Arguments are one JSON object: renderMotion's options plus
 * `script`, and `chrome` for a page; or, with `music`, renderMusic's
 * options, `script` being the generator.
 */
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { type Draw, renderHtml, renderMotion, renderMusic } from "@mockingbird/motion";

const { script, chrome, music, ...options } = JSON.parse(process.argv[2] ?? "{}");

/** A list of sounds with paths from the script's folder, as an import's would be. */
function soundsOf(listed: unknown, where: string) {
  if (listed !== undefined && listed !== null && !Array.isArray(listed)) {
    throw new Error(`${where} must be a list of { path, at, volume, loop, duck }.`);
  }
  return (listed ?? []).map((sound: { path?: unknown }, i: number) => {
    const path = resolve(dirname(script), String(sound?.path));
    if (!existsSync(path)) throw new Error(`audio[${i}]: there's no file at ${path}`);
    return { ...sound, path };
  });
}

try {
  if (music) {
    await renderMusic(script, { chrome, ...options });
    console.log(JSON.stringify({ made: true }));
    process.exit(0);
  }
  let frames: number;
  let sounds: unknown[] = [];
  if (/\.html?$/i.test(script)) {
    frames = await renderHtml(script, {
      ...options,
      chrome,
      // Checked once the page has loaded, before drawing, so a typo costs no render.
      onLoad: ({ audio }) => {
        sounds = soundsOf(audio, `${script}'s \`mockingbird.audio\``);
      },
    });
  } else {
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
    sounds = soundsOf(listed, `${script}'s \`audio\``);
    frames = await renderMotion(draw, options);
  }
  console.log(JSON.stringify({ frames, sounds }));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
