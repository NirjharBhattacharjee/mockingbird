// bun bench/edit.ts <out dir>: one short made with every editing tool, in the
// order an agent calls them (transcribe, captions, render, motion), timed,
// with stills from the result. CI runs it on Windows (#202); it needs ffmpeg,
// whisper-server, the models and the pinned Chrome.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { mcpTools } from "../apps/daemon/src/mcp.ts";

const out = resolve(process.argv[2] ?? "edit-out");
mkdirSync(out, { recursive: true });
const tools = mcpTools(
  async () => ({}),
  () => {},
);
const call = async (name: string, args: Record<string, unknown>) => {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`no ${name} tool`);
  const t = performance.now();
  const result = await tool.run(args);
  console.log(`${name}: ${((performance.now() - t) / 1000).toFixed(1)} s`);
  return result;
};
const ffmpeg = (args: string[]) => {
  const r = Bun.spawnSync(["ffmpeg", "-nostdin", "-y", "-loglevel", "error", ...args]);
  if (r.exitCode !== 0) throw new Error(r.stderr.toString());
};

// A 16:9 "talk": a moving test picture under the speech fixture, padded to 6 s.
const talk = join(out, "talk.mp4");
ffmpeg([
  ...["-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=30:duration=6"],
  ...["-i", resolve(import.meta.dir, "fixtures/hello.wav")],
  ...["-af", "apad", "-t", "6", "-pix_fmt", "yuv420p", "-shortest", talk],
]);
const clips = [{ from: 0, to: 5.5 }];

console.log(await call("transcribe", { path: talk }));
const srt = String(await call("captions", { path: talk, clips }));
writeFileSync(join(out, "captions.srt"), srt);
const cut = join(out, "cut.mp4");
const final = join(out, "short.mp4");
// render and motion never overwrite: clear this script's own outputs from a run before.
for (const file of [cut, final]) rmSync(file, { force: true });
// The captions go on in the motion pass, which draws its own, so not here too.
console.log(await call("render", { path: talk, clips, vertical: true, out: cut }));

// The kit's short template as it ships (motion fills in "KIT"), as a full-frame
// shot, with its hook over the cut.
const page = join(out, "short.html");
writeFileSync(
  page,
  readFileSync(
    resolve(import.meta.dir, "../plugin/skills/motion-graphics/templates/short.html"),
    "utf8",
  ).replace("const SPLIT = true;", "const SPLIT = false;"),
);
console.log(await call("motion", { script: page, path: cut, captions: srt, out: final }));

for (const at of [0.5, 3]) {
  ffmpeg(["-ss", String(at), "-i", final, "-frames:v", "1", join(out, `still-${at}s.png`)]);
}
console.log(`stills in ${out}`);
