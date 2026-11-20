// bun scripts/style-roles.ts: each motion style's typography roles (#276), read
// from what it draws in the pinned Chrome, into styles/roles.json. The title's
// font and colour, the label's font and colour, an accent label's colour, and
// the surface's average colour. Run after adding or changing a style.
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { findChrome, fontFaces } from "../apps/daemon/src/models.ts";
import { launchChrome, pageFonts } from "../packages/motion/src/index.ts";

const motion = join(import.meta.dir, "../plugin/skills/motion-graphics");
const chromePath = findChrome();
if (!chromePath) throw new Error("No Chrome: run `mockingbird models pull chrome`.");
const dir = mkdtempSync(join(tmpdir(), "style-roles-"));
const page = join(dir, "roles.html");
writeFileSync(
  page,
  `<!doctype html><body><script>${pageFonts(fontFaces())}</script><script type="module">
import { STYLES, style } from ${JSON.stringify(pathToFileURL(join(motion, "styles.js")).href)};
window.roles = async () => {
  const W = 960, H = 540, m = { width: W, height: H, fps: 30, duration: 4, frame: 60, cues: [] };
  const out = {};
  for (const id of Object.keys(STYLES)) {
    const c = new OffscreenCanvas(W, H);
    const ctx = c.getContext("2d");
    // What each call sets: fonts in order, and the colour of the text it fills.
    let fonts = [], inks = [];
    const proto = Object.getPrototypeOf(ctx);
    const font = Object.getOwnPropertyDescriptor(proto, "font");
    const fillText = proto.fillText;
    Object.defineProperty(ctx, "font", { get() { return font.get.call(this); }, set(v) { fonts.push(v); font.set.call(this, v); } });
    ctx.fillText = function (...a) { if (typeof this.fillStyle === "string") inks.push(this.fillStyle); return fillText.apply(this, a); };
    const record = (draw) => { fonts = []; inks = []; draw(); return { fonts: [...fonts], inks: [...inks] }; };
    const look = style(id, ctx, 2, m);
    look.surface();
    // The surface's colour: the average of its middle.
    const px = ctx.getImageData(W / 4, H / 4, W / 2, H / 2).data;
    let [r, g, b] = [0, 0, 0];
    for (let i = 0; i < px.length; i += 4) { r += px[i]; g += px[i + 1]; b += px[i + 2]; }
    const n = px.length / 4;
    const hex = (v) => Math.round(v / n).toString(16).padStart(2, "0");
    const title = record(() => look.title("Title", { at: 0, dur: 0.3 }));
    const label = record(() => look.label("Label", 0.5, 0.5, { at: 0 }));
    const accent = record(() => look.label("Accent", 0.5, 0.6, { at: 0, tone: "accent" }));
    out[id] = { title, label, accent, background: "#" + hex(r) + hex(g) + hex(b) };
  }
  return out;
};
window.ready = true;
</script></body>`,
);

const chrome = await launchChrome(chromePath);
try {
  const { targetId } = await chrome.send<{ targetId: string }>("Target.createTarget", {
    url: "about:blank",
  });
  const { sessionId } = await chrome.send<{ sessionId: string }>("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  const ev = async (expression: string) => {
    const r = await chrome.send<{
      result?: { value?: unknown };
      exceptionDetails?: { text: string };
    }>(
      "Runtime.evaluate",
      { expression, awaitPromise: true, returnByValue: true },
      sessionId,
      120_000,
    );
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result?.value;
  };
  await chrome.send("Page.enable", {}, sessionId);
  await chrome.send("Page.navigate", { url: pathToFileURL(page).href }, sessionId);
  for (let i = 0; i < 100 && !(await ev("window.ready === true")); i++) await Bun.sleep(100);
  await ev("document.fonts.ready.then(() => true)");
  const raw = (await ev("window.roles()")) as Record<
    string,
    Record<string, { fonts: string[]; inks: string[] }> & { background: string }
  >;
  // A font string's first family, and the size-free weight.
  const family = (font = "") =>
    font
      .replace(/^.*?\d+(\.\d+)?px\s+/, "")
      .split(",")[0]
      ?.trim()
      .replace(/^["']|["']$/g, "") ?? "";
  const weight = (font = "") =>
    Number(/\b([1-9]00)\b/.exec(font)?.[1] ?? (/\bbold\b/.test(font) ? 700 : 400));
  // The biggest font a call set is its text; the rest are decoration.
  const main = (fonts: string[]) =>
    fonts.reduce(
      (best, f) =>
        Number(/(\d+(\.\d+)?)px/.exec(f)?.[1] ?? 0) > Number(/(\d+(\.\d+)?)px/.exec(best)?.[1] ?? 0)
          ? f
          : best,
      fonts[0] ?? "",
    );
  // Pixel styles draw text on a canvas of their own, out of sight of the hook:
  // their first font stack in the source stands in.
  const declared = (id: string) =>
    /['"`]["']?([A-Z][^"',]+)["']?, ["']Noto Color Emoji/.exec(
      readFileSync(join(motion, "styles", `${id}.ts`), "utf8"),
    )?.[1] ?? "Inter";
  const roles = Object.fromEntries(
    Object.entries(raw).map(([id, r]) => {
      const t = main(r.title?.fonts ?? []);
      const l = main(r.label?.fonts ?? []);
      return [
        id,
        {
          title: { family: family(t) || family(l) || declared(id), weight: weight(t) },
          body: { family: family(l) || family(t) || declared(id), weight: weight(l) },
          ink: r.label?.inks.at(-1) ?? r.title?.inks.at(-1) ?? "#000000",
          accent: r.accent?.inks.at(-1) ?? r.title?.inks.at(-1) ?? "#000000",
          background: r.background,
        },
      ];
    }),
  );
  writeFileSync(join(motion, "styles/roles.json"), `${JSON.stringify(roles, null, 2)}\n`);
  console.log(`${Object.keys(roles).length} styles' roles in styles/roles.json`);
} finally {
  await chrome.close();
}
