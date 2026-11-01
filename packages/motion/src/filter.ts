import { dlopen, FFIType, ptr } from "bun:ffi";

/**
 * The canvas `filter`: CSS filter functions, run on a premultiplied BGRA
 * bitmap with Accelerate's vImage, a C API in macOS like Core Graphics.
 * Numbers follow the Filter Effects spec (https://www.w3.org/TR/filter-effects-1/):
 * filter functions work in sRGB, and blur() is three box blurs.
 */

/** One filter function, as `parseFilter` reads it. */
export type FilterStep =
  | { kind: "blur"; sigma: number }
  | { kind: "drop-shadow"; x: number; y: number; sigma: number; color: string }
  | { kind: "color"; name: string; amount: number };

const COLOR = new Set([
  "brightness",
  "contrast",
  "grayscale",
  "hue-rotate",
  "invert",
  "opacity",
  "saturate",
  "sepia",
]);
/** These top out at 100%. */
const CAPPED = new Set(["grayscale", "invert", "opacity", "sepia"]);

const length = (text: string, what: string) => {
  const m = /^(-?(?:\d+\.?\d*|\.\d+))(px)?$/.exec(text);
  if (!m || (!m[2] && Number(m[1]) !== 0))
    throw new Error(`${what} needs a length in px; got "${text}"`);
  return Number(m[1]);
};

/** A CSS filter list, like `"blur(4px) brightness(120%)"`; `"none"` or `""` is no filter. */
export function parseFilter(css: string): FilterStep[] {
  const text = css.trim();
  if (text === "" || text === "none") return [];
  const steps: FilterStep[] = [];
  // A function's arguments may hold one level of brackets: drop-shadow(… rgba(…)).
  const call = /\s*([a-z-]+)\(((?:[^()]|\([^()]*\))*)\)\s*/gy;
  for (let m = call.exec(text); m; m = call.exec(text)) {
    const [, name = "", arg = ""] = m;
    const value = arg.trim();
    if (name === "blur") {
      const sigma = value ? length(value, "blur()") : 0;
      if (sigma < 0) throw new Error("blur() can't be negative");
      steps.push({ kind: "blur", sigma });
    } else if (name === "drop-shadow") {
      const parts = value.match(/[a-z]+\([^)]*\)|[^\s]+/gi) ?? [];
      const lengths = parts.filter((p) => /^-?[\d.]+(px)?$/.test(p));
      const color = parts.filter((p) => !lengths.includes(p)).join(" ") || "black";
      if (lengths.length < 2 || lengths.length > 3) {
        throw new Error(
          `drop-shadow() takes x, y and an optional blur, then a colour; got "${value}"`,
        );
      }
      const [x = 0, y = 0, sigma = 0] = lengths.map((l) => length(l, "drop-shadow()"));
      if (sigma < 0) throw new Error("drop-shadow()'s blur can't be negative");
      steps.push({ kind: "drop-shadow", x, y, sigma, color });
    } else if (COLOR.has(name)) {
      steps.push({ kind: "color", name, amount: amount(name, value) });
    } else if (name === "url") {
      throw new Error("filter url() needs an SVG document, which a motion script doesn't have");
    } else {
      throw new Error(`"${name}()" isn't a filter function mockingbird knows`);
    }
    if (call.lastIndex === text.length) return steps;
  }
  throw new Error(
    `"${css}" isn't a filter mockingbird reads; write it like "blur(4px) saturate(1.5)"`,
  );
}

/** A colour function's argument: a number or a percentage, or an angle for hue-rotate. */
function amount(name: string, value: string): number {
  if (name === "hue-rotate") {
    if (!value) return 0;
    const m = /^(-?(?:\d+\.?\d*|\.\d+))(deg|rad|grad|turn)?$/.exec(value);
    if (!m || (!m[2] && Number(m[1]) !== 0))
      throw new Error(`hue-rotate() needs an angle; got "${value}"`);
    const n = Number(m[1]);
    const unit = m[2] ?? "deg";
    return unit === "rad"
      ? n
      : unit === "turn"
        ? n * 2 * Math.PI
        : unit === "grad"
          ? (n * Math.PI) / 200
          : (n * Math.PI) / 180;
  }
  if (!value) return 1;
  const m = /^((?:\d+\.?\d*|\.\d+))(%)?$/.exec(value);
  if (!m) throw new Error(`${name}() needs a number or a percentage, not negative; got "${value}"`);
  const n = Number(m[1]) / (m[2] ? 100 : 1);
  return CAPPED.has(name) ? Math.min(n, 1) : n;
}

/**
 * A colour function as a 4x5 matrix over unpremultiplied R, G, B, A in 0–1:
 * row `i` gives output channel `i` from the inputs and, last, a constant.
 */
export function colorMatrix(name: string, a: number): number[][] {
  const rgb = (m: number[][], bias = [0, 0, 0]) => [
    [...(m[0] as number[]), 0, bias[0] as number],
    [...(m[1] as number[]), 0, bias[1] as number],
    [...(m[2] as number[]), 0, bias[2] as number],
    [0, 0, 0, 1, 0],
  ];
  const k = 1 - a;
  switch (name) {
    case "brightness":
      return rgb([
        [a, 0, 0],
        [0, a, 0],
        [0, 0, a],
      ]);
    case "contrast":
      return rgb(
        [
          [a, 0, 0],
          [0, a, 0],
          [0, 0, a],
        ],
        [0.5 - a / 2, 0.5 - a / 2, 0.5 - a / 2],
      );
    case "invert":
      return rgb(
        [
          [1 - 2 * a, 0, 0],
          [0, 1 - 2 * a, 0],
          [0, 0, 1 - 2 * a],
        ],
        [a, a, a],
      );
    case "opacity":
      return [
        [1, 0, 0, 0, 0],
        [0, 1, 0, 0, 0],
        [0, 0, 1, 0, 0],
        [0, 0, 0, a, 0],
      ];
    case "grayscale":
      return rgb([
        [0.2126 + 0.7874 * k, 0.7152 - 0.7152 * k, 0.0722 - 0.0722 * k],
        [0.2126 - 0.2126 * k, 0.7152 + 0.2848 * k, 0.0722 - 0.0722 * k],
        [0.2126 - 0.2126 * k, 0.7152 - 0.7152 * k, 0.0722 + 0.9278 * k],
      ]);
    case "sepia":
      return rgb([
        [0.393 + 0.607 * k, 0.769 - 0.769 * k, 0.189 - 0.189 * k],
        [0.349 - 0.349 * k, 0.686 + 0.314 * k, 0.168 - 0.168 * k],
        [0.272 - 0.272 * k, 0.534 - 0.534 * k, 0.131 + 0.869 * k],
      ]);
    case "saturate":
      return rgb([
        [0.213 + 0.787 * a, 0.715 - 0.715 * a, 0.072 - 0.072 * a],
        [0.213 - 0.213 * a, 0.715 + 0.285 * a, 0.072 - 0.072 * a],
        [0.213 - 0.213 * a, 0.715 - 0.715 * a, 0.072 + 0.928 * a],
      ]);
    default: {
      // hue-rotate, `a` in radians.
      const [c, s] = [Math.cos(a), Math.sin(a)];
      return rgb([
        [
          0.213 + c * 0.787 - s * 0.213,
          0.715 - c * 0.715 - s * 0.715,
          0.072 - c * 0.072 + s * 0.928,
        ],
        [
          0.213 - c * 0.213 + s * 0.143,
          0.715 + c * 0.285 + s * 0.14,
          0.072 - c * 0.072 - s * 0.283,
        ],
        [
          0.213 - c * 0.213 - s * 0.787,
          0.715 - c * 0.715 + s * 0.715,
          0.072 + c * 0.928 + s * 0.072,
        ],
      ]);
    }
  }
}

/** The box size three box blurs need to look like a Gaussian of `sigma` (Filter Effects §feGaussianBlur), made odd. */
export const boxSize = (sigma: number) => {
  const d = Math.floor((sigma * 3 * Math.sqrt(2 * Math.PI)) / 4 + 0.5);
  return d % 2 ? d : d + 1;
};

/** Where R, G, B and A sit in a BGRA pixel. */
const AT = [2, 1, 0, 3];
const DIVISOR = 256;
const kvImageBackgroundColorFill = 4;

/** Blur and colour functions over `pixels`, a `width` by `height` premultiplied BGRA bitmap. */
export function createFilters(pixels: Uint8Array, width: number, height: number) {
  const { i32, i64, u32, u64, ptr: P } = FFIType;
  const vi = dlopen("/System/Library/Frameworks/Accelerate.framework/Accelerate", {
    vImageBoxConvolve_ARGB8888: { args: [P, P, P, u64, u64, u32, u32, P, u32], returns: i64 },
    vImageMatrixMultiply_ARGB8888: { args: [P, P, P, i32, P, P, u32], returns: i64 },
    vImagePremultiplyData_RGBA8888: { args: [P, P, u32], returns: i64 },
    vImageUnpremultiplyData_RGBA8888: { args: [P, P, u32], returns: i64 },
  });
  const spare = new Uint8Array(pixels.length);
  /** A vImage_Buffer: data, height, width, bytes a row. Kept, since vImage holds only its address. */
  const buffer = (data: Uint8Array) =>
    new BigUint64Array([BigInt(ptr(data)), BigInt(height), BigInt(width), BigInt(width * 4)]);
  // The arrays, not their addresses: an address alone doesn't stop the GC freeing what it points at.
  const [main, other] = [buffer(pixels), buffer(spare)];
  const transparent = new Uint8Array(4);
  const check = (error: number | bigint, what: string) => {
    if (Number(error) !== 0) throw new Error(`vImage couldn't ${what} (error ${error})`);
  };

  return {
    blur(sigma: number) {
      const d = boxSize(sigma);
      if (d < 3) return;
      // Three passes, back and forth; outside the canvas counts as transparent.
      const passes: [BigUint64Array, BigUint64Array][] = [
        [main, other],
        [other, main],
        [main, other],
      ];
      for (const [from, to] of passes) {
        check(
          vi.symbols.vImageBoxConvolve_ARGB8888(
            from,
            to,
            null,
            0,
            0,
            d,
            d,
            transparent,
            kvImageBackgroundColorFill,
          ),
          "blur",
        );
      }
      pixels.set(spare);
    },
    color(name: string, amount: number) {
      const m = colorMatrix(name, amount);
      // vImage takes pixels as row vectors: matrix[from * 4 + to], in memory's BGRA order.
      const matrix = new Int16Array(16);
      const bias = new Int32Array(4).fill(DIVISOR / 2);
      for (let to = 0; to < 4; to++) {
        const row = m[to] as number[];
        for (let from = 0; from < 4; from++) {
          const k = Math.round((row[from] as number) * DIVISOR);
          matrix[(AT[from] as number) * 4 + (AT[to] as number)] = Math.max(
            -32768,
            Math.min(32767, k),
          );
        }
        const at = AT[to] as number;
        bias[at] = (bias[at] as number) + Math.round((row[4] as number) * 255 * DIVISOR);
      }
      // The functions are defined on colours before alpha is multiplied in.
      check(vi.symbols.vImageUnpremultiplyData_RGBA8888(main, main, 0), "unpremultiply");
      check(
        vi.symbols.vImageMatrixMultiply_ARGB8888(
          main,
          main,
          ptr(matrix),
          DIVISOR,
          null,
          ptr(bias),
          0,
        ),
        `apply ${name}()`,
      );
      check(vi.symbols.vImagePremultiplyData_RGBA8888(main, main, 0), "premultiply");
    },
    close() {
      vi.close();
    },
  };
}
