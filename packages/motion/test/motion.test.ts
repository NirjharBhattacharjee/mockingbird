import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { invert, multiply } from "../src/canvas.ts";
import {
  bezier,
  createCanvas,
  ease,
  interpolate,
  parseColor,
  parseFont,
  renderMotion,
  spring,
} from "../src/index.ts";

describe("timing", () => {
  test("interpolate holds at the ends and maps between points", () => {
    expect(interpolate(-1, [0, 2], [10, 20])).toBe(10);
    expect(interpolate(1, [0, 2], [10, 20])).toBe(15);
    expect(interpolate(9, [0, 2], [10, 20])).toBe(20);
    expect(interpolate(1.5, [0, 1, 2], [0, 100, 0])).toBe(50);
    expect(() => interpolate(0, [0], [1])).toThrow();
  });

  test("easings start at 0, end at 1, and inOut is symmetric", () => {
    for (const curve of [ease.linear, ease.in, ease.out, ease.inOut, ease.back]) {
      expect(curve(0)).toBe(0);
      expect(curve(1)).toBe(1);
    }
    expect(ease.inOut(0.5)).toBeCloseTo(0.5, 5);
    expect(bezier(0, 0, 1, 1)(0.3)).toBeCloseTo(0.3, 4);
    expect(ease.out(0.2)).toBeGreaterThan(0.2);
  });

  test("spring starts still, overshoots by default, and settles", () => {
    expect(spring(0.5, { start: 1 })).toBe(0);
    const path = Array.from({ length: 300 }, (_, i) => spring(i / 100));
    expect(Math.max(...path)).toBeGreaterThan(1);
    expect(spring(5)).toBeCloseTo(1, 3);
    expect(spring(5, { from: 0.8, to: 1 })).toBeCloseTo(1, 3);
    const stiff = Array.from({ length: 300 }, (_, i) => spring(i / 100, { damping: 40 }));
    expect(Math.max(...stiff)).toBeLessThanOrEqual(1);
  });
});

describe("parsing", () => {
  test("colours in the usual CSS forms", () => {
    expect(parseColor("#f00")).toEqual([1, 0, 0, 1]);
    expect(parseColor("#00ff0080")[3]).toBeCloseTo(0.5, 2);
    expect(parseColor("rgba(255, 0, 0, 0.5)")).toEqual([1, 0, 0, 0.5]);
    expect(parseColor("rgb(0 0 255 / 50%)")).toEqual([0, 0, 1, 0.5]);
    const red = parseColor("hsl(0, 100%, 50%)");
    expect(red.map((v) => Number(v.toFixed(3)))).toEqual([1, 0, 0, 1]);
    expect(parseColor("transparent")[3]).toBe(0);
    expect(() => parseColor("#ggg")).toThrow(/colour/);
  });

  test("fonts as CSS writes them", () => {
    expect(parseFont("bold 64px SF Pro")).toEqual({
      italic: false,
      weight: 0.4,
      size: 64,
      family: "SF Pro",
    });
    expect(parseFont("italic 900 20px 'Avenir Next', sans-serif")).toEqual({
      italic: true,
      weight: 0.62,
      size: 20,
      family: "Avenir Next",
    });
    expect(() => parseFont("64 Arial")).toThrow(/font/);
  });

  test("a transform and its inverse undo each other", () => {
    const m = multiply(
      [2, 0, 0, 3, 10, 20],
      [Math.cos(1), Math.sin(1), -Math.sin(1), Math.cos(1), 0, 0],
    );
    const back = multiply(m, invert(m));
    expect(back.map((v) => Math.round(v * 1e9) / 1e9 + 0)).toEqual([1, 0, 0, 1, 0, 0]);
  });
});

const macOS = process.platform === "darwin" && process.arch === "arm64";

describe.if(macOS)("canvas", () => {
  /** BGRA at canvas (x, y), y down. */
  const at = (pixels: Uint8Array, width: number, x: number, y: number) =>
    Array.from(pixels.subarray((y * width + x) * 4, (y * width + x) * 4 + 4));
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

  test("fills rectangles from the top left, in canvas colours", () => {
    withCanvas(({ ctx, pixels }) => {
      ctx.fillStyle = "#f00";
      ctx.fillRect(10, 10, 20, 20);
      expect(at(pixels, 100, 15, 15)).toEqual([0, 0, 255, 255]);
      expect(at(pixels, 100, 5, 5)).toEqual([0, 0, 0, 0]);
    });
  });

  test("transforms move what's drawn, and setTransform and restore undo them", () => {
    withCanvas(({ ctx, pixels }) => {
      ctx.fillStyle = "blue";
      ctx.save();
      ctx.translate(50, 0);
      ctx.fillRect(0, 0, 10, 10);
      ctx.restore();
      expect(at(pixels, 100, 55, 5)).toEqual([255, 0, 0, 255]);
      ctx.translate(30, 60);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillRect(0, 80, 5, 5);
      expect(at(pixels, 100, 2, 82)).toEqual([255, 0, 0, 255]);
      expect(at(pixels, 100, 32, 92)).toEqual([0, 0, 0, 0]);
    });
  });

  test("a flat transform draws nothing, and the canvas recovers from it", () => {
    withCanvas(({ ctx, pixels }) => {
      ctx.fillStyle = "red";
      ctx.scale(0, 0);
      ctx.fillRect(0, 0, 100, 100);
      ctx.fillText("x", 10, 10);
      expect(at(pixels, 100, 50, 50)[3]).toBe(0);
      ctx.resetTransform();
      ctx.translate(40, 40);
      ctx.fillRect(0, 0, 10, 10);
      expect(at(pixels, 100, 45, 45)).toEqual([0, 0, 255, 255]);
      expect(at(pixels, 100, 5, 5)[3]).toBe(0);
    });
  });

  test("arcs go clockwise down the canvas, as in a browser", () => {
    withCanvas(({ ctx, pixels }) => {
      ctx.beginPath();
      ctx.arc(50, 50, 20, 0, Math.PI);
      ctx.fill();
      expect(at(pixels, 100, 50, 60)[3]).toBe(255);
      expect(at(pixels, 100, 50, 40)[3]).toBe(0);
    });
  });

  test("clips, clears, and draws with alpha", () => {
    withCanvas(({ ctx, pixels }) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, 50, 100);
      ctx.clip();
      ctx.fillRect(0, 0, 100, 100);
      ctx.restore();
      expect(at(pixels, 100, 25, 50)[3]).toBe(255);
      expect(at(pixels, 100, 75, 50)[3]).toBe(0);
      ctx.clearRect(0, 0, 10, 10);
      expect(at(pixels, 100, 5, 5)[3]).toBe(0);
      ctx.globalAlpha = 0.5;
      ctx.fillRect(60, 0, 10, 10);
      expect(at(pixels, 100, 65, 5)[3]).toBeCloseTo(128, -1);
    });
  });

  test("paints a gradient from one end to the other", () => {
    withCanvas(({ ctx, pixels }) => {
      const g = ctx.createLinearGradient(0, 0, 100, 0);
      g.addColorStop(0, "#f00");
      g.addColorStop(1, "#00f");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 100, 10);
      const [lb, , lr] = at(pixels, 100, 2, 5);
      const [rb, , rr] = at(pixels, 100, 97, 5);
      expect(lr ?? 0).toBeGreaterThan(200);
      expect(rb ?? 0).toBeGreaterThan(200);
      expect(lb ?? 255).toBeLessThan(50);
      expect(rr ?? 255).toBeLessThan(50);
    });
  });

  test("draws text above its baseline and measures it", () => {
    withCanvas(({ ctx, pixels }) => {
      ctx.font = "bold 40px sans-serif";
      const { width } = ctx.measureText("HHH");
      expect(width).toBeGreaterThan(40);
      ctx.fillText("HHH", 10, 60);
      const inked = (x0: number, x1: number, y0: number, y1: number) => {
        for (let y = y0; y < y1; y++)
          for (let x = x0; x < x1; x++) if (at(pixels, 100, x, y)[3]) return true;
        return false;
      };
      expect(inked(10, 10 + Math.floor(width), 25, 60)).toBe(true);
      expect(inked(0, 100, 65, 100)).toBe(false);
      expect(inked(0, 8, 0, 100)).toBe(false);
    });
  });

  test("a frame starts from the video under it, with the state reset", () => {
    // Core Graphics stops clearing bitmaps narrower than 16 pixels; motion never makes one.
    const canvas = createCanvas(16, 16);
    try {
      const green = new Uint8Array(16 * 16 * 4);
      for (let i = 0; i < green.length; i += 4) green.set([0, 255, 0, 255], i);
      canvas.beginFrame(green);
      canvas.ctx.fillStyle = "red";
      canvas.ctx.save();
      canvas.endFrame();
      expect(at(canvas.pixels, 16, 1, 1)).toEqual([0, 255, 0, 255]);
      canvas.beginFrame();
      expect(canvas.ctx.fillStyle).toBe("#000");
      expect(at(canvas.pixels, 16, 1, 1)).toEqual([0, 0, 0, 0]);
      canvas.endFrame();
    } finally {
      canvas.close();
    }
  });
});

describe.if(macOS && !!Bun.which("ffmpeg"))("renderMotion", () => {
  test("encodes one frame per step of time, and reports a failed draw by its time", async () => {
    const dir = mkdtempSync(join(tmpdir(), "motion-test-"));
    try {
      const out = join(dir, "a.mp4");
      const frames = await renderMotion(
        (ctx, t) => {
          ctx.fillStyle = `rgb(${Math.round(t * 255)}, 0, 0)`;
          ctx.fillRect(0, 0, 64, 64);
        },
        { out, width: 64, height: 64, fps: 10, duration: 0.5 },
      );
      expect(frames).toBe(5);
      const probe = Bun.spawnSync([
        "ffprobe",
        "-v",
        "error",
        "-count_frames",
        "-show_entries",
        "stream=nb_read_frames",
        "-of",
        "csv=p=0",
        out,
      ]);
      expect(probe.stdout.toString().trim()).toBe("5");

      const broken = join(dir, "b.mp4");
      const failed = renderMotion(
        (_, t) => {
          if (t >= 0.2) throw new Error("boom");
        },
        { out: broken, width: 64, height: 64, fps: 10, duration: 1 },
      );
      expect(failed).rejects.toThrow("draw failed at 0.20 s (frame 2): boom");
      await failed.catch(() => {});
      expect(existsSync(broken)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
