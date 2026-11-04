// Lo-fi hip hop: a swung, laid-back beat under warm electric-piano seventh
// chords, a round bass, worn-tape flutter and vinyl crackle, everything
// through a low-pass so it sits under a voice. Good under talking, studying
// and devlogs. Tempo 70-90 (default 80); a key like "A minor".
//
// Energy adds layers: chords and crackle always; a kick and hats from 0.25;
// the snare and bass from 0.45; busier hats and a soft melody from 0.7.
import {
  bass,
  bus,
  chord,
  degree,
  energyAt,
  flutter,
  hat,
  human,
  keys,
  kick,
  lead,
  noise,
  parseKey,
  route,
  snare,
  vinyl,
} from "./lib.js";

/** Minor: i7 VImaj7 iv7 v7. Major: Imaj7 vi7 ii7 V7. One chord a bar. */
const PROGRESSION = { minor: [0, 5, 3, 4], major: [0, 5, 1, 4] };

/** How late the off-beat eighths land: 0.5 is straight, 0.62 is a lazy swing. */
const SWING = 0.6;

export default function lofi(ctx, { duration, tempo = 80, key = "A minor", energy }) {
  const k = parseKey(key);
  const beat = 60 / tempo;
  const bar = beat * 4;
  const mix = bus(ctx, { duration, tone: 3800, room: 2.2 });
  const hiss = noise(ctx, 1);
  const wobble = flutter(ctx, duration);
  const drums = ctx.createGain();
  drums.gain.value = 0.8;
  route(drums, mix, 0.08);
  const piano = ctx.createGain();
  route(piano, mix, 0.35);
  const low = ctx.createGain();
  route(low, mix);
  const melody = ctx.createGain();
  route(melody, mix, 0.5);
  vinyl(ctx, mix.dry, duration);

  const progression = PROGRESSION[k.minor ? "minor" : "major"];
  const pentatonic = k.minor ? [0, 2, 3, 4, 6] : [0, 1, 2, 4, 5];
  for (let n = 0, t = 0; t < duration; n++, t = n * bar) {
    const e = energyAt(energy, t);
    const d = progression[n % progression.length];
    const notes = chord(k, d, 3);
    // A strum: the notes a few milliseconds apart, the top one quietest.
    notes.forEach((midi, i) => {
      const at = t + i * 0.018 + Math.abs(human(0.01));
      keys(ctx, piano, at, midi, bar * 0.92, (0.16 - i * 0.015) * (0.85 + 0.3 * e), wobble);
    });
    // Half the bars re-strike the chord on the "and" of three, quieter.
    if (n % 2 === 1 && e > 0.35) {
      notes.slice(1).forEach((midi, i) => {
        const at = t + beat * (2 + SWING) + i * 0.015;
        keys(ctx, piano, at, midi, beat * 1.2, 0.07, wobble);
      });
    }

    if (e > 0.45) {
      const root = degree(k, d, 1);
      bass(ctx, low, t + 0.01, root, beat * 1.6, 0.3);
      bass(ctx, low, t + beat * (2 + SWING), root, beat * 0.9, 0.22);
      bass(ctx, low, t + beat * 3.5, degree(k, d + 4, 1), beat * 0.4, 0.18);
    }

    for (let b = 0; b < 4; b++) {
      const on = t + b * beat;
      const off = t + (b + SWING) * beat;
      if (e > 0.25) {
        // Kick on one and the "and" of two, with a ghost before three in some bars.
        if (b === 0) kick(ctx, drums, on + human(0.006), 0.9);
        if (b === 1 && n % 2 === 0) kick(ctx, drums, off + human(0.006), 0.6);
        if (b === 2 && n % 4 === 3) kick(ctx, drums, on - beat * 0.25, 0.45);
        hat(ctx, drums, on + human(0.01), 0.55 + human(0.2), { noiseBuffer: hiss });
        hat(ctx, drums, off + human(0.01), 0.35 + human(0.15), { noiseBuffer: hiss });
      }
      if (e > 0.45 && (b === 1 || b === 3)) {
        snare(ctx, drums, on + 0.012 + human(0.008), 0.55, { soft: true, noiseBuffer: hiss });
      }
      if (e > 0.7 && Math.random() < 0.5) {
        hat(ctx, drums, on + beat * 0.75, 0.2, { noiseBuffer: hiss, length: 0.03 });
      }
    }

    // Above 0.7, a few pentatonic notes over the second half of the bar.
    if (e > 0.7) {
      for (let s = 4; s < 8; s++) {
        if (Math.random() < 0.45) continue;
        const step = pentatonic[Math.floor(Math.random() * pentatonic.length)];
        const at = t + (Math.floor(s / 2) + (s % 2 ? SWING : 0)) * beat;
        lead(ctx, melody, at, degree(k, step, 5), beat * 0.45, 0.07);
      }
    }
  }
}
