import { describe, expect, test } from "bun:test";
import { boxSize, colorMatrix, parseFilter } from "../src/filter.ts";
import { createCanvas, Path2D } from "../src/index.ts";

/** A path's calls with their numbers rounded, to compare. */
const calls = (path: Path2D) =>
  path.calls.map(([name, args]) => [
    name,
    (args as number[]).map((n) => Math.round(n * 1000) / 1000),
  ]);

describe("SVG path data", () => {
  test("absolute and relative lines, and implicit linetos after a moveto", () => {
    expect(calls(new Path2D("M10 10 h80 v80 H10 Z m5,5 20 0 l0 10"))).toEqual([
      ["moveTo", [10, 10]],
      ["lineTo", [90, 10]],
      ["lineTo", [90, 90]],
      ["lineTo", [10, 90]],
      ["closePath", []],
      ["moveTo", [15, 15]],
      ["lineTo", [35, 15]],
      ["lineTo", [35, 25]],
    ]);
  });

  test("smooth curves mirror the last control point", () => {
    expect(calls(new Path2D("M0 0 C10 0 20 10 20 20 S30 40 40 40 Q50 40 50 50 T60 60"))).toEqual([
      ["moveTo", [0, 0]],
      ["bezierCurveTo", [10, 0, 20, 10, 20, 20]],
      ["bezierCurveTo", [20, 30, 30, 40, 40, 40]],
      ["quadraticCurveTo", [50, 40, 50, 50]],
      ["quadraticCurveTo", [50, 60, 60, 60]],
    ]);
  });

  test("an arc becomes an ellipse around its centre, with run-together flags", () => {
    // A half circle of radius 10 from (0,0) to (20,0), sweeping clockwise: centre (10,0).
    const [, arc] = calls(new Path2D("M0 0a10 10 0 0120 0"));
    const pi = Math.round(Math.PI * 1000) / 1000;
    expect(arc).toEqual(["ellipse", [10, 0, 10, 10, 0, pi, Math.round(Math.PI * 2000) / 1000, 0]]);
    // Radii too small to reach are grown until they do.
    const [, grown = []] = calls(new Path2D("M0 0 A1 1 0 0 0 20 0"));
    expect((grown[1] as number[]).slice(0, 4)).toEqual([10, 0, 10, 10]);
  });

  test("says where bad path data goes wrong", () => {
    expect(() => new Path2D("M10 10 L20")).toThrow(/character/);
    expect(() => new Path2D("X0 0")).toThrow(/character 0/);
  });
});

describe("CSS filters", () => {
  test("reads a chain of functions, with percentages, angles and a shadow colour", () => {
    expect(
      parseFilter(
        "blur(4px) brightness(120%) hue-rotate(0.5turn) drop-shadow(2px 4px 6px rgba(0, 0, 0, 0.5))",
      ),
    ).toEqual([
      { kind: "blur", sigma: 4 },
      { kind: "color", name: "brightness", amount: 1.2 },
      { kind: "color", name: "hue-rotate", amount: Math.PI },
      { kind: "drop-shadow", x: 2, y: 4, sigma: 6, color: "rgba(0, 0, 0, 0.5)" },
    ]);
    expect(parseFilter("none")).toEqual([]);
    expect(parseFilter("grayscale(3)")).toEqual([{ kind: "color", name: "grayscale", amount: 1 }]);
    expect(() => parseFilter("blur(4)")).toThrow(/px/);
    expect(() => parseFilter("url(#glow)")).toThrow(/SVG/);
    expect(() => parseFilter("glow(2px)")).toThrow(/glow/);
    expect(() => parseFilter("blur(2px) junk")).toThrow(/filter/);
  });

  test("colour matrices leave colours alone at their identity amounts", () => {
    const identity = [
      [1, 0, 0, 0, 0],
      [0, 1, 0, 0, 0],
      [0, 0, 1, 0, 0],
      [0, 0, 0, 1, 0],
    ];
    const near = (m: number[][]) => m.map((r) => r.map((v) => Math.round(v * 1000) / 1000));
    for (const [name, a] of [
      ["brightness", 1],
      ["contrast", 1],
      ["grayscale", 0],
      ["sepia", 0],
      ["saturate", 1],
      ["hue-rotate", 0],
      ["invert", 0],
      ["opacity", 1],
    ] as const) {
      expect(near(colorMatrix(name, a))).toEqual(identity);
    }
  });

  test("blur's box is the spec's size, made odd", () => {
    expect(boxSize(1)).toBe(3);
    expect(boxSize(4)).toBe(9);
    expect(boxSize(10)).toBe(19);
  });
});

const macOS = process.platform === "darwin" && process.arch === "arm64";

describe.if(macOS)("Path2D and filter on the canvas", () => {
  /** BGRA at canvas (x, y), y down. */
  const at = (pixels: Uint8Array, x: number, y: number) =>
    Array.from(pixels.subarray((y * 100 + x) * 4, (y * 100 + x) * 4 + 4));
  const withCanvas = (draw: (canvas: ReturnType<typeof createCanvas>) => void) => {
    const canvas = createCanvas(100, 100);
    try {
      canvas.beginFrame();
      draw(canvas);
      canvas.endFrame();
    } finally {
      canvas.close();
    }
  };

  test("fills and strokes a Path2D under the current transform, leaving the context's path", () => {
    withCanvas(({ ctx, pixels }) => {
      const square = new Path2D("M0 0 h20 v20 h-20 Z");
      ctx.beginPath();
      ctx.rect(80, 80, 10, 10);
      ctx.fillStyle = "#f00";
      ctx.translate(10, 10);
      ctx.fill(square);
      ctx.resetTransform();
      expect(at(pixels, 20, 20)).toEqual([0, 0, 255, 255]);
      expect(at(pixels, 5, 5)[3]).toBe(0);
      // The context's own rectangle is still its path.
      ctx.fill();
      expect(at(pixels, 85, 85)).toEqual([0, 0, 255, 255]);
      // addPath with a transform, and evenodd: a ring.
      const ring = new Path2D();
      ring.arc(50, 50, 20, 0, Math.PI * 2);
      ring.addPath(new Path2D("M50 40 a10 10 0 1 0 0.01 0 Z"), {
        a: 1,
        b: 0,
        c: 0,
        d: 1,
        e: 0,
        f: 0,
      });
      ctx.fillStyle = "#00f";
      ctx.fill(ring, "evenodd");
      expect(at(pixels, 50, 34)).toEqual([255, 0, 0, 255]);
      expect(at(pixels, 50, 50)[3]).toBe(0);
    });
  });

  test("scale(0), where a spring starts, draws nothing instead of failing", () => {
    withCanvas(({ ctx, pixels }) => {
      ctx.scale(0, 0);
      ctx.fill(new Path2D("M0 0 h20 v20 Z"));
      ctx.fillRect(0, 0, 100, 100);
      ctx.filter = "blur(2px)";
      ctx.fillRect(0, 0, 100, 100);
      expect(pixels.every((v) => v === 0)).toBe(true);
    });
  });

  test("addPath copies its source, and its shapes don't join the ones before", () => {
    withCanvas(({ ctx, pixels }) => {
      const left = new Path2D();
      left.arc(20, 50, 10, 0, Math.PI * 2);
      const right = new Path2D();
      right.arc(80, 50, 10, 0, Math.PI * 2);
      const both = new Path2D(left);
      both.addPath(right);
      // Edited after it was added: no effect on `both`.
      right.rect(0, 0, 100, 10);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 4;
      ctx.stroke(both);
      expect(at(pixels, 30, 50)[3]).toBe(255);
      expect(at(pixels, 70, 50)[3]).toBe(255);
      // No line from one circle to the other, and no rectangle.
      expect(at(pixels, 50, 50)[3]).toBe(0);
      expect(at(pixels, 50, 2)[3]).toBe(0);
    });
  });

  test("an empty addPath leaves the line being drawn alone", () => {
    withCanvas(({ ctx, pixels }) => {
      const p = new Path2D();
      p.moveTo(10, 50);
      p.lineTo(40, 50);
      p.addPath(new Path2D());
      p.lineTo(90, 50);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 4;
      ctx.stroke(p);
      expect(at(pixels, 70, 50)[3]).toBe(255);
    });
  });

  test("a filter reaches onto the canvas from a shape just off it", () => {
    withCanvas(({ ctx, pixels }) => {
      ctx.filter = "drop-shadow(20px 0px 0px #f00)";
      ctx.fillRect(-20, 20, 10, 10);
      expect(at(pixels, 5, 25)).toEqual([0, 0, 255, 255]);
      ctx.filter = "blur(4px)";
      ctx.fillStyle = "#fff";
      ctx.fillRect(100, 60, 20, 20);
      expect(at(pixels, 98, 70)[3]).toBeGreaterThan(20);
    });
  });

  test("clips to a Path2D", () => {
    withCanvas(({ ctx, pixels }) => {
      ctx.clip(new Path2D("M0 0 H50 V100 H0 Z"));
      ctx.fillRect(0, 0, 100, 100);
      expect(at(pixels, 25, 50)[3]).toBe(255);
      expect(at(pixels, 75, 50)[3]).toBe(0);
    });
  });

  test("blur spreads a shape out softly, and none turns it off", () => {
    withCanvas(({ ctx, pixels }) => {
      ctx.fillStyle = "#fff";
      ctx.filter = "blur(4px)";
      ctx.fillRect(40, 40, 20, 20);
      // Blurred past its edge, and no longer solid at its own edge.
      expect(at(pixels, 37, 50)[3]).toBeGreaterThan(20);
      expect(at(pixels, 40, 50)[3]).toBeLessThan(200);
      // Three 9 px boxes reach past the middle of a 20 px square, as a browser's blur does.
      expect(at(pixels, 50, 50)[3]).toBeGreaterThan(230);
      ctx.filter = "none";
      expect(ctx.filter).toBe("none");
      ctx.fillRect(0, 0, 10, 10);
      expect(at(pixels, 9, 5)[3]).toBe(255);
      expect(at(pixels, 11, 5)[3]).toBe(0);
    });
  });

  test("colour filters change what's drawn, not what's under it", () => {
    withCanvas(({ ctx, pixels }) => {
      ctx.fillStyle = "#f00";
      ctx.fillRect(0, 0, 100, 50);
      ctx.filter = "grayscale(100%)";
      ctx.fillRect(0, 50, 100, 50);
      expect(at(pixels, 50, 25)).toEqual([0, 0, 255, 255]);
      // Red's luminance, 0.2126, on all three channels.
      const [b = 0, g = 0, r = 0, a = 0] = at(pixels, 50, 75);
      for (const v of [b, g, r]) expect(v).toBeCloseTo(54, -1);
      expect(a).toBe(255);
      ctx.clearRect(0, 0, 100, 10);
      ctx.filter = "invert(1)";
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, 10, 10);
      expect(at(pixels, 5, 5)).toEqual([255, 255, 255, 255]);
      ctx.filter = "opacity(0.5)";
      ctx.fillRect(20, 0, 10, 10);
      expect(at(pixels, 25, 5)[3]).toBeCloseTo(128, -1);
      ctx.filter = "hue-rotate(120deg)";
      ctx.fillStyle = "#f00";
      ctx.fillRect(40, 0, 10, 10);
      // Red turns towards green.
      const [, green = 0, red = 0] = at(pixels, 45, 5);
      expect(green).toBeGreaterThan(red);
    });
  });

  test("drop-shadow draws a shadow under the shape, inside the canvas's clip", () => {
    withCanvas(({ ctx, pixels }) => {
      ctx.fillStyle = "#fff";
      ctx.filter = "drop-shadow(10px 10px 0px #00f)";
      ctx.fillRect(20, 20, 20, 20);
      expect(at(pixels, 30, 30)).toEqual([255, 255, 255, 255]);
      expect(at(pixels, 45, 45)).toEqual([255, 0, 0, 255]);
      expect(at(pixels, 55, 55)[3]).toBe(0);
      // The clip still applies to the filtered result.
      ctx.clearRect(0, 0, 100, 100);
      ctx.beginPath();
      ctx.rect(0, 0, 42, 100);
      ctx.clip();
      ctx.fillRect(20, 20, 20, 20);
      expect(at(pixels, 41, 45)[3]).toBe(255);
      expect(at(pixels, 45, 45)[3]).toBe(0);
    });
  });

  test("a filter applies to text and pictures too, and goes with save and restore", () => {
    withCanvas(({ ctx, pixels }) => {
      ctx.save();
      ctx.filter = "blur(3px)";
      ctx.font = "bold 40px sans-serif";
      ctx.fillStyle = "#fff";
      ctx.fillText("I", 10, 60);
      ctx.restore();
      expect(ctx.filter).toBe("none");
      // A blurred letter has no fully solid pixel at its edge, and some soft ones beside it.
      const row = Array.from({ length: 40 }, (_, x) => at(pixels, x, 45)[3] as number);
      expect(row.some((a) => a > 0 && a < 255)).toBe(true);
    });
  });
});
