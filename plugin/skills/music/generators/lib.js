// What every generator is built from: keys and chords, the energy curve, a
// mix bus with a room, and instruments made of oscillators, filters and
// noise, so there are no samples to license. A generator is a module whose
// default export is (ctx, params) => void: it schedules sound on ctx, an
// OfflineAudioContext as long as params.duration. Math.random is seeded by
// mockingbird's `music` tool, so use it freely: the same seed, the same track.

const NAMES = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];

/** A MIDI note's frequency in Hz. */
export const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

/** "A minor", "F# major", "Eb": the root's pitch class (0-11) and whether it's minor. */
export function parseKey(key = "A minor") {
  const m = /^\s*([a-g])\s*([#b]?)\s*(major|minor|maj|min|m)?\s*$/i.exec(key);
  if (!m) throw new Error(`key must look like "A minor" or "F# major"; got "${key}"`);
  const shift = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
  const quality = (m[3] ?? "major").toLowerCase();
  return {
    root: (NAMES[m[1].toLowerCase()] + shift + 12) % 12,
    minor: quality.startsWith("min") || quality === "m",
  };
}

/** The MIDI note of scale degree `degree` (0 = the root, 7 = an octave up) in `octave`. */
export function degree(key, d, octave = 4) {
  const steps = key.minor ? MINOR : MAJOR;
  const wrapped = ((d % 7) + 7) % 7;
  return 12 * (octave + 1) + key.root + steps[wrapped] + 12 * Math.floor(d / 7);
}

/** A chord on scale degree `d`: `size` notes stacked in thirds (4 = a seventh chord). */
export const chord = (key, d, octave = 3, size = 4) =>
  Array.from({ length: size }, (_, i) => degree(key, d + 2 * i, octave));

/** The energy (0-1) at `t` seconds: a number, or [seconds, level] points eased between. */
export function energyAt(energy, t) {
  if (energy === undefined) return 0.6;
  if (typeof energy === "number") return energy;
  if (t <= energy[0][0]) return energy[0][1];
  for (let i = 1; i < energy.length; i++) {
    const [t1, v1] = energy[i];
    const [t0, v0] = energy[i - 1];
    if (t <= t1) {
      const p = (t - t0) / (t1 - t0);
      return v0 + (v1 - v0) * p * p * (3 - 2 * p);
    }
  }
  return energy[energy.length - 1][1];
}

/** Seconds of white noise, from the seeded Math.random. */
export function noise(ctx, seconds = 1) {
  const buffer = ctx.createBuffer(1, Math.round(seconds * ctx.sampleRate), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** A little timing and level drift, so it isn't a grid. */
export const human = (amount = 1) => (Math.random() - 0.5) * amount;

/**
 * The mix: `dry` and `room` (a send to a reverb) feed a gentle compressor,
 * an optional low-pass `tone`, and a fade in and out over the whole track.
 */
export function bus(ctx, { duration, room = 2.4, tone = 18000, fadeIn = 1, fadeOut = 2.5 }) {
  const master = ctx.createGain();
  master.gain.setValueAtTime(0, 0);
  master.gain.linearRampToValueAtTime(1, fadeIn);
  master.gain.setValueAtTime(1, Math.max(fadeIn, duration - fadeOut));
  master.gain.linearRampToValueAtTime(0, duration);
  const squash = ctx.createDynamicsCompressor();
  squash.threshold.value = -18;
  squash.ratio.value = 3;
  squash.attack.value = 0.01;
  squash.release.value = 0.25;
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = tone;
  lowpass.Q.value = 0.5;
  lowpass.connect(squash).connect(master).connect(ctx.destination);

  const dry = ctx.createGain();
  dry.connect(lowpass);
  const verb = ctx.createConvolver();
  verb.buffer = impulse(ctx, room);
  const wet = ctx.createGain();
  wet.gain.value = 0.5;
  verb.connect(wet).connect(lowpass);
  return { dry, room: verb, master };
}

/** A room's echo: stereo noise dying away over `seconds`. */
function impulse(ctx, seconds) {
  const n = Math.round(seconds * ctx.sampleRate);
  const buffer = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 3;
  }
  return buffer;
}

/** Sends `node` to the bus, with `send` of it to the room as well. */
export function route(node, mix, send = 0) {
  node.connect(mix.dry);
  if (send) {
    const g = node.context.createGain();
    g.gain.value = send;
    node.connect(g).connect(mix.room);
  }
}

/** A gain that opens at `t` to `level` and closes over `release` after `length`. */
function envelope(ctx, t, { level, attack = 0.005, decay = 0.2, sustain = 0.6, length, release }) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(level, t + attack);
  g.gain.setTargetAtTime(level * sustain, t + attack, decay / 3);
  g.gain.setTargetAtTime(0, t + length, release / 4);
  return g;
}

// ---------------------------------------------------------------- drums

/** A kick: a sine falling from 130 to 45 Hz. */
export function kick(ctx, out, t, level = 1) {
  t = Math.max(0, t); // a humanised first hit can land just before 0
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(130, t);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  const g = ctx.createGain();
  g.gain.setValueAtTime(level, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.5);
}

/** A snare: a band of noise and a short tone; `soft` takes the crack off, for lo-fi. */
export function snare(ctx, out, t, level = 1, { soft = false, noiseBuffer } = {}) {
  t = Math.max(0, t); // a humanised first hit can land just before 0
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer;
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = soft ? 1400 : 2000;
  band.Q.value = 0.8;
  const g = ctx.createGain();
  g.gain.setValueAtTime(level * 0.7, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + (soft ? 0.22 : 0.18));
  n.connect(band).connect(g).connect(out);
  n.start(t, Math.random() * 0.5);
  n.stop(t + 0.3);
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(200, t);
  o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
  const og = ctx.createGain();
  og.gain.setValueAtTime(level * 0.35, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  o.connect(og).connect(out);
  o.start(t);
  o.stop(t + 0.12);
}

/** A closed hi-hat: high noise, a few tens of milliseconds long. */
export function hat(ctx, out, t, level = 1, { noiseBuffer, length = 0.05 } = {}) {
  t = Math.max(0, t); // a humanised first hit can land just before 0
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer;
  const high = ctx.createBiquadFilter();
  high.type = "highpass";
  high.frequency.value = 7000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(level * 0.25, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + length);
  n.connect(high).connect(g).connect(out);
  n.start(t, Math.random() * 0.5);
  n.stop(t + length + 0.02);
}

// ---------------------------------------------------------------- instruments

/**
 * An electric piano note: a sine and a quieter triangle an octave up, with a
 * soft attack. `wobble` is a node to bend its pitch with (tape flutter).
 */
export function keys(ctx, out, t, midi, length, level = 0.2, wobble) {
  t = Math.max(0, t); // a humanised first hit can land just before 0
  const env = envelope(ctx, t, {
    level,
    attack: 0.012,
    decay: 0.8,
    sustain: 0.45,
    length,
    release: 0.6,
  });
  for (const [type, ratio, gain] of [
    ["sine", 1, 1],
    ["triangle", 2, 0.18],
  ]) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = hz(midi) * ratio;
    o.detune.value = human(6);
    if (wobble) wobble.connect(o.detune);
    const g = ctx.createGain();
    g.gain.value = gain;
    o.connect(g).connect(env);
    o.start(t);
    o.stop(t + length + 0.8);
  }
  env.connect(out);
}

/** A round bass note: a sine with a little triangle for the edge. */
export function bass(ctx, out, t, midi, length, level = 0.35) {
  t = Math.max(0, t); // a humanised first hit can land just before 0
  const env = envelope(ctx, t, {
    level,
    attack: 0.01,
    decay: 0.3,
    sustain: 0.7,
    length,
    release: 0.12,
  });
  for (const [type, gain] of [
    ["sine", 1],
    ["triangle", 0.15],
  ]) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = hz(midi);
    const g = ctx.createGain();
    g.gain.value = gain;
    o.connect(g).connect(env);
    o.start(t);
    o.stop(t + length + 0.3);
  }
  env.connect(out);
}

/** A soft lead note: a sine with a slow attack and a touch of vibrato. */
export function lead(ctx, out, t, midi, length, level = 0.1) {
  t = Math.max(0, t); // a humanised first hit can land just before 0
  const env = envelope(ctx, t, {
    level,
    attack: 0.04,
    decay: 0.4,
    sustain: 0.6,
    length,
    release: 0.3,
  });
  const o = ctx.createOscillator();
  o.frequency.value = hz(midi);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 5;
  const depth = ctx.createGain();
  depth.gain.setValueAtTime(0, t);
  depth.gain.linearRampToValueAtTime(12, t + length);
  lfo.connect(depth).connect(o.detune);
  o.connect(env).connect(out);
  for (const x of [o, lfo]) {
    x.start(t);
    x.stop(t + length + 0.5);
  }
}

/** A slow pitch drift, in cents, to connect to oscillators' detune: worn tape. */
export function flutter(ctx, duration, cents = 7) {
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.45;
  const depth = ctx.createGain();
  depth.gain.value = cents;
  lfo.connect(depth);
  lfo.start(0);
  lfo.stop(duration);
  return depth;
}

/** Vinyl: a low hiss with crackles scattered through it, for the whole track. */
export function vinyl(ctx, out, duration, level = 0.05) {
  const n = Math.round(duration * ctx.sampleRate);
  const buffer = ctx.createBuffer(1, n, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * 0.08;
  const pops = Math.round(duration * 9);
  for (let p = 0; p < pops; p++) {
    const at = Math.floor(Math.random() * (n - 40));
    const size = 0.3 + Math.random() * 0.7;
    for (let i = 0; i < 30; i++) data[at + i] += (Math.random() * 2 - 1) * size * (1 - i / 30);
  }
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 3000;
  band.Q.value = 0.4;
  const g = ctx.createGain();
  g.gain.value = level;
  src.connect(band).connect(g).connect(out);
  src.start(0);
}
