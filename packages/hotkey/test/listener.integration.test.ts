import { describe, expect, test } from "bun:test";
import { checkInputMonitoring, startHotkeyListener } from "../src/index.ts";

const canWatch = process.env.MOCKINGBIRD_INTEGRATION && checkInputMonitoring() === "granted";

// Pressing Fn can't be simulated without Accessibility permission, so this only
// covers the worker wiring: it starts, leaves the main thread responsive, stops.
describe.skipIf(!canWatch)("startHotkeyListener (integration)", () => {
  test("starts, keeps the main thread responsive, and stops", async () => {
    const events: unknown[] = [];
    const listener = startHotkeyListener({ onEvent: (event) => events.push(event) });
    await listener.ready;

    let ticks = 0;
    let worstLagMs = 0;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      worstLagMs = Math.max(worstLagMs, now - last - 50);
      last = now;
      ticks++;
    }, 50);
    await Bun.sleep(1_000);
    clearInterval(timer);

    expect(ticks).toBeGreaterThan(10);
    // The macOS run loop blocks its thread; the main thread must not stall.
    expect(worstLagMs).toBeLessThan(200);
    await listener.stop();
  }, 30_000);
});
