import { open } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { type Chrome, launchChrome } from "./chrome.ts";

/** What a music generator is given, as its second argument. */
export type MusicParams = {
  duration: number;
  sampleRate: number;
  seed: number;
  tempo?: number;
  key?: string;
  /** 0 to 1, or a curve: [seconds, level] points, eased between. */
  energy?: number | [number, number][];
};

/** Seconds of sound read back from Chrome at a time: 3.8 MB of float32, one DevTools message. */
const CHUNK_SECONDS = 10;

/**
 * Runs the music generator `module` in the Chrome at `chrome` and saves what
 * it plays as a 32-bit float stereo WAV at `out`. The module's default
 * export is `(ctx, params)`, where ctx is an OfflineAudioContext as long as
 * `params.duration`; it schedules its sound on ctx and returns (or resolves)
 * once it has. Math.random is seeded from `params.seed`, so the same
 * arguments make the same track. Not the same bytes: Chrome sums a node's
 * inputs in an order that changes between runs, so float rounding differs in
 * the last bits (about 6e-8, -144 dBFS). Run it under an OS sandbox, as
 * `motion` is.
 */
export async function renderMusic(
  module: string,
  { chrome: chromePath, out, params }: { chrome: string; out: string; params: MusicParams },
): Promise<void> {
  const url = pathToFileURL(module).href;
  let chrome: Chrome | undefined;
  const file = await open(out, "w");
  try {
    chrome = await launchChrome(chromePath);
    // A page at the module's own address, so it and its relative imports load as files.
    const { targetId } = await chrome.send<{ targetId: string }>("Target.createTarget", { url });
    const { sessionId } = await chrome.send<{ sessionId: string }>("Target.attachToTarget", {
      targetId,
      flatten: true,
    });
    const run = async <T>(expression: string): Promise<T> => {
      const reply = await chrome?.send<{
        result: { value: T };
        exceptionDetails?: { text: string; exception?: { description?: string } };
      }>("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId);
      if (!reply) throw new Error("Chrome closed");
      const failed = reply.exceptionDetails;
      if (failed) throw new Error(failed.exception?.description ?? failed.text);
      return reply.result.value;
    };
    await waitForLoad(run);
    const frames = await run<number>(`(async () => {
      const params = ${JSON.stringify(params)};
      // mulberry32: the same numbers for the same seed, in every run.
      let s = params.seed >>> 0;
      Math.random = () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let x = Math.imul(s ^ (s >>> 15), 1 | s);
        x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
        return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
      };
      const make = (await import(${JSON.stringify(url)})).default;
      if (typeof make !== "function") {
        throw new Error("a music generator needs \`export default function (ctx, params)\`");
      }
      const ctx = new OfflineAudioContext(2, Math.round(params.duration * params.sampleRate), params.sampleRate);
      await make(ctx, params);
      const sound = await ctx.startRendering();
      globalThis.__sound = [sound.getChannelData(0), sound.getChannelData(1)];
      return sound.length;
    })()`);
    await file.write(wavHeader(frames, params.sampleRate));
    const step = CHUNK_SECONDS * params.sampleRate;
    for (let at = 0; at < frames; at += step) {
      const piece = await run<string>(`(() => {
        const [l, r] = globalThis.__sound;
        const n = Math.min(${step}, l.length - ${at});
        const both = new Float32Array(n * 2);
        for (let i = 0; i < n; i++) { both[2 * i] = l[${at} + i]; both[2 * i + 1] = r[${at} + i]; }
        const bytes = new Uint8Array(both.buffer);
        let text = "";
        for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return btoa(text);
      })()`);
      await file.write(Buffer.from(piece, "base64"));
    }
  } finally {
    await file.close();
    await chrome?.close();
  }
}

/** Waits for the page to finish loading, so the import comes from a file page. */
async function waitForLoad(run: <T>(expression: string) => Promise<T>) {
  for (let i = 0; i < 200; i++) {
    const ready = 'location.protocol === "file:" && document.readyState === "complete"';
    if (await run<boolean>(ready)) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("the generator's page didn't load in 5 s");
}

/** A WAV header for `frames` of 32-bit float stereo. */
export function wavHeader(frames: number, sampleRate: number): Buffer {
  const bytes = frames * 8;
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + bytes, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(3, 20); // IEEE float
  h.writeUInt16LE(2, 22);
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(sampleRate * 8, 28);
  h.writeUInt16LE(8, 32);
  h.writeUInt16LE(32, 34);
  h.write("data", 36);
  h.writeUInt32LE(bytes, 40);
  return h;
}
