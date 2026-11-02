import { dlopen, FFIType, ptr, read } from "bun:ffi";
import { createFilters, type FilterStep, parseFilter } from "./filter.ts";
import { Path2D, type Transform } from "./path2d.ts";

/**
 * A drawing context with the browser's Canvas 2D API, drawn by Core Graphics
 * and Core Text into a bitmap: what a motion script draws each frame with.
 * Coordinates start at the top left, as on a canvas; Core Graphics counts up
 * from the bottom, so the context is flipped once when it's made.
 *
 * Needs Apple silicon: a CGAffineTransform or CGRect goes to Core Graphics
 * by value, which Bun's FFI can only do by following arm64's rules (a
 * CGRect as four doubles, a larger struct as a pointer to it).
 */

const FRAMEWORKS = "/System/Library/Frameworks";
const kCFStringEncodingUTF8 = 0x08000100;
const kCFNumberSInt32Type = 3;
const kCFNumberDoubleType = 13;
const kCTFontUIFontSystem = 2;
/** BGRA in memory, alpha premultiplied: what ffmpeg reads as `bgra`. */
const BGRA_PREMULTIPLIED = 2 | (2 << 12);
/** BGRA in memory with alpha ignored: what ffmpeg writes as `bgra` for a video. */
const BGRX = 6 | (2 << 12);
const kCGInterpolationHigh = 3;
const kCGTextFill = 0;
const kCGTextStroke = 1;
const kCGTextClip = 7;
const kCGBlendModeSourceIn = 18;
const kCFCompareCaseInsensitive = 1;
const kCGBlendModeClear = 16;
const kCGGradientDrawsBeyondBothEnds = 3;
/** dlsym's "search everything loaded" handle on macOS, `(void *)-2`. */
const RTLD_DEFAULT = -2n;

/** CoreFoundation objects as `u64`, never `ptr`: see packages/context/src/caret.ts. */
const REF = FFIType.u64;
const { f64, i32, i64, u32, u64, bool, void: none, ptr: P } = FFIType;

function loadSymbols() {
  const cf = dlopen(`${FRAMEWORKS}/CoreFoundation.framework/CoreFoundation`, {
    CFRelease: { args: [REF], returns: none },
    CFStringCreateWithCString: { args: [P, P, u32], returns: REF },
    CFStringCompare: { args: [REF, REF, u64], returns: i64 },
    CFNumberCreate: { args: [P, i64, P], returns: REF },
    CFDictionaryCreate: { args: [P, P, P, i64, P, P], returns: REF },
    CFAttributedStringCreateMutable: { args: [P, i64], returns: REF },
    CFAttributedStringReplaceString: { args: [REF, i64, i64, REF], returns: none },
    CFAttributedStringSetAttribute: { args: [REF, i64, i64, REF, REF], returns: none },
    CFAttributedStringGetLength: { args: [REF], returns: i64 },
    CFURLCreateFromFileSystemRepresentation: { args: [P, P, i64, bool], returns: REF },
  });
  const ct = dlopen(`${FRAMEWORKS}/CoreText.framework/CoreText`, {
    CTFontCreateUIFontForLanguage: { args: [u32, f64, P], returns: REF },
    CTFontCopyFamilyName: { args: [REF], returns: REF },
    CTFontDescriptorCreateWithAttributes: { args: [REF], returns: REF },
    CTFontCreateWithFontDescriptor: { args: [REF, f64, P], returns: REF },
    CTFontGetAscent: { args: [REF], returns: f64 },
    CTFontGetDescent: { args: [REF], returns: f64 },
    CTLineCreateWithAttributedString: { args: [REF], returns: REF },
    CTLineGetTypographicBounds: { args: [REF, P, P, P], returns: f64 },
    CTLineDraw: { args: [REF, REF], returns: none },
  });
  const cg = dlopen(`${FRAMEWORKS}/CoreGraphics.framework/CoreGraphics`, {
    CGColorSpaceCreateDeviceRGB: { args: [], returns: REF },
    CGColorCreateSRGB: { args: [f64, f64, f64, f64], returns: REF },
    CGBitmapContextCreate: { args: [P, u64, u64, u64, u64, REF, u32], returns: REF },
    CGBitmapContextCreateImage: { args: [REF], returns: REF },
    CGContextSaveGState: { args: [REF], returns: none },
    CGContextRestoreGState: { args: [REF], returns: none },
    CGContextTranslateCTM: { args: [REF, f64, f64], returns: none },
    CGContextScaleCTM: { args: [REF, f64, f64], returns: none },
    CGContextRotateCTM: { args: [REF, f64], returns: none },
    CGContextConcatCTM: { args: [REF, P], returns: none },
    CGContextSetRGBFillColor: { args: [REF, f64, f64, f64, f64], returns: none },
    CGContextSetRGBStrokeColor: { args: [REF, f64, f64, f64, f64], returns: none },
    CGContextSetAlpha: { args: [REF, f64], returns: none },
    CGContextSetBlendMode: { args: [REF, i32], returns: none },
    CGContextSetLineWidth: { args: [REF, f64], returns: none },
    CGContextSetLineCap: { args: [REF, i32], returns: none },
    CGContextSetLineJoin: { args: [REF, i32], returns: none },
    CGContextSetMiterLimit: { args: [REF, f64], returns: none },
    CGContextSetLineDash: { args: [REF, f64, P, u64], returns: none },
    CGContextSetShadowWithColor: { args: [REF, f64, f64, f64, REF], returns: none },
    CGContextSetInterpolationQuality: { args: [REF, i32], returns: none },
    CGContextSetTextDrawingMode: { args: [REF, i32], returns: none },
    CGContextSetTextPosition: { args: [REF, f64, f64], returns: none },
    CGContextBeginTransparencyLayer: { args: [REF, P], returns: none },
    CGContextEndTransparencyLayer: { args: [REF], returns: none },
    CGContextAddPath: { args: [REF, REF], returns: none },
    CGContextFillPath: { args: [REF], returns: none },
    CGContextEOFillPath: { args: [REF], returns: none },
    CGContextStrokePath: { args: [REF], returns: none },
    CGContextClip: { args: [REF], returns: none },
    CGContextEOClip: { args: [REF], returns: none },
    CGContextReplacePathWithStrokedPath: { args: [REF], returns: none },
    CGContextClearRect: { args: [REF, f64, f64, f64, f64], returns: none },
    CGContextClipToRect: { args: [REF, f64, f64, f64, f64], returns: none },
    CGContextDrawImage: { args: [REF, f64, f64, f64, f64, REF], returns: none },
    CGContextDrawLinearGradient: { args: [REF, REF, f64, f64, f64, f64, u32], returns: none },
    CGContextDrawRadialGradient: {
      args: [REF, REF, f64, f64, f64, f64, f64, f64, u32],
      returns: none,
    },
    CGGradientCreateWithColorComponents: { args: [REF, P, P, u64], returns: REF },
    CGPathCreateMutable: { args: [], returns: REF },
    CGPathMoveToPoint: { args: [REF, P, f64, f64], returns: none },
    CGPathAddLineToPoint: { args: [REF, P, f64, f64], returns: none },
    CGPathAddQuadCurveToPoint: { args: [REF, P, f64, f64, f64, f64], returns: none },
    CGPathAddCurveToPoint: { args: [REF, P, f64, f64, f64, f64, f64, f64], returns: none },
    CGPathAddArc: { args: [REF, P, f64, f64, f64, f64, f64, bool], returns: none },
    CGPathAddArcToPoint: { args: [REF, P, f64, f64, f64, f64, f64], returns: none },
    CGPathCloseSubpath: { args: [REF], returns: none },
    CGDataProviderCreateWithData: { args: [P, P, u64, P], returns: REF },
    CGImageCreate: { args: [u64, u64, u64, u64, u64, REF, u32, REF, P, bool, i32], returns: REF },
    CGImageCreateWithImageInRect: { args: [REF, f64, f64, f64, f64], returns: REF },
    CGImageGetWidth: { args: [REF], returns: u64 },
    CGImageGetHeight: { args: [REF], returns: u64 },
  });
  const io = dlopen(`${FRAMEWORKS}/ImageIO.framework/ImageIO`, {
    CGImageSourceCreateWithURL: { args: [REF, P], returns: REF },
    CGImageSourceCreateImageAtIndex: { args: [REF, u64, P], returns: REF },
  });
  const libc = dlopen("/usr/lib/libSystem.B.dylib", {
    dlsym: { args: [i64, P], returns: P },
  });
  return { cf, ct, cg, io, libc };
}

const cString = (text: string) => ptr(Buffer.from(`${text}\0`));

/** An affine transform as a canvas lists it: x' = a x + c y + e, y' = b x + d y + f. */
type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** `m` then `n`: the transform that does `m` first. */
export function multiply(m: Matrix, n: Matrix): Matrix {
  const [a, b, c, d, e, f] = m;
  const [a2, b2, c2, d2, e2, f2] = n;
  return [
    a * a2 + b * c2,
    a * b2 + b * d2,
    c * a2 + d * c2,
    c * b2 + d * d2,
    e * a2 + f * c2 + e2,
    e * b2 + f * d2 + f2,
  ];
}

export function invert([a, b, c, d, e, f]: Matrix): Matrix {
  const det = a * d - b * c;
  if (!det) throw new Error("the transform squashes everything flat, so it can't be undone");
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}

/** Whether `m` squashes the plane to a line or a point, as `scale(0)` does. */
export const isFlat = ([a, b, c, d]: Matrix) => Math.abs(a * d - b * c) < 1e-12;

const isIdentity = (m: Matrix) => m.every((v, i) => Math.abs(v - (IDENTITY[i] as number)) < 1e-12);

/** Red, green, blue and alpha, each 0 to 1. */
export type Rgba = [number, number, number, number];

const NAMED: Record<string, string> = {
  black: "#000",
  white: "#fff",
  red: "#f00",
  lime: "#0f0",
  green: "#008000",
  blue: "#00f",
  yellow: "#ff0",
  cyan: "#0ff",
  aqua: "#0ff",
  magenta: "#f0f",
  fuchsia: "#f0f",
  orange: "#ffa500",
  purple: "#800080",
  pink: "#ffc0cb",
  gray: "#808080",
  grey: "#808080",
  silver: "#c0c0c0",
  gold: "#ffd700",
  brown: "#a52a2a",
  navy: "#000080",
  teal: "#008080",
  maroon: "#800000",
  transparent: "#0000",
};

/**
 * A CSS colour: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()`, `rgba()`,
 * `hsl()`, `hsla()`, or a common name. Throws on anything else, so a typo
 * shows up instead of drawing black.
 */
export function parseColor(text: string): Rgba {
  const css = text.trim().toLowerCase();
  const named = NAMED[css];
  if (named) return parseColor(named);
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(css)?.[1];
  if (hex) {
    const full = hex.length <= 4 ? [...hex].map((h) => h + h).join("") : hex;
    const [r, g, b, a = 255] = (full.match(/../g) ?? []).map((h) => Number.parseInt(h, 16));
    return [(r ?? 0) / 255, (g ?? 0) / 255, (b ?? 0) / 255, a / 255];
  }
  const fn = /^(rgba?|hsla?)\((.*)\)$/.exec(css);
  if (fn) {
    const parts = (fn[2] ?? "").split(/[\s,/]+/).filter(Boolean);
    const alpha = (part = "1") =>
      part.endsWith("%") ? Number.parseFloat(part) / 100 : Number(part);
    const [x, y, z, w] = parts;
    if (parts.length === 3 || parts.length === 4) {
      if (fn[1]?.startsWith("rgb")) {
        const channel = (part = "") =>
          part.endsWith("%") ? Number.parseFloat(part) / 100 : Number(part) / 255;
        const rgba: Rgba = [channel(x), channel(y), channel(z), alpha(w)];
        if (rgba.every(Number.isFinite)) return rgba;
      } else {
        const [h, s, l] = [
          Number.parseFloat(x ?? ""),
          Number.parseFloat(y ?? "") / 100,
          Number.parseFloat(z ?? "") / 100,
        ];
        const k = (n: number) => (n + h / 30) % 12;
        const amount = s * Math.min(l, 1 - l);
        const at = (n: number) => l - amount * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
        const rgba: Rgba = [at(0), at(8), at(4), alpha(w)];
        if (rgba.every(Number.isFinite)) return rgba;
      }
    }
  }
  throw new Error(
    `"${text}" isn't a colour mockingbird knows; use #rrggbb, rgb(), rgba() or hsl()`,
  );
}

/** A gradient from createLinearGradient or createRadialGradient. */
export class Gradient {
  readonly stops: [number, Rgba][] = [];
  constructor(
    readonly kind: "linear" | "radial",
    readonly at: number[],
    /** The canvas's transform when the gradient was made, which its coordinates stay in. */
    readonly matrix: Matrix = IDENTITY,
  ) {}
  addColorStop(offset: number, color: string) {
    if (!(offset >= 0 && offset <= 1))
      throw new Error(`a colour stop's offset must be 0 to 1; got ${offset}`);
    this.stops.push([offset, parseColor(color)]);
    this.stops.sort((p, q) => p[0] - q[0]);
  }
}

/** A picture to draw with drawImage: from `m.image(path)`, or the video's frame. */
export type Picture = { readonly width: number; readonly height: number; readonly ref: bigint };

type Paint = { css: string | Gradient; rgba?: Rgba };
type Font = { ref: bigint; ascent: number; descent: number };
type Op = { kind: string; args: number[]; m: Matrix };
type State = {
  fill: Paint;
  stroke: Paint;
  lineWidth: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  miterLimit: number;
  dash: number[];
  dashOffset: number;
  alpha: number;
  composite: string;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  filter: string;
  steps: FilterStep[];
  matrix: Matrix;
  /**
   * The transform Core Graphics holds, which is `matrix` unless that's flat:
   * a flat one could never be undone, so Core Graphics keeps the last that
   * wasn't, and nothing is drawn until the canvas's transform is whole again.
   */
  drawn: Matrix;
};
type CanvasLineCap = "butt" | "round" | "square";
type CanvasLineJoin = "miter" | "round" | "bevel";
type CanvasTextAlign = "left" | "right" | "center" | "start" | "end";
type CanvasTextBaseline = "top" | "hanging" | "middle" | "alphabetic" | "ideographic" | "bottom";

const fresh = (): State => ({
  fill: { css: "#000", rgba: [0, 0, 0, 1] },
  stroke: { css: "#000", rgba: [0, 0, 0, 1] },
  lineWidth: 1,
  lineCap: "butt",
  lineJoin: "miter",
  miterLimit: 10,
  dash: [],
  dashOffset: 0,
  alpha: 1,
  composite: "source-over",
  font: "10px sans-serif",
  textAlign: "start",
  textBaseline: "alphabetic",
  shadowColor: "rgba(0, 0, 0, 0)",
  shadowBlur: 0,
  shadowOffsetX: 0,
  shadowOffsetY: 0,
  filter: "none",
  steps: [],
  matrix: IDENTITY,
  drawn: IDENTITY,
});

/** Canvas's composite operations, in Core Graphics's CGBlendMode order. */
const BLEND = [
  "source-over",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "soft-light",
  "hard-light",
  "difference",
  "exclusion",
  "hue",
  "saturation",
  "color",
  "luminosity",
  "clear",
  "copy",
  "source-in",
  "source-out",
  "source-atop",
  "destination-over",
  "destination-in",
  "destination-out",
  "destination-atop",
  "xor",
];

/** Core Text's weights for CSS's 100 to 900. */
const WEIGHTS: Record<string, number> = {
  "100": -0.8,
  "200": -0.6,
  "300": -0.4,
  "400": 0,
  "500": 0.23,
  "600": 0.3,
  "700": 0.4,
  "800": 0.56,
  "900": 0.62,
  normal: 0,
  bold: 0.4,
  lighter: -0.4,
  bolder: 0.56,
};
const SYSTEM_FONTS = new Set([
  "system-ui",
  "sans-serif",
  "-apple-system",
  "blinkmacsystemfont",
  "sf pro",
  "sf pro display",
  "sf pro text",
]);
const GENERIC: Record<string, string> = { serif: "Times New Roman", monospace: "Menlo" };

/** A CSS `font`: `[italic] [weight] <size>px <family>[, fallbacks]`. */
export function parseFont(css: string): {
  italic: boolean;
  weight: number;
  size: number;
  family: string;
  /** The family and its fallbacks, in order. */
  families: string[];
} {
  const m =
    /^\s*((?:(?:italic|oblique|normal|bold|bolder|lighter|[1-9]00|small-caps)\s+)*)(\d*\.?\d+)px(?:\/\S+)?\s+(.+)$/i.exec(
      css,
    );
  if (!m)
    throw new Error(`"${css}" isn't a font mockingbird reads; write it like "bold 64px SF Pro"`);
  const words = (m[1] ?? "").toLowerCase().split(/\s+/);
  const weight = words.map((w) => WEIGHTS[w]).find((w) => w !== undefined && w !== 0) ?? 0;
  const families = (m[3] ?? "")
    .split(",")
    .map((f) => f.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
  return {
    italic: words.some((w) => w === "italic" || w === "oblique"),
    weight,
    size: Number(m[2]),
    family: families[0] ?? "",
    families,
  };
}

export type Canvas = ReturnType<typeof createCanvas>;

/**
 * A `width` by `height` canvas. Draw with `ctx`; `pixels` holds the result
 * as premultiplied BGRA. Call `beginFrame` before each frame and `endFrame`
 * after it, and `close` when done.
 */
export function createCanvas(width: number, height: number) {
  if (process.arch !== "arm64") throw new Error("Motion graphics need a Mac with Apple silicon.");
  const { cf, ct, cg, io, libc } = loadSymbols();
  const owned: bigint[] = [];
  const own = (ref: bigint | number | null, what: string): bigint => {
    if (ref === null || ref === 0 || ref === 0n)
      throw new Error(`Core Graphics couldn't make ${what}`);
    const handle = BigInt(ref);
    owned.push(handle);
    return handle;
  };
  const release = (ref: bigint) => cf.symbols.CFRelease(ref);
  const constant = (name: string): bigint => {
    const address = libc.symbols.dlsym(RTLD_DEFAULT, cString(name));
    if (!address) throw new Error(`${name} isn't loaded`);
    return read.u64(address, 0);
  };
  const cfString = (text: string) =>
    BigInt(cf.symbols.CFStringCreateWithCString(null, cString(text), kCFStringEncodingUTF8));
  const cfNumber = (value: number, type = kCFNumberDoubleType) =>
    BigInt(
      cf.symbols.CFNumberCreate(
        null,
        type,
        ptr(type === kCFNumberDoubleType ? new Float64Array([value]) : new Int32Array([value])),
      ),
    );
  const keyCallbacks = libc.symbols.dlsym(RTLD_DEFAULT, cString("kCFTypeDictionaryKeyCallBacks"));
  const valueCallbacks = libc.symbols.dlsym(
    RTLD_DEFAULT,
    cString("kCFTypeDictionaryValueCallBacks"),
  );
  /** A CFDictionary of `pairs`, which it retains; release it after. */
  const cfDictionary = (pairs: [bigint, bigint][]) => {
    const keys = new BigUint64Array(pairs.map(([k]) => k));
    const values = new BigUint64Array(pairs.map(([, v]) => v));
    return BigInt(
      cf.symbols.CFDictionaryCreate(
        null,
        ptr(keys),
        ptr(values),
        pairs.length,
        keyCallbacks,
        valueCallbacks,
      ),
    );
  };

  const space = own(cg.symbols.CGColorSpaceCreateDeviceRGB(), "a colour space");
  /** A flipped bitmap context drawing into `bytes`, top left first. */
  const bitmap = (bytes: Uint8Array, w = width, h = height) => {
    const ref = own(
      cg.symbols.CGBitmapContextCreate(ptr(bytes), w, h, 8, w * 4, space, BGRA_PREMULTIPLIED),
      `a ${w}x${h} bitmap`,
    );
    cg.symbols.CGContextTranslateCTM(ref, 0, h);
    cg.symbols.CGContextScaleCTM(ref, 1, -1);
    cg.symbols.CGContextSetInterpolationQuality(ref, kCGInterpolationHigh);
    return ref;
  };
  const pixels = new Uint8Array(width * height * 4);
  const canvas = bitmap(pixels);
  /** Where drawing goes: the canvas, or the filter layer while one draw call is filtered. */
  let c = canvas;

  const fontKey = constant("kCTFontAttributeName");
  const fromContextKey = constant("kCTForegroundColorFromContextAttributeName");
  const yes = constant("kCFBooleanTrue");
  const familyKey = constant("kCTFontFamilyNameAttribute");
  const traitsKey = constant("kCTFontTraitsAttribute");
  const weightKey = constant("kCTFontWeightTrait");
  const symbolicKey = constant("kCTFontSymbolicTrait");
  const fonts = new Map<string, Font>();
  const images = new Map<string, Picture>();
  let systemFamily: bigint | undefined;

  const fontFor = (css: string): Font => {
    const cached = fonts.get(css);
    if (cached) return cached;
    const { italic, weight, size, families } = parseFont(css);
    for (const family of families) {
      const font = fontOf(family, weight, italic, size);
      if (font) {
        fonts.set(css, font);
        return font;
      }
    }
    throw new Error(
      `${families.join(", ")} ${families.length > 1 ? "aren't" : "isn't"} installed on this Mac; use an installed family (Font Book lists them) or add a fallback, like "${css}, serif"`,
    );
  };

  /** One family as Core Text has it, or undefined when it isn't installed and Core Text would substitute another. */
  const fontOf = (family: string, weight: number, italic: boolean, size: number) => {
    const lower = family.toLowerCase();
    const temporary: bigint[] = [];
    const temp = (ref: bigint) => {
      temporary.push(ref);
      return ref;
    };
    try {
      let name: bigint;
      const system = SYSTEM_FONTS.has(lower);
      if (system) {
        // The system font's family has a private name; ask Core Text for it once.
        if (!systemFamily) {
          const ui = temp(
            BigInt(ct.symbols.CTFontCreateUIFontForLanguage(kCTFontUIFontSystem, 12, null)),
          );
          systemFamily = own(ct.symbols.CTFontCopyFamilyName(ui), "the system font's name");
        }
        name = systemFamily;
      } else {
        name = temp(cfString(GENERIC[lower] ?? family));
      }
      const traits = temp(
        cfDictionary([
          [weightKey, temp(cfNumber(weight))],
          [symbolicKey, temp(cfNumber(italic ? 1 : 0, kCFNumberSInt32Type))],
        ]),
      );
      const attributes = temp(
        cfDictionary([
          [familyKey, name],
          [traitsKey, traits],
        ]),
      );
      const descriptor = temp(BigInt(ct.symbols.CTFontDescriptorCreateWithAttributes(attributes)));
      const ref = BigInt(ct.symbols.CTFontCreateWithFontDescriptor(descriptor, size, null));
      if (!ref) throw new Error(`Core Text couldn't make the font ${family}`);
      // Core Text answers a family it doesn't have with its fallback font, not an error.
      const got = temp(BigInt(ct.symbols.CTFontCopyFamilyName(ref)));
      if (!system && cf.symbols.CFStringCompare(got, name, kCFCompareCaseInsensitive) !== 0n) {
        release(ref);
        return undefined;
      }
      return {
        ref,
        ascent: ct.symbols.CTFontGetAscent(ref),
        descent: ct.symbols.CTFontGetDescent(ref),
      };
    } finally {
      for (const ref of temporary.reverse()) release(ref);
    }
  };

  /** A Core Text line of `text` in `font`, coloured by the context; release it after. */
  const textLine = (text: string, font: Font) => {
    const string = cfString(text);
    const attributed = BigInt(cf.symbols.CFAttributedStringCreateMutable(null, 0));
    try {
      cf.symbols.CFAttributedStringReplaceString(attributed, 0, 0, string);
      const length = cf.symbols.CFAttributedStringGetLength(attributed);
      cf.symbols.CFAttributedStringSetAttribute(attributed, 0, length, fontKey, font.ref);
      cf.symbols.CFAttributedStringSetAttribute(attributed, 0, length, fromContextKey, yes);
      const ref = BigInt(ct.symbols.CTLineCreateWithAttributedString(attributed));
      return { ref, width: ct.symbols.CTLineGetTypographicBounds(ref, null, null, null) };
    } finally {
      release(attributed);
      release(string);
    }
  };

  let state = fresh();
  let saved: State[] = [];
  let ops: Op[] = [];
  /** Where the path's current subpath starts, if there is one. */
  let start: [number, number] | undefined;
  let frame: { image: bigint; provider: bigint } | undefined;

  const applyShadow = () => {
    const rgba = parseColor(state.shadowColor);
    if (rgba[3] === 0 || (!state.shadowBlur && !state.shadowOffsetX && !state.shadowOffsetY)) {
      cg.symbols.CGContextSetShadowWithColor(c, 0, 0, 0, 0n);
      return;
    }
    const color = BigInt(cg.symbols.CGColorCreateSRGB(...rgba));
    // A shadow's offset ignores the flip, so down the canvas is down the bitmap.
    cg.symbols.CGContextSetShadowWithColor(
      c,
      state.shadowOffsetX,
      -state.shadowOffsetY,
      state.shadowBlur,
      color,
    );
    release(color);
  };
  const paint = (css: string | Gradient): Paint =>
    css instanceof Gradient ? { css } : { css, rgba: parseColor(css) };

  const record = (kind: string, args: number[]) => ops.push({ kind, args, m: state.matrix });

  /** Records `path`'s calls into the canvas's path recorder, under the current transform. */
  const replay = (path: Path2D) => {
    for (const call of path.calls) {
      if (call[0] === "addPath") {
        const [, inner, t] = call as [string, Path2D, Transform | undefined];
        const outer = state.matrix;
        if (t) state.matrix = multiply([t.a, t.b, t.c, t.d, t.e, t.f], outer);
        // An added path's shapes are its own: they don't continue the subpath before them.
        if (inner.calls.length) start = undefined;
        replay(inner);
        state.matrix = outer;
      } else if (call[0] === "roundRect") {
        const [x = 0, y = 0, w = 0, h = 0, , ...radii] = call[1] as number[];
        ctx.roundRect(x, y, w, h, radii);
      } else {
        const [name, args] = call as [string, number[]];
        (ctx as unknown as Record<string, (...a: number[]) => void>)[name]?.(...args);
      }
    }
  };
  /** `path` as a CGPath, leaving the canvas's own path as it was; release it after. */
  const pathOf = (path: Path2D) => {
    if (!(path instanceof Path2D)) throw new Error("fill, stroke and clip take a Path2D");
    const [kept, keptStart] = [ops, start];
    [ops, start] = [[], undefined];
    try {
      replay(path);
      return buildPath();
    } finally {
      [ops, start] = [kept, keptStart];
    }
  };

  /**
   * The offscreen layer a filtered draw call goes into: the canvas plus `pad`
   * pixels all round, so a shape just off the canvas can still blur or cast
   * a shadow onto it. Grown when a filter reaches further.
   */
  let layer:
    | { c: bigint; filters: ReturnType<typeof createFilters>; pad: number; w: number; h: number }
    | undefined;
  /**
   * Draws what's in the bitmap `from` (`w` by `h`) over `to` with its top
   * left at (x, y), pixel for pixel, under `to`'s settings (its clip, shadow,
   * alpha and blend), `at` undoing `to`'s transform.
   */
  const blit = (to: bigint, from: bigint, w: number, h: number, x = 0, y = 0, at = IDENTITY) => {
    // A snapshot: `from` can be cleared and drawn into while it's drawn.
    const image = BigInt(cg.symbols.CGBitmapContextCreateImage(from));
    if (from === to) cg.symbols.CGContextClearRect(to, 0, 0, w, h);
    cg.symbols.CGContextSaveGState(to);
    if (!isIdentity(at)) cg.symbols.CGContextConcatCTM(to, ptr(new Float64Array(at)));
    cg.symbols.CGContextTranslateCTM(to, x, y + h);
    cg.symbols.CGContextScaleCTM(to, 1, -1);
    cg.symbols.CGContextDrawImage(to, 0, 0, w, h, image);
    cg.symbols.CGContextRestoreGState(to);
    release(image);
  };
  /** How far past a shape its filter can reach, in pixels: about 3σ for a blur, plus a shadow's offset. */
  const reach = (steps: FilterStep[]) =>
    // ponytail: capped at 1024, so a huge blur can't make a huge layer; past that, edges clip.
    Math.min(
      1024,
      Math.ceil(
        steps.reduce(
          (sum, s) =>
            s.kind === "blur"
              ? sum + 3 * s.sigma
              : s.kind === "drop-shadow"
                ? sum + Math.max(Math.abs(s.x), Math.abs(s.y)) + 3 * s.sigma
                : sum,
          0,
        ),
      ),
    );
  /**
   * Runs one draw call through the filter, if there is one, as the HTML spec
   * orders it: the shape is drawn alone into a layer, filtered, then laid on
   * the canvas, where the clip, shadow, globalAlpha and composite apply.
   */
  const filtered = (paint: () => void) => {
    if (!state.steps.length) return paint();
    if (isFlat(state.matrix)) return;
    const pad = reach(state.steps);
    if (!layer || layer.pad < pad) {
      if (layer) {
        layer.filters.close();
        owned.splice(owned.indexOf(layer.c), 1);
        release(layer.c);
      }
      const [w, h] = [width + 2 * pad, height + 2 * pad];
      const bytes = new Uint8Array(w * h * 4);
      layer = { c: bitmap(bytes, w, h), filters: createFilters(bytes, w, h), pad, w, h };
    }
    const { c: l, w, h } = layer;
    cg.symbols.CGContextSaveGState(l);
    cg.symbols.CGContextClearRect(l, 0, 0, w, h);
    cg.symbols.CGContextTranslateCTM(l, layer.pad, layer.pad);
    // The transform Core Graphics holds, which a flat one never reaches.
    cg.symbols.CGContextConcatCTM(l, ptr(new Float64Array(state.drawn)));
    cg.symbols.CGContextSetLineWidth(l, state.lineWidth);
    cg.symbols.CGContextSetLineCap(l, ["butt", "round", "square"].indexOf(state.lineCap));
    cg.symbols.CGContextSetLineJoin(l, ["miter", "round", "bevel"].indexOf(state.lineJoin));
    cg.symbols.CGContextSetMiterLimit(l, state.miterLimit);
    cg.symbols.CGContextSetLineDash(
      l,
      state.dashOffset,
      state.dash.length ? ptr(new Float64Array(state.dash)) : null,
      state.dash.length,
    );
    c = l;
    try {
      paint();
    } finally {
      c = canvas;
      cg.symbols.CGContextRestoreGState(l);
    }
    for (const step of state.steps) {
      if (step.kind === "blur") layer.filters.blur(step.sigma);
      else if (step.kind === "color") layer.filters.color(step.name, step.amount);
      else {
        // Core Graphics's own shadow, as shadowBlur uses: its blur is twice the standard deviation.
        cg.symbols.CGContextSaveGState(l);
        const color = BigInt(cg.symbols.CGColorCreateSRGB(...parseColor(step.color)));
        cg.symbols.CGContextSetShadowWithColor(l, step.x, -step.y, step.sigma * 2, color);
        release(color);
        blit(l, l, w, h);
        cg.symbols.CGContextRestoreGState(l);
      }
    }
    // Back to the canvas's own pixels, so the layer lands where it was drawn.
    blit(canvas, l, w, h, -layer.pad, -layer.pad, invert(state.drawn));
  };
  /** Canvas's rule: a line or curve with no subpath to add to starts one. */
  const ensure = (x: number, y: number) => {
    if (!start) ctx.moveTo(x, y);
  };

  /** The recorded path in today's coordinates, as a CGPath; release it after. */
  const buildPath = (from = ops) => {
    const path = BigInt(cg.symbols.CGPathCreateMutable());
    const undo = invert(state.drawn);
    for (const { kind, args, m } of from) {
      const step = multiply(m, undo);
      const t = isIdentity(step) ? null : ptr(new Float64Array(step));
      const [a = 0, b = 0, c2 = 0, d = 0, e = 0, f = 0, g = 0] = args;
      if (kind === "move") cg.symbols.CGPathMoveToPoint(path, t, a, b);
      else if (kind === "line") cg.symbols.CGPathAddLineToPoint(path, t, a, b);
      else if (kind === "quad") cg.symbols.CGPathAddQuadCurveToPoint(path, t, a, b, c2, d);
      else if (kind === "cubic") cg.symbols.CGPathAddCurveToPoint(path, t, a, b, c2, d, e, f);
      else if (kind === "arc") cg.symbols.CGPathAddArc(path, t, a, b, c2, d, e, !!f);
      else if (kind === "arcTo") cg.symbols.CGPathAddArcToPoint(path, t, a, b, c2, d, e);
      else if (kind === "ellipse") {
        // A unit circle, stretched, turned and moved into place.
        const shape = multiply(
          multiply(
            [c2, 0, 0, d, 0, 0],
            [Math.cos(e), Math.sin(e), -Math.sin(e), Math.cos(e), 0, 0],
          ),
          [1, 0, 0, 1, a, b],
        );
        cg.symbols.CGPathAddArc(
          path,
          ptr(new Float64Array(multiply(shape, step))),
          0,
          0,
          1,
          f,
          g,
          !!args[7],
        );
      } else if (kind === "close") cg.symbols.CGPathCloseSubpath(path);
    }
    return path;
  };

  const gradient = (g: Gradient) => {
    if (!g.stops.length) return;
    const colors = new Float64Array(g.stops.flatMap(([, rgba]) => rgba));
    const offsets = new Float64Array(g.stops.map(([o]) => o));
    const ref = BigInt(
      cg.symbols.CGGradientCreateWithColorComponents(
        space,
        ptr(colors),
        ptr(offsets),
        g.stops.length,
      ),
    );
    const [x0 = 0, y0 = 0, a = 0, b = 0, d = 0, e = 0] = g.at;
    // Painted in the space it was made in, as on a canvas, not today's.
    const back = multiply(g.matrix, invert(state.drawn));
    cg.symbols.CGContextSaveGState(c);
    if (!isIdentity(back)) cg.symbols.CGContextConcatCTM(c, ptr(new Float64Array(back)));
    if (g.kind === "linear") {
      cg.symbols.CGContextDrawLinearGradient(c, ref, x0, y0, a, b, kCGGradientDrawsBeyondBothEnds);
    } else {
      cg.symbols.CGContextDrawRadialGradient(
        c,
        ref,
        x0,
        y0,
        a,
        b,
        d,
        e,
        kCGGradientDrawsBeyondBothEnds,
      );
    }
    cg.symbols.CGContextRestoreGState(c);
    release(ref);
  };

  /** Fills or strokes `path` with the current style, then releases it. */
  const draw = (path: bigint, how: "fill" | "stroke", rule: string) => {
    if (flat()) {
      release(path);
      return;
    }
    const style = how === "fill" ? state.fill : state.stroke;
    cg.symbols.CGContextAddPath(c, path);
    release(path);
    if (style.rgba) {
      if (how === "stroke") {
        cg.symbols.CGContextSetRGBStrokeColor(c, ...style.rgba);
        cg.symbols.CGContextStrokePath(c);
      } else {
        cg.symbols.CGContextSetRGBFillColor(c, ...style.rgba);
        if (rule === "evenodd") cg.symbols.CGContextEOFillPath(c);
        else cg.symbols.CGContextFillPath(c);
      }
      return;
    }
    cg.symbols.CGContextSaveGState(c);
    if (how === "stroke") cg.symbols.CGContextReplacePathWithStrokedPath(c);
    if (rule === "evenodd") cg.symbols.CGContextEOClip(c);
    else cg.symbols.CGContextClip(c);
    gradient(style.css as Gradient);
    cg.symbols.CGContextRestoreGState(c);
  };

  const rectOps = (x: number, y: number, w: number, h: number): Op[] => {
    const m = state.matrix;
    return [
      { kind: "move", args: [x, y], m },
      { kind: "line", args: [x + w, y], m },
      { kind: "line", args: [x + w, y + h], m },
      { kind: "line", args: [x, y + h], m },
      { kind: "close", args: [], m },
    ];
  };

  const text = (
    value: string,
    x: number,
    y: number,
    maxWidth: number | undefined,
    how: "fill" | "stroke",
  ) => {
    if (flat()) return;
    const font = fontFor(state.font);
    const line = textLine(String(value), font);
    try {
      const squeeze = maxWidth !== undefined && line.width > maxWidth ? maxWidth / line.width : 1;
      const width = line.width * squeeze;
      const align = state.textAlign;
      const dx =
        align === "center" ? -width / 2 : align === "right" || align === "end" ? -width : 0;
      const base = state.textBaseline;
      const dy =
        base === "top" || base === "hanging"
          ? font.ascent
          : base === "middle"
            ? (font.ascent - font.descent) / 2
            : base === "bottom" || base === "ideographic"
              ? -font.descent
              : 0;
      const style = how === "fill" ? state.fill : state.stroke;
      cg.symbols.CGContextSaveGState(c);
      cg.symbols.CGContextTranslateCTM(c, x + dx, y + dy);
      // Glyphs are drawn y-up; undo the canvas's flip for them.
      cg.symbols.CGContextScaleCTM(c, squeeze, -1);
      cg.symbols.CGContextSetTextPosition(c, 0, 0);
      if (style.rgba) {
        if (how === "fill") cg.symbols.CGContextSetRGBFillColor(c, ...style.rgba);
        else cg.symbols.CGContextSetRGBStrokeColor(c, ...style.rgba);
        cg.symbols.CGContextSetTextDrawingMode(c, how === "fill" ? kCGTextFill : kCGTextStroke);
        ct.symbols.CTLineDraw(line.ref, c);
      } else if (how === "fill") {
        // A gradient shows through the letters: clip to them, then paint.
        cg.symbols.CGContextSetTextDrawingMode(c, kCGTextClip);
        ct.symbols.CTLineDraw(line.ref, c);
        cg.symbols.CGContextScaleCTM(c, 1 / squeeze, -1);
        cg.symbols.CGContextTranslateCTM(c, -(x + dx), -(y + dy));
        gradient(style.css as Gradient);
      } else {
        // Text clip modes clip to the filled letters even when stroking, so an
        // outline goes through a layer: drawn opaque, then the gradient over it, source-in.
        cg.symbols.CGContextBeginTransparencyLayer(c, null);
        cg.symbols.CGContextSetRGBStrokeColor(c, 1, 1, 1, 1);
        cg.symbols.CGContextSetTextDrawingMode(c, kCGTextStroke);
        ct.symbols.CTLineDraw(line.ref, c);
        cg.symbols.CGContextScaleCTM(c, 1 / squeeze, -1);
        cg.symbols.CGContextTranslateCTM(c, -(x + dx), -(y + dy));
        cg.symbols.CGContextSetBlendMode(c, kCGBlendModeSourceIn);
        gradient(style.css as Gradient);
        cg.symbols.CGContextEndTransparencyLayer(c);
      }
      cg.symbols.CGContextRestoreGState(c);
    } finally {
      release(line.ref);
    }
  };

  /** Makes `target` the canvas's transform, and Core Graphics's too unless it's flat. */
  const setMatrix = (target: Matrix) => {
    state.matrix = target;
    if (isFlat(target)) return;
    if (!isIdentity(multiply(target, invert(state.drawn)))) {
      cg.symbols.CGContextConcatCTM(
        c,
        ptr(new Float64Array(multiply(target, invert(state.drawn)))),
      );
    }
    state.drawn = target;
  };
  /** Applies `m` before the current transform, as translate, scale and rotate do. */
  const applyFirst = (m: Matrix) => setMatrix(multiply(m, state.matrix));
  /** Nothing shows through a flat transform, as in a browser. */
  const flat = () => isFlat(state.matrix);

  const ctx = {
    canvas: { width, height },

    save() {
      saved.push({ ...state, dash: [...state.dash] });
      cg.symbols.CGContextSaveGState(c);
    },
    restore() {
      const last = saved.pop();
      if (!last) return;
      state = last;
      cg.symbols.CGContextRestoreGState(c);
    },

    translate(x: number, y: number) {
      applyFirst([1, 0, 0, 1, x, y]);
    },
    scale(x: number, y: number) {
      applyFirst([x, 0, 0, y, 0, 0]);
    },
    rotate(angle: number) {
      const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
      applyFirst([cos, sin, -sin, cos, 0, 0]);
    },
    transform(a: number, b: number, c2: number, d: number, e: number, f: number) {
      applyFirst([a, b, c2, d, e, f]);
    },
    setTransform(
      a: number | { a: number; b: number; c: number; d: number; e: number; f: number } = 1,
      b = 0,
      c2 = 0,
      d = 1,
      e = 0,
      f = 0,
    ) {
      setMatrix(typeof a === "object" ? [a.a, a.b, a.c, a.d, a.e, a.f] : [a, b, c2, d, e, f]);
    },
    resetTransform() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    },
    getTransform() {
      const [a, b, c2, d, e, f] = state.matrix;
      return { a, b, c: c2, d, e, f };
    },

    get fillStyle(): string | Gradient {
      return state.fill.css;
    },
    set fillStyle(css: string | Gradient) {
      state.fill = paint(css);
    },
    get strokeStyle(): string | Gradient {
      return state.stroke.css;
    },
    set strokeStyle(css: string | Gradient) {
      state.stroke = paint(css);
    },
    get globalAlpha() {
      return state.alpha;
    },
    set globalAlpha(alpha: number) {
      if (!(alpha >= 0 && alpha <= 1)) return;
      state.alpha = alpha;
      cg.symbols.CGContextSetAlpha(c, alpha);
    },
    get globalCompositeOperation() {
      return state.composite;
    },
    set globalCompositeOperation(op: string) {
      const mode = BLEND.indexOf(op);
      if (mode < 0) throw new Error(`"${op}" isn't a composite operation mockingbird knows`);
      state.composite = op;
      cg.symbols.CGContextSetBlendMode(c, mode);
    },
    get lineWidth() {
      return state.lineWidth;
    },
    set lineWidth(width: number) {
      if (!(width > 0)) return;
      state.lineWidth = width;
      cg.symbols.CGContextSetLineWidth(c, width);
    },
    get lineCap() {
      return state.lineCap;
    },
    set lineCap(cap: CanvasLineCap) {
      state.lineCap = cap;
      cg.symbols.CGContextSetLineCap(c, ["butt", "round", "square"].indexOf(cap));
    },
    get lineJoin() {
      return state.lineJoin;
    },
    set lineJoin(join: CanvasLineJoin) {
      state.lineJoin = join;
      cg.symbols.CGContextSetLineJoin(c, ["miter", "round", "bevel"].indexOf(join));
    },
    get miterLimit() {
      return state.miterLimit;
    },
    set miterLimit(limit: number) {
      state.miterLimit = limit;
      cg.symbols.CGContextSetMiterLimit(c, limit);
    },
    setLineDash(segments: number[]) {
      state.dash = segments.length % 2 ? [...segments, ...segments] : [...segments];
      cg.symbols.CGContextSetLineDash(
        c,
        state.dashOffset,
        state.dash.length ? ptr(new Float64Array(state.dash)) : null,
        state.dash.length,
      );
    },
    getLineDash() {
      return [...state.dash];
    },
    get lineDashOffset() {
      return state.dashOffset;
    },
    set lineDashOffset(offset: number) {
      state.dashOffset = offset;
      ctx.setLineDash(state.dash);
    },
    get font() {
      return state.font;
    },
    set font(css: string) {
      fontFor(css);
      state.font = css;
    },
    get textAlign() {
      return state.textAlign;
    },
    set textAlign(align: CanvasTextAlign) {
      state.textAlign = align;
    },
    get textBaseline() {
      return state.textBaseline;
    },
    set textBaseline(baseline: CanvasTextBaseline) {
      state.textBaseline = baseline;
    },
    /** CSS filter functions, like "blur(6px) brightness(120%)", applied to each thing drawn after. */
    get filter() {
      return state.filter;
    },
    set filter(css: string) {
      state.steps = parseFilter(String(css));
      state.filter = state.steps.length ? String(css) : "none";
    },
    get shadowColor() {
      return state.shadowColor;
    },
    set shadowColor(css: string) {
      parseColor(css);
      state.shadowColor = css;
      applyShadow();
    },
    get shadowBlur() {
      return state.shadowBlur;
    },
    set shadowBlur(blur: number) {
      state.shadowBlur = Math.max(0, blur);
      applyShadow();
    },
    get shadowOffsetX() {
      return state.shadowOffsetX;
    },
    set shadowOffsetX(x: number) {
      state.shadowOffsetX = x;
      applyShadow();
    },
    get shadowOffsetY() {
      return state.shadowOffsetY;
    },
    set shadowOffsetY(y: number) {
      state.shadowOffsetY = y;
      applyShadow();
    },

    beginPath() {
      ops = [];
      start = undefined;
    },
    moveTo(x: number, y: number) {
      record("move", [x, y]);
      start = [x, y];
    },
    lineTo(x: number, y: number) {
      if (!start) return ctx.moveTo(x, y);
      record("line", [x, y]);
    },
    quadraticCurveTo(cpx: number, cpy: number, x: number, y: number) {
      ensure(cpx, cpy);
      record("quad", [cpx, cpy, x, y]);
    },
    bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number) {
      ensure(cp1x, cp1y);
      record("cubic", [cp1x, cp1y, cp2x, cp2y, x, y]);
    },
    // Angles grow clockwise on a canvas, which is Core Graphics's
    // counterclockwise once the canvas is flipped; `counterclockwise` maps across as is.
    arc(x: number, y: number, r: number, from: number, to: number, counterclockwise = false) {
      // With no subpath, it starts its own, so Core Graphics doesn't join it to the last shape.
      if (!start) ctx.moveTo(x + r * Math.cos(from), y + r * Math.sin(from));
      record("arc", [x, y, r, from, to, counterclockwise ? 1 : 0]);
    },
    arcTo(x1: number, y1: number, x2: number, y2: number, r: number) {
      ensure(x1, y1);
      record("arcTo", [x1, y1, x2, y2, r]);
    },
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
      if (!start) {
        const [px, py] = [rx * Math.cos(from), ry * Math.sin(from)];
        const [cos, sin] = [Math.cos(rotation), Math.sin(rotation)];
        ctx.moveTo(x + px * cos - py * sin, y + px * sin + py * cos);
      }
      record("ellipse", [x, y, rx, ry, rotation, from, to, counterclockwise ? 1 : 0]);
    },
    rect(x: number, y: number, w: number, h: number) {
      ops.push(...rectOps(x, y, w, h));
      start = [x, y];
    },
    roundRect(x: number, y: number, w: number, h: number, radii: number | number[] = 0) {
      const list = Array.isArray(radii) ? radii : [radii];
      const [tl = 0, tr = tl, br = tl, bl = tr] =
        list.length === 3 ? [list[0], list[1], list[2], list[1]] : list;
      const fit = (r: number) => Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
      ctx.moveTo(x + fit(tl), y);
      ctx.arcTo(x + w, y, x + w, y + h, fit(tr));
      ctx.arcTo(x + w, y + h, x, y + h, fit(br));
      ctx.arcTo(x, y + h, x, y, fit(bl));
      ctx.arcTo(x, y, x + w, y, fit(tl));
      ctx.closePath();
    },
    closePath() {
      if (!start) return;
      record("close", []);
    },
    /** fill([rule]) or fill(path[, rule]). */
    fill(path?: Path2D | "nonzero" | "evenodd", rule: "nonzero" | "evenodd" = "nonzero") {
      const how = typeof path === "string" ? path : rule;
      // Built inside, so a draw the filter skips makes no path to leak.
      filtered(() => draw(path instanceof Path2D ? pathOf(path) : buildPath(), "fill", how));
    },
    stroke(path?: Path2D) {
      filtered(() =>
        draw(path instanceof Path2D ? pathOf(path) : buildPath(), "stroke", "nonzero"),
      );
    },
    /** clip([rule]) or clip(path[, rule]). */
    clip(shape?: Path2D | "nonzero" | "evenodd", which: "nonzero" | "evenodd" = "nonzero") {
      // A flat transform clips to nothing at all.
      if (flat()) return cg.symbols.CGContextClipToRect(c, 0, 0, 0, 0);
      const path = shape instanceof Path2D ? pathOf(shape) : buildPath();
      const rule = typeof shape === "string" ? shape : which;
      cg.symbols.CGContextAddPath(c, path);
      release(path);
      if (rule === "evenodd") cg.symbols.CGContextEOClip(c);
      else cg.symbols.CGContextClip(c);
    },
    fillRect(x: number, y: number, w: number, h: number) {
      filtered(() => draw(buildPath(rectOps(x, y, w, h)), "fill", "nonzero"));
    },
    strokeRect(x: number, y: number, w: number, h: number) {
      filtered(() => draw(buildPath(rectOps(x, y, w, h)), "stroke", "nonzero"));
    },
    clearRect(x: number, y: number, w: number, h: number) {
      if (flat()) return;
      cg.symbols.CGContextSaveGState(c);
      cg.symbols.CGContextSetBlendMode(c, kCGBlendModeClear);
      cg.symbols.CGContextSetShadowWithColor(c, 0, 0, 0, 0n);
      const path = buildPath(rectOps(x, y, w, h));
      cg.symbols.CGContextAddPath(c, path);
      release(path);
      cg.symbols.CGContextFillPath(c);
      cg.symbols.CGContextRestoreGState(c);
    },

    createLinearGradient(x0: number, y0: number, x1: number, y1: number) {
      return new Gradient("linear", [x0, y0, x1, y1], state.matrix);
    },
    createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number) {
      return new Gradient("radial", [x0, y0, r0, x1, y1, r1], state.matrix);
    },

    fillText(value: string, x: number, y: number, maxWidth?: number) {
      filtered(() => text(value, x, y, maxWidth, "fill"));
    },
    strokeText(value: string, x: number, y: number, maxWidth?: number) {
      filtered(() => text(value, x, y, maxWidth, "stroke"));
    },
    measureText(value: string) {
      const font = fontFor(state.font);
      const line = textLine(String(value), font);
      release(line.ref);
      return {
        width: line.width,
        actualBoundingBoxLeft: 0,
        actualBoundingBoxRight: line.width,
        actualBoundingBoxAscent: font.ascent,
        actualBoundingBoxDescent: font.descent,
        fontBoundingBoxAscent: font.ascent,
        fontBoundingBoxDescent: font.descent,
      };
    },

    /** drawImage(picture, dx, dy[, dw, dh]) or drawImage(picture, sx, sy, sw, sh, dx, dy, dw, dh). */
    drawImage(picture: Picture, ...at: number[]) {
      if (!picture || typeof picture.ref !== "bigint") {
        throw new Error("drawImage takes a picture from m.image(path), or m.video");
      }
      if (flat()) return;
      let ref = picture.ref;
      let [dx = 0, dy = 0, dw = picture.width, dh = picture.height] = at;
      let cropped = false;
      if (at.length === 8) {
        const [sx = 0, sy = 0, sw = 0, sh = 0] = at;
        [dx = 0, dy = 0, dw = 0, dh = 0] = at.slice(4);
        ref = BigInt(cg.symbols.CGImageCreateWithImageInRect(ref, sx, sy, sw, sh));
        if (!ref) return;
        cropped = true;
      }
      filtered(() => {
        cg.symbols.CGContextSaveGState(c);
        // A CGImage draws y-up from its rect's corner; undo the canvas's flip for it.
        cg.symbols.CGContextTranslateCTM(c, dx, dy + dh);
        cg.symbols.CGContextScaleCTM(c, 1, -1);
        cg.symbols.CGContextDrawImage(c, 0, 0, dw, dh, ref);
        cg.symbols.CGContextRestoreGState(c);
      });
      if (cropped) release(ref);
    },
  };

  return {
    ctx,
    pixels,

    /** A picture file (PNG, JPEG, HEIC, …), read once and kept for the canvas's life. */
    image(path: string): Picture {
      const cached = images.get(path);
      if (cached) return cached;
      const bytes = Buffer.from(path);
      const url = BigInt(
        cf.symbols.CFURLCreateFromFileSystemRepresentation(null, ptr(bytes), bytes.length, false),
      );
      const source = url && BigInt(io.symbols.CGImageSourceCreateWithURL(url, null));
      const ref = source && BigInt(io.symbols.CGImageSourceCreateImageAtIndex(source, 0, null));
      for (const r of [source, url]) if (r) release(r);
      if (!ref) throw new Error(`couldn't read the picture ${path}`);
      owned.push(ref);
      const picture = {
        width: Number(cg.symbols.CGImageGetWidth(ref)),
        height: Number(cg.symbols.CGImageGetHeight(ref)),
        ref,
      };
      images.set(path, picture);
      return picture;
    },

    /**
     * Starts a frame: clears the canvas and the script's state, and draws
     * `video` (one BGRA frame at the canvas's size) over the whole of it.
     * Returns that frame as a picture.
     */
    beginFrame(video?: Uint8Array): Picture | undefined {
      cg.symbols.CGContextSaveGState(c);
      state = fresh();
      saved = [];
      ops = [];
      start = undefined;
      cg.symbols.CGContextClearRect(c, 0, 0, width, height);
      if (!video) return undefined;
      const provider = BigInt(
        cg.symbols.CGDataProviderCreateWithData(null, ptr(video), video.length, null),
      );
      const image = BigInt(
        cg.symbols.CGImageCreate(
          width,
          height,
          8,
          32,
          width * 4,
          space,
          BGRX,
          provider,
          null,
          false,
          0,
        ),
      );
      frame = { image, provider };
      const picture = { width, height, ref: image };
      ctx.drawImage(picture, 0, 0, width, height);
      return picture;
    },
    /** Ends a frame: puts back the state the script left changed. */
    endFrame() {
      for (let i = 0; i <= saved.length; i++) cg.symbols.CGContextRestoreGState(c);
      saved = [];
      if (frame) {
        release(frame.image);
        release(frame.provider);
        frame = undefined;
      }
    },
    close() {
      layer?.filters.close();
      for (const font of fonts.values()) release(font.ref);
      for (const ref of owned.reverse()) release(ref);
      fonts.clear();
      images.clear();
      for (const library of [cf, ct, cg, io, libc]) library.close();
    },
  };
}
