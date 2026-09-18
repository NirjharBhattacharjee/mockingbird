import { dlopen, FFIType, ptr } from "bun:ffi";

const CORE_FOUNDATION = "/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation";
const APPLICATION_SERVICES =
  "/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices";

const kCGHIDEventTap = 0;
/** macOS accepts only a short string per event; 20 UTF-16 units is the usual limit. */
const MAX_UNITS_PER_EVENT = 20;

export class TypingError extends Error {
  override name = "TypingError";
}

/**
 * Replaces characters that would do something other than insert text: newlines
 * would submit a chat message or run a shell command, control codes can do
 * worse. Tabs become spaces so indentation isn't typed into other fields.
 */
export function sanitizeForTyping(text: string): string {
  let out = "";
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    // Line breaks and tabs become spaces; other control codes are dropped.
    // Done by code point rather than a regex, because the formatter rewrites
    // escaped control characters in a regex literal into invisible bytes.
    if (code === 0x0a || code === 0x0d || code === 0x09 || code === 0x0b || code === 0x0c) {
      out += " ";
    } else if (code >= 0x20 && code !== 0x7f) {
      out += character;
    }
  }
  return out.replace(/ {2,}/g, " ").trim();
}

/** Splits text into pieces small enough to type, never between surrogate pairs. */
export function chunkForTyping(text: string, maxUnits = MAX_UNITS_PER_EVENT): string[] {
  const chunks: string[] = [];
  let index = 0;
  while (index < text.length) {
    let end = Math.min(index + maxUnits, text.length);
    // Don't cut between the two halves of an emoji or other surrogate pair.
    const code = text.charCodeAt(end - 1);
    if (end < text.length && code >= 0xd800 && code <= 0xdbff) end--;
    // A pair longer than maxUnits would otherwise produce an empty chunk forever.
    if (end <= index) end = Math.min(index + 2, text.length);
    chunks.push(text.slice(index, end));
    index = end;
  }
  return chunks;
}

function loadSymbols() {
  const cf = dlopen(CORE_FOUNDATION, {
    CFRelease: { args: [FFIType.ptr], returns: FFIType.void },
  });
  const cg = dlopen(APPLICATION_SERVICES, {
    CGEventCreateKeyboardEvent: {
      args: [FFIType.ptr, FFIType.u16, FFIType.bool],
      returns: FFIType.ptr,
    },
    CGEventKeyboardSetUnicodeString: {
      args: [FFIType.ptr, FFIType.u64, FFIType.ptr],
      returns: FFIType.void,
    },
    CGEventPost: { args: [FFIType.u32, FFIType.ptr], returns: FFIType.void },
    CGPreflightPostEventAccess: { args: [], returns: FFIType.bool },
    CGRequestPostEventAccess: { args: [], returns: FFIType.bool },
  });
  return { cf, cg };
}

/** Whether macOS lets this app type into other apps (Accessibility). */
export function checkTypingAccess(): boolean {
  const { cf, cg } = loadSymbols();
  const granted = cg.symbols.CGPreflightPostEventAccess();
  cf.close();
  cg.close();
  return granted;
}

/** Shows the macOS prompt for permission to type into other apps. */
export function requestTypingAccess(): boolean {
  const { cf, cg } = loadSymbols();
  const granted = cg.symbols.CGRequestPostEventAccess();
  cf.close();
  cg.close();
  return granted;
}

export type TypeTextOptions = {
  /** Pause between chunks, to let the receiving app keep up. */
  chunkDelayMs?: number;
  maxUnitsPerEvent?: number;
};

/**
 * Types text into whichever app has focus, as Unicode key events. The
 * clipboard is never touched.
 */
export async function typeText(text: string, options: TypeTextOptions = {}): Promise<void> {
  const clean = sanitizeForTyping(text);
  if (!clean) return;
  if (!checkTypingAccess()) {
    throw new TypingError(
      "not allowed to type into other apps. Enable Accessibility for your terminal in " +
        "System Settings → Privacy & Security → Accessibility, then quit and reopen it.",
    );
  }

  const { chunkDelayMs = 4, maxUnitsPerEvent = MAX_UNITS_PER_EVENT } = options;
  const { cf, cg } = loadSymbols();
  try {
    for (const chunk of chunkForTyping(clean, maxUnitsPerEvent)) {
      const units = new Uint16Array(chunk.length);
      for (let i = 0; i < chunk.length; i++) units[i] = chunk.charCodeAt(i);

      for (const keyDown of [true, false]) {
        const event = cg.symbols.CGEventCreateKeyboardEvent(null, 0, keyDown);
        if (!event) throw new TypingError("macOS refused to create a keyboard event");
        cg.symbols.CGEventKeyboardSetUnicodeString(
          event,
          BigInt(units.length) as never,
          ptr(units) as never,
        );
        cg.symbols.CGEventPost(kCGHIDEventTap, event);
        cf.symbols.CFRelease(event);
      }
      if (chunkDelayMs > 0) await Bun.sleep(chunkDelayMs);
    }
  } finally {
    cf.close();
    cg.close();
  }
}
