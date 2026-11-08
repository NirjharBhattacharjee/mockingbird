// Minimal electronic: a steady four-on-the-floor kick, a sub bass on the
// off-beats, sixteenth hats, a rim click and a short chord stab whose filter
// opens as it builds. Good under tech, coding and fast-cut edits. Tempo
// 115-128 (default 122); a minor key works best (default "F minor").
//
// Energy: kick and sub always above 0.15; hats from 0.35; the stab from 0.5,
// brighter as it rises; the clap and a riser into each eight-bar phrase from
// 0.75.
import {
  bass,
  bus,
  chord,
  clap,
  degree,
  energyAt,
  hat,
  human,
  kick,
  noise,
  pad,
  parseKey,
  riser,
  route,
  snare,
} from "./lib.js";

/** Two chords, four bars each: i and VI in minor, I and vi in major. */
const PROGRESSION = { minor: [0, 5], major: [0, 5] };

export default function electronic(ctx, { duration, tempo = 122, key = "F minor", energy }) {
  const k = parseKey(key);
  const beat = 60 / tempo;
  const bar = beat * 4;
  const mix = bus(ctx, { duration, room: 1.4, tone: 16000 });
  const hiss = noise(ctx, 1);
  const drums = ctx.createGain();
  drums.gain.value = 0.8;
  route(drums, mix, 0.04);
  const low = ctx.createGain();
  route(low, mix);
  const stabs = ctx.createGain();
  route(stabs, mix, 0.35);
  const fx = ctx.createGain();
  route(fx, mix, 0.3);

  const progression = PROGRESSION[k.minor ? "minor" : "major"];
  for (let n = 0, t = 0; t < duration; n++, t = n * bar) {
    const e = energyAt(energy, t);
    const d = progression[Math.floor(n / 4) % progression.length];
    for (let b = 0; b < 4; b++) {
      const on = t + b * beat;
      if (e > 0.15) {
        kick(ctx, drums, on, 1);
        bass(ctx, low, on + beat / 2, degree(k, d, 1), beat * 0.35, 0.32);
      }
      if (e > 0.35) {
        for (let s = 0; s < 4; s++) {
          const accent = s === 2 ? 0.55 : 0.25;
          hat(ctx, drums, on + (s * beat) / 4 + human(0.003), accent, {
            noiseBuffer: hiss,
            length: s === 2 ? 0.07 : 0.035,
          });
        }
        // A rim click on the last sixteenth of beat two, now and then.
        if (b === 1 && Math.random() < 0.6) {
          snare(ctx, drums, on + beat * 0.75, 0.25, { noiseBuffer: hiss });
        }
      }
      if (e > 0.75 && (b === 1 || b === 3)) clap(ctx, drums, on, 0.6, { noiseBuffer: hiss });
    }
    // A chord stab on the "and" of one and of three, its filter opening with the energy.
    if (e > 0.5) {
      for (const at of [0.5, 2.5]) {
        for (const midi of chord(k, d, 4, 3)) {
          pad(ctx, stabs, t + at * beat, midi, beat * 0.2, 0.05, {
            voices: 2,
            spread: 8,
            cutoff: 500 + 4000 * (e - 0.5),
            attack: 0.005,
            release: 0.15,
          });
        }
      }
    }
    if (energyAt(energy, t + bar) > 0.75 && n % 8 === 7)
      riser(ctx, fx, t + bar, bar * 2, 0.1, { noiseBuffer: hiss });
  }
}
