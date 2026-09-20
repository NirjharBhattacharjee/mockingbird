import { statSync, truncateSync } from "node:fs";
import { checkInputMonitoring, requestInputMonitoring } from "@mockingbird/hotkey";
import { checkTypingAccess, requestTypingAccess } from "@mockingbird/inject";
import { agentPaths } from "./agent/plist.ts";
import { inputArgsFor, startSession } from "./session.ts";

/** launchd appends to the log forever and never rotates it. */
const MAX_LOG_BYTES = 1024 * 1024;

const stamp = () => new Date().toISOString().replace("T", " ").slice(0, 19);
const log = (message: string) => {
  for (const line of message.split("\n")) console.error(`${stamp()} ${line}`);
};

function trimLog(path: string): void {
  try {
    if (statSync(path).size > MAX_LOG_BYTES) truncateSync(path, 0);
  } catch {
    // No log yet, or launchd hasn't created it. Nothing to trim.
  }
}

export async function main(): Promise<number> {
  trimLog(agentPaths().logPath);

  // Asking here, rather than in the CLI, is what puts *this* process's binary
  // into the Privacy lists: macOS records the grant against whoever asks, and
  // under launchd that is us, not the terminal the user typed `start` into.
  const hotkeyAllowed = checkInputMonitoring() === "granted";
  const typingAllowed = checkTypingAccess();
  if (!hotkeyAllowed) requestInputMonitoring();
  if (!typingAllowed) requestTypingAccess();
  log(
    `permissions: Fn ${hotkeyAllowed ? "ok" : "MISSING (Input Monitoring)"}, ` +
      `typing ${typingAllowed ? "ok" : "MISSING (Accessibility)"}`,
  );
  if (!hotkeyAllowed || !typingAllowed) {
    log(
      "grant them to the bun binary in System Settings → Privacy & Security, " +
        "then run `mockingbird restart`.",
    );
  }

  const session = await startSession({
    inputArgs: inputArgsFor(process.env.MOCKINGBIRD_DEVICE),
    typingAllowed,
    hotkeyAllowed,
    log,
    onResult: (result, delivery) => {
      // The text itself is never logged: it goes to the app and nowhere else.
      // MOCKINGBIRD_LOG_TEXT=1 is the opt-in debug escape hatch.
      const chars = result.finalText.length;
      if (delivery.typed) log(`typed ${chars} characters`);
      else if (!result.finalText) log("no speech detected");
      else log(`not typed (${chars} characters): ${delivery.reason}`);
      if (process.env.MOCKINGBIRD_LOG_TEXT === "1" && result.finalText) {
        log(`text: ${result.finalText}`);
      }
    },
  });

  log("listening. Hold Fn to talk.");
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
      log(`${signal} received, stopping`);
      session.end(0);
    });
  }

  const code = await session.ended;
  await session.close();
  log(`stopped (${code})`);
  return code;
}

if (import.meta.main) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      log(`error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    },
  );
}
