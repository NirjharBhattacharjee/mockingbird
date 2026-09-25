import { describe, expect, test } from "bun:test";
import { TYPED_EVENT_MARK } from "@mockingbird/inject";
import {
  checkInputMonitoring,
  EVENT_TYPE_FLAGS_CHANGED,
  EVENT_TYPE_KEY_DOWN,
  EVENT_TYPE_KEY_UP,
  EVENT_TYPE_LEFT_MOUSE_DOWN,
  KEYCODE_ESCAPE,
  KEYCODE_FN,
  KEYCODE_GLOBE,
  TapDecoder,
} from "../src/index.ts";

// Real values captured from macOS while pressing Fn (see ARCHITECTURE.md changelog).
const FLAGS_FN_DOWN = 0x800100;
const FLAGS_FN_UP = 0x100;
const FLAGS_FN_AND_COMMAND = 0x900108;

describe("TapDecoder", () => {
  test("reports Fn press and release", () => {
    const decoder = new TapDecoder();
    expect(decoder.decode(EVENT_TYPE_FLAGS_CHANGED, KEYCODE_FN, FLAGS_FN_DOWN, 100)).toEqual({
      type: "fn-down",
      at: 100,
    });
    expect(decoder.decode(EVENT_TYPE_FLAGS_CHANGED, KEYCODE_FN, FLAGS_FN_UP, 900)).toEqual({
      type: "fn-up",
      at: 900,
    });
  });

  test("ignores repeats of the state it already reported", () => {
    const decoder = new TapDecoder();
    decoder.decode(EVENT_TYPE_FLAGS_CHANGED, KEYCODE_FN, FLAGS_FN_DOWN, 1);
    expect(decoder.decode(EVENT_TYPE_FLAGS_CHANGED, KEYCODE_FN, FLAGS_FN_DOWN, 2)).toBeUndefined();
    decoder.decode(EVENT_TYPE_FLAGS_CHANGED, KEYCODE_FN, FLAGS_FN_UP, 3);
    expect(decoder.decode(EVENT_TYPE_FLAGS_CHANGED, KEYCODE_FN, FLAGS_FN_UP, 4)).toBeUndefined();
  });

  test("Fn stays down while other modifiers change", () => {
    const decoder = new TapDecoder();
    decoder.decode(EVENT_TYPE_FLAGS_CHANGED, KEYCODE_FN, FLAGS_FN_DOWN, 1);
    // Pressing Command reports keycode 55, which isn't Fn: no event.
    expect(decoder.decode(EVENT_TYPE_FLAGS_CHANGED, 55, FLAGS_FN_AND_COMMAND, 2)).toBeUndefined();
    // A later Fn event still carrying the Fn flag isn't a new press either.
    expect(
      decoder.decode(EVENT_TYPE_FLAGS_CHANGED, KEYCODE_FN, FLAGS_FN_AND_COMMAND, 3),
    ).toBeUndefined();
    expect(decoder.decode(EVENT_TYPE_FLAGS_CHANGED, KEYCODE_FN, FLAGS_FN_UP, 4)).toEqual({
      type: "fn-up",
      at: 4,
    });
  });

  test("reports Esc", () => {
    const decoder = new TapDecoder();
    expect(decoder.decode(EVENT_TYPE_KEY_DOWN, KEYCODE_ESCAPE, 0, 7)).toEqual({
      type: "key-down",
      keycode: KEYCODE_ESCAPE,
      at: 7,
    });
    expect(decoder.decode(EVENT_TYPE_KEY_UP, KEYCODE_ESCAPE, 0, 8)).toEqual({
      type: "key-up",
      keycode: KEYCODE_ESCAPE,
      at: 8,
    });
  });

  test("never passes on which other key was pressed", () => {
    const decoder = new TapDecoder();
    // Letters, digits, punctuation, modifiers, function keys: a password typed
    // while mockingbird runs must never reach the app. All that gets out is
    // that some key went down, with no keycode.
    for (let keycode = 0; keycode < 128; keycode++) {
      if (keycode === KEYCODE_ESCAPE || keycode === KEYCODE_FN) continue;
      expect(decoder.decode(EVENT_TYPE_KEY_DOWN, keycode, 0, keycode)).toEqual({
        type: "input",
        source: "key",
        at: keycode,
      });
      expect(decoder.decode(EVENT_TYPE_KEY_UP, keycode, 0, keycode)).toBeUndefined();
    }
  });

  test("a mouse click counts as input", () => {
    const decoder = new TapDecoder();
    expect(decoder.decode(EVENT_TYPE_LEFT_MOUSE_DOWN, 0, 0, 5)).toEqual({
      type: "input",
      source: "click",
      at: 5,
    });
  });

  test("Fn, the globe key, and mockingbird's own typing aren't input", () => {
    const decoder = new TapDecoder();
    expect(decoder.decode(EVENT_TYPE_KEY_DOWN, KEYCODE_FN, 0, 1)).toBeUndefined();
    expect(decoder.decode(EVENT_TYPE_KEY_DOWN, KEYCODE_GLOBE, 0, 1)).toBeUndefined();
    expect(decoder.decode(EVENT_TYPE_KEY_DOWN, 0, 0, 1, TYPED_EVENT_MARK)).toBeUndefined();
  });

  test("drops flag changes from modifiers other than Fn", () => {
    const decoder = new TapDecoder();
    for (const keycode of [54, 55, 56, 58, 59, 60, 61, 62]) {
      expect(decoder.decode(EVENT_TYPE_FLAGS_CHANGED, keycode, FLAGS_FN_DOWN, 1)).toBeUndefined();
    }
  });

  test("ignores event types it doesn't handle, such as mouse moves", () => {
    const decoder = new TapDecoder();
    for (const type of [2, 5, 6, 22, 29]) {
      expect(decoder.decode(type, KEYCODE_FN, FLAGS_FN_DOWN, 1)).toBeUndefined();
    }
  });
});

describe("checkInputMonitoring", () => {
  test("reports one of the three known states", () => {
    expect(["granted", "denied", "unknown"]).toContain(checkInputMonitoring());
  });
});
