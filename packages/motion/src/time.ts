/** Easing curves: progress from 0 to 1 in, eased progress out. */
export type Easing = (x: number) => number;

/**
 * CSS's `cubic-bezier(x1, y1, x2, y2)`. Finds the curve's x for `x` by
 * Newton's method, falling back to bisection where the slope is flat.
 */
export function bezier(x1: number, y1: number, x2: number, y2: number): Easing {
  const at = (a: number, b: number, s: number) =>
    3 * a * s * (1 - s) ** 2 + 3 * b * s ** 2 * (1 - s) + s ** 3;
  const slope = (a: number, b: number, s: number) =>
    3 * a * (1 - s) ** 2 + 6 * (b - a) * s * (1 - s) + 3 * (1 - b) * s ** 2;
  return (x) => {
    if (x <= 0 || x >= 1) return x <= 0 ? 0 : 1;
    let s = x;
    for (let i = 0; i < 8; i++) {
      const d = slope(x1, x2, s);
      if (Math.abs(d) < 1e-6) break;
      s -= (at(x1, x2, s) - x) / d;
    }
    if (s < 0 || s > 1 || Math.abs(at(x1, x2, s) - x) > 1e-5) {
      let [lo, hi] = [0, 1];
      for (let i = 0; i < 40; i++) {
        s = (lo + hi) / 2;
        if (at(x1, x2, s) < x) lo = s;
        else hi = s;
      }
    }
    return at(y1, y2, s);
  };
}

/** The usual curves; `back` overshoots a little before it settles. */
export const ease = {
  linear: (x: number) => x,
  in: bezier(0.42, 0, 1, 1),
  out: bezier(0, 0, 0.58, 1),
  inOut: bezier(0.42, 0, 0.58, 1),
  back: bezier(0.34, 1.56, 0.64, 1),
  bezier,
};

/**
 * `t` mapped from `input` to `output`, which list matching points in
 * increasing order of input, e.g. `interpolate(t, [0, 0.3, 2], [0, 1, 1])`.
 * Held at the ends; `easing` shapes each stretch.
 */
export function interpolate(
  t: number,
  input: number[],
  output: number[],
  easing: Easing = ease.linear,
): number {
  if (input.length < 2 || input.length !== output.length) {
    throw new Error("interpolate needs two or more input points and as many outputs");
  }
  const last = input.length - 1;
  if (t <= (input[0] as number)) return output[0] as number;
  if (t >= (input[last] as number)) return output[last] as number;
  let i = 0;
  while (t > (input[i + 1] as number)) i++;
  const [t0, t1] = [input[i] as number, input[i + 1] as number];
  const [v0, v1] = [output[i] as number, output[i + 1] as number];
  return v0 + (v1 - v0) * easing((t - t0) / (t1 - t0));
}

/**
 * A spring released at `start` seconds, moving from `from` to `to`: the
 * motion of a mass on a spring with no starting speed. The defaults
 * (stiffness 100, damping 10, mass 1) overshoot a little and settle in
 * about a second, like Remotion's.
 */
export function spring(
  t: number,
  { from = 0, to = 1, start = 0, stiffness = 100, damping = 10, mass = 1 } = {},
): number {
  const s = t - start;
  if (s <= 0) return from;
  const w = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  let done: number;
  if (zeta < 1) {
    const wd = w * Math.sqrt(1 - zeta ** 2);
    done = 1 - Math.exp(-zeta * w * s) * (Math.cos(wd * s) + ((zeta * w) / wd) * Math.sin(wd * s));
  } else if (zeta === 1) {
    done = 1 - Math.exp(-w * s) * (1 + w * s);
  } else {
    const root = w * Math.sqrt(zeta ** 2 - 1);
    const [r1, r2] = [-zeta * w + root, -zeta * w - root];
    done = 1 - (r2 * Math.exp(r1 * s) - r1 * Math.exp(r2 * s)) / (r2 - r1);
  }
  return from + (to - from) * done;
}
