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

/** A paused request, as Fetch.requestPaused gives it. */
type Paused = { requestId: string; request: { url: string } };

/** Long enough for a heavy page to load, short of a page that never answers. */
const COMMAND_TIMEOUT_MS = 60_000;

/**
 * Starts the Chrome at `path` and talks to it over a pipe
 * (`--remote-debugging-pipe`: fd 3 in, fd 4 out, each message ending in a
 * NUL), so it opens no port. Chrome's own sandbox is off, since it can't
 * start inside another one: run this under an OS sandbox, as
 * `apps/daemon/src/motion-run.ts` does with `sandbox-exec`.
 *
 * It can't reach the network on any OS (#157), whatever page or script any
 * tab runs: no host name resolves; everything else, an IP address or
 * loopback included, goes to a proxy on the discard port, where nothing
 * answers; WebRTC may send UDP only through that proxy; and every request
 * any tab makes stops at the browser for `gate`, which lets through only a
 * file on this computer.
 *
 * To start Chrome inside an OS sandbox, pass `wrap`, a command Chrome's own
 * is appended to.
 */
export async function launchChrome(
  path: string,
  { wrap = [] }: { wrap?: string[] } = {},
): Promise<Chrome> {
  const profile = mkdtempSync(join(tmpdir(), "mockingbird-chrome-"));
  const [program = path, ...before] = [...wrap, path];
  const proc = spawn(
    program,
    [
      ...before,
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
      "--host-resolver-rules=MAP * ~NOTFOUND",
      "--proxy-server=127.0.0.1:9",
      // Loopback goes through the proxy too, rather than straight out.
      "--proxy-bypass-list=<-loopback>",
      // WebRTC's UDP doesn't go through a proxy, so without this a page could
      // reach a STUN server by its IP address.
      "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
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
      if (message.method === "Fetch.requestPaused") {
        gate(message.params as Paused);
        continue;
      }
      const w = waiting.get(message.id);
      if (!w) continue; // another event: nothing here listens for it
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

  // Only a file here goes through. A file URL with a host is another
  // machine's share on Windows (UNC, read over SMB), so it fails like http.
  const gate = ({ requestId, request }: Paused) => {
    let local = false;
    try {
      const url = new URL(request.url);
      local = url.protocol === "file:" && url.host === "";
    } catch {
      // unparseable: failed
    }
    const [method, params] = local
      ? ["Fetch.continueRequest", { requestId }]
      : ["Fetch.failRequest", { requestId, errorReason: "BlockedByClient" }];
    send(method as string, params).catch(() => {});
  };

  const close = async () => {
    if (proc.exitCode === null && proc.signalCode === null) {
      const exited = new Promise((r) => proc.once("exit", r));
      proc.kill("SIGKILL");
      await exited;
    }
    // On Windows, Chrome's child processes hold the profile for a moment
    // after it's killed. A temp folder left behind mustn't fail the render.
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
    } catch {
      // the OS clears temp folders
    }
  };

  try {
    await send("Browser.getVersion");
    // On the browser, not a tab: every tab and worker it opens is covered.
    await send("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
  } catch (error) {
    await close();
    throw error;
  }
  return { send, close };
}
