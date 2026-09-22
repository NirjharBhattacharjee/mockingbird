import { dlopen, FFIType, type Pointer, ptr } from "bun:ffi";

const CORE_FOUNDATION = "/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation";
const APPLICATION_SERVICES =
  "/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices";

const kCFStringEncodingUTF8 = 0x08000100;
const kAXValueCFRangeType = 4;
const kAXErrorSuccess = 0;
/** Seconds an app gets to answer, so a hung one can't hold up typing. */
const MESSAGING_TIMEOUT_S = 0.25;

function loadSymbols() {
  const cf = dlopen(CORE_FOUNDATION, {
    CFRelease: { args: [FFIType.ptr], returns: FFIType.void },
    CFStringCreateWithCString: {
      args: [FFIType.ptr, FFIType.ptr, FFIType.u32],
      returns: FFIType.ptr,
    },
    CFGetTypeID: { args: [FFIType.ptr], returns: FFIType.u64_fast },
    CFStringGetTypeID: { args: [], returns: FFIType.u64_fast },
    CFStringGetLength: { args: [FFIType.ptr], returns: FFIType.i64_fast },
    CFStringGetCharacterAtIndex: { args: [FFIType.ptr, FFIType.i64], returns: FFIType.u16 },
  });
  const ax = dlopen(APPLICATION_SERVICES, {
    AXIsProcessTrusted: { args: [], returns: FFIType.bool },
    AXUIElementCreateSystemWide: { args: [], returns: FFIType.ptr },
    AXUIElementSetMessagingTimeout: { args: [FFIType.ptr, FFIType.f32], returns: FFIType.i32 },
    AXUIElementCopyAttributeValue: {
      args: [FFIType.ptr, FFIType.ptr, FFIType.ptr],
      returns: FFIType.i32,
    },
    AXUIElementCopyParameterizedAttributeValue: {
      args: [FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.ptr],
      returns: FFIType.i32,
    },
    AXValueCreate: { args: [FFIType.u32, FFIType.ptr], returns: FFIType.ptr },
    AXValueGetValue: { args: [FFIType.ptr, FFIType.u32, FFIType.ptr], returns: FFIType.bool },
  });
  return { cf, ax };
}

/**
 * The one character just before the cursor in the focused text field of the
 * app in front, read through Accessibility: `""` when the cursor is at the
 * start of the field, `undefined` when it can't be read (no permission, no
 * text field, an app that doesn't expose its text, or one too slow to answer).
 * With a selection, it's the character before the selection, since typing
 * replaces it. Only that one character is ever requested, never the field.
 */
export function charBeforeCaret(): string | undefined {
  let symbols: ReturnType<typeof loadSymbols>;
  try {
    symbols = loadSymbols();
  } catch {
    return undefined;
  }
  const { cf, ax } = symbols;
  const owned: Pointer[] = [];
  /** Remembers a pointer to release at the end; null for a missing one. */
  const own = (ref: Pointer | bigint | null): Pointer | null => {
    const pointer = (typeof ref === "bigint" ? Number(ref) : ref) as Pointer | null;
    if (!pointer) return null;
    owned.push(pointer);
    return pointer;
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
  const copy = (element: Pointer, attribute: string, parameter?: Pointer): Pointer | null => {
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

  try {
    if (!ax.symbols.AXIsProcessTrusted()) return undefined;
    const system = own(ax.symbols.AXUIElementCreateSystemWide());
    if (!system) return undefined;
    ax.symbols.AXUIElementSetMessagingTimeout(system, MESSAGING_TIMEOUT_S);

    const field = copy(system, "AXFocusedUIElement");
    if (!field) return undefined;
    ax.symbols.AXUIElementSetMessagingTimeout(field, MESSAGING_TIMEOUT_S);

    const selection = copy(field, "AXSelectedTextRange");
    if (!selection) return undefined;
    // A CFRange: location and length, both CFIndex (64-bit).
    const range = new BigInt64Array(2);
    if (!ax.symbols.AXValueGetValue(selection, kAXValueCFRangeType, ptr(range))) return undefined;
    const location = range[0] ?? -1n;
    if (location < 0n) return undefined;
    if (location === 0n) return "";

    const previous = new BigInt64Array([location - 1n, 1n]);
    const previousRange = own(ax.symbols.AXValueCreate(kAXValueCFRangeType, ptr(previous)));
    if (!previousRange) return undefined;
    const text = copy(field, "AXStringForRange", previousRange);
    if (!text || cf.symbols.CFGetTypeID(text) !== cf.symbols.CFStringGetTypeID()) return undefined;
    if (cf.symbols.CFStringGetLength(text) < 1) return undefined;
    return String.fromCharCode(cf.symbols.CFStringGetCharacterAtIndex(text, 0));
  } catch {
    return undefined;
  } finally {
    for (const ref of owned.reverse()) cf.symbols.CFRelease(ref);
    cf.close();
    ax.close();
  }
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
