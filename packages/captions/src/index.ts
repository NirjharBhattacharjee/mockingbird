import { dlopen, FFIType, ptr, read } from "bun:ffi";
import { join } from "node:path";

/** One caption: its text, and when it shows, in seconds. */
export type Cue = { start: number; end: number; text: string };

/** `01:02:03,450` or `02:03.45` in seconds; undefined if it isn't a time. */
function srtTime(text: string): number | undefined {
  const m = /(?:(\d+):)?(\d{1,2}):(\d{1,2})[,.](\d{1,3})/.exec(text);
  if (!m) return undefined;
  const [, h = "0", min = "0", s = "0", ms = "0"] = m;
  return Number(h) * 3600 + Number(min) * 60 + Number(s) + Number(ms.padEnd(3, "0")) / 1000;
}

/**
 * The cues in SRT text. A cue without a time line, without text, or that
 * ends before it starts is left out. Tags like `<i>` are dropped, since the
 * captions are drawn in one style.
 */
export function parseSrt(srt: string): Cue[] {
  return srt
    .replace(/\r/g, "")
    .split(/\n[ \t]*\n/)
    .flatMap((block) => {
      const lines = block.trim().split("\n");
      const at = lines.findIndex((line) => line.includes("-->"));
      const [from = "", to = ""] = (lines[at] ?? "").split("-->");
      const start = srtTime(from);
      const end = srtTime(to);
      const text = lines
        .slice(at + 1)
        .join("\n")
        .replace(/<[^>]*>/g, "")
        .trim();
      return at >= 0 && start !== undefined && end !== undefined && end > start && text
        ? [{ start, end, text }]
        : [];
    });
}

const FRAMEWORKS = "/System/Library/Frameworks";
const kCFStringEncodingUTF8 = 0x08000100;
const kCTFontUIFontEmphasizedSystem = 3;
const kCGImageAlphaPremultipliedLast = 1;
const kCGTextFill = 0;
const kCGTextStroke = 1;
const kCGLineJoinRound = 1;
/** dlsym's "search everything loaded" handle on macOS, `(void *)-2`. */
const RTLD_DEFAULT = -2n;

/** Text height and outline, against the short side of the video. */
const TEXT_SIZE = 0.075;
const OUTLINE = 0.2;
/** How much of the short side a line may take before it wraps. */
const LINE_WIDTH = 0.9;

/** CoreFoundation objects as `u64`, never `ptr`: see packages/context/src/caret.ts. */
const REF = FFIType.u64;
const { f64, i32, i64, u32, u64, bool, void: none, ptr: P } = FFIType;

function loadSymbols() {
  const cf = dlopen(`${FRAMEWORKS}/CoreFoundation.framework/CoreFoundation`, {
    CFRelease: { args: [REF], returns: none },
    CFStringCreateWithCString: { args: [P, P, u32], returns: REF },
    CFAttributedStringCreateMutable: { args: [P, i64], returns: REF },
    // A CFRange { location, length } goes by value, as two integer
    // arguments: that's how arm64 and x86-64 both pass a 16-byte struct.
    CFAttributedStringReplaceString: { args: [REF, i64, i64, REF], returns: none },
    CFAttributedStringSetAttribute: { args: [REF, i64, i64, REF, REF], returns: none },
    CFAttributedStringGetLength: { args: [REF], returns: i64 },
    CFURLCreateFromFileSystemRepresentation: { args: [P, P, i64, bool], returns: REF },
  });
  const ct = dlopen(`${FRAMEWORKS}/CoreText.framework/CoreText`, {
    CTFontCreateUIFontForLanguage: { args: [u32, f64, P], returns: REF },
    CTFontGetAscent: { args: [REF], returns: f64 },
    CTFontGetDescent: { args: [REF], returns: f64 },
    CTLineCreateWithAttributedString: { args: [REF], returns: REF },
    CTLineGetTypographicBounds: { args: [REF, P, P, P], returns: f64 },
    CTLineDraw: { args: [REF, REF], returns: none },
  });
  const cg = dlopen(`${FRAMEWORKS}/CoreGraphics.framework/CoreGraphics`, {
    CGColorSpaceCreateDeviceRGB: { args: [], returns: REF },
    CGBitmapContextCreate: { args: [P, u64, u64, u64, u64, REF, u32], returns: REF },
    CGBitmapContextCreateImage: { args: [REF], returns: REF },
    CGContextSetTextDrawingMode: { args: [REF, i32], returns: none },
    CGContextSetLineWidth: { args: [REF, f64], returns: none },
    CGContextSetLineJoin: { args: [REF, i32], returns: none },
    CGContextSetRGBFillColor: { args: [REF, f64, f64, f64, f64], returns: none },
    CGContextSetRGBStrokeColor: { args: [REF, f64, f64, f64, f64], returns: none },
    CGContextSetTextPosition: { args: [REF, f64, f64], returns: none },
  });
  const io = dlopen(`${FRAMEWORKS}/ImageIO.framework/ImageIO`, {
    CGImageDestinationCreateWithURL: { args: [REF, REF, u64, P], returns: REF },
    CGImageDestinationAddImage: { args: [REF, REF, P], returns: none },
    CGImageDestinationFinalize: { args: [REF], returns: bool },
  });
  const libc = dlopen("/usr/lib/libSystem.B.dylib", {
    dlsym: { args: [i64, P], returns: P },
  });
  return { cf, ct, cg, io, libc };
}

const cString = (text: string) => ptr(Buffer.from(`${text}\0`));

/**
 * Draws each of `texts` into `dir` as a transparent PNG: white bold text
 * with a black outline, centred, wrapped to fit a video whose short side is
 * `side` pixels, as wide as that side. Returns the files in order, or
 * undefined if they can't be drawn: Core Text is macOS only.
 */
export function drawCaptions(texts: string[], dir: string, side: number): string[] | undefined {
  let symbols: ReturnType<typeof loadSymbols>;
  try {
    symbols = loadSymbols();
  } catch {
    return undefined;
  }
  const { cf, ct, cg, io, libc } = symbols;
  const owned: bigint[] = [];
  const own = (ref: bigint | number | null): bigint => {
    if (ref === null || ref === 0 || ref === 0n) throw new Error("Core Text returned nothing");
    const handle = BigInt(ref);
    owned.push(handle);
    return handle;
  };
  /** Releases what was owned after `mark`, newest first. */
  const releaseTo = (mark: number) => {
    for (const ref of owned.splice(mark).reverse()) cf.symbols.CFRelease(ref);
  };
  /** A constant a framework exports, like kCFBooleanTrue. */
  const constant = (name: string): bigint => {
    const address = libc.symbols.dlsym(RTLD_DEFAULT, cString(name));
    if (!address) throw new Error(`${name} isn't loaded`);
    return read.u64(address, 0);
  };
  const cfString = (text: string) =>
    own(cf.symbols.CFStringCreateWithCString(null, cString(text), kCFStringEncodingUTF8));

  try {
    const size = Math.round(side * TEXT_SIZE);
    const outline = size * OUTLINE;
    const font = own(
      ct.symbols.CTFontCreateUIFontForLanguage(kCTFontUIFontEmphasizedSystem, size, null),
    );
    const fontKey = constant("kCTFontAttributeName");
    // Colours come from the context, so one line draws as outline, then as fill.
    const fromContextKey = constant("kCTForegroundColorFromContextAttributeName");
    const yes = constant("kCFBooleanTrue");
    const lineHeight = ct.symbols.CTFontGetAscent(font) + ct.symbols.CTFontGetDescent(font);
    const descent = ct.symbols.CTFontGetDescent(font);
    const space = own(cg.symbols.CGColorSpaceCreateDeviceRGB());
    const png = cfString("public.png");

    const line = (text: string) => {
      const attributed = own(cf.symbols.CFAttributedStringCreateMutable(null, 0));
      cf.symbols.CFAttributedStringReplaceString(attributed, 0, 0, cfString(text));
      const length = cf.symbols.CFAttributedStringGetLength(attributed);
      cf.symbols.CFAttributedStringSetAttribute(attributed, 0, length, fontKey, font);
      cf.symbols.CFAttributedStringSetAttribute(attributed, 0, length, fromContextKey, yes);
      const ref = own(ct.symbols.CTLineCreateWithAttributedString(attributed));
      return { ref, width: ct.symbols.CTLineGetTypographicBounds(ref, null, null, null) };
    };
    const fits = (text: string) => {
      const mark = owned.length;
      try {
        return line(text).width <= side * LINE_WIDTH;
      } finally {
        releaseTo(mark);
      }
    };
    /** `pieces` joined with `gap`, as many to a line as fit. */
    const pack = (pieces: string[], gap: string) => {
      const lines: string[] = [];
      for (const piece of pieces) {
        const last = lines.at(-1);
        if (last !== undefined && fits(`${last}${gap}${piece}`)) {
          lines[lines.length - 1] = `${last}${gap}${piece}`;
        } else {
          lines.push(piece);
        }
      }
      return lines;
    };
    const characters = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    /**
     * Words onto as few lines as fit. A word too long for a line, like a
     * Chinese or Japanese sentence with no spaces, breaks between characters.
     */
    const wrap = (text: string) =>
      text.split("\n").flatMap((paragraph) =>
        pack(
          paragraph
            .split(/\s+/)
            .filter(Boolean)
            .flatMap((word) =>
              fits(word)
                ? [word]
                : pack(
                    [...characters.segment(word)].map((c) => c.segment),
                    "",
                  ),
            ),
          " ",
        ),
      );

    const files = texts.map((text, n) => {
      // This cue's bitmap and lines go as soon as its PNG is saved.
      const mark = owned.length;
      const lines = wrap(text).map(line);
      const height = Math.ceil(lines.length * lineHeight + 2 * outline);
      const context = own(
        cg.symbols.CGBitmapContextCreate(
          null,
          side,
          height,
          8,
          0,
          space,
          kCGImageAlphaPremultipliedLast,
        ),
      );
      cg.symbols.CGContextSetLineJoin(context, kCGLineJoinRound);
      cg.symbols.CGContextSetLineWidth(context, outline);
      cg.symbols.CGContextSetRGBStrokeColor(context, 0, 0, 0, 1);
      cg.symbols.CGContextSetRGBFillColor(context, 1, 1, 1, 1);
      // The outline first, then the fill over its inner half.
      for (const mode of [kCGTextStroke, kCGTextFill]) {
        cg.symbols.CGContextSetTextDrawingMode(context, mode);
        lines.forEach(({ ref, width }, i) => {
          // Core Graphics counts y up from the bottom.
          const baseline = height - outline - (i + 1) * lineHeight + descent;
          cg.symbols.CGContextSetTextPosition(context, (side - width) / 2, baseline);
          ct.symbols.CTLineDraw(ref, context);
        });
      }
      const file = join(dir, `caption-${n}.png`);
      const path = Buffer.from(file);
      const url = own(
        cf.symbols.CFURLCreateFromFileSystemRepresentation(null, ptr(path), path.length, false),
      );
      const destination = own(io.symbols.CGImageDestinationCreateWithURL(url, png, 1, null));
      io.symbols.CGImageDestinationAddImage(
        destination,
        own(cg.symbols.CGBitmapContextCreateImage(context)),
        null,
      );
      if (!io.symbols.CGImageDestinationFinalize(destination))
        throw new Error(`couldn't write ${file}`);
      releaseTo(mark);
      return file;
    });
    return files;
  } catch {
    return undefined;
  } finally {
    for (const ref of owned.reverse()) cf.symbols.CFRelease(ref);
    for (const library of [cf, ct, cg, io, libc]) library.close();
  }
}
