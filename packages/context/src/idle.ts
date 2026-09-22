import { dlopen, FFIType } from "bun:ffi";

const APPLICATION_SERVICES =
  "/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices";

const kCGEventSourceStateHIDSystemState = 1;
/** Events that can move a text cursor: a key press or any mouse click. */
const CURSOR_EVENTS = {
  keyDown: 10,
  leftMouseDown: 1,
  rightMouseDown: 3,
  otherMouseDown: 25,
};

/**
 * Seconds since the last key press or mouse click anywhere on the system, or
 * undefined if macOS won't say. Only the time is known, never which key or
 * where, and it needs no permission. The Fn key doesn't count: macOS reports
 * it as a modifier change, not a key press.
 */
export function secondsSinceInput(): number | undefined {
  try {
    const cg = dlopen(APPLICATION_SERVICES, {
      CGEventSourceSecondsSinceLastEventType: {
        args: [FFIType.u32, FFIType.u32],
        returns: FFIType.f64,
      },
    });
    try {
      const seconds = Object.values(CURSOR_EVENTS).map((type) =>
        cg.symbols.CGEventSourceSecondsSinceLastEventType(kCGEventSourceStateHIDSystemState, type),
      );
      const latest = Math.min(...seconds);
      return Number.isFinite(latest) && latest >= 0 ? latest : undefined;
    } finally {
      cg.close();
    }
  } catch {
    return undefined;
  }
}
