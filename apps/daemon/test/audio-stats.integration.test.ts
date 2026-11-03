import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { audioStats } from "../src/audio-stats.ts";

const home = process.env.MOCKINGBIRD_HOME ?? join(homedir(), ".mockingbird");
const hello = join(import.meta.dir, "../../../bench/fixtures/hello.wav");
const dir = mkdtempSync(join(tmpdir(), "audio-stats-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function ffmpeg(...args: string[]) {
  const r = Bun.spawnSync(["ffmpeg", "-v", "error", "-y", ...args], { stderr: "pipe" });
  if (r.exitCode !== 0) throw new Error(r.stderr.toString());
}

describe.skipIf(!process.env.MOCKINGBIRD_INTEGRATION)("audio_stats (integration)", () => {
  test("speech over a 96 BPM kick 20 dB down, and the kick alone", async () => {
    const voice = join(dir, "voice.wav");
    const kick = join(dir, "kick.wav");
    const mix = join(dir, "mix.wav");
    // The fixture twice with a pause between, then 3 s of nothing: 13.5 s.
    ffmpeg(
      ...["-i", hello, "-i", hello, "-filter_complex"],
      "[0]apad=pad_dur=1.5[a];[a][1]concat=n=2:v=0:a=1,apad=pad_dur=3",
      voice,
    );
    // A decaying 55 Hz thump every 0.625 s (96 BPM), peaking past full scale.
    ffmpeg(
      ...["-f", "lavfi", "-i"],
      "aevalsrc='sin(2*PI*55*t)*exp(-12*mod(t,0.625))+0.3*sin(2*PI*220*t)':s=16000:d=13.5",
      kick,
    );
    // The kick's RMS is about -11 dBFS and the speech's about -18: -27 dB puts it 20 under.
    ffmpeg(
      ...["-i", voice, "-i", kick, "-filter_complex"],
      "[1]volume=-27dB[m];[0][m]amix=inputs=2:normalize=0",
      mix,
    );

    const mixed = await audioStats(mix, {}, home);
    const under = Number(mixed.match(/, (-?[\d.]+) dB under the voice/)?.[1]);
    expect(Math.abs(under - 20)).toBeLessThan(2);
    expect(mixed).toMatch(/speech: [6-8]\d% of it/);

    const alone = await audioStats(kick, {}, home);
    expect(alone).toMatch(/beat: 9[56]\.\d BPM, one every 0\.6[23]\d s/);
    expect(alone).toContain("probably clipped");
    expect(alone).toContain("speech: none");

    const stretch = await audioStats(kick, { from: 5, to: 10 }, home);
    expect(stretch).toContain(", 0:05.0 to 0:10.0");
  }, 60_000);
});
