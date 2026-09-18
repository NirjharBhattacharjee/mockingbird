import { EventTapError, type TapEvent } from "./event-tap.ts";

export type HotkeyListener = {
  /** Resolves once the tap is watching, or rejects if macOS refused. */
  ready: Promise<void>;
  stop(): Promise<void>;
};

export type HotkeyListenerOptions = {
  onEvent: (event: TapEvent) => void;
  onError?: (error: Error) => void;
  readyTimeoutMs?: number;
};

/**
 * Watches the keyboard from a worker thread, so the blocking macOS run loop
 * never stalls audio capture on the main thread.
 */
export function startHotkeyListener({
  onEvent,
  onError = () => {},
  readyTimeoutMs = 5_000,
}: HotkeyListenerOptions): HotkeyListener {
  const worker = new Worker(new URL("./tap.worker.ts", import.meta.url).href, { type: "module" });

  let settle: { resolve: () => void; reject: (error: Error) => void } | undefined;
  const ready = new Promise<void>((resolve, reject) => {
    settle = { resolve, reject };
  });
  const timer = setTimeout(() => {
    settle?.reject(new EventTapError(`keyboard watcher didn't start within ${readyTimeoutMs}ms`));
    settle = undefined;
  }, readyTimeoutMs);

  worker.addEventListener("message", (event: MessageEvent) => {
    const data = event.data as TapEvent | { type: "ready" } | { type: "error"; message: string };
    if (data.type === "ready") {
      clearTimeout(timer);
      settle?.resolve();
      settle = undefined;
    } else if (data.type === "error") {
      const error = new EventTapError(data.message);
      clearTimeout(timer);
      if (settle) {
        settle.reject(error);
        settle = undefined;
      } else {
        onError(error);
      }
    } else {
      onEvent(data);
    }
  });

  return {
    ready,
    async stop() {
      clearTimeout(timer);
      worker.postMessage({ type: "stop" });
      // The worker checks the flag between run-loop slices (250ms).
      await Bun.sleep(400);
      worker.terminate();
    },
  };
}
