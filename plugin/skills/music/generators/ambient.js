// Ambient: slow, wide pads that change chord every two bars, a low drone,
// and bells now and then, in a big room. No drums. Good under calm
// explainers, tutorials and anything reflective. Tempo 50-80 (default 60)
// only sets how slowly the chords move; a key like "D major".
//
// Energy opens the pads' filter and brings in more bells; above 0.6 a soft
// pulse of eighth notes runs under the pads.
import { bell, bus, chord, degree, energyAt, pad, parseKey, pluck, route } from "./lib.js";

/** Major: I V vi IV. Minor: i VI III VII. Two bars each. */
const PROGRESSION = { major: [0, 4, 5, 3], minor: [0, 5, 2, 6] };

export default function ambient(ctx, { duration, tempo = 60, key = "D major", energy }) {
  const k = parseKey(key);
  const beat = 60 / tempo;
  const span = beat * 8;
  const mix = bus(ctx, { duration, room: 5, tone: 9000, fadeIn: 3, fadeOut: 5 });
  const pads = ctx.createGain();
  route(pads, mix, 0.6);
  const bells = ctx.createGain();
  route(bells, mix, 0.9);
  const pulse = ctx.createGain();
  route(pulse, mix, 0.5);

  // A drone on the root under everything.
  pad(ctx, pads, 0, degree(k, 0, 1), duration, 0.05, {
    type: "triangle",
    voices: 2,
    cutoff: 400,
    attack: 4,
    release: 4,
  });

  const progression = PROGRESSION[k.minor ? "minor" : "major"];
  const scale = [0, 1, 2, 4, 5];
  for (let n = 0, t = 0; t < duration; n++, t = n * span) {
    const e = energyAt(energy, t);
    const d = progression[n % progression.length];
    // Chords overlap by a beat, so one swells as the last fades.
    for (const midi of chord(k, d, 3, 3).concat(degree(k, d + 7, 4))) {
      pad(ctx, pads, t, midi, span + beat, 0.045, {
        cutoff: 700 + 2600 * e,
        spread: 14,
        attack: beat * 3,
        release: beat * 3,
      });
    }
    // Bells: a few notes from the scale, more as the energy rises. Each slot
    // of the span (16 half-beats) rings with a chance from the energy there.
    for (let s = 0; s < 16; s++) {
      const at = t + (s * beat) / 2;
      if (Math.random() >= (1 + energyAt(energy, at) * 4) / 16) continue;
      const step = scale[Math.floor(Math.random() * scale.length)];
      bell(ctx, bells, at, degree(k, step, 5), 0.035 + Math.random() * 0.02, 4);
    }
    for (let s = 0; s < 16; s++) {
      const at = t + (s * beat) / 2;
      const es = energyAt(energy, at);
      if (es <= 0.6) continue;
      const note = degree(k, d + (s % 4 === 3 ? 4 : 0), 3);
      pluck(ctx, pulse, at, note, beat * 0.4, 0.05 * (es - 0.5));
    }
  }
}
