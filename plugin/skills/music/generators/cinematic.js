// Cinematic pads: slow string swells, a low brass-like bed and, when it
// builds, big drums and a riser into the next phrase. Good under trailers,
// intros, reveals and dramatic turns. Tempo 60-90 (default 72); a minor key
// works best (default "D minor").
//
// Energy: strings always, brightening as it rises; the low bed from 0.35;
// drums on the downbeats from 0.55, every beat and a riser from 0.8.
import { bus, chord, degree, energyAt, noise, pad, parseKey, riser, route, tom } from "./lib.js";

/** Minor: i VI III VII. Major: I vi IV V. Two bars each. */
const PROGRESSION = { minor: [0, 5, 2, 6], major: [0, 5, 3, 4] };

export default function cinematic(ctx, { duration, tempo = 72, key = "D minor", energy }) {
  const k = parseKey(key);
  const beat = 60 / tempo;
  const span = beat * 8;
  const mix = bus(ctx, { duration, room: 4, tone: 12000, fadeIn: 2, fadeOut: 4 });
  const hiss = noise(ctx, 1);
  const strings = ctx.createGain();
  route(strings, mix, 0.55);
  const brass = ctx.createGain();
  route(brass, mix, 0.35);
  const drums = ctx.createGain();
  // Low enough that the hits don't do all the limiter's work.
  drums.gain.value = 0.5;
  route(drums, mix, 0.3);
  const fx = ctx.createGain();
  route(fx, mix, 0.4);

  const progression = PROGRESSION[k.minor ? "minor" : "major"];
  for (let n = 0, t = 0; t < duration; n++, t = n * span) {
    const e = energyAt(energy, t);
    const d = progression[n % progression.length];
    // Strings: the chord spread over two octaves, swelling into each change.
    const voicing = [...chord(k, d, 3, 3), degree(k, d + 7, 4), degree(k, d + 9, 4)];
    for (const midi of voicing) {
      pad(ctx, strings, t, midi, span, 0.04 + 0.02 * e, {
        voices: 4,
        spread: 9,
        cutoff: 900 + 3500 * e,
        attack: beat * 2.5,
        release: beat * 2,
      });
    }
    if (e > 0.35) {
      for (const midi of [degree(k, d, 1), degree(k, d, 2), degree(k, d + 4, 2)]) {
        pad(ctx, brass, t, midi, span, 0.06 * e, {
          voices: 2,
          spread: 5,
          cutoff: 500 + 900 * e,
          attack: beat,
          release: beat * 1.5,
        });
      }
    }
    for (let b = 0; b < 8; b++) {
      const on = t + b * beat;
      const downbeat = b % 4 === 0;
      if ((e > 0.55 && downbeat) || e > 0.8) {
        tom(ctx, drums, on, downbeat ? 0.9 : 0.6, { pitch: downbeat ? 70 : 95, noiseBuffer: hiss });
      }
    }
    if (energyAt(energy, t + span) > 0.8 && n % 2 === 1)
      riser(ctx, fx, t + span, beat * 6, 0.12, { noiseBuffer: hiss });
  }
}
