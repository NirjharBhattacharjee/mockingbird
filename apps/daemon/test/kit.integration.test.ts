import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderHtml } from "@mockingbird/motion";
import { KIT_URL } from "../src/mcp.ts";
import { findChrome, fontFaces } from "../src/models.ts";

/**
 * The editor-reel pieces (#255), the scene camera (#274) and the light
 * (#275), each drawn alone on a frame of its own over the same board: every
 * one has to change the picture. MOCKINGBIRD_STILLS keeps a PNG of each,
 * for a person to look at.
 */
const PIECES: Record<string, string> = {
  board: "",
  tornFrame: "k.tornFrame({ x: W * 0.2, y: H * 0.2, w: W * 0.6, h: H * 0.6, at: 0 });",
  sticker: 'k.sticker({ text: "NEW", x: W / 2, y: H / 2, at: 0 });',
  tape: "k.tape(W / 2, H / 2, -0.4, 300);",
  scribble:
    "k.scribble({ points: Array.from({ length: 20 }, (_, i) => [W / 2 + Math.cos(i / 3) * 200, H / 2 + Math.sin(i / 3) * 120]), at: 0, loop: true, dur: 0.2 });",
  kinetic: 'k.kinetic({ text: "STOP", at: 0, mode: "scatter", color: "#111" });',
  glitch: 'k.title({ lines: ["glitch"], at: -1, x: W / 2, y: H / 2 }); k.glitch(0.4, 0.4);',
  zoomBlur: 'k.title({ lines: ["zoom"], at: -1, x: W / 2, y: H / 2 }); k.zoomBlur(0.55, 0.3);',
  view: 'const cam = k.view({ moves: [{ preset: "crash-zoom", at: 0, dur: 0.4 }] }); cam.layer(0, () => k.title({ lines: ["view"], at: -1, x: W / 2, y: H / 2 }));',
  sweep: "k.sweep(0.3, 0.6, 0.8);",
};

const stills = process.env.MOCKINGBIRD_STILLS;

describe.skipIf(!process.env.MOCKINGBIRD_INTEGRATION)("kit pieces (integration)", () => {
  test("each editor-reel, camera and light piece draws something", async () => {
    const dir = mkdtempSync(join(tmpdir(), "kit-pieces-"));
    const names = Object.keys(PIECES);
    const page = join(dir, "pieces.html");
    // Frame i draws piece i at 0.6 s into its own clock.
    writeFileSync(
      page,
      `<!doctype html><body style="margin:0"><script type="module">
import { kit, page, THEMES } from ${JSON.stringify(KIT_URL)};
const draws = [${names.map((n) => `(k, W, H) => { ${PIECES[n]} }`).join(",\n")}];
page((ctx, t, m) => {
  const k = kit(ctx, 0.6, m, { ...THEMES.punch, light: 120 });
  ctx.fillStyle = ctx.createPattern(k.paper(), "repeat");
  ctx.fillRect(0, 0, k.W, k.H);
  draws[m.frame](k, k.W, k.H);
});
</script></body>`,
    );
    const out = join(dir, "pieces.mp4");
    await renderHtml(page, {
      chrome: findChrome() as string,
      out,
      width: 960,
      height: 540,
      fps: 1,
      duration: names.length,
      fonts: fontFaces(),
    });
    // Each frame, kept as a still if asked, and as raw pixels at 96x54 to compare.
    const frames = names.map((name, i) => {
      const pick = ["-v", "error", "-i", out, "-vf", `select=eq(n\\,${i})`, "-frames:v", "1"];
      if (stills) {
        mkdirSync(stills, { recursive: true });
        Bun.spawnSync(["ffmpeg", "-y", ...pick, join(stills, `piece-${name}.png`)]);
      }
      const raw = Bun.spawnSync([
        "ffmpeg",
        ...pick.slice(0, 5),
        `${pick[5]},scale=96:54`,
        ...pick.slice(6),
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "-",
      ]);
      return raw.stdout;
    });
    const board = frames[0] as Uint8Array;
    const change = (f: Uint8Array) =>
      f.reduce((s, v, j) => s + Math.abs(v - (board[j] ?? 0)), 0) / f.length;
    for (const [i, name] of names.entries()) {
      // More than encoding noise (0.00 between identical frames); the faintest, tape, is 0.18.
      if (i)
        expect({ name, changed: change(frames[i] as Uint8Array) > 0.1 }).toEqual({
          name,
          changed: true,
        });
    }
  }, 120_000);
});
