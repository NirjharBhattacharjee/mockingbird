// Upbeat corporate: bright and positive, a four-on-the-floor kick, claps,
// off-beat hats, piano-like chords, a plucked arpeggio and an eighth-note
// bass. Good under product demos, launches and listicles. Tempo 105-128
// (default 116); a major key works best (default "C major").
//
// Energy adds layers: chords and arpeggio always; kick and bass from 0.3;
// claps and hats from 0.5; a riser into each four-bar phrase and a higher
// arpeggio from 0.75.
import {
  bass,
  bus,
  chord,
  clap,
  degree,
  energyAt,
  hat,
  human,
  keys,
  kick,
  noise,
  parseKey,
  pluck,
  riser,
  route,
} from "./lib.js";

/** I V vi IV in major, i VI III VII in minor. One chord a bar. */
const PROGRESSION = { major: [0, 4, 5, 3], minor: [0, 5, 2, 6] };

export default function corporate(ctx, { duration, tempo = 116, key = "C major", energy }) {
  const k = parseKey(key);
  const beat = 60 / tempo;
  const bar = beat * 4;
  const mix = bus(ctx, { duration, room: 1.6, tone: 14000 });
  const hiss = noise(ctx, 1);
  const drums = ctx.createGain();
  drums.gain.value = 0.75;
  route(drums, mix, 0.05);
  const piano = ctx.createGain();
  route(piano, mix, 0.2);
  const arp = ctx.createGain();
  route(arp, mix, 0.25);
  const low = ctx.createGain();
  route(low, mix);
  const fx = ctx.createGain();
  route(fx, mix, 0.3);

  const progression = PROGRESSION[k.minor ? "minor" : "major"];
  for (let n = 0, t = 0; t < duration; n++, t = n * bar) {
    const e = energyAt(energy, t);
    const d = progression[n % progression.length];
    const notes = chord(k, d, 4, 3);
    // Chords on one and the "and" of two: a push that keeps it moving.
    for (const at of [0, 1.5, 2.5]) {
      for (const midi of notes) keys(ctx, piano, t + at * beat, midi, beat * 0.9, 0.07);
    }
    // An arpeggio up and down the chord in eighths, an octave higher when it's busy.
    const up = e > 0.75 ? 5 : 4;
    const pattern = [0, 1, 2, 3, 2, 1, 0, 1];
    pattern.forEach((p, s) => {
      const midi = p === 3 ? degree(k, d + 7, up) : degree(k, d + 2 * p, up);
      pluck(ctx, arp, t + (s * beat) / 2 + human(0.004), midi, beat * 0.4, 0.09);
    });

    for (let b = 0; b < 4; b++) {
      const on = t + b * beat;
      if (e > 0.3) {
        kick(ctx, drums, on, 0.95);
        bass(ctx, low, on, degree(k, d, 2), beat * 0.4, 0.26);
        bass(ctx, low, on + beat / 2, degree(k, d, 2), beat * 0.35, 0.2);
      }
      if (e > 0.5) {
        if (b === 1 || b === 3) clap(ctx, drums, on, 0.7, { noiseBuffer: hiss });
        hat(ctx, drums, on + beat / 2, 0.5 + human(0.15), { noiseBuffer: hiss, length: 0.06 });
      }
    }
    // A riser into every fourth bar's downbeat.
    if (energyAt(energy, t + bar) > 0.75 && n % 4 === 3)
      riser(ctx, fx, t + bar, bar, 0.1, { noiseBuffer: hiss });
  }
}
