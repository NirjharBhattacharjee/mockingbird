import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable, Writable } from "node:stream";

/** A headless Chrome, driven over the DevTools protocol. */
export type Chrome = {
  /** One DevTools command; `session` sends it to a tab. `T` is the reply's shape. */
  send: <T = Record<string, unknown>>(
    method: string,
    params?: object,
    session?: string,
  ) => Promise<T>;
  close: () => Promise<void>;
};

/** Long enough for a heavy page to load, short of a page that never answers. */
const COMMAND_TIMEOUT_MS = 60_000;

/**
 * Starts the Chrome at `path` and talks to it over a pipe
 * (`--remote-debugging-pipe`: fd 3 in, fd 4 out, each message ending in a
 * NUL), so it opens no port. Chrome's own sandbox is off, since it can't
 * start inside another one: run this under an OS sandbox, as
 * `apps/daemon/src/motion-run.ts` does with `sandbox-exec`.
 */
export async function launchChrome(path: string): Promise<Chrome> {
  const profile = mkdtempSync(join(tmpdir(), "mockingbird-chrome-"));
  const proc = spawn(
    path,
    [
      "--remote-debugging-pipe",
      "--no-sandbox",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--hide-scrollbars",
      "--mute-audio",
      // Colours as the page wrote them, not as this Mac's display would show them.
      "--force-color-profile=srgb",
      "--allow-file-access-from-files",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"] },
  );
  const input = proc.stdio[3] as Writable;
  const output = proc.stdio[4] as Readable;
  let said = "";
  proc.stderr?.on("data", (chunk: Buffer) => {
    said = (said + chunk.toString()).slice(-2000);
  });

  let id = 0;
  const waiting = new Map<number, { resolve: (r: unknown) => void; reject: (e: Error) => void }>();
  let gone: Error | undefined;
  const fail = (error: Error) => {
    gone ??= error;
    for (const w of waiting.values()) w.reject(gone);
    waiting.clear();
  };
  proc.on("error", fail);
  proc.on("exit", (code, signal) => {
    fail(new Error(`Chrome stopped (${signal ?? `exit ${code}`}): ${said.trim().slice(-500)}`));
  });

  // A screenshot is one message of a megabyte or more: keep the pieces and join them once.
  let parts: Buffer[] = [];
  output.on("data", (chunk: Buffer) => {
    let at = 0;
    for (let end = chunk.indexOf(0, at); end !== -1; end = chunk.indexOf(0, at)) {
      parts.push(chunk.subarray(at, end));
      const message = JSON.parse(Buffer.concat(parts).toString());
      parts = [];
      at = end + 1;
      const w = waiting.get(message.id);
      if (!w) continue; // an event: nothing here listens for any
      waiting.delete(message.id);
      if (message.error) w.reject(new Error(message.error.message));
      else w.resolve(message.result);
    }
    if (at < chunk.length) parts.push(chunk.subarray(at));
  });
  // Writing to a Chrome that has just died is reported by `exit`.
  input.on("error", () => {});

  const send: Chrome["send"] = <T>(method: string, params = {}, session?: string) => {
    if (gone) return Promise.reject(gone);
    const n = ++id;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        waiting.delete(n);
        reject(new Error(`Chrome didn't answer ${method} in ${COMMAND_TIMEOUT_MS / 1000} s`));
      }, COMMAND_TIMEOUT_MS);
      waiting.set(n, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v as T);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      input.write(`${JSON.stringify({ id: n, method, params, sessionId: session })}\0`);
    });
  };

  const close = async () => {
    if (proc.exitCode === null && proc.signalCode === null) {
      const exited = new Promise((r) => proc.once("exit", r));
      proc.kill("SIGKILL");
      await exited;
    }
    rmSync(profile, { recursive: true, force: true });
  };

  try {
    await send("Browser.getVersion");
  } catch (error) {
    await close();
    throw error;
  }
  return { send, close };
}
