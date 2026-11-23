import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { compile, load } from "@mockingbird/timeline";
import { type Source, toFcpxml, toOtio } from "@mockingbird/timeline/export";
import { probe } from "../inspect/probe.ts";
import { requireFile } from "../runtime.ts";

/**
 * `export`: the project at `file` as FCPXML and/or OTIO (#198), each source
 * probed for its length, size and rate. Never overwrites: a taken name gets -N.
 */
export async function exportProject(file: string, format: string, out: unknown): Promise<string> {
  if (!["fcpxml", "otio", "both"].includes(format)) {
    throw new Error(`format must be fcpxml, otio or both; got ${format}`);
  }
  const project = load(requireFile(file, "Project")).project;
  if (!project.clips.length) throw new Error(`${file} has no clips to export.`);
  const compiled = compile(project, dirname(file));
  // An HTML overlay is drawn by Chrome at render time, so there's no media for an editor to take.
  const pages = compiled.inserts.filter((i) => /\.html?$/i.test(i.path));
  const cut = { ...compiled, inserts: compiled.inserts.filter((i) => !pages.includes(i)) };
  const paths = [
    ...new Set([
      ...cut.clips.map((c) => c.path),
      ...cut.inserts.map((i) => i.path),
      ...cut.sounds.flatMap((s) => (s.path ? [s.path] : [])),
    ]),
  ];
  const facts = new Map<string, Source>();
  for (const p of paths) {
    const pr = await probe(requireFile(p, "Source"));
    facts.set(p, {
      seconds: pr.seconds,
      video: pr.video,
      audio: pr.audio,
      size: pr.size,
      fps: pr.fps,
    });
  }
  const info = (p: string) => facts.get(p) as Source;
  const first = info(cut.clips[0]?.path as string);
  const size = cut.size ?? (cut.split ? "1080x1920" : first.size);
  const fps = cut.fps ?? first.fps;
  const name = basename(file).replace(/\.json$/i, "");
  const dir = out === undefined ? dirname(file) : resolve(String(out));
  mkdirSync(dir, { recursive: true });
  const free = (ext: string) => {
    for (let n = 0; ; n++) {
      const f = join(dir, `${name}${n ? `-${n}` : ""}.${ext}`);
      if (!existsSync(f)) return f;
    }
  };
  const saved: string[] = [];
  let left: string[] = [];
  if (format !== "otio") {
    const x = toFcpxml(cut, name, size, fps, info);
    const f = free("fcpxml");
    writeFileSync(f, x.text);
    saved.push(f);
    left = x.left;
  }
  if (format !== "fcpxml") {
    const o = toOtio(cut, name, fps, info);
    const f = free("otio");
    writeFileSync(f, o.text);
    saved.push(f);
    // Both formats: everything either one leaves out, said once.
    left = [...new Set([...left, ...o.left])];
  }
  if (pages.length) left = [...left, `${pages.length} HTML overlay page(s)`];
  return [
    `Saved ${saved.join(" and ")} (${size}, ${fps} fps, ${cut.clips.length} clips).`,
    left.length ? `Not carried, so redo them in the editor: ${left.join("; ")}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
