/**
 * The browser's Path2D: a path kept for later, drawn with `ctx.fill(path)`,
 * `ctx.stroke(path)` or `ctx.clip(path)`. It only records its calls; the
 * canvas replays them into its own path recorder when the path is drawn, so
 * the transform current then applies, as on a browser canvas.
 */

/** A transform as Path2D's `addPath` takes it, like a DOMMatrix. */
export type Transform = { a: number; b: number; c: number; d: number; e: number; f: number };

export type PathCall = [name: string, args: number[]] | ["addPath", Path2D, Transform | undefined];

export class Path2D {
  readonly calls: PathCall[] = [];

  /** A new path, a copy of `path`, or the shape in SVG path data, like `"M10 10 h80 v80 Z"`. */
  constructor(path?: Path2D | string) {
    if (path instanceof Path2D) this.calls.push(...path.calls);
    else if (typeof path === "string") parseSvgPath(path, this);
  }

  addPath(path: Path2D, transform?: Transform) {
    if (!(path instanceof Path2D)) throw new Error("addPath takes a Path2D");
    // Copies, as a browser takes them: editing either afterwards doesn't change this path.
    const t = transform && {
      a: transform.a,
      b: transform.b,
      c: transform.c,
      d: transform.d,
      e: transform.e,
      f: transform.f,
    };
    this.calls.push(["addPath", new Path2D(path), t]);
  }
  moveTo(x: number, y: number) {
    this.calls.push(["moveTo", [x, y]]);
  }
  lineTo(x: number, y: number) {
    this.calls.push(["lineTo", [x, y]]);
  }
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number) {
    this.calls.push(["quadraticCurveTo", [cpx, cpy, x, y]]);
  }
  bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number) {
    this.calls.push(["bezierCurveTo", [cp1x, cp1y, cp2x, cp2y, x, y]]);
  }
  arc(x: number, y: number, r: number, from: number, to: number, counterclockwise = false) {
    this.calls.push(["arc", [x, y, r, from, to, counterclockwise ? 1 : 0]]);
  }
  arcTo(x1: number, y1: number, x2: number, y2: number, r: number) {
    this.calls.push(["arcTo", [x1, y1, x2, y2, r]]);
  }
  ellipse(
    x: number,
    y: number,
    rx: number,
    ry: number,
    rotation: number,
    from: number,
    to: number,
    counterclockwise = false,
  ) {
    this.calls.push(["ellipse", [x, y, rx, ry, rotation, from, to, counterclockwise ? 1 : 0]]);
  }
  rect(x: number, y: number, w: number, h: number) {
    this.calls.push(["rect", [x, y, w, h]]);
  }
  roundRect(x: number, y: number, w: number, h: number, radii: number | number[] = 0) {
    // Spread back out on replay: the canvas's roundRect takes a number or a list.
    const list = Array.isArray(radii) ? radii : [radii];
    this.calls.push(["roundRect", [x, y, w, h, list.length, ...list]]);
  }
  closePath() {
    this.calls.push(["closePath", []]);
  }
}

const NUMBER = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/y;
/** How many numbers each SVG command takes. */
const ARITY: Record<string, number> = {
  m: 2,
  l: 2,
  h: 1,
  v: 1,
  c: 6,
  s: 4,
  q: 4,
  t: 2,
  a: 7,
  z: 0,
};

/**
 * SVG path data (the `d` of a `<path>`) as calls on `to`: every command, in
 * absolute and relative forms, with smooth curves and elliptical arcs.
 */
export function parseSvgPath(d: string, to: Path2D) {
  let i = 0;
  const skip = () => {
    while (i < d.length && /[\s,]/.test(d[i] as string)) i++;
  };
  const fail = (): never => {
    throw new Error(`SVG path data isn't valid at character ${i}: "${d.slice(i, i + 12)}"`);
  };
  const number = () => {
    skip();
    NUMBER.lastIndex = i;
    const m = NUMBER.exec(d);
    if (!m) return fail();
    i += m[0].length;
    return Number(m[0]);
  };
  // An arc's flags are single digits, which can run together: "a1 1 0 01 5 5".
  const flag = () => {
    skip();
    const f = d[i];
    if (f !== "0" && f !== "1") return fail();
    i++;
    return f === "1";
  };

  let [x, y] = [0, 0];
  let [sx, sy] = [0, 0];
  /** The last curve's second control point, for S (cubic) or T (quadratic). */
  let cubic: [number, number] | undefined;
  let quad: [number, number] | undefined;
  let command = "";
  for (skip(); i < d.length; skip()) {
    const c = d[i] as string;
    if (/[a-zA-Z]/.test(c)) {
      if (ARITY[c.toLowerCase()] === undefined) fail();
      command = c;
      i++;
    } else if (!command || command === "z" || command === "Z") {
      fail();
    }
    const lower = command.toLowerCase();
    const rel = command === lower;
    const [ox, oy] = rel ? [x, y] : [0, 0];
    if (lower === "z") {
      to.closePath();
      [x, y] = [sx, sy];
      cubic = quad = undefined;
      continue;
    }
    if (lower === "m") {
      [x, y] = [ox + number(), oy + number()];
      to.moveTo(x, y);
      [sx, sy] = [x, y];
      // More pairs after a moveto are linetos.
      command = rel ? "l" : "L";
      cubic = quad = undefined;
      continue;
    }
    let [nextCubic, nextQuad]: (typeof cubic)[] = [undefined, undefined];
    if (lower === "l") {
      [x, y] = [ox + number(), oy + number()];
      to.lineTo(x, y);
    } else if (lower === "h") {
      x = ox + number();
      to.lineTo(x, y);
    } else if (lower === "v") {
      y = oy + number();
      to.lineTo(x, y);
    } else if (lower === "c" || lower === "s") {
      // S's first control point is the last one mirrored through the current point.
      const [x1, y1] =
        lower === "c"
          ? [ox + number(), oy + number()]
          : cubic
            ? [2 * x - cubic[0], 2 * y - cubic[1]]
            : [x, y];
      const [x2, y2, ex, ey] = [ox + number(), oy + number(), ox + number(), oy + number()];
      to.bezierCurveTo(x1, y1, x2, y2, ex, ey);
      nextCubic = [x2, y2];
      [x, y] = [ex, ey];
    } else if (lower === "q" || lower === "t") {
      const [x1, y1] =
        lower === "q"
          ? [ox + number(), oy + number()]
          : quad
            ? [2 * x - quad[0], 2 * y - quad[1]]
            : [x, y];
      const [ex, ey] = [ox + number(), oy + number()];
      to.quadraticCurveTo(x1, y1, ex, ey);
      nextQuad = [x1, y1];
      [x, y] = [ex, ey];
    } else {
      const [rx, ry, turn] = [number(), number(), number()];
      const [large, sweep] = [flag(), flag()];
      const [ex, ey] = [ox + number(), oy + number()];
      svgArc(to, x, y, rx, ry, turn, large, sweep, ex, ey);
      [x, y] = [ex, ey];
    }
    [cubic, quad] = [nextCubic, nextQuad];
  }
}

/** Angle from vector u to vector v. */
const angle = (ux: number, uy: number, vx: number, vy: number) =>
  Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);

/**
 * An SVG arc from (x1, y1) to (x2, y2) as an ellipse() call: SVG 1.1's
 * endpoint-to-centre conversion (appendix F.6.5), radii grown if too small (F.6.6).
 */
function svgArc(
  to: Path2D,
  x1: number,
  y1: number,
  rx: number,
  ry: number,
  turnDegrees: number,
  large: boolean,
  sweep: boolean,
  x2: number,
  y2: number,
) {
  if (x1 === x2 && y1 === y2) return;
  if (!rx || !ry) return to.lineTo(x2, y2);
  [rx, ry] = [Math.abs(rx), Math.abs(ry)];
  const phi = (turnDegrees * Math.PI) / 180;
  const [cos, sin] = [Math.cos(phi), Math.sin(phi)];
  const [dx, dy] = [(x1 - x2) / 2, (y1 - y2) / 2];
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  const grow = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (grow > 1) [rx, ry] = [rx * Math.sqrt(grow), ry * Math.sqrt(grow)];
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const [cxp, cyp] = [(k * rx * y1p) / ry, (-k * ry * x1p) / rx];
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const [ux, uy] = [(x1p - cxp) / rx, (y1p - cyp) / ry];
  const [vx, vy] = [(-x1p - cxp) / rx, (-y1p - cyp) / ry];
  const from = angle(1, 0, ux, uy);
  let span = angle(ux, uy, vx, vy);
  if (!sweep && span > 0) span -= 2 * Math.PI;
  if (sweep && span < 0) span += 2 * Math.PI;
  // SVG's sweep flag 1 runs the way angles grow, which on a canvas is clockwise.
  to.ellipse(cx, cy, rx, ry, phi, from, from + span, !sweep);
}
