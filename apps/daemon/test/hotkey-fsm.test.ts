import { describe, expect, test } from "bun:test";
import { KEYCODE_ESCAPE, KEYCODE_FN } from "@mockingbird/hotkey";
import { HotkeyFsm } from "../src/hotkey-fsm.ts";

const fnDown = (at: number) => ({ type: "fn-down", at }) as const;
const fnUp = (at: number) => ({ type: "fn-up", at }) as const;
const escapeKey = (at: number) => ({ type: "key-down", keycode: KEYCODE_ESCAPE, at }) as const;

describe("HotkeyFsm", () => {
  test("hold to talk: recording starts on press and stops on release", () => {
    const fsm = new HotkeyFsm();
    expect(fsm.handle(fnDown(0))).toBe("start");
    expect(fsm.state).toBe("ARMED");

    fsm.tick(200);
    expect(fsm.state).toBe("CAPTURE_PTT");
    expect(fsm.recording).toBe(true);

    expect(fsm.handle(fnUp(1500))).toBe("stop");
    expect(fsm.state).toBe("IDLE");
    expect(fsm.recording).toBe(false);
  });

  test("a single quick tap records nothing", () => {
    const fsm = new HotkeyFsm();
    fsm.handle(fnDown(0));
    expect(fsm.handle(fnUp(100))).toBe("cancel");
    expect(fsm.state).toBe("TAP_WAIT");

    fsm.tick(500);
    expect(fsm.state).toBe("IDLE");
    expect(fsm.recording).toBe(false);
  });

  test("double tap starts hands-free, next press stops it", () => {
    const fsm = new HotkeyFsm();
    fsm.handle(fnDown(0));
    fsm.handle(fnUp(100));
    expect(fsm.handle(fnDown(250))).toBe("start");
    expect(fsm.state).toBe("CAPTURE_LOCK");

    // Releasing the second tap keeps recording; that's the point of lock mode.
    expect(fsm.handle(fnUp(300))).toBeUndefined();
    expect(fsm.state).toBe("CAPTURE_LOCK");
    fsm.tick(5_000);
    expect(fsm.recording).toBe(true);

    expect(fsm.handle(fnDown(6_000))).toBe("stop");
    expect(fsm.state).toBe("IDLE");
    expect(fsm.handle(fnUp(6_100))).toBeUndefined();
  });

  test("a tap after the double-tap window is just another tap", () => {
    const fsm = new HotkeyFsm();
    fsm.handle(fnDown(0));
    fsm.handle(fnUp(100));
    fsm.tick(400);
    expect(fsm.state).toBe("IDLE");
    expect(fsm.handle(fnDown(500))).toBe("start");
    expect(fsm.state).toBe("ARMED");
  });

  test("Esc cancels a hold and hands-free mode", () => {
    const fsm = new HotkeyFsm();
    fsm.handle(fnDown(0));
    fsm.tick(200);
    expect(fsm.handle(escapeKey(300))).toBe("cancel");
    expect(fsm.state).toBe("IDLE");

    fsm.handle(fnDown(1_000));
    fsm.handle(fnUp(1_100));
    fsm.handle(fnDown(1_250));
    expect(fsm.state).toBe("CAPTURE_LOCK");
    expect(fsm.handle(escapeKey(2_000))).toBe("cancel");
    expect(fsm.state).toBe("IDLE");
  });

  test("Esc while idle does nothing, and other keys are ignored", () => {
    const fsm = new HotkeyFsm();
    expect(fsm.handle(escapeKey(0))).toBeUndefined();
    expect(fsm.handle({ type: "key-down", keycode: KEYCODE_FN, at: 1 })).toBeUndefined();
    expect(fsm.handle({ type: "key-up", keycode: 0, at: 2 })).toBeUndefined();
    expect(fsm.state).toBe("IDLE");
  });

  test("deadline says when tick() is needed", () => {
    const fsm = new HotkeyFsm({ holdMs: 180, doubleTapMs: 300 });
    expect(fsm.deadline).toBeUndefined();
    fsm.handle(fnDown(1_000));
    expect(fsm.deadline).toBe(1_180);
    fsm.handle(fnUp(1_050));
    expect(fsm.deadline).toBe(1_350);
    fsm.tick(1_400);
    expect(fsm.deadline).toBeUndefined();
  });

  test("a held key past the hold threshold still stops on release", () => {
    const fsm = new HotkeyFsm({ holdMs: 50, doubleTapMs: 100 });
    fsm.handle(fnDown(0));
    fsm.tick(60);
    expect(fsm.handle(fnUp(70))).toBe("stop");
  });
});
