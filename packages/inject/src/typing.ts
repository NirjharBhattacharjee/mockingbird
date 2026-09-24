import { dlopen, FFIType, ptr } from "bun:ffi";

const CORE_FOUNDATION = "/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation";
const APPLICATION_SERVICES =
  "/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices";

const kCGHIDEventTap = 0;
const kCGEventFlagMaskShift = 0x00020000;
const KEYCODE_RETURN = 36;
const kCGEventSourceUserData = 42;

/**
 * Stamped on every key event mockingbird posts, so its own keyboard watcher
 * (`packages/hotkey`) can tell them from the user's typing.
 */
export const TYPED_EVENT_MARK = 0x6d6b6264;
/** macOS accepts only a short string per event; 20 UTF-16 units is the usual limit. */
const MAX_UNITS_PER_EVENT = 20;

export class TypingError extends Error {
  override name = "TypingError";
}

/**
 * Replaces characters that would do something other than insert text. Control
 * codes are dropped and tabs become spaces, so indentation isn't typed into
 * other fields.
 *
 * Line breaks become spaces unless `lineBreaks` is set, which a dictated list
 * needs. They are never typed as a plain Return — see `postLineBreak`.
 */
export function sanitizeForTyping(text: string, { lineBreaks = false } = {}): string {
  let out = "";
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    // Done by code point rather than a regex, because the formatter rewrites
    // escaped control characters in a regex literal into invisible bytes.
    const isLineBreak = code === 0x0a || code === 0x0d;
    if (isLineBreak && lineBreaks) {
      out += "\n";
    } else if (isLineBreak || code === 0x09 || code === 0x0b || code === 0x0c) {
      out += " ";
    } else if (code >= 0x20 && code !== 0x7f) {
      out += character;
    }
  }
  return out
    .replace(/[^\S\n]{2,}/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Splits text into pieces small enough to type, never between surrogate pairs.
 * A line break is its own chunk, because it is posted as a key press rather
 * than as text.
 */
export function chunkForTyping(text: string, maxUnits = MAX_UNITS_PER_EVENT): string[] {
  const chunks: string[] = [];
  for (const [index, line] of text.split("\n").entries()) {
    if (index > 0) chunks.push("\n");
    chunks.push(...chunkLine(line, maxUnits));
  }
  return chunks;
}

function chunkLine(text: string, maxUnits: number): string[] {
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
    CGEventSetFlags: { args: [FFIType.ptr, FFIType.u64], returns: FFIType.void },
    CGEventSetIntegerValueField: {
      args: [FFIType.ptr, FFIType.u32, FFIType.i64],
      returns: FFIType.void,
    },
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
  /**
   * Checked before every chunk. Returning false abandons the rest of the text
   * where it is — the caller's chance to stop a long dictation following the
   * user into an app they didn't dictate into.
   */
  stillWanted?: () => boolean;
  /**
   * Typed before the text, after sanitizing (which trims, so a leading space
   * in the text itself wouldn't survive). Nothing is typed for empty text.
   */
  prefix?: string;
  /**
   * Keep line breaks, typed as Shift+Return. Chat apps take that as a new line
   * rather than "send", and editors as an ordinary newline — but a terminal
   * runs the command either way, so callers leave this off there.
   */
  lineBreaks?: boolean;
};

/** How much of the sanitized text reached the app. */
export type TypeResult = {
  /** UTF-16 units posted as key events. */
  typed: number;
  /** Units the sanitized text had; `typed < total` means it stopped early. */
  total: number;
};

/**
 * Feeds text to `post` in typeable chunks, pausing between them and stopping
 * at the first chunk `stillWanted` turns down. Separate from `typeText` so the
 * stopping can be tested without posting real key events.
 */
export async function typeChunks(
  text: string,
  post: (chunk: string) => void,
  options: TypeTextOptions = {},
): Promise<TypeResult> {
  const { chunkDelayMs = 4, maxUnitsPerEvent = MAX_UNITS_PER_EVENT, stillWanted } = options;
  let typed = 0;
  for (const chunk of chunkForTyping(text, maxUnitsPerEvent)) {
    if (stillWanted && !stillWanted()) break;
    post(chunk);
    typed += chunk.length;
    if (chunkDelayMs > 0) await Bun.sleep(chunkDelayMs);
  }
  return { typed, total: text.length };
}

/** Sanitizes text for typing and puts `prefix` in front, unless nothing is left. */
export function prepareForTyping(
  text: string,
  prefix = "",
  options: { lineBreaks?: boolean } = {},
) {
  const clean = sanitizeForTyping(text, options);
  return clean ? prefix + clean : "";
}

/**
 * Types text into whichever app has focus, as Unicode key events. The
 * clipboard is never touched.
 */
export async function typeText(text: string, options: TypeTextOptions = {}): Promise<TypeResult> {
  const clean = prepareForTyping(text, options.prefix, { lineBreaks: options.lineBreaks });
  if (!clean) return { typed: 0, total: 0 };
  if (!checkTypingAccess()) {
    throw new TypingError(
      "not allowed to type into other apps. Enable Accessibility for your terminal in " +
        "System Settings → Privacy & Security → Accessibility, then quit and reopen it.",
    );
  }

  const { cf, cg } = loadSymbols();
  try {
    return await typeChunks(
      clean,
      (chunk) => {
        if (chunk === "\n") {
          // Shift+Return: a new line in a chat app, not "send".
          for (const keyDown of [true, false]) {
            const event = cg.symbols.CGEventCreateKeyboardEvent(null, KEYCODE_RETURN, keyDown);
            if (!event) throw new TypingError("macOS refused to create a keyboard event");
            cg.symbols.CGEventSetFlags(event, kCGEventFlagMaskShift);
            cg.symbols.CGEventSetIntegerValueField(event, kCGEventSourceUserData, TYPED_EVENT_MARK);
            cg.symbols.CGEventPost(kCGHIDEventTap, event);
            cf.symbols.CFRelease(event);
          }
          return;
        }
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
          cg.symbols.CGEventSetIntegerValueField(event, kCGEventSourceUserData, TYPED_EVENT_MARK);
          cg.symbols.CGEventPost(kCGHIDEventTap, event);
          cf.symbols.CFRelease(event);
        }
      },
      options,
    );
  } finally {
    cf.close();
    cg.close();
  }
}
