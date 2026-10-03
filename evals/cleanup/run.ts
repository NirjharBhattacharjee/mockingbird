/**
 * `bun run eval:cleanup [promptfoo args]`: scores the cleanup step against
 * the cases in evals/cleanup/tests with promptfoo, all on this Mac.
 *
 *   bun run eval:cleanup                         # every case
 *   bun run eval:cleanup --filter-pattern list   # some cases
 *   MOCKINGBIRD_EVAL_SET=holdout bun run eval:cleanup
 *
 * Nothing leaves the machine: the model is the local Ollama, the checks are
 * plain code, and promptfoo's telemetry, update check, sharing and remote
 * test generation are switched off below. Results open with
 * `npx promptfoo view`, which also runs locally.
 */
import { join } from "node:path";
import { DEFAULT_LLM_MODEL } from "../../apps/daemon/src/runtime.ts";
import { llm, startCleanupServer } from "./server.ts";

const PROMPTFOO = "promptfoo@0.123.1";
const port = Number(process.env.MOCKINGBIRD_EVAL_PORT ?? 8798);
const dir = import.meta.dir;

const server = startCleanupServer(port);
console.error(`warming ${DEFAULT_LLM_MODEL}...`);
await llm.load?.();

const proc = Bun.spawn(
  [
    "npx",
    "--yes",
    PROMPTFOO,
    "eval",
    "-c",
    join(dir, "promptfooconfig.yaml"),
    "--no-cache",
    "--no-share",
    "-o",
    join(dir, "output", "latest.json"),
    // Tune against the dev set; check a change still holds on the held-out one.
    "--filter-metadata",
    `set=${process.env.MOCKINGBIRD_EVAL_SET ?? "dev"}`,
    ...Bun.argv.slice(2),
  ],
  {
    cwd: process.cwd(),
    stdout: "inherit",
    stderr: "inherit",
    env: {
      ...process.env,
      MOCKINGBIRD_EVAL_PORT: String(port),
      PROMPTFOO_DISABLE_TELEMETRY: "1",
      PROMPTFOO_DISABLE_UPDATE: "1",
      PROMPTFOO_DISABLE_SHARING: "1",
      PROMPTFOO_DISABLE_REMOTE_GENERATION: "true",
    },
  },
);
const code = await proc.exited;
server.stop(true);
process.exit(code);
