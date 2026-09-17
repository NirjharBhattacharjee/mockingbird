import { describe, expect, test } from "bun:test";
import { type SupervisedChild, Supervisor, type SupervisorEvent } from "../src/supervisor.ts";

/** A child that exits with `code` after `ms`, or runs until stopped when ms is Infinity. */
function fakeChild(ms: number, code = 1): SupervisedChild & { stopped: boolean } {
  let finish: (code: number) => void = () => {};
  const exited = new Promise<number>((resolve) => {
    finish = resolve;
    if (Number.isFinite(ms)) setTimeout(() => resolve(code), ms);
  });
  const child = {
    exited,
    stopped: false,
    async stop() {
      child.stopped = true;
      finish(143);
      await exited;
    },
  };
  return child;
}

const fast = { initialDelayMs: 1, maxDelayMs: 4, stableAfterMs: 50 };

describe("Supervisor", () => {
  test("restarts a crashing child with backoff, then gives up", async () => {
    const events: SupervisorEvent[] = [];
    let spawned = 0;
    const supervisor = new Supervisor(
      () => {
        spawned++;
        return fakeChild(0);
      },
      { ...fast, maxFailures: 4, onEvent: (e) => events.push(e) },
    );
    supervisor.start();
    await supervisor.done;

    expect(spawned).toBe(4);
    expect(events.filter((e) => e.type === "restarting").map((e) => e.delayMs)).toEqual([1, 2, 4]);
    expect(events.at(-1)).toEqual({ type: "gave-up", failures: 4 });
  });

  test("a child that ran long enough resets the failure count", async () => {
    const lifetimes = [0, 0, 60, 0, 0, 0];
    const events: SupervisorEvent[] = [];
    const supervisor = new Supervisor(() => fakeChild(lifetimes.shift() ?? 0), {
      ...fast,
      maxFailures: 3,
      onEvent: (e) => events.push(e),
    });
    supervisor.start();
    await supervisor.done;

    const restarts = events.filter((e) => e.type === "restarting").map((e) => e.failures);
    expect(restarts).toEqual([1, 2, 1, 2]);
    expect(events.filter((e) => e.type === "started").length).toBe(5);
  });

  test("stop() stops the running child without restarting it", async () => {
    const children: ReturnType<typeof fakeChild>[] = [];
    const events: SupervisorEvent[] = [];
    const supervisor = new Supervisor(
      () => {
        const child = fakeChild(Number.POSITIVE_INFINITY);
        children.push(child);
        return child;
      },
      { ...fast, onEvent: (e) => events.push(e) },
    );
    supervisor.start();
    await Bun.sleep(10);
    await supervisor.stop();

    expect(children.length).toBe(1);
    expect(children[0]?.stopped).toBe(true);
    expect(events.map((e) => e.type)).toEqual(["started"]);
  });

  test("stop() during a backoff wait returns promptly", async () => {
    const supervisor = new Supervisor(() => fakeChild(0), {
      initialDelayMs: 10_000,
      maxFailures: 10,
    });
    supervisor.start();
    await Bun.sleep(10);
    const started = performance.now();
    await supervisor.stop();
    expect(performance.now() - started).toBeLessThan(500);
  });
});
