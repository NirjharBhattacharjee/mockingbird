import { createEventTap, type TapEvent } from "./event-tap.ts";

// The macOS run loop blocks, so the tap lives here instead of the main thread.
let running = true;
declare const self: Worker;

self.addEventListener("message", (event: MessageEvent) => {
  if ((event.data as { type?: string })?.type === "stop") running = false;
});

try {
  const tap = createEventTap((tapEvent: TapEvent) => self.postMessage(tapEvent));
  self.postMessage({ type: "ready" });
  while (running) tap.poll(0.25);
  tap.close();
} catch (error) {
  self.postMessage({
    type: "error",
    message: error instanceof Error ? error.message : String(error),
  });
}
