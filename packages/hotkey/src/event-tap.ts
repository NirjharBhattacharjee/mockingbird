import { dlopen, FFIType, JSCallback, ptr } from "bun:ffi";

const CORE_FOUNDATION = "/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation";
const APPLICATION_SERVICES =
  "/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices";
const IOKIT = "/System/Library/Frameworks/IOKit.framework/IOKit";

const kCGSessionEventTap = 1;
const kCGHeadInsertEventTap = 0;
/** Listen-only: events are observed, never modified or swallowed. */
const kCGEventTapOptionListenOnly = 1;
const kCGKeyboardEventKeycode = 9;
const kCGEventFlagMaskSecondaryFn = 0x800000;
const kCFStringEncodingUTF8 = 0x08000100;
const kIOHIDRequestTypeListenEvent = 1;

const EVENT_KEY_DOWN = 10;
const EVENT_KEY_UP = 11;
const EVENT_FLAGS_CHANGED = 12;
const EVENT_MASK = (1n << 10n) | (1n << 11n) | (1n << 12n);

export const KEYCODE_FN = 63;
export const KEYCODE_ESCAPE = 53;

export type TapEvent =
  | { type: "fn-down" | "fn-up"; at: number }
  | { type: "key-down" | "key-up"; keycode: number; at: number };

export type InputMonitoringAccess = "granted" | "denied" | "unknown";

export const EVENT_TYPE_KEY_DOWN = EVENT_KEY_DOWN;
export const EVENT_TYPE_KEY_UP = EVENT_KEY_UP;
export const EVENT_TYPE_FLAGS_CHANGED = EVENT_FLAGS_CHANGED;

/**
 * Decides which raw macOS events become hotkey events. Every key except Fn and
 * Esc is dropped here, so nothing else is ever passed on, stored, or logged
 * (docs/SECURITY_PRIVACY.md §4). Kept separate from the FFI callback so it can
 * be tested.
 */
export class TapDecoder {
  private fnDown = false;

  decode(type: number, keycode: number, flags: number, at: number): TapEvent | undefined {
    if (type === EVENT_FLAGS_CHANGED) {
      if (keycode !== KEYCODE_FN) return undefined;
      const down = (flags & kCGEventFlagMaskSecondaryFn) !== 0;
      // macOS repeats flagsChanged for other modifiers while Fn is held.
      if (down === this.fnDown) return undefined;
      this.fnDown = down;
      return { type: down ? "fn-down" : "fn-up", at };
    }
    if (type === EVENT_KEY_DOWN || type === EVENT_KEY_UP) {
      if (keycode !== KEYCODE_ESCAPE) return undefined;
      return { type: type === EVENT_KEY_DOWN ? "key-down" : "key-up", keycode, at };
    }
    return undefined;
  }
}

function loadCoreFoundation() {
  return dlopen(CORE_FOUNDATION, {
    CFStringCreateWithCString: {
      args: [FFIType.ptr, FFIType.cstring, FFIType.u32],
      returns: FFIType.ptr,
    },
    CFRunLoopGetCurrent: { args: [], returns: FFIType.ptr },
    CFRunLoopAddSource: { args: [FFIType.ptr, FFIType.ptr, FFIType.ptr], returns: FFIType.void },
    CFRunLoopRunInMode: { args: [FFIType.ptr, FFIType.f64, FFIType.bool], returns: FFIType.i32 },
    CFMachPortCreateRunLoopSource: {
      args: [FFIType.ptr, FFIType.ptr, FFIType.i64],
      returns: FFIType.ptr,
    },
  });
}

function loadApplicationServices() {
  return dlopen(APPLICATION_SERVICES, {
    CGEventTapCreate: {
      args: [FFIType.u32, FFIType.u32, FFIType.u32, FFIType.u64, FFIType.ptr, FFIType.ptr],
      returns: FFIType.ptr,
    },
    CGEventTapEnable: { args: [FFIType.ptr, FFIType.bool], returns: FFIType.void },
    CGEventGetFlags: { args: [FFIType.ptr], returns: FFIType.u64 },
    CGEventGetIntegerValueField: { args: [FFIType.ptr, FFIType.u32], returns: FFIType.i64 },
  });
}

/** Whether this app may observe keyboard events (System Settings → Input Monitoring). */
export function checkInputMonitoring(): InputMonitoringAccess {
  const io = dlopen(IOKIT, {
    IOHIDCheckAccess: { args: [FFIType.u32], returns: FFIType.u32 },
  });
  const access = io.symbols.IOHIDCheckAccess(kIOHIDRequestTypeListenEvent);
  io.close();
  return access === 0 ? "granted" : access === 1 ? "denied" : "unknown";
}

/** Asks macOS to show the Input Monitoring prompt. Returns false if already denied. */
export function requestInputMonitoring(): boolean {
  const io = dlopen(IOKIT, {
    IOHIDRequestAccess: { args: [FFIType.u32], returns: FFIType.bool },
  });
  const granted = io.symbols.IOHIDRequestAccess(kIOHIDRequestTypeListenEvent);
  io.close();
  return granted;
}

export class EventTapError extends Error {
  override name = "EventTapError";
}

export type EventTap = {
  /** Runs the macOS run loop for up to `seconds`, delivering events to the callback. */
  poll(seconds: number): void;
  close(): void;
};

/**
 * Creates a listen-only keyboard tap that reports the Fn key and Esc, and
 * nothing else. The caller drives it with poll(), which blocks the current
 * thread — run it on a worker, not the main thread.
 */
export function createEventTap(onEvent: (event: TapEvent) => void): EventTap {
  const cf = loadCoreFoundation();
  const cg = loadApplicationServices();
  const decoder = new TapDecoder();

  const callback = new JSCallback(
    (_proxy: number, type: number, event: number) => {
      const keycode = Number(
        cg.symbols.CGEventGetIntegerValueField(event as never, kCGKeyboardEventKeycode),
      );
      const flags = Number(cg.symbols.CGEventGetFlags(event as never));
      const decoded = decoder.decode(type, keycode, flags, Date.now());
      if (decoded) onEvent(decoded);
      return event;
    },
    { args: [FFIType.ptr, FFIType.u32, FFIType.ptr, FFIType.ptr], returns: FFIType.ptr },
  );

  const tap = cg.symbols.CGEventTapCreate(
    kCGSessionEventTap,
    kCGHeadInsertEventTap,
    kCGEventTapOptionListenOnly,
    EVENT_MASK,
    callback.ptr as never,
    null,
  );
  if (!tap) {
    callback.close();
    cf.close();
    cg.close();
    throw new EventTapError(
      "could not watch the keyboard. Enable Input Monitoring for your terminal in " +
        "System Settings → Privacy & Security → Input Monitoring, then quit and reopen it.",
    );
  }

  const modeBuffer = Buffer.from("kCFRunLoopDefaultMode\0", "utf8");
  const mode = cf.symbols.CFStringCreateWithCString(
    null,
    ptr(modeBuffer) as never,
    kCFStringEncodingUTF8,
  );
  cf.symbols.CFRunLoopAddSource(
    cf.symbols.CFRunLoopGetCurrent(),
    cf.symbols.CFMachPortCreateRunLoopSource(null, tap, 0),
    mode as never,
  );
  cg.symbols.CGEventTapEnable(tap, true);

  return {
    poll(seconds: number) {
      cf.symbols.CFRunLoopRunInMode(mode as never, seconds, false);
    },
    close() {
      cg.symbols.CGEventTapEnable(tap, false);
      callback.close();
      cf.close();
      cg.close();
    },
  };
}
