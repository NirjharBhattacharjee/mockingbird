import { parseArgs } from "node:util";
import { frontmostApp } from "@mockingbird/context";
import { checkTypingAccess, requestTypingAccess, typeText } from "@mockingbird/inject";

const USAGE = `Usage: bun run type [--delay 3] "text to type"
       bun run type --check

Types text into whatever app is in front, to check that typing works before
using it from \`bun run listen\`.

Options:
  --delay <s>   wait this many seconds first, so you can click into another
                app (default 3)
  --check       report whether typing is allowed, and which app is in front
  -h, --help    show this help`;

const log = (message: string) => console.error(message);

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      delay: { type: "string" },
      check: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });

  if (values.help) {
    console.log(USAGE);
    return 0;
  }

  const app = await frontmostApp();
  if (values.check) {
    const allowed = checkTypingAccess();
    log(`typing into other apps: ${allowed ? "allowed" : "not allowed"}`);
    log(`app in front: ${app ? `${app.name} (${app.bundleId})` : "unknown"}`);
    if (!allowed) {
      log("asking macOS for permission — approve it, then quit and reopen this terminal.");
      requestTypingAccess();
    }
    return allowed ? 0 : 1;
  }

  const text = positionals.join(" ");
  if (!text) {
    log(`error: nothing to type\n\n${USAGE}`);
    return 2;
  }

  const delaySeconds = Number(values.delay ?? 3);
  if (delaySeconds > 0) {
    log(`typing in ${delaySeconds}s — click into the app you want it typed into...`);
    await Bun.sleep(delaySeconds * 1000);
  }

  const now = await frontmostApp();
  await typeText(text);
  log(`typed ${text.length} characters into ${now?.name ?? "the app in front"}`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    log(`error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  },
);
