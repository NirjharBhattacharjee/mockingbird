import { dlopen, FFIType, ptr } from "bun:ffi";

const CORE_FOUNDATION = "/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation";
const APPLICATION_SERVICES =
  "/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices";

const kCFStringEncodingUTF8 = 0x08000100;
const kAXValueCFRangeType = 4;
const kCFNumberSInt64Type = 4;
const kAXErrorSuccess = 0;
/** Seconds an app gets to answer, so a hung one can't hold up typing. */
const MESSAGING_TIMEOUT_S = 0.25;

/**
 * CoreFoundation objects are handled as `u64` (a bigint), never `ptr`. Short
 * strings like the one character asked for here come back as tagged pointers,
 * with the top bit set: turning one into a JS number rounds it, and handing
 * the rounded value back to CoreFoundation crashes the process.
 */
const REF = FFIType.u64;

function loadSymbols() {
  const cf = dlopen(CORE_FOUNDATION, {
    CFRelease: { args: [REF], returns: FFIType.void },
    CFStringCreateWithCString: {
      args: [FFIType.ptr, FFIType.ptr, FFIType.u32],
      returns: REF,
    },
    CFGetTypeID: { args: [REF], returns: FFIType.u64_fast },
    CFStringGetTypeID: { args: [], returns: FFIType.u64_fast },
    CFStringGetLength: { args: [REF], returns: FFIType.i64_fast },
    CFStringGetCharacterAtIndex: { args: [REF, FFIType.i64], returns: FFIType.u16 },
    CFNumberGetValue: { args: [REF, FFIType.i32, FFIType.ptr], returns: FFIType.bool },
  });
  const ax = dlopen(APPLICATION_SERVICES, {
    AXIsProcessTrusted: { args: [], returns: FFIType.bool },
    AXUIElementCreateSystemWide: { args: [], returns: REF },
    AXUIElementSetMessagingTimeout: { args: [REF, FFIType.f32], returns: FFIType.i32 },
    AXUIElementCopyAttributeValue: {
      args: [REF, REF, FFIType.ptr],
      returns: FFIType.i32,
    },
    AXUIElementGetPid: { args: [REF, FFIType.ptr], returns: FFIType.i32 },
    AXUIElementCopyParameterizedAttributeValue: {
      args: [REF, REF, REF, FFIType.ptr],
      returns: FFIType.i32,
    },
    AXValueCreate: { args: [FFIType.u32, FFIType.ptr], returns: REF },
    AXValueGetValue: { args: [REF, FFIType.u32, FFIType.ptr], returns: FFIType.bool },
  });
  return { cf, ax };
}

/**
 * The focused text field, as far as Accessibility shows it. Positions count
 * UTF-16 units, as the field's own do.
 */
export type FocusedField = {
  /** The process the field belongs to. */
  pid: number;
  /** Where the cursor is, or where the selection starts. */
  caret: number;
  /** How long the text is; undefined if the app doesn't say. */
  length(): number | undefined;
  /** The text from `start` to `end`, cut to the field; undefined if the app won't give it. */
  text(start: number, end: number): string | undefined;
};

/**
 * Runs `read` against the focused text field of the app in front. Undefined
 * when there's no such field to read: no permission, no text field, an app
 * that doesn't expose its text or is too slow to answer, or a password field,
 * which is never read. Callers ask for the ranges they need, never the field.
 * With `pid`, a field that has moved to another app by then isn't read either.
 */
export function readFocusedField<T>(
  read: (field: FocusedField) => T,
  /** Read only if the field belongs to this process; checked before anything is read from it. */
  { pid }: { pid?: number } = {},
): T | undefined {
  let symbols: ReturnType<typeof loadSymbols>;
  try {
    symbols = loadSymbols();
  } catch {
    return undefined;
  }
  const { cf, ax } = symbols;
  const owned: bigint[] = [];
  /** Remembers a reference to release at the end; null for a missing one. */
  const own = (ref: bigint | number | null): bigint | null => {
    if (ref === null || ref === 0 || ref === 0n) return null;
    const handle = BigInt(ref);
    owned.push(handle);
    return handle;
  };
  const cfString = (text: string) =>
    own(
      cf.symbols.CFStringCreateWithCString(
        null,
        ptr(Buffer.from(`${text}\0`)),
        kCFStringEncodingUTF8,
      ),
    );
  /** Copies an attribute into `owned`; null when the app didn't give one. */
  const copy = (element: bigint, attribute: string, parameter?: bigint): bigint | null => {
    const name = cfString(attribute);
    if (!name) return null;
    const out = new BigUint64Array(1);
    const error =
      parameter === undefined
        ? ax.symbols.AXUIElementCopyAttributeValue(element, name, ptr(out))
        : ax.symbols.AXUIElementCopyParameterizedAttributeValue(element, name, parameter, ptr(out));
    if (error !== kAXErrorSuccess) return null;
    return own(out[0] ?? null);
  };
  /** A CFString as JS, or undefined for anything else. */
  const jsString = (ref: bigint | null): string | undefined => {
    if (!ref || cf.symbols.CFGetTypeID(ref) !== cf.symbols.CFStringGetTypeID()) return undefined;
    const units: number[] = [];
    const length = Number(cf.symbols.CFStringGetLength(ref));
    for (let i = 0; i < length; i++) units.push(cf.symbols.CFStringGetCharacterAtIndex(ref, i));
    return String.fromCharCode(...units);
  };

  try {
    if (!ax.symbols.AXIsProcessTrusted()) return undefined;
    const system = own(ax.symbols.AXUIElementCreateSystemWide());
    if (!system) return undefined;
    ax.symbols.AXUIElementSetMessagingTimeout(system, MESSAGING_TIMEOUT_S);

    const element = copy(system, "AXFocusedUIElement");
    if (!element) return undefined;
    const owner = new Int32Array(1);
    if (ax.symbols.AXUIElementGetPid(element, ptr(owner)) !== kAXErrorSuccess) return undefined;
    if (pid !== undefined && owner[0] !== pid) return undefined;
    ax.symbols.AXUIElementSetMessagingTimeout(element, MESSAGING_TIMEOUT_S);
    if (jsString(copy(element, "AXSubrole")) === "AXSecureTextField") return undefined;

    const selection = copy(element, "AXSelectedTextRange");
    if (!selection) return undefined;
    // A CFRange: location and length, both CFIndex (64-bit).
    const range = new BigInt64Array(2);
    if (!ax.symbols.AXValueGetValue(selection, kAXValueCFRangeType, ptr(range))) return undefined;
    const caret = Number(range[0] ?? -1n);
    if (caret < 0) return undefined;

    let known: number | undefined;
    const length = () => {
      if (known !== undefined) return known;
      const count = copy(element, "AXNumberOfCharacters");
      const out = new BigInt64Array(1);
      if (!count || !cf.symbols.CFNumberGetValue(count, kCFNumberSInt64Type, ptr(out))) return;
      known = Number(out[0]);
      return known;
    };
    const text = (from: number, to: number) => {
      const start = Math.max(0, from);
      const end = Math.min(to, length() ?? to);
      if (end <= start) return "";
      const span = own(
        ax.symbols.AXValueCreate(
          kAXValueCFRangeType,
          ptr(new BigInt64Array([BigInt(start), BigInt(end - start)])),
        ),
      );
      return span ? jsString(copy(element, "AXStringForRange", span)) : undefined;
    };
    return read({ pid: owner[0] ?? 0, caret, length, text });
  } catch {
    return undefined;
  } finally {
    for (const ref of owned.reverse()) cf.symbols.CFRelease(ref);
    cf.close();
    ax.close();
  }
}

/**
 * The one character just before the cursor in the focused text field: `""`
 * when the cursor is at the start of the field, `undefined` when it can't be
 * read (see `readFocusedField`). With a selection, it's the character before
 * the selection, since typing replaces it. Only that one character is read.
 */
export function charBeforeCaret(): string | undefined {
  return readFocusedField(({ caret, text }) =>
    caret === 0 ? "" : text(caret - 1, caret)?.slice(-1) || undefined,
  );
}

/** Characters after which new text follows directly, without a space. */
const OPENERS = new Set(["(", "[", "{", "“", "‘", "«", "¿", "¡"]);

/**
 * Whether dictated text typed after `before` (from `charBeforeCaret`) needs a
 * space in front, so a second sentence doesn't run into the first. Unknown
 * means no: a missing space is easier to live with than a stray one.
 */
export function needsLeadingSpace(before: string | undefined): boolean {
  if (!before) return false;
  if (/\s/.test(before)) return false;
  return !OPENERS.has(before);
}
