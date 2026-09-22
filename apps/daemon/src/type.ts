import { parseArgs } from "node:util";
import { charBeforeCaret, frontmostApp, needsLeadingSpace } from "@mockingbird/context";
import { checkTypingAccess, requestTypingAccess, typeText } from "@mockingbird/inject";

const USAGE = `Usage: bun run type [--delay 3] "text to type"
       bun run type --check [--delay 3]

Types text into whatever app is in front, to check that typing works before
using it from \`bun run listen\`.

Options:
  --delay <s>   wait this many seconds first, so you can click into another
                app (default 3 when typing, 0 with --check)
  --check       report whether typing is allowed, which app is in front, and
                whether mockingbird can see the text before its cursor
  -h, --help    show this help`;

const log = (message: string) => console.error(message);

const MAX_DELAY_SECONDS = 60;

export async function main(argv: string[] = Bun.argv.slice(2)): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
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

  const delaySeconds = Number(values.delay ?? (values.check ? 0 : 3));
  if (!Number.isFinite(delaySeconds) || delaySeconds < 0 || delaySeconds > MAX_DELAY_SECONDS) {
    log(`error: --delay must be a number of seconds from 0 to ${MAX_DELAY_SECONDS}\n\n${USAGE}`);
    return 2;
  }

  if (values.check) {
    if (delaySeconds > 0) {
      log(`checking in ${delaySeconds}s — click into the app you want checked...`);
      await Bun.sleep(delaySeconds * 1000);
    }
    const app = await frontmostApp();
    const allowed = checkTypingAccess();
    log(`typing into other apps: ${allowed ? "allowed" : "not allowed"}`);
    log(`app in front: ${app ? `${app.name} (${app.bundleId})` : "unknown"}`);
    // Never prints the character itself, only whether it could be read.
    const before = charBeforeCaret();
    log(
      before === undefined
        ? "text before the cursor: not readable here. A space still goes after your last dictation, unless you typed or clicked since"
        : `text before the cursor: readable (would add a space: ${needsLeadingSpace(before) ? "yes" : "no"})`,
    );
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

  if (delaySeconds > 0) {
    log(`typing in ${delaySeconds}s — click into the app you want it typed into...`);
    await Bun.sleep(delaySeconds * 1000);
  }

  const now = await frontmostApp();
  await typeText(text);
  log(`typed ${text.length} characters into ${now?.name ?? "the app in front"}`);
  return 0;
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
