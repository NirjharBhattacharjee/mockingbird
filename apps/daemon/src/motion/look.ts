import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { PLUGIN } from "../guide.ts";
import { probe } from "../inspect/probe.ts";
import { requireFile } from "../runtime.ts";
import { KIT_URL, STYLES_URL, THREE_URL } from "./kit.ts";
import type { Host, Motion } from "./run.ts";

const MOTION = join(PLUGIN, "skills", "motion-graphics");
/** The page a look board renders: templates/look-board.html. */
export const LOOK_BOARD = join(MOTION, "templates", "look-board.html");

/** Words from the video for the look board: a title, up to three short labels, and a number. */
export type Board = {
  title: string;
  points: string[];
  stat?: { value: number; unit?: string; label?: string };
};

/** A build message with its place: `file:line:column: message`, then the line. */
function where(log: unknown): string {
  const { message, position: p } = log as {
    message?: string;
    position?: { file: string; line: number; column: number; lineText: string } | null;
  };
  if (!p) return String(message ?? log);
  return `${p.file}:${p.line}:${p.column}: ${message}\n  ${p.lineText.trim()}`;
}

/**
 * Builds the look the agent wrote at `file` (TypeScript or JavaScript) into
 * one module, `out` (`<name>.look.js` beside it by default), that a page
 * imports. "STYLES", "KIT" and "THREE" stay imports of the plugin's built
 * files by their file URLs, so the module holds only the look itself. A
 * mistake comes back with its line. Returns the module's path.
 */
export async function buildLook(
  file: string,
  out = join(dirname(file), `${basename(file, extname(file))}.look.js`),
): Promise<string> {
  requireFile(file, "Look");
  if (!/\.(ts|js|mjs)$/i.test(file)) {
    throw new Error(`A look is a .ts or .js module; ${file} isn't one.`);
  }
  let built: Awaited<ReturnType<typeof Bun.build>>;
  try {
    built = await Bun.build({
      entrypoints: [file],
      target: "browser",
      format: "esm",
      plugins: [
        {
          name: "mockingbird-look",
          setup(b) {
            // The plugin's built files, imported by their file URLs, not bundled:
            // the kit finds its sounds and grain beside itself (a bundled copy
            // would look beside the look), and a page that imports STYLES too
            // loads one copy of the styles, not two (#263).
            const external = (path: string) => () => ({ path, external: true });
            b.onResolve({ filter: /^KIT$|[\\/]kit\.ts$/ }, external(KIT_URL));
            b.onResolve({ filter: /^STYLES$/ }, external(STYLES_URL));
            b.onResolve({ filter: /^THREE$/ }, external(THREE_URL));
          },
        },
      ],
    });
  } catch (error) {
    const logs = (error as { errors?: unknown[] }).errors;
    throw new Error(
      `The look at ${file} doesn't build:\n${logs?.length ? logs.map(where).join("\n") : String(error)}`,
    );
  }
  const [module] = built.outputs;
  if (!built.success || !module) {
    throw new Error(`The look at ${file} doesn't build:\n${built.logs.map(where).join("\n")}`);
  }
  writeFileSync(out, await module.text());
  return out;
}

/**
 * `out`, or `<look>-board-N.mp4` beside the look with the first N whose clip
 * and contact sheet are both free. The sheet is claimed here; the clip is
 * left for `motion` to claim.
 */
function boardTarget(
  host: Host,
  file: string,
  out: string | undefined,
): { clip: string; sheet: string } {
  const sheetOf = (clip: string) => `${clip.replace(/\.mp4$/i, "")}-sheet.jpg`;
  if (out) {
    const sheet = sheetOf(out);
    if (existsSync(out) || !host.claim(sheet)) {
      throw new Error(`${out} or its sheet ${sheet} already exists; give another \`out\`.`);
    }
    return { clip: out, sheet };
  }
  const base = join(dirname(file), basename(file, extname(file)));
  for (let n = 1; ; n++) {
    const clip = `${base}-board-${n}.mp4`;
    if (!existsSync(clip) && host.claim(sheetOf(clip))) return { clip, sheet: sheetOf(clip) };
  }
}

/**
 * Shows a look before editing starts (#262): builds it, draws it, and saves
 * the clip and a contact sheet of twelve stills beside the look, for the user
 * to approve or send back. With `page`, the agent's own board (a page that
 * imports the look `from "LOOK"`, drawn from the video's content) is drawn,
 * over `path` if given; without, a generic storyboard of `board`'s words.
 */
export async function lookBoard(
  motion: Motion,
  host: Host,
  file: string,
  board: Board,
  {
    size = "1920x1080",
    duration = 8.5,
    out,
    page: own,
    path,
  }: { size?: string; duration?: number; out?: string; page?: string; path?: string },
): Promise<string> {
  if (own) requireFile(own, "Board page");
  if (path) requireFile(path, "File");
  // Claimed before anything is written, so a taken `out` leaves nothing behind.
  const { clip: target, sheet } = boardTarget(host, file, out);
  // This board's own build, so a rebuild running alongside can't swap it out;
  // the stable <name>.look.js beside it is what the edit's pages import.
  const stamp = `${process.pid}-${randomUUID()}`;
  const mine = join(dirname(file), `.${basename(file)}.${stamp}.look.js`);
  const module = join(dirname(file), `${basename(file, extname(file))}.look.js`);
  const template = own ?? LOOK_BOARD;
  const page = join(dirname(own ?? file), `.${basename(template)}.board-${stamp}.html`);
  let drawn: string;
  try {
    await buildLook(file, mine);
    const url = JSON.stringify(pathToFileURL(mine).href);
    // Inline as data, never as code: "<" escaped so a title can't close the script,
    // and given through callbacks so "$&" in it isn't a replacement pattern.
    const words = JSON.stringify(board).replace(/</g, "\\u003c");
    writeFileSync(
      page,
      readFileSync(template, "utf8")
        .replaceAll('from "LOOK"', () => `from ${url}`)
        .replaceAll('const BOARD = "BOARD";', () => `const BOARD = ${words};`),
    );
    // A 3D look draws on the GPU, as a page that imports THREE does.
    const gpu = readFileSync(file, "utf8").includes('from "THREE"');
    drawn = await motion(
      page,
      path ? { path, duration, out: target, gpu } : { size, duration, out: target, gpu },
    );
    // Twelve stills over the clip as drawn: over a shorter `path`, it's shorter than `duration`.
    const length = (await probe(target)).seconds || duration;
    await host.ffmpeg(
      ["-i", target, "-vf", `fps=12/${length},scale=480:-2,tile=4x3`, "-frames:v", "1", sheet],
      "make the contact sheet",
    );
    // Only a look that drew becomes the one the edit's pages import, swapped in
    // whole so a render reading it never sees half a file.
    const swap = `${module}.${stamp}.tmp`;
    copyFileSync(mine, swap);
    renameSync(swap, module);
  } catch (error) {
    rmSync(sheet, { force: true });
    rmSync(target, { force: true });
    throw error;
  } finally {
    rmSync(page, { force: true });
    rmSync(mine, { force: true });
  }
  const pageUrl = JSON.stringify(pathToFileURL(module).href);
  return [
    `Look board: ${drawn}`,
    `Stills: ${sheet}`,
    `Built look: ${module}. A page imports it with \`import look from ${pageUrl}\` and draws with look.make(ctx, t, m).`,
    'Now show the user the stills and the clip, and ask them, word for word: "Should I edit with this look, or what should change?" Don\'t start editing until they say yes.',
    "When they do, save it in the project with edit's set { look: { file, mood, approved: true } }. If they say to skip the look, set { look: { skipped: true } }.",
  ].join("\n");
}
