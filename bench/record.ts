/**
 * Records from the microphone into bench/voice/<name>.wav, for measuring
 * transcription on a real voice instead of synthetic clips.
 *
 *   bun run bench:record my-clip          # records until you press Enter
 *
 * Also writes bench/voice/<name>.txt for you to type what you actually said;
 * bench/voice/ is gitignored — the recordings stay on this machine.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  concatSamples,
  encodeWav,
  loudestWindowRms,
  startCapture,
} from "../packages/audio/src/index.ts";

const name = process.argv[2];
if (!name) {
  console.error("usage: bun run bench:record <name>");
  process.exit(2);
}

const dir = join(import.meta.dir, "voice");
mkdirSync(dir, { recursive: true });
const wav = join(dir, `${name}.wav`);
const txt = join(dir, `${name}.txt`);

const chunks: Int16Array[] = [];
const capture = startCapture({ onSamples: (s) => chunks.push(s) });
console.log("recording — speak, then press Enter to stop");

await new Promise<void>((resolve) => {
  process.stdin.resume();
  process.stdin.once("data", () => resolve());
});
await capture.stop();
process.stdin.pause();

const audio = { samples: concatSamples(chunks), sampleRate: 16000 };
if (audio.samples.length === 0) {
  console.error(`nothing was recorded. ${capture.stderrTail()}`);
  process.exit(1);
}
writeFileSync(wav, encodeWav(audio));
writeFileSync(txt, "", { flag: "wx" });
const seconds = (audio.samples.length / audio.sampleRate).toFixed(1);
console.log(`saved ${wav} (${seconds}s, level ${loudestWindowRms(audio).toFixed(3)})`);
console.log(`now type what you actually said into ${txt}`);
